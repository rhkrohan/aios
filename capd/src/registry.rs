//! The official MCP Registry (D108): every published MCP server, for the Store's
//! "All MCP servers" shelf beside SIOS's signed catalog.
//!
//! The broker fetches registry.modelcontextprotocol.io (latest versions only), keeps
//! a copy in its state folder (so the Store works offline) and refreshes it once a
//! day, outside its lock. Everything in it is someone else's words: names and
//! descriptions are plain text with control characters removed and lengths capped;
//! only https remote addresses count. Nothing here installs anything; installing a
//! registry server is a separate, owner-confirmed step with always-ask rules.
//! Icons are fetched one at a time on request: https only, PNG or WebP by their
//! bytes (never SVG, which can carry scripts), at most 256 KB, cached by hash.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub const BASE: &str = "https://registry.modelcontextprotocol.io/v0/servers";
const PAGE: usize = 100;
const MAX_PAGES: usize = 300;
const MAX_PAGE_BYTES: u64 = 8 << 20;
const MAX_ICON: u64 = 256 << 10;
/// Refreshed when older than this.
pub const STALE_SECS: u64 = 24 * 3600;

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Server {
    /// Its registry name: reverse DNS or io.github.<user>/<name>
    pub name: String,
    pub title: String,
    pub about: String,
    pub version: String,
    /// Who the registry says published it (its domain or GitHub account)
    pub publisher: String,
    #[serde(default)]
    pub website: String,
    #[serde(default)]
    pub repository: String,
    /// https streamable-http or sse addresses
    #[serde(default)]
    pub remotes: Vec<String>,
    /// Packages to run locally: "npm:@scope/name", "pypi:name", "oci:image"...
    #[serde(default)]
    pub packages: Vec<String>,
    /// Its own icon, if it gave an https PNG or WebP one
    #[serde(default)]
    pub icon: String,
}

#[derive(Serialize, Deserialize, Default)]
pub struct Cache {
    #[serde(default)]
    pub fetched_at: u64,
    #[serde(default)]
    pub servers: Vec<Server>,
}

fn clean(s: &str, n: usize) -> String {
    s.chars().filter(|c| !c.is_control() && !('\u{202a}'..='\u{202e}').contains(c) && !('\u{2066}'..='\u{2069}').contains(c)).take(n).collect::<String>().trim().to_string()
}

/// An https address with a plain host, or nothing.
fn https(u: &str) -> Option<String> {
    let rest = u.strip_prefix("https://")?;
    let host = rest.split(['/', '?', '#']).next()?;
    let ok = !host.is_empty() && !host.contains('@') && host.chars().all(|c| c.is_ascii_alphanumeric() || ".-:".contains(c)) && u.len() <= 500 && !u.chars().any(|c| c.is_whitespace() || c.is_control());
    ok.then(|| u.to_string())
}

/// Who published it, from its name: io.github.alice/x -> github.com/alice; com.example/x -> example.com.
pub fn publisher(name: &str) -> String {
    let ns = name.split('/').next().unwrap_or("");
    if let Some(user) = ns.strip_prefix("io.github.") {
        return format!("github.com/{}", clean(user, 60));
    }
    let mut parts: Vec<&str> = ns.split('.').filter(|p| !p.is_empty()).collect();
    parts.reverse();
    clean(&parts.join("."), 80)
}

/// One registry entry into SIOS's plain form; None when it's malformed.
pub fn parse(v: &Value) -> Option<Server> {
    let s = &v["server"];
    let name = s["name"].as_str()?;
    if name.is_empty() || name.len() > 200 || !name.contains('/') {
        return None;
    }
    let remotes = s["remotes"].as_array().into_iter().flatten()
        .filter(|r| matches!(r["type"].as_str(), Some("streamable-http") | Some("sse")))
        .filter_map(|r| r["url"].as_str().and_then(https)).take(5).collect();
    let packages = s["packages"].as_array().into_iter().flatten()
        .filter_map(|p| Some(format!("{}:{}", clean(p["registryType"].as_str()?, 12), clean(p["identifier"].as_str()?, 200)))).take(5).collect();
    let icon = s["icons"].as_array().into_iter().flatten()
        .filter(|i| matches!(i["mimeType"].as_str(), Some("image/png") | Some("image/webp")) || i["src"].as_str().is_some_and(|x| x.ends_with(".png") || x.ends_with(".webp")))
        .filter_map(|i| i["src"].as_str().and_then(https)).next().unwrap_or_default();
    Some(Server {
        name: clean(name, 200),
        title: clean(s["title"].as_str().unwrap_or(""), 80),
        about: clean(s["description"].as_str().unwrap_or(""), 400),
        version: clean(s["version"].as_str().unwrap_or(""), 40),
        publisher: publisher(name),
        website: s["websiteUrl"].as_str().and_then(https).unwrap_or_default(),
        repository: s["repository"]["url"].as_str().and_then(https).unwrap_or_default(),
        remotes,
        packages,
        icon,
    })
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new().timeout(std::time::Duration::from_secs(30)).redirects(0).build()
}

/// Fetch every latest server, page by page. Runs without the broker's lock.
pub fn fetch() -> Result<Vec<Server>, String> {
    let a = agent();
    let mut out: Vec<Server> = vec![];
    let mut at: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let mut cursor: Option<String> = None;
    for _ in 0..MAX_PAGES {
        let mut req = a.get(BASE).query("limit", &PAGE.to_string()).query("version", "latest");
        if let Some(c) = &cursor {
            req = req.query("cursor", c);
        }
        let resp = req.call().map_err(|e| format!("the MCP Registry didn't answer: {e}"))?;
        let mut body = String::new();
        std::io::Read::read_to_string(&mut std::io::Read::take(resp.into_reader(), MAX_PAGE_BYTES), &mut body).map_err(|e| e.to_string())?;
        let v: Value = serde_json::from_str(&body).map_err(|_| "the MCP Registry sent something that isn't JSON")?;
        for e in v["servers"].as_array().into_iter().flatten() {
            if let Some(s) = parse(e) {
                // the newest version of each name wins
                if let Some(&i) = at.get(&s.name) {
                    out[i] = s;
                } else {
                    at.insert(s.name.clone(), out.len());
                    out.push(s);
                }
            }
        }
        cursor = v["metadata"]["nextCursor"].as_str().filter(|c| !c.is_empty() && c.len() < 500).map(String::from);
        if cursor.is_none() {
            break;
        }
    }
    Ok(out)
}

impl Cache {
    pub fn open(dir: &Path) -> Cache {
        std::fs::read(dir.join("registry.json")).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
    }

    pub fn save(&self, dir: &Path) {
        let tmp = dir.join("registry.json.tmp");
        if std::fs::write(&tmp, serde_json::to_vec(self).unwrap_or_default()).is_ok() {
            let _ = std::fs::rename(&tmp, dir.join("registry.json"));
        }
    }

    /// One page of servers matching the words, best first.
    pub fn view(&self, query: &str, offset: usize, limit: usize) -> Value {
        let words: Vec<String> = query.to_lowercase().split_whitespace().map(String::from).take(8).collect();
        let mut hits: Vec<(usize, &Server)> = self.servers.iter().filter_map(|s| {
            if words.is_empty() {
                return Some((0, s));
            }
            let title = s.title.to_lowercase();
            let hay = format!("{} {} {} {}", title, s.name.to_lowercase(), s.about.to_lowercase(), s.publisher.to_lowercase());
            let n = words.iter().filter(|w| hay.contains(w.as_str())).count();
            (n == words.len()).then(|| (n * 10 + usize::from(title.starts_with(&words[0])) * 5, s))
        }).collect();
        hits.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.title.cmp(&b.1.title)));
        let total = hits.len();
        let page: Vec<Value> = hits.into_iter().skip(offset).take(limit.clamp(1, 100)).map(|(_, s)| json!({
            "name": s.name, "title": if s.title.is_empty() { s.name.rsplit('/').next().unwrap_or(&s.name).to_string() } else { s.title.clone() },
            "about": s.about, "version": s.version, "publisher": s.publisher, "website": s.website, "repository": s.repository,
            "remotes": s.remotes, "packages": s.packages, "icon": s.icon,
            "installable": !s.remotes.is_empty(),
            "talks_to": s.remotes.first().and_then(|r| r.strip_prefix("https://")).and_then(|r| r.split(['/', '?']).next()).unwrap_or(""),
        })).collect();
        json!({ "servers": page, "total": total, "all": self.servers.len(), "fetched_at": self.fetched_at })
    }
}

/// Fetch one icon into the cache: https only, PNG or WebP by its bytes, at most 256 KB.
/// Returns the cached file. Runs without the broker's lock.
pub fn icon(url: &str, dir: &Path) -> Result<PathBuf, String> {
    let url = https(url).ok_or("not an https address")?;
    let file = dir.join(format!("{}.img", &crate::audit::sha256_hex(url.as_bytes())[..32]));
    if file.exists() {
        return Ok(file);
    }
    let resp = agent().get(&url).call().map_err(|e| format!("couldn't fetch the icon: {e}"))?;
    let mut bytes = Vec::new();
    std::io::Read::read_to_end(&mut std::io::Read::take(resp.into_reader(), MAX_ICON + 1), &mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_ICON {
        return Err("the icon is too big".into());
    }
    let png = bytes.starts_with(b"\x89PNG\r\n\x1a\n");
    let webp = bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP";
    if !png && !webp {
        return Err("the icon isn't a PNG or WebP picture".into());
    }
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    std::fs::write(&file, &bytes).map_err(|e| e.to_string())?;
    Ok(file)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entries_become_plain_and_only_https_counts() {
        let v = json!({ "server": {
            "name": "io.github.alice/notes", "title": "Notes\u{1b}[31m", "description": "Read \u{202e}your notes", "version": "1.2.0",
            "remotes": [{ "type": "streamable-http", "url": "https://notes.example.com/mcp" }, { "type": "streamable-http", "url": "http://plain.example.com/mcp" }, { "type": "sse", "url": "https://user@evil.example/" }],
            "packages": [{ "registryType": "npm", "identifier": "@alice/notes-mcp" }],
            "icons": [{ "src": "https://notes.example.com/i.svg", "mimeType": "image/svg+xml" }, { "src": "https://notes.example.com/i.png", "mimeType": "image/png" }]
        }});
        let s = parse(&v).unwrap();
        assert_eq!((s.title.as_str(), s.about.as_str()), ("Notes[31m", "Read your notes"));
        assert_eq!(s.remotes, vec!["https://notes.example.com/mcp".to_string()], "http and user@ addresses are dropped");
        assert_eq!(s.packages, vec!["npm:@alice/notes-mcp".to_string()]);
        assert_eq!(s.icon, "https://notes.example.com/i.png", "never an SVG");
        assert_eq!(s.publisher, "github.com/alice");
        assert_eq!(publisher("com.linear/mcp"), "linear.com");
        assert!(parse(&json!({ "server": { "name": "" } })).is_none());
        let c = Cache { fetched_at: 1, servers: vec![s, parse(&json!({ "server": { "name": "com.linear/mcp", "title": "Linear", "description": "Issues", "remotes": [{ "type": "streamable-http", "url": "https://mcp.linear.app/mcp" }] } })).unwrap()] };
        let v = c.view("linear", 0, 20);
        assert_eq!((v["total"].as_u64(), v["servers"][0]["talks_to"].as_str(), v["servers"][0]["installable"].as_bool()), (Some(1), Some("mcp.linear.app"), Some(true)));
        assert_eq!(c.view("", 0, 1)["servers"].as_array().unwrap().len(), 1);
    }
}
