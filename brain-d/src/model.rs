//! The model, behind one small interface (D15: any model can drive).
//!
//! On SIOS brain-d holds no key and can't reach the internet: it asks the
//! broker's model gateway (`model.complete`, D33), which holds the owner's keys
//! and checks consent, limits and Sensitive data. The broker picks the provider
//! the owner chose in Settings > Brain (Claude, ChatGPT, Gemini, a local model).
//!
//! The Mac preview still passes OPENAI_API_KEY to brain-d (D19); then brain-d
//! calls OpenAI itself. That path is for development only.

use serde_json::{json, Value};
use std::time::Duration;

use crate::capd::Capd;

pub struct Model {
    pub name: String,
    how: How,
    /// The goal's pass: lets the broker see what the goal has read (Sensitive data stays local).
    pub cap: Option<String>,
}

enum How {
    Broker(Capd),
    OpenAiDirect { key: String, agent: ureq::Agent },
}

impl Model {
    pub fn from_env() -> Result<Model, String> {
        if let Ok(key) = std::env::var("OPENAI_API_KEY") {
            return Ok(Model {
                name: std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-5.5".into()),
                how: How::OpenAiDirect { key, agent: ureq::AgentBuilder::new().timeout(Duration::from_secs(120)).build() },
                cap: None,
            });
        }
        Ok(Model { name: "the AI chosen in Settings".into(), how: How::Broker(crate::capd_link()), cap: None })
    }

    /// One call that must come back as JSON matching `schema`.
    pub fn structured(&self, instructions: &str, input: &str, name: &str, schema: Value) -> Result<Value, String> {
        match &self.how {
            How::Broker(capd) => {
                let v = capd.call_slow("model.complete", self.params(name, instructions, input, Some(schema)))?;
                v.get("json").cloned().ok_or_else(|| "the AI didn't answer with JSON".to_string())
            }
            How::OpenAiDirect { .. } => {
                let v = self.respond(json!({
                    "instructions": instructions,
                    "input": [{ "role": "user", "content": input }],
                    "text": { "format": { "type": "json_schema", "name": name, "strict": true, "schema": schema } },
                }))?;
                serde_json::from_str(&Self::text_of(&v)).map_err(|e| format!("the model's plan wasn't valid JSON: {e}"))
            }
        }
    }

    /// One call for plain text.
    pub fn text(&self, instructions: &str, input: &str) -> Result<String, String> {
        match &self.how {
            How::Broker(capd) => {
                let v = capd.call_slow("model.complete", self.params("text", instructions, input, None))?;
                Ok(v["text"].as_str().unwrap_or("").trim().to_string())
            }
            How::OpenAiDirect { .. } => {
                let v = self.respond(json!({ "instructions": instructions, "input": [{ "role": "user", "content": input }] }))?;
                Ok(Self::text_of(&v).trim().to_string())
            }
        }
    }

    fn params(&self, purpose: &str, system: &str, input: &str, schema: Option<Value>) -> Value {
        let mut p = json!({ "purpose": purpose, "system": system, "input": input });
        if let Some(s) = schema {
            p["schema"] = s;
        }
        if let Some(c) = &self.cap {
            p["cap"] = json!(c);
        }
        p
    }

    fn respond(&self, body: Value) -> Result<Value, String> {
        let How::OpenAiDirect { key, agent } = &self.how else { return Err("not the direct path".into()) };
        let mut body = body;
        body["model"] = json!(self.name);
        match agent.post("https://api.openai.com/v1/responses").set("Authorization", &format!("Bearer {key}")).send_json(body) {
            Ok(r) => r.into_json().map_err(|e| e.to_string()),
            Err(ureq::Error::Status(code, r)) => {
                let j: Value = r.into_json().unwrap_or(json!({}));
                Err(format!("OpenAI {code}: {}", j["error"]["message"].as_str().unwrap_or("request failed")))
            }
            Err(e) => Err(format!("can't reach OpenAI: {e}")),
        }
    }

    fn text_of(v: &Value) -> String {
        v["output"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|o| o["type"] == "message")
            .flat_map(|m| m["content"].as_array().cloned().unwrap_or_default())
            .filter_map(|c| c["text"].as_str().map(String::from))
            .collect::<Vec<_>>()
            .join("\n")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn broker_requests_carry_the_goal_pass_and_no_key() {
        let m = Model { name: "x".into(), how: How::Broker(Capd { sock: "/nonexistent".into(), state: "/nonexistent".into() }), cap: Some("tok".into()) };
        let p = m.params("plan", "sys", "in", Some(json!({ "type": "object" })));
        assert_eq!((p["purpose"].as_str(), p["cap"].as_str()), (Some("plan"), Some("tok")));
        assert!(p.get("key").is_none());
        // no broker running: a plain error, not a crash
        assert!(m.text("s", "i").unwrap_err().contains("capd"));
    }
}
