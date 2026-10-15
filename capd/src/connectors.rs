//! Connectors (C1, D79 to D84): outside services as typed SIOS tools, through MCP.
//!
//! SIOS is the MCP client, inside capd, so every connector call goes through the
//! broker like any other tool. What a connector may offer comes from a catalog
//! signed with SIOS's key (D80): for each tool, SIOS's own name, risk level,
//! description and argument schema. Text a server writes about its tools never
//! reaches a model. On install, capd lists the server's tools and pins a hash of
//! each one's input schema; if the server later changes them, the connector is
//! switched off until the owner looks (rug-pull defence).
//!
//! Sign-ins (tokens) live in the Sign-ins vault (D74), are added and removed only
//! by the owner, and are opened only for the one request that needs them. A
//! connector's answers are untrusted data: they taint the goal (D81).
//!
//! First transport: remote MCP over HTTPS ("streamable HTTP"), called by capd.
//! Local servers in confined units (sios-connectors.slice) come with the first
//! connector that needs one (C2).

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use std::time::Duration;

use crate::policy::Level;
use crate::tools::ToolSpec;

/// SIOS's catalog signing key (public half). The private half never ships.
pub const CATALOG_KEY: [u8; 32] = include!("../catalog-key.in");

/// Where the image keeps the catalog; SIOS_CATALOG overrides it (tests, the Mac preview).
pub fn catalog_path() -> PathBuf {
    std::env::var("SIOS_CATALOG").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("/usr/share/sios/connectors/catalog.json"))
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CatalogTool {
    /// SIOS's name for it ("github.prs").
    pub name: String,
    /// The server's name for it ("search_pull_requests").
    pub server_tool: String,
    /// read, reversible or irreversible: set by SIOS, never by the server.
    pub level: String,
    /// Written by SIOS.
    pub about: String,
    /// The arguments SIOS lets through (a strict subset of the server's).
    pub args: Value,
    /// Fixed arguments SIOS always sends (e.g. a method), never set by the model.
    #[serde(default)]
    pub fixed: Value,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SignIn {
    /// What the owner pastes, in plain words.
    pub label: String,
    /// Where to make one.
    pub help_url: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Entry {
    pub id: String,
    pub name: String,
    pub publisher: String,
    pub verified: bool,
    /// What it's for, written by SIOS.
    pub about: String,
    /// Remote MCP over HTTPS.
    pub url: String,
    /// Fixed, non-secret headers (e.g. read-only mode).
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    pub signin: Option<SignIn>,
    /// The only hosts it talks to.
    pub destinations: Vec<String>,
    pub tools: Vec<CatalogTool>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Catalog {
    pub version: u64,
    pub entries: Vec<Entry>,
}

impl Catalog {
    /// The catalog only if its signature checks out; otherwise nothing (and why).
    pub fn load(path: &Path, key: &[u8; 32]) -> Result<Catalog, String> {
        let body = std::fs::read(path).map_err(|_| "no connector catalog on this system".to_string())?;
        let sig = std::fs::read_to_string(path.with_extension("json.sig")).map_err(|_| "the connector catalog isn't signed".to_string())?;
        let sig = B64.decode(sig.trim()).ok().and_then(|b| <[u8; 64]>::try_from(b.as_slice()).ok()).ok_or("the catalog signature is damaged")?;
        let vk = VerifyingKey::from_bytes(key).map_err(|_| "bad catalog key")?;
        vk.verify(&body, &Signature::from_bytes(&sig)).map_err(|_| "the connector catalog's signature doesn't match: not loading it".to_string())?;
        let c: Catalog = serde_json::from_slice(&body).map_err(|e| format!("the connector catalog is damaged: {e}"))?;
        for e in &c.entries {
            check_entry(e)?;
        }
        Ok(c)
    }

    pub fn get(&self, id: &str) -> Option<&Entry> {
        self.entries.iter().find(|e| e.id == id)
    }
}

/// Even a signed catalog is checked: names under the connector's own prefix, https
/// only, to a listed host, and no name SIOS already uses.
fn check_entry(e: &Entry) -> Result<(), String> {
    let id_ok = !e.id.is_empty() && e.id.len() <= 32 && e.id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if !id_ok {
        return Err(format!("catalog: bad connector id {:?}", e.id));
    }
    if host_of(&e.url).is_none_or(|h| !e.destinations.iter().any(|d| d == &h)) {
        return Err(format!("catalog: {} must use https to one of its destinations", e.id));
    }
    for t in &e.tools {
        let ok = t.name.strip_prefix(&format!("{}.", e.id)).is_some_and(|rest| !rest.is_empty() && rest.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_'));
        if !ok || crate::tools::TOOLS.iter().any(|s| s.name == t.name) {
            return Err(format!("catalog: bad tool name {:?}", t.name));
        }
        if level(&t.level).is_none() || !t.args.is_object() {
            return Err(format!("catalog: {} needs a level and an argument schema", t.name));
        }
    }
    Ok(())
}

fn level(s: &str) -> Option<Level> {
    match s {
        "read" => Some(Level::Read),
        "reversible" => Some(Level::Reversible),
        "irreversible" => Some(Level::Irreversible),
        _ => None,
    }
}

/// "https://api.example.com/mcp/" -> "api.example.com"; anything but https -> None.
fn host_of(url: &str) -> Option<String> {
    let rest = url.strip_prefix("https://")?;
    let host = rest.split(['/', '?', '#']).next()?;
    (!host.is_empty() && !host.contains('@') && !host.contains(':')).then(|| host.to_ascii_lowercase())
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Installed {
    pub id: String,
    pub installed_at: u64,
    /// Which AIs may use its tools ("sios", paired apps' ids). The owner picks.
    pub ais: Vec<String>,
    /// server tool -> sha256 of its input schema, pinned at install.
    pub pinned: BTreeMap<String, String>,
    /// Set when the server's tools changed; it does nothing until reinstalled.
    #[serde(default)]
    pub disabled: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
pub struct Registry {
    #[serde(default)]
    pub installed: Vec<Installed>,
    #[serde(skip)]
    path: PathBuf,
    #[serde(skip)]
    pub catalog: Catalog,
    /// Why the catalog didn't load, if it didn't.
    #[serde(skip)]
    pub catalog_error: Option<String>,
}

/// Connector tool specs, made once per tool name and kept for the life of capd
/// (a handful of small strings), so `tools::spec` can hand out `&'static` like the built-ins.
static SPECS: RwLock<Vec<&'static ToolSpec>> = RwLock::new(Vec::new());
/// The installed tools right now (name -> the connector's args schema).
static LIVE: RwLock<BTreeMap<String, Value>> = RwLock::new(BTreeMap::new());

pub fn spec(name: &str) -> Option<&'static ToolSpec> {
    if !LIVE.read().ok()?.contains_key(name) {
        return None;
    }
    SPECS.read().ok()?.iter().find(|s| s.name == name).copied()
}

/// The argument schema SIOS wrote for an installed connector tool.
pub fn args_schema(name: &str) -> Option<Value> {
    LIVE.read().ok()?.get(name).cloned()
}

/// Every installed connector tool's spec.
pub fn specs() -> Vec<&'static ToolSpec> {
    let live = LIVE.read().map(|l| l.keys().cloned().collect::<Vec<_>>()).unwrap_or_default();
    live.iter().filter_map(|n| spec(n)).collect()
}

fn leak(s: &str) -> &'static str {
    Box::leak(s.to_string().into_boxed_str())
}

impl Registry {
    pub fn open(dir: &Path, catalog: Result<Catalog, String>) -> Registry {
        let path = dir.join("connectors.json");
        let mut r: Registry = std::fs::read(&path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        r.path = path;
        match catalog {
            Ok(c) => r.catalog = c,
            Err(e) => r.catalog_error = Some(e),
        }
        r.publish();
        r
    }

    fn save(&self) {
        use std::os::unix::fs::OpenOptionsExt;
        let tmp = self.path.with_extension("json.tmp");
        let _ = std::fs::remove_file(&tmp);
        let ok = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&tmp)
            .and_then(|mut f| std::io::Write::write_all(&mut f, &serde_json::to_vec_pretty(self).unwrap_or_default()));
        if ok.is_ok() {
            let _ = std::fs::rename(&tmp, &self.path);
        }
    }

    /// Make the installed, enabled connectors' tools known to the broker.
    fn publish(&self) {
        let mut live = BTreeMap::new();
        let mut specs = SPECS.write().unwrap_or_else(|p| p.into_inner());
        for i in self.installed.iter().filter(|i| i.disabled.is_none()) {
            let Some(e) = self.catalog.get(&i.id) else { continue };
            for t in &e.tools {
                let lv = level(&t.level).unwrap_or(Level::Irreversible);
                // a name keeps the spec it was first made with; a catalog that changes a
                // tool's level needs a restart of capd to take effect
                if !specs.iter().any(|s| s.name == t.name) {
                    specs.push(Box::leak(Box::new(ToolSpec { name: leak(&t.name), level: lv, egress: true, path_args: &[], about: leak(&t.about) })));
                }
                live.insert(t.name.clone(), t.args.clone());
            }
        }
        *LIVE.write().unwrap_or_else(|p| p.into_inner()) = live;
    }

    pub fn get(&self, id: &str) -> Option<&Installed> {
        self.installed.iter().find(|i| i.id == id)
    }

    /// Which connector a tool belongs to, if it's an installed one.
    pub fn owner_of(&self, tool: &str) -> Option<(&Entry, &Installed, &CatalogTool)> {
        let id = tool.split('.').next()?;
        let e = self.catalog.get(id)?;
        let t = e.tools.iter().find(|t| t.name == tool)?;
        Some((e, self.get(id)?, t))
    }

    /// May this AI use this connector tool? (The owner picked which AIs get it.)
    pub fn allows(&self, tool: &str, principal: &str) -> Result<(), String> {
        let Some((e, i, _)) = self.owner_of(tool) else { return Err(format!("{tool} isn't an installed connector tool")) };
        if let Some(why) = &i.disabled {
            return Err(format!("{} is switched off: {why}", e.name));
        }
        if !i.ais.iter().any(|a| a == principal) {
            return Err(format!("you haven't let {principal} use {}", e.name));
        }
        Ok(())
    }

    pub fn add(&mut self, id: &str, ais: Vec<String>, pinned: BTreeMap<String, String>, now: u64) {
        self.installed.retain(|i| i.id != id);
        self.installed.push(Installed { id: id.into(), installed_at: now, ais, pinned, disabled: None });
        self.save();
        self.publish();
    }

    pub fn remove(&mut self, id: &str) -> bool {
        let before = self.installed.len();
        self.installed.retain(|i| i.id != id);
        self.save();
        self.publish();
        before != self.installed.len()
    }

    pub fn set_ais(&mut self, id: &str, ais: Vec<String>) -> Result<(), String> {
        let i = self.installed.iter_mut().find(|i| i.id == id).ok_or("that connector isn't installed")?;
        i.ais = ais;
        self.save();
        Ok(())
    }

    pub fn disable(&mut self, id: &str, why: &str) {
        if let Some(i) = self.installed.iter_mut().find(|i| i.id == id) {
            i.disabled = Some(why.into());
        }
        self.save();
        self.publish();
    }

    /// For SIOS's windows: the catalog and what's installed. Never a token.
    pub fn view(&self, signed_in: &dyn Fn(&str) -> bool) -> Value {
        let entries: Vec<Value> = self
            .catalog
            .entries
            .iter()
            .map(|e| {
                let i = self.get(&e.id);
                json!({
                    "id": e.id, "name": e.name, "publisher": e.publisher, "verified": e.verified, "about": e.about,
                    "destinations": e.destinations, "signin": e.signin, "signed_in": signed_in(&e.id),
                    "installed": i.is_some(), "ais": i.map(|i| i.ais.clone()).unwrap_or_default(),
                    "disabled": i.and_then(|i| i.disabled.clone()),
                    "tools": e.tools.iter().map(|t| json!({ "name": t.name, "level": t.level, "about": t.about })).collect::<Vec<_>>(),
                })
            })
            .collect();
        json!({ "catalog_version": self.catalog.version, "catalog_error": self.catalog_error, "connectors": entries })
    }

    /// For SIOS's brain: the tools this AI may plan with (SIOS-written text only).
    pub fn tools_for(&self, principal: &str) -> Vec<Value> {
        let mut out = Vec::new();
        for i in self.installed.iter().filter(|i| i.disabled.is_none() && i.ais.iter().any(|a| a == principal)) {
            if let Some(e) = self.catalog.get(&i.id) {
                for t in &e.tools {
                    out.push(json!({ "name": t.name, "about": t.about, "level": t.level, "args": t.args }));
                }
            }
        }
        out
    }
}

/// sha256 of a server tool's input schema (serde_json orders keys, so it's stable).
pub fn schema_hash(schema: &Value) -> String {
    crate::audit::sha256_hex(schema.to_string().as_bytes())
}

/// Pin the catalog's tools against the server's list. Every catalog tool must exist.
pub fn pin(e: &Entry, server_tools: &[Value]) -> Result<BTreeMap<String, String>, String> {
    let mut pinned = BTreeMap::new();
    for t in &e.tools {
        let s = server_tools.iter().find(|s| s["name"] == t.server_tool.as_str()).ok_or_else(|| format!("{} no longer offers {}", e.name, t.server_tool))?;
        pinned.insert(t.server_tool.clone(), schema_hash(&s["inputSchema"]));
    }
    Ok(pinned)
}

/// Did any pinned tool change? The first one that did, if so.
pub fn changed(pinned: &BTreeMap<String, String>, server_tools: &[Value]) -> Option<String> {
    for (name, hash) in pinned {
        match server_tools.iter().find(|s| s["name"] == name.as_str()) {
            None => return Some(format!("{name} is gone")),
            Some(s) if &schema_hash(&s["inputSchema"]) != hash => return Some(format!("{name} changed")),
            _ => {}
        }
    }
    None
}

// ---- the MCP client: streamable HTTP, one short session per use ----

/// What one request to a connector needs: everything decided under capd's lock.
pub struct Prepared {
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub token: Option<zeroize::Zeroizing<String>>,
}

impl Prepared {
    pub fn new(e: &Entry, token: Option<zeroize::Zeroizing<String>>) -> Prepared {
        Prepared { url: e.url.clone(), headers: e.headers.iter().map(|(k, v)| (k.clone(), v.clone())).collect(), token }
    }
}

const MAX_BODY: u64 = 2 * 1024 * 1024;

fn agent() -> ureq::Agent {
    // no redirects: a token is never carried to another host
    ureq::AgentBuilder::new().timeout(Duration::from_secs(30)).redirects(0).build()
}

/// One JSON-RPC exchange. Returns (result, session id the server gave, if any).
fn rpc(p: &Prepared, session: Option<&str>, method: &str, params: Value, id: Option<u64>) -> Result<(Value, Option<String>), String> {
    let mut body = json!({ "jsonrpc": "2.0", "method": method, "params": params });
    if let Some(id) = id {
        body["id"] = json!(id);
    }
    let mut req = agent().post(&p.url).set("Content-Type", "application/json").set("Accept", "application/json, text/event-stream").set("MCP-Protocol-Version", "2025-06-18");
    for (k, v) in &p.headers {
        req = req.set(k, v);
    }
    if let Some(t) = &p.token {
        req = req.set("Authorization", &format!("Bearer {}", t.as_str()));
    }
    if let Some(s) = session {
        req = req.set("Mcp-Session-Id", s);
    }
    let resp = match req.send_string(&body.to_string()) {
        Ok(r) => r,
        Err(ureq::Error::Status(401 | 403, _)) => return Err("the service refused the sign-in (check the token and its permissions)".into()),
        Err(ureq::Error::Status(code, _)) => return Err(format!("the service answered {code}")),
        Err(e) => return Err(format!("couldn't reach the service: {}", e.kind())),
    };
    let sid = resp.header("Mcp-Session-Id").map(String::from);
    if id.is_none() {
        return Ok((Value::Null, sid));
    }
    let sse = resp.content_type() == "text/event-stream";
    let mut text = String::new();
    std::io::Read::read_to_string(&mut std::io::Read::take(resp.into_reader(), MAX_BODY), &mut text).map_err(|e| e.to_string())?;
    let msg: Value = if sse {
        text.lines().filter_map(|l| l.strip_prefix("data:")).filter_map(|d| serde_json::from_str::<Value>(d.trim()).ok()).find(|v| v["id"] == json!(id)).ok_or("the service's answer was cut short")?
    } else {
        serde_json::from_str(&text).map_err(|_| "the service's answer wasn't JSON")?
    };
    if let Some(e) = msg.get("error") {
        return Err(format!("the service said no: {}", e["message"].as_str().unwrap_or("error").chars().take(200).collect::<String>()));
    }
    Ok((msg["result"].clone(), sid))
}

fn open_session(p: &Prepared) -> Result<Option<String>, String> {
    let (_, sid) = rpc(p, None, "initialize", json!({ "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": { "name": "sios-capd", "version": env!("CARGO_PKG_VERSION") } }), Some(1))?;
    rpc(p, sid.as_deref(), "notifications/initialized", json!({}), None)?;
    Ok(sid)
}

/// The server's tool list (names and input schemas; its descriptions are dropped here).
pub fn list_tools(p: &Prepared) -> Result<Vec<Value>, String> {
    let sid = open_session(p)?;
    let mut all = Vec::new();
    let mut cursor: Option<String> = None;
    for n in 0..10 {
        let params = cursor.as_ref().map(|c| json!({ "cursor": c })).unwrap_or(json!({}));
        let (r, _) = rpc(p, sid.as_deref(), "tools/list", params, Some(2 + n))?;
        for t in r["tools"].as_array().cloned().unwrap_or_default() {
            all.push(json!({ "name": t["name"], "inputSchema": t["inputSchema"] }));
        }
        cursor = r["nextCursor"].as_str().map(String::from);
        if cursor.is_none() {
            break;
        }
    }
    Ok(all)
}

/// Call one tool. The answer is the server's text, capped: untrusted data.
pub fn call(p: &Prepared, server_tool: &str, args: &Value) -> Result<Value, String> {
    let sid = open_session(p)?;
    let (r, _) = rpc(p, sid.as_deref(), "tools/call", json!({ "name": server_tool, "arguments": args }), Some(9))?;
    let text: String = r["content"].as_array().into_iter().flatten().filter(|c| c["type"] == "text").filter_map(|c| c["text"].as_str()).collect::<Vec<_>>().join("\n");
    let text: String = text.chars().filter(|c| !c.is_control() || *c == '\n' || *c == '\t').take(20_000).collect();
    Ok(json!({ "text": text, "failed": r["isError"].as_bool().unwrap_or(false), "untrusted": true }))
}

/// The arguments sent: what the model gave (already checked against SIOS's schema),
/// with SIOS's fixed ones on top.
pub fn arguments(t: &CatalogTool, args: &Value) -> Value {
    let mut a = args.clone();
    if let (Some(obj), Some(fixed)) = (a.as_object_mut(), t.fixed.as_object()) {
        for (k, v) in fixed {
            obj.insert(k.clone(), v.clone());
        }
    }
    a
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn entry() -> Value {
        json!({ "id": "github", "name": "GitHub", "publisher": "GitHub", "verified": true, "about": "Your repositories", "url": "https://api.githubcopilot.com/mcp/readonly",
                "signin": { "label": "token", "help_url": "https://github.com/settings/tokens" }, "destinations": ["api.githubcopilot.com"],
                "tools": [{ "name": "github.prs", "server_tool": "search_pull_requests", "level": "read", "about": "Search pull requests.", "args": { "type": "object", "properties": { "query": { "type": "string" } }, "required": ["query"] } }] })
    }

    fn write_signed(dir: &Path, cat: &Value, sk: &SigningKey) -> PathBuf {
        let p = dir.join("catalog.json");
        let body = serde_json::to_vec(cat).unwrap();
        std::fs::write(&p, &body).unwrap();
        std::fs::write(dir.join("catalog.json.sig"), B64.encode(sk.sign(&body).to_bytes())).unwrap();
        p
    }

    #[test]
    fn only_a_catalog_signed_by_sios_loads() {
        let d = tempfile::tempdir().unwrap();
        let sk = SigningKey::from_bytes(&[7u8; 32]);
        let key = sk.verifying_key().to_bytes();
        let p = write_signed(d.path(), &json!({ "version": 1, "entries": [entry()] }), &sk);
        assert_eq!(Catalog::load(&p, &key).unwrap().entries.len(), 1);
        // one byte changed after signing
        let mut body = std::fs::read(&p).unwrap();
        body[10] ^= 1;
        std::fs::write(&p, body).unwrap();
        assert!(Catalog::load(&p, &key).is_err());
        // signed by someone else
        let other = SigningKey::from_bytes(&[9u8; 32]);
        let p = write_signed(d.path(), &json!({ "version": 1, "entries": [entry()] }), &other);
        assert!(Catalog::load(&p, &key).is_err());
    }

    #[test]
    fn even_a_signed_catalog_cant_take_sios_names_or_plain_http() {
        let d = tempfile::tempdir().unwrap();
        let sk = SigningKey::from_bytes(&[7u8; 32]);
        let key = sk.verifying_key().to_bytes();
        for bad in [
            json!({ "url": "http://api.githubcopilot.com/mcp/" }),
            json!({ "url": "https://evil.example.com/mcp/" }),
            json!({ "tools": [{ "name": "files.read", "server_tool": "x", "level": "read", "about": "", "args": {} }] }),
            json!({ "tools": [{ "name": "github.x", "server_tool": "x", "level": "whatever", "about": "", "args": {} }] }),
        ] {
            let mut e = entry();
            for (k, v) in bad.as_object().unwrap() {
                e[k] = v.clone();
            }
            let p = write_signed(d.path(), &json!({ "version": 1, "entries": [e] }), &sk);
            assert!(Catalog::load(&p, &key).is_err(), "{bad}");
        }
    }

    #[test]
    fn installed_tools_are_known_only_to_the_ais_the_owner_picked() {
        let d = tempfile::tempdir().unwrap();
        let cat: Catalog = serde_json::from_value(json!({ "version": 1, "entries": [entry()] })).unwrap();
        let mut r = Registry::open(d.path(), Ok(cat));
        assert!(r.allows("github.prs", "sios").is_err(), "not installed yet");
        r.add("github", vec!["sios".into()], BTreeMap::new(), 1);
        assert!(spec("github.prs").is_some_and(|s| s.egress && s.level == Level::Read));
        assert!(r.allows("github.prs", "sios").is_ok());
        assert!(r.allows("github.prs", "agent:coder").is_err());
        assert_eq!(r.tools_for("sios").len(), 1);
        r.disable("github", "search_pull_requests changed");
        assert!(r.allows("github.prs", "sios").is_err() && r.tools_for("sios").is_empty());
        assert!(r.remove("github"));
        assert!(spec("github.prs").is_none(), "gone with it");
    }

    #[test]
    fn a_changed_server_schema_is_noticed() {
        let e: Entry = serde_json::from_value(entry()).unwrap();
        let tools = vec![json!({ "name": "search_pull_requests", "inputSchema": { "type": "object", "properties": { "query": { "type": "string" } } } })];
        let pinned = pin(&e, &tools).unwrap();
        assert!(changed(&pinned, &tools).is_none());
        let sneaky = vec![json!({ "name": "search_pull_requests", "inputSchema": { "type": "object", "properties": { "query": { "type": "string" }, "also_send_to": { "type": "string" } } } })];
        assert!(changed(&pinned, &sneaky).is_some());
        assert!(pin(&e, &[]).is_err(), "a tool the catalog names must exist");
    }
}
