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

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
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
    /// A cheaper model for small jobs (writing a text, spotting a habit); planning always
    /// uses `model`. Empty: everything uses `model` (doc 20).
    #[serde(default)]
    pub small_model: String,
    /// What the owner pays, in dollars per million tokens (input, output), for `model` and
    /// `small_model`. 0: not given, so no cost is estimated (SIOS never guesses prices).
    #[serde(default)]
    pub price: [f64; 2],
    #[serde(default)]
    pub small_price: [f64; 2],
}

/// (scheme, host) of a base address, or None if it isn't a plain one. Refuses
/// "user@host" forms, which can make an address look local while going elsewhere.
pub fn parse_base(url: &str) -> Option<(String, String)> {
    let (scheme, rest) = url.trim().split_once("://")?;
    let scheme = scheme.to_ascii_lowercase();
    let authority = rest.split(['/', '?', '#']).next()?;
    if authority.is_empty() || authority.contains('@') || authority.chars().any(|c| c.is_whitespace() || c.is_control() || c == '\\') {
        return None;
    }
    let host = if let Some(v6) = authority.strip_prefix('[') {
        v6.split_once(']')?.0.to_string()
    } else {
        authority.rsplit_once(':').map(|(h, port)| if port.chars().all(|c| c.is_ascii_digit()) { h } else { authority }).unwrap_or(authority).to_string()
    };
    (!host.is_empty()).then(|| (scheme, host.to_ascii_lowercase()))
}

/// Only "localhost" or a loopback address is this computer.
pub fn is_local_host(host: &str) -> bool {
    host == "localhost" || host.parse::<std::net::IpAddr>().is_ok_and(|ip| ip.is_loopback())
}

impl Provider {
    /// A provider on this computer gets no internet traffic; Sensitive data may go to it.
    pub fn online(&self) -> bool {
        !(self.kind == "compat" && parse_base(&self.base_url).is_some_and(|(_, h)| is_local_host(&h)))
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
    /// Tokens sent and received today, and the estimated cost where prices are given.
    #[serde(default)]
    pub tokens_today: [u64; 2],
    #[serde(default)]
    pub cost_today: f64,
}

fn presets() -> Vec<Provider> {
    let p = |id: &str, kind: &str, label: &str, model: &str, base_url: &str| Provider { id: id.into(), kind: kind.into(), label: label.into(), model: model.into(), base_url: base_url.into(), consent: false, small_model: String::new(), price: [0.0; 2], small_price: [0.0; 2] };
    let mut claude = p("anthropic", "anthropic", "Claude (Anthropic)", "claude-opus-5-5", "");
    claude.small_model = "claude-haiku-5-5".into();
    vec![
        claude,
        p("openai", "openai", "ChatGPT (OpenAI)", "gpt-5.5", ""),
        p("gemini", "gemini", "Gemini (Google)", "", ""),
        p("local", "compat", "A model on this computer (Ollama, llama.cpp)", "", "http://localhost:11434/v1"),
        p("custom", "compat", "Another OpenAI-compatible service (OpenRouter...)", "", ""),
    ]
}

impl Default for Config {
    fn default() -> Self {
        Config { providers: presets(), active: None, max_calls_per_day: 200, max_input_chars: 200_000, day: 0, calls_today: 0, tokens_today: [0, 0], cost_today: 0.0 }
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
            .map(|p| json!({ "id": p.id, "kind": p.kind, "label": p.label, "model": p.model, "small_model": p.small_model, "price": p.price, "small_price": p.small_price, "base_url": p.base_url, "consent": p.consent, "online": p.online(), "has_key": self.keys.has(&p.id), "active": self.cfg.active.as_deref() == Some(p.id.as_str()) }))
            .collect();
        let today = self.cfg.day == super::state::now() / 86400;
        json!({ "providers": providers, "active": self.cfg.active, "max_calls_per_day": self.cfg.max_calls_per_day, "max_input_chars": self.cfg.max_input_chars, "calls_today": self.calls_today(super::state::now()),
                "tokens_today": if today { self.cfg.tokens_today } else { [0, 0] }, "cost_today": if today { self.cfg.cost_today } else { 0.0 }, "keys_sealed_by": self.keys.sealed_by })
    }

    fn calls_today(&self, now: u64) -> u32 {
        if self.cfg.day == now / 86400 { self.cfg.calls_today } else { 0 }
    }

    // ------------------------------------------------------------ owner changes

    // (the key is never echoed back, not even in an error)
    pub fn set_key(&mut self, id: &str, key: &str) -> Result<Value, String> {
        let p = self.find(id)?.clone();
        let key = clean_key(key)?;
        self.keys.set(&p.id, &key)?;
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
            let small = p["small_model"].as_str().map(|m| m.trim().to_string());
            let base = p["base_url"].as_str().map(|b| b.trim().to_string());
            for m in model.iter().chain(small.iter()) {
                if m.len() > 120 || m.chars().any(|c| c.is_whitespace() || c.is_control()) {
                    return Err("a model name has no spaces".into());
                }
            }
            let price = |k: &str| -> Result<Option<[f64; 2]>, String> {
                match p[k].as_array() {
                    None => Ok(None),
                    Some(a) if a.len() == 2 && a.iter().all(|x| x.as_f64().is_some_and(|f| (0.0..1000.0).contains(&f))) => Ok(Some([a[0].as_f64().unwrap(), a[1].as_f64().unwrap()])),
                    Some(_) => Err("a price is two numbers (input, output) in dollars per million tokens, under 1000".into()),
                }
            };
            let (price_main, price_small) = (price("price")?, price("small_price")?);
            if let Some(b) = base.as_ref().filter(|b| !b.is_empty()) {
                let ok = match parse_base(b) {
                    Some((scheme, host)) => scheme == "https" || (scheme == "http" && is_local_host(&host)),
                    None => false,
                };
                if !ok {
                    return Err("the address must be https://, or http:// on this computer (localhost)".into());
                }
            }
            let q = self.cfg.providers.iter_mut().find(|x| x.id == id).unwrap();
            if let Some(m) = model {
                q.model = m;
            }
            if let Some(m) = small {
                q.small_model = m;
            }
            if let Some(x) = price_main {
                q.price = x;
            }
            if let Some(x) = price_small {
                q.small_price = x;
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
        let mut provider = self.find(&id)?.clone();
        // small jobs go to the cheaper model when the owner set one; planning never does
        let purpose = p["purpose"].as_str().unwrap_or("text");
        if purpose != "plan" && !provider.small_model.is_empty() && !test {
            provider.model = std::mem::take(&mut provider.small_model);
            provider.price = provider.small_price;
        }
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

    /// Count a call that went out, with the tokens it used (and their cost, where the owner
    /// gave prices for that model).
    pub fn counted(&mut self, now: u64, provider: &Provider, usage: &Value) {
        if self.cfg.day != now / 86400 {
            self.cfg.day = now / 86400;
            self.cfg.calls_today = 0;
            self.cfg.tokens_today = [0, 0];
            self.cfg.cost_today = 0.0;
        }
        self.cfg.calls_today += 1;
        let (i, o) = (usage["in"].as_u64().unwrap_or(0), usage["out"].as_u64().unwrap_or(0));
        self.cfg.tokens_today[0] += i;
        self.cfg.tokens_today[1] += o;
        self.cfg.cost_today += (i as f64 * provider.price[0] + o as f64 * provider.price[1]) / 1_000_000.0;
        self.save();
    }
}


/// A pasted key, as the provider issued it. Keys never contain spaces, so line
/// breaks and invisible characters that came along with a copy (a wrapped line,
/// a web page's zero-width space) are dropped; anything else odd is refused.
pub(crate) fn clean_key(raw: &str) -> Result<String, String> {
    let invisible = |c: char| c.is_whitespace() || c.is_control() || matches!(c, '\u{200B}'..='\u{200D}' | '\u{2060}' | '\u{FEFF}');
    let key: String = raw.chars().filter(|c| !invisible(*c)).collect();
    if key.is_empty() {
        return Err("the key field is empty".into());
    }
    if key.len() < 8 {
        return Err(format!("that key is only {} characters long; API keys are longer. Copy the whole key", key.chars().count()));
    }
    if key.len() > 400 {
        return Err("that's longer than any API key (over 400 characters). Copy just the key".into());
    }
    if !key.chars().all(|c| c.is_ascii_graphic()) {
        return Err("that key has characters API keys don't use (for example curly quotes or accents). Copy it again from the provider's page".into());
    }
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn small_jobs_use_the_small_model_and_tokens_and_cost_add_up() {
        let d = tempfile::tempdir().unwrap();
        let mut g = Gateway::open(d.path()).unwrap();
        g.cfg.providers.push(Provider { id: "m".into(), kind: "compat".into(), label: "M".into(), model: "big".into(), base_url: "http://localhost:1/v1".into(), consent: true, small_model: "small".into(), price: [10.0, 30.0], small_price: [1.0, 2.0] });
        g.cfg.active = Some("m".into());
        let now = crate::state::now();
        let call = |g: &Gateway, purpose: &str| g.prepare(&json!({ "purpose": purpose, "system": "s", "input": "i" }), None, false, "g", now, false).unwrap();
        let plan = call(&g, "plan");
        assert_eq!(plan.provider.model, "big", "planning always uses the main model");
        let text = call(&g, "text");
        assert_eq!(text.provider.model, "small");
        g.counted(now, &plan.provider, &json!({ "in": 1_000_000, "out": 100_000 }));
        g.counted(now, &text.provider, &json!({ "in": 500_000, "out": 0 }));
        let l = g.list();
        assert_eq!(l["tokens_today"], json!([1_500_000, 100_000]));
        assert!((l["cost_today"].as_f64().unwrap() - (10.0 + 3.0 + 0.5)).abs() < 1e-6);
        // a new day starts from zero
        g.counted(now + 86_400, &plan.provider, &json!({}));
        assert_eq!(g.cfg.tokens_today, [0, 0]);
    }

    #[test]
    fn only_real_loopback_addresses_count_as_this_computer() {
        let p = |url: &str| Provider { id: "x".into(), kind: "compat".into(), label: "x".into(), model: "m".into(), base_url: url.into(), consent: true, ..Default::default() };
        for local in ["http://localhost:11434/v1", "http://127.0.0.1:8080/v1", "http://[::1]:11434/v1", "http://LOCALHOST/v1"] {
            assert!(!p(local).online(), "{local}");
        }
        for remote in ["http://127.0.0.1@evil.example/v1", "http://localhost.evil.example/v1", "http://localhost@evil.example", "https://openrouter.ai/api/v1", "http://127.evil.example/v1", "", "localhost:11434"] {
            assert!(p(remote).online(), "{remote}");
        }
        assert_eq!(parse_base("https://api.example.com:8443/v1"), Some(("https".into(), "api.example.com".into())));
        assert_eq!(parse_base("http://user:pw@host/"), None);
    }

    #[test]
    fn pasted_keys_lose_line_breaks_and_invisible_characters() {
        let k = "sk-ant-api03-ABCdef_123-xyz";
        assert_eq!(clean_key(k).unwrap(), k);
        assert_eq!(clean_key(&format!("  {k}\n")).unwrap(), k);
        assert_eq!(clean_key("sk-ant-api03-ABC\ndef_123-xyz").unwrap(), k);
        assert_eq!(clean_key("\u{FEFF}sk-ant-api03-ABCdef_123\u{200B}-xyz\r\n").unwrap(), k);
        assert!(clean_key("   ").unwrap_err().contains("empty"));
        assert!(clean_key("abc").unwrap_err().contains("3 characters"));
        assert!(clean_key("“sk-ant-api03-ABCdef”").unwrap_err().contains("curly quotes"));
        // the key itself never appears in an error
        assert!(!clean_key("sk-ant-é-secret").unwrap_err().contains("secret"));
    }
}

/// The call itself, with no lock held. Returns {"text": ...} or {"json": ...}.
pub fn send(p: &Prepared) -> Result<Value, String> {
    providers::send(p)
}
