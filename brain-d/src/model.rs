//! The model, behind one small interface (D15: any model can drive). Today it's
//! OpenAI's Responses API (D19); a local llama.cpp server or Claude slots in
//! here without touching the planner, the checks or the broker.

use serde_json::{json, Value};
use std::time::Duration;

pub struct Model {
    pub name: String,
    key: String,
    agent: ureq::Agent,
}

impl Model {
    pub fn from_env() -> Result<Model, String> {
        let key = std::env::var("OPENAI_API_KEY").map_err(|_| "No OPENAI_API_KEY for brain-d".to_string())?;
        Ok(Model {
            name: std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-5.5".into()),
            key,
            agent: ureq::AgentBuilder::new().timeout(Duration::from_secs(120)).build(),
        })
    }

    fn respond(&self, body: Value) -> Result<Value, String> {
        let mut body = body;
        body["model"] = json!(self.name);
        let resp = self
            .agent
            .post("https://api.openai.com/v1/responses")
            .set("Authorization", &format!("Bearer {}", self.key))
            .send_json(body);
        let v: Value = match resp {
            Ok(r) => r.into_json().map_err(|e| e.to_string())?,
            Err(ureq::Error::Status(code, r)) => {
                let j: Value = r.into_json().unwrap_or(json!({}));
                return Err(format!("OpenAI {code}: {}", j["error"]["message"].as_str().unwrap_or("request failed")));
            }
            Err(e) => return Err(format!("can't reach OpenAI: {e}")),
        };
        Ok(v)
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

    /// One call that must come back as JSON matching `schema`.
    pub fn structured(&self, instructions: &str, input: &str, name: &str, schema: Value) -> Result<Value, String> {
        let v = self.respond(json!({
            "instructions": instructions,
            "input": [{ "role": "user", "content": input }],
            "text": { "format": { "type": "json_schema", "name": name, "strict": true, "schema": schema } },
        }))?;
        serde_json::from_str(&Self::text_of(&v)).map_err(|e| format!("the model's plan wasn't valid JSON: {e}"))
    }

    /// One call for plain text.
    pub fn text(&self, instructions: &str, input: &str) -> Result<String, String> {
        let v = self.respond(json!({ "instructions": instructions, "input": [{ "role": "user", "content": input }] }))?;
        Ok(Self::text_of(&v).trim().to_string())
    }
}
