//! The four kinds of provider behind one call (D34). Each turns the neutral
//! request into its own API's shape and hands back {"text"} or {"json"}.
//! The key goes only into the request header; error messages never repeat it.

use serde_json::{json, Value};
use std::time::Duration;

use super::Prepared;

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new().timeout(Duration::from_secs(120)).build()
}

/// POST with a header for the key; errors say the provider and status, never the request.
fn post(url: &str, headers: &[(&str, &str)], body: &Value, who: &str) -> Result<Value, String> {
    let mut req = agent().post(url);
    for (k, v) in headers {
        req = req.set(k, v);
    }
    match req.send_json(body) {
        Ok(r) => r.into_json().map_err(|e| format!("{who} sent something unreadable: {e}")),
        Err(ureq::Error::Status(code, r)) => {
            let j: Value = r.into_json().unwrap_or(json!({}));
            let msg = j["error"]["message"].as_str().or(j["error"].as_str()).or(j["message"].as_str()).unwrap_or("request failed");
            Err(format!("{who} answered {code}: {}", msg.chars().take(300).collect::<String>()))
        }
        Err(e) => Err(format!("can't reach {who}: {}", e.to_string().chars().take(200).collect::<String>())),
    }
}

fn as_out(text: String, structured: bool, who: &str) -> Result<Value, String> {
    if structured {
        let t = text.trim().trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();
        serde_json::from_str::<Value>(t).map(|v| json!({ "json": v })).map_err(|e| format!("{who}'s answer wasn't the JSON asked for: {e}"))
    } else {
        Ok(json!({ "text": text.trim() }))
    }
}

pub fn send(p: &Prepared) -> Result<Value, String> {
    let key = p.key.as_ref().map(|k| k.as_str()).unwrap_or("");
    match p.provider.kind.as_str() {
        "anthropic" => anthropic(p, key),
        "openai" => openai(p, key),
        "compat" => compat(p, key),
        "gemini" => gemini(p, key),
        #[cfg(test)]
        "mock" => Ok(if p.schema.is_some() { json!({ "json": { "echo": p.input } }) } else { json!({ "text": format!("echo: {}", p.input) }) }),
        other => Err(format!("unknown provider kind {other}")),
    }
}

/// Anthropic Messages API. JSON answers use structured outputs (output_config.format);
/// the current models don't take forced tool use. A server-side fallback model
/// answers if the chosen one declines on safety grounds.
fn anthropic(p: &Prepared, key: &str) -> Result<Value, String> {
    let mut body = json!({
        "model": p.provider.model,
        "max_tokens": p.max_tokens,
        "system": p.system,
        "messages": [{ "role": "user", "content": p.input }],
        "fallbacks": "default",
    });
    if let Some(s) = &p.schema {
        body["output_config"] = json!({ "format": { "type": "json_schema", "schema": s } });
    }
    let v = post(
        "https://api.anthropic.com/v1/messages",
        &[("x-api-key", key), ("anthropic-version", "2023-06-01"), ("anthropic-beta", "server-side-fallback-2026-07-01")],
        &body,
        "Anthropic",
    )?;
    match v["stop_reason"].as_str() {
        Some("refusal") => return Err("Claude declined this request.".into()),
        Some("max_tokens") => return Err("Claude's answer was cut off (too long).".into()),
        _ => {}
    }
    let text: String = v["content"].as_array().into_iter().flatten().filter(|b| b["type"] == "text").filter_map(|b| b["text"].as_str()).collect::<Vec<_>>().join("");
    as_out(text, p.schema.is_some(), "Claude")
}

/// OpenAI Responses API (what brain-d used directly before D33).
fn openai(p: &Prepared, key: &str) -> Result<Value, String> {
    let mut body = json!({
        "model": p.provider.model,
        "instructions": p.system,
        "input": [{ "role": "user", "content": p.input }],
        "max_output_tokens": p.max_tokens,
    });
    if let Some(s) = &p.schema {
        body["text"] = json!({ "format": { "type": "json_schema", "name": "answer", "strict": true, "schema": s } });
    }
    let auth = format!("Bearer {key}");
    let v = post("https://api.openai.com/v1/responses", &[("Authorization", &auth)], &body, "OpenAI")?;
    let text: String = v["output"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|o| o["type"] == "message")
        .flat_map(|m| m["content"].as_array().cloned().unwrap_or_default())
        .filter_map(|c| c["text"].as_str().map(String::from))
        .collect::<Vec<_>>()
        .join("\n");
    as_out(text, p.schema.is_some(), "OpenAI")
}

/// Any OpenAI-compatible chat API: Gemini's compatible endpoint, OpenRouter, Ollama, llama.cpp.
/// Asks for strict JSON first; a service that doesn't support it gets plain JSON mode
/// with the schema in the instructions.
fn compat(p: &Prepared, key: &str) -> Result<Value, String> {
    let base = p.provider.base_url.trim_end_matches('/');
    if base.is_empty() {
        return Err(format!("{} has no address yet (Settings > Brain).", p.provider.label));
    }
    let url = format!("{base}/chat/completions");
    let auth = format!("Bearer {key}");
    let headers: Vec<(&str, &str)> = if key.is_empty() { vec![] } else { vec![("Authorization", &auth)] };
    let mut body = json!({
        "model": p.provider.model,
        "max_tokens": p.max_tokens,
        "messages": [{ "role": "system", "content": p.system }, { "role": "user", "content": p.input }],
    });
    let read = |v: &Value| v["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();
    if let Some(s) = &p.schema {
        body["response_format"] = json!({ "type": "json_schema", "json_schema": { "name": "answer", "strict": true, "schema": s } });
        match post(&url, &headers, &body, &p.provider.label) {
            Ok(v) => return as_out(read(&v), true, &p.provider.label),
            Err(e) if e.contains(" answered 4") => {
                body["response_format"] = json!({ "type": "json_object" });
                body["messages"][0]["content"] = json!(format!("{}\n\nAnswer with one JSON object that matches this JSON Schema exactly:\n{s}", p.system));
            }
            Err(e) => return Err(e),
        }
    }
    let v = post(&url, &headers, &body, &p.provider.label)?;
    as_out(read(&v), p.schema.is_some(), &p.provider.label)
}

/// Google's Gemini API, natively.
fn gemini(p: &Prepared, key: &str) -> Result<Value, String> {
    let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent", p.provider.model);
    let mut gen = json!({ "maxOutputTokens": p.max_tokens });
    if let Some(s) = &p.schema {
        gen["responseMimeType"] = json!("application/json");
        gen["responseJsonSchema"] = s.clone();
    }
    let body = json!({
        "systemInstruction": { "parts": [{ "text": p.system }] },
        "contents": [{ "role": "user", "parts": [{ "text": p.input }] }],
        "generationConfig": gen,
    });
    let v = post(&url, &[("x-goog-api-key", key)], &body, "Gemini")?;
    if v["promptFeedback"]["blockReason"].is_string() {
        return Err("Gemini declined this request.".into());
    }
    let text: String = v["candidates"][0]["content"]["parts"].as_array().into_iter().flatten().filter_map(|x| x["text"].as_str()).collect::<Vec<_>>().join("");
    as_out(text, p.schema.is_some(), "Gemini")
}
