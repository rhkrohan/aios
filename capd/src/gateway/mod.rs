//! The model gateway (D33, D34): the broker holds the owner's AI account keys and
//! makes every model call for SIOS's brain. brain-d sends a request and gets text
//! or JSON back; it never sees a key, and it can't reach the internet itself.
//!
//! Before any call leaves the computer the broker checks that the owner has
//! allowed that provider, that a key is there (unless it's a local model), that
//! today's limits aren't used up, and that the goal isn't carrying Sensitive data
//! to an online provider. Every call is in the audit log: provider, model, sizes,
//! never contents.
//!
//! The HTTP call happens outside the broker's lock (see main.rs), so a slow model
//! never holds up anyone else.

pub mod keys;
mod providers;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use zeroize::Zeroizing;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Provider {
    pub id: String,
    /// anthropic | openai | compat | gemini (and mock in tests)
    pub kind: String,
    pub label: String,
    /// Empty: not chosen yet (the owner picks it in Settings).
    pub model: String,
    /// For compat: where to send requests. Empty: the kind's own address.
    #[serde(default)]
    pub base_url: String,
    /// The owner allowed SIOS to send requests here (Settings, confirmed with their password).
    #[serde(default)]
    pub consent: bool,
}

impl Provider {
    /// A provider on this computer gets no internet traffic; Sensitive data may go to it.
    pub fn online(&self) -> bool {
        let u = self.base_url.to_lowercase();
        let host = u.split("://").nth(1).unwrap_or("").split(['/', ':']).next().unwrap_or("");
        !(self.kind == "compat" && (host == "localhost" || host.starts_with("127.") || host == "[::1]"))
    }

    fn needs_key(&self) -> bool {
        self.online()
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Config {
    pub providers: Vec<Provider>,
    /// Which provider SIOS's brain uses. None: no online AI chosen.
    pub active: Option<String>,
    pub max_calls_per_day: u32,
    pub max_input_chars: usize,
    #[serde(default)]
    pub day: u64,
    #[serde(default)]
    pub calls_today: u32,
}

fn presets() -> Vec<Provider> {
    let p = |id: &str, kind: &str, label: &str, model: &str, base_url: &str| Provider { id: id.into(), kind: kind.into(), label: label.into(), model: model.into(), base_url: base_url.into(), consent: false };
    vec![
        p("anthropic", "anthropic", "Claude (Anthropic)", "claude-opus-5-5", ""),
        p("openai", "openai", "ChatGPT (OpenAI)", "gpt-5.5", ""),
        p("gemini", "gemini", "Gemini (Google)", "", ""),
        p("local", "compat", "A model on this computer (Ollama, llama.cpp)", "", "http://localhost:11434/v1"),
        p("custom", "compat", "Another OpenAI-compatible service (OpenRouter...)", "", ""),
    ]
}

impl Default for Config {
    fn default() -> Self {
        Config { providers: presets(), active: None, max_calls_per_day: 200, max_input_chars: 200_000, day: 0, calls_today: 0 }
    }
}

pub struct Gateway {
    path: PathBuf,
    pub cfg: Config,
    pub keys: keys::Keys,
}

/// Everything a call needs once the broker's lock is released.
pub struct Prepared {
    pub provider: Provider,
    pub key: Option<Zeroizing<String>>,
    pub purpose: String,
    pub system: String,
    pub input: String,
    pub schema: Option<Value>,
    pub max_tokens: u32,
    /// Who it's for, for the audit log.
    pub goal: String,
}

impl Gateway {
    pub fn open(dir: &Path) -> Result<Gateway, String> {
        let path = dir.join("providers.json");
        let mut cfg: Config = std::fs::read(&path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        // presets added in a later release appear in an older file too
        for p in presets() {
            if !cfg.providers.iter().any(|x| x.id == p.id) {
                cfg.providers.push(p);
            }
        }
        Ok(Gateway { path, cfg, keys: keys::Keys::open(dir)? })
    }

    fn save(&self) {
        use std::os::unix::fs::OpenOptionsExt;
        let tmp = self.path.with_extension("tmp");
        let _ = std::fs::remove_file(&tmp);
        if let Ok(mut f) = std::fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&tmp) {
            let _ = std::io::Write::write_all(&mut f, &serde_json::to_vec_pretty(&self.cfg).unwrap_or_default());
            let _ = std::fs::rename(&tmp, &self.path);
        }
    }

    fn find(&self, id: &str) -> Result<&Provider, String> {
        self.cfg.providers.iter().find(|p| p.id == id).ok_or_else(|| format!("no provider called {id}"))
    }

    /// What Settings shows. No key ever leaves; only whether one is there.
    pub fn list(&self) -> Value {
        let providers: Vec<Value> = self
            .cfg
            .providers
            .iter()
            .map(|p| json!({ "id": p.id, "kind": p.kind, "label": p.label, "model": p.model, "base_url": p.base_url, "consent": p.consent, "online": p.online(), "has_key": self.keys.has(&p.id), "active": self.cfg.active.as_deref() == Some(p.id.as_str()) }))
            .collect();
        json!({ "providers": providers, "active": self.cfg.active, "max_calls_per_day": self.cfg.max_calls_per_day, "max_input_chars": self.cfg.max_input_chars, "calls_today": self.calls_today(super::state::now()), "keys_sealed_by": self.keys.sealed_by })
    }

    fn calls_today(&self, now: u64) -> u32 {
        if self.cfg.day == now / 86400 { self.cfg.calls_today } else { 0 }
    }

    // ------------------------------------------------------------ owner changes

    pub fn set_key(&mut self, id: &str, key: &str) -> Result<Value, String> {
        let p = self.find(id)?.clone();
        let key = key.trim();
        if key.len() < 8 || key.len() > 400 || key.chars().any(|c| c.is_whitespace() || c.is_control()) {
            return Err("that doesn't look like an API key".into());
        }
        self.keys.set(&p.id, key)?;
        Ok(json!({ "saved": p.id }))
    }

    pub fn remove_key(&mut self, id: &str) -> Result<Value, String> {
        let p = self.find(id)?.clone();
        Ok(json!({ "removed": self.keys.remove(&p.id)? }))
    }

    pub fn consent(&mut self, id: &str, on: bool) -> Result<Value, String> {
        self.find(id)?;
        if let Some(p) = self.cfg.providers.iter_mut().find(|p| p.id == id) {
            p.consent = on;
        }
        if !on && self.cfg.active.as_deref() == Some(id) {
            self.cfg.active = None;
        }
        self.save();
        Ok(self.list())
    }

    /// Model, address, which one is active, and the limits.
    pub fn configure(&mut self, p: &Value) -> Result<Value, String> {
        if let Some(id) = p["id"].as_str() {
            self.find(id)?;
            let model = p["model"].as_str().map(|m| m.trim().to_string());
            let base = p["base_url"].as_str().map(|b| b.trim().to_string());
            if let Some(m) = &model {
                if m.len() > 120 || m.chars().any(|c| c.is_whitespace() || c.is_control()) {
                    return Err("a model name has no spaces".into());
                }
            }
            if let Some(b) = &base {
                if !(b.is_empty() || b.starts_with("https://") || b.starts_with("http://localhost") || b.starts_with("http://127.")) {
                    return Err("the address must start with https:// (or be on this computer)".into());
                }
            }
            let q = self.cfg.providers.iter_mut().find(|x| x.id == id).unwrap();
            if let Some(m) = model {
                q.model = m;
            }
            if let Some(b) = base {
                if q.kind == "compat" {
                    q.base_url = b;
                }
            }
            if p["active"].as_bool() == Some(true) {
                self.cfg.active = Some(id.to_string());
            }
        }
        if p["active"].is_null() && p.get("active").is_some() {
            self.cfg.active = None;
        }
        if let Some(n) = p["max_calls_per_day"].as_u64() {
            self.cfg.max_calls_per_day = n.clamp(1, 10_000) as u32;
        }
        if let Some(n) = p["max_input_chars"].as_u64() {
            self.cfg.max_input_chars = n.clamp(1_000, 2_000_000) as usize;
        }
        self.save();
        Ok(self.list())
    }

    // ------------------------------------------------------------ calls

    /// Check a call and collect what it needs. `carrying_sensitive`: the goal has read
    /// something labelled Sensitive (decided by the broker from the goal's pass).
    /// `test`: the owner pressed Test for this provider (confirmed with their password),
    /// which stands in for consent for that one short call.
    pub fn prepare(&self, p: &Value, provider_id: Option<&str>, carrying_sensitive: bool, goal: &str, now: u64, test: bool) -> Result<Prepared, String> {
        let id = provider_id.map(String::from).or_else(|| self.cfg.active.clone()).ok_or("No AI is connected yet. Open Settings > Brain to add one.")?;
        let provider = self.find(&id)?.clone();
        if !provider.consent && !test {
            return Err(format!("You haven't allowed SIOS to send requests to {} yet (Settings > Brain).", provider.label));
        }
        if provider.model.is_empty() {
            return Err(format!("Pick a model for {} in Settings > Brain.", provider.label));
        }
        if provider.online() && carrying_sensitive {
            return Err(format!("This task read Sensitive files, and Sensitive data never goes to an online AI ({}).", provider.label));
        }
        if self.calls_today(now) >= self.cfg.max_calls_per_day {
            return Err(format!("Today's limit of {} AI requests is used up (Settings > Brain).", self.cfg.max_calls_per_day));
        }
        let system = p["system"].as_str().unwrap_or("").to_string();
        let input = p["input"].as_str().unwrap_or("").to_string();
        if input.is_empty() {
            return Err("nothing to send".into());
        }
        if system.len() + input.len() > self.cfg.max_input_chars {
            return Err(format!("That request is larger than the {} character limit (Settings > Brain).", self.cfg.max_input_chars));
        }
        let key = if provider.needs_key() {
            Some(self.keys.get(&provider.id)?.ok_or_else(|| format!("There's no key for {} yet (Settings > Brain).", provider.label))?)
        } else {
            self.keys.get(&provider.id)?
        };
        Ok(Prepared {
            provider,
            key,
            purpose: p["purpose"].as_str().unwrap_or("text").chars().take(40).collect(),
            system,
            input,
            schema: p.get("schema").filter(|s| s.is_object()).cloned(),
            max_tokens: p["max_tokens"].as_u64().unwrap_or(16_000).clamp(16, 32_000) as u32,
            goal: goal.to_string(),
        })
    }

    /// Count a call that went out.
    pub fn counted(&mut self, now: u64) {
        if self.cfg.day != now / 86400 {
            self.cfg.day = now / 86400;
            self.cfg.calls_today = 0;
        }
        self.cfg.calls_today += 1;
        self.save();
    }
}

/// The call itself, with no lock held. Returns {"text": ...} or {"json": ...}.
pub fn send(p: &Prepared) -> Result<Value, String> {
    providers::send(p)
}
