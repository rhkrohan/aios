//! Long-term memory, built the way Linux manages memory and files (see
//! docs/plan/09-memory.md):
//!   - every memory is a record with metadata, like an inode with extended
//!     attributes: what it says, kind, group, labels, where it came from,
//!     when, how often it's been used
//!   - groups work like permissions: SIOS's own brain sees every group, and
//!     each outside AI sees only the groups the owner shared with it (a per-AI
//!     view, like a mount namespace)
//!   - Sensitive memories never go to a model running online
//!   - secrets never enter memory at all (like the kernel keyring, they live
//!     elsewhere: the sign-in vault)
//!   - episodes are an append-only log of what happened (like journald), and
//!     old ones are dropped first (like page reclaim)
//!   - patterns the brain notices wait as suggestions until the owner says yes
//!
//! On SIOS this is Vault: encrypted under ~/.local/share/sios/vault, enforced by
//! the broker. Here it's a JSON file in capd's state folder.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub const GROUPS: [&str; 6] = ["People", "Habits", "Work", "Personal", "Finance", "History"];
const MAX_EPISODES: usize = 200;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Person {
    pub name: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub role: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Memory {
    pub id: String,
    pub text: String,
    /// fact, preference, person, episode
    pub kind: String,
    pub group: String,
    #[serde(default)]
    pub labels: Vec<String>,
    /// "you", "goal <id>", "suggested by SIOS, confirmed by you"
    pub source: String,
    pub created: u64,
    #[serde(default)]
    pub last_used: u64,
    #[serde(default)]
    pub uses: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub person: Option<Person>,
    /// Episodes: the memories that were recalled for that goal (the context graph's edges).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub links: Vec<String>,
    /// Which AI wrote it or ran the goal ("SIOS", "Pip (helper)", "Claude Desktop (MCP)").
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub by: String,
    /// A newer memory about the same thing replaced this one (D73): kept as
    /// history, left out of recall, and the owner can revert.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub superseded_by: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub superseded_at: Option<u64>,
    /// Deleted by the owner: kept 30 days so it can be put back, then gone.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<u64>,
}

impl Memory {
    /// In use: not replaced, not in the bin.
    pub fn live(&self) -> bool {
        self.superseded_by.is_none() && self.deleted_at.is_none()
    }
}

/// Roles one person holds at a time: a new one replaces the old one.
const ONE_AT_A_TIME: [&str; 14] = ["accountant", "landlord", "doctor", "dentist", "therapist", "lawyer", "manager", "boss", "advisor", "partner", "wife", "husband", "mechanic", "barber"];

/// What a fact is about: the words before its value ("lunch spot is X" ->
/// "lunch spot", "I keep finance files in X" -> "i keep finance files").
/// A few ways of saying the same thing share one subject.
fn subject(text: &str) -> Option<String> {
    let t = text.to_lowercase();
    let cut = [" is ", " are ", " in ", " on ", " at ", " to ", " = "].iter().filter_map(|w| t.find(w)).min()?;
    let s = t[..cut].trim().trim_start_matches("my ").trim().to_string();
    let s = match s.as_str() {
        "i moved" | "i'm moving" | "i am moving" | "i now live" | "i live" => "i live".to_string(),
        _ => s,
    };
    (!s.is_empty() && s.len() <= 60).then_some(s)
}

/// Is `new` the newer version of `old` (D73)? Same email or full name for people,
/// or the same one-at-a-time role; the same subject and group for other facts.
fn same_subject(new: &Memory, old: &Memory) -> bool {
    if new.kind == "episode" || old.kind == "episode" || !old.live() || new.id == old.id {
        return false;
    }
    match (&new.person, &old.person) {
        (Some(a), Some(b)) => {
            let says_new = { let t = new.text.to_lowercase(); t.contains(" now ") || t.contains(" new ") };
            (!a.email.is_empty() && a.email.eq_ignore_ascii_case(&b.email))
                || a.name.eq_ignore_ascii_case(&b.name)
                || (!a.role.is_empty() && a.role.eq_ignore_ascii_case(&b.role) && (says_new || ONE_AT_A_TIME.iter().any(|r| a.role.to_lowercase().contains(r))))
        }
        (None, None) => new.group == old.group && subject(&new.text).is_some_and(|s| subject(&old.text) == Some(s)),
        _ => false,
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Suggestion {
    pub id: String,
    pub text: String,
    pub kind: String,
    pub group: String,
    pub why: String,
    pub created: u64,
}

#[derive(Serialize, Deserialize, Default)]
pub struct MemStore {
    #[serde(default)]
    pub memories: Vec<Memory>,
    #[serde(default)]
    pub suggestions: Vec<Suggestion>,
    /// Which groups each outside AI may read. Nothing by default.
    #[serde(default)]
    pub shares: BTreeMap<String, Vec<String>>,
    #[serde(skip)]
    path: PathBuf,
}

/// Who is asking, and from where.
pub struct Viewer<'a> {
    pub principal: &'a str,
    /// The owner, or the owner's own brain: every group.
    pub own: bool,
    /// The answer goes to a model running online: never Sensitive.
    pub online: bool,
}

/// Does this look like a secret? Passwords, keys, tokens and card numbers never enter memory.
pub fn looks_secret(text: &str) -> Option<&'static str> {
    let t = text.to_lowercase();
    for w in ["password", "passcode", "passphrase", "pin code", "pin is", "api key", "secret key", "private key", "access token", "security code", "cvv", "2fa code", "recovery code", "seed phrase"] {
        if t.contains(w) {
            return Some("it looks like a password or key");
        }
    }
    if text.contains("-----BEGIN") || text.split_whitespace().any(|w| (w.starts_with("sk-") || w.starts_with("ghp_") || w.starts_with("xox")) && w.len() > 12) {
        return Some("it contains what looks like a key or token");
    }
    // a long run of digits (spaces and dashes allowed) like a card or account number
    let digits: String = text.chars().filter(|c| c.is_ascii_digit() || *c == ' ' || *c == '-').collect();
    if digits.split(|c: char| !c.is_ascii_digit() && c != ' ' && c != '-').any(|run| run.chars().filter(|c| c.is_ascii_digit()).count() >= 13) {
        return Some("it contains what looks like a card or account number");
    }
    None
}

fn words(s: &str) -> Vec<String> {
    s.to_lowercase().split(|c: char| !c.is_alphanumeric() && c != '@' && c != '.').filter(|w| w.len() > 2).map(|w| w.trim_matches('.').to_string()).filter(|w| !STOP.contains(&w.as_str())).collect()
}

const STOP: [&str; 24] = ["the", "and", "for", "with", "that", "this", "from", "into", "you", "your", "are", "was", "has", "have", "can", "please", "what", "who", "all", "any", "about", "tell", "send", "email"];

impl MemStore {
    pub fn open(path: &Path) -> MemStore {
        let mut s: MemStore = std::fs::read(path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        s.path = path.to_path_buf();
        // shares saved under the old free names ("Claude Desktop (MCP)") move to identity ids
        let old: Vec<String> = s.shares.keys().filter(|k| k.ends_with(" (MCP)")).cloned().collect();
        for k in old {
            let slug: String = k.trim_end_matches(" (MCP)").to_lowercase().split(|c: char| !c.is_ascii_alphanumeric()).filter(|x| !x.is_empty()).collect::<Vec<_>>().join("-");
            if let Some(g) = s.shares.remove(&k) {
                s.shares.entry(format!("app:{slug}")).or_insert(g);
            }
        }
        s
    }

    pub fn save(&self) {
        let _ = std::fs::write(&self.path, serde_json::to_vec_pretty(self).unwrap_or_default());
    }

    /// People from the old people.json become person memories, once.
    pub fn import_people(&mut self, people: &Value, now: u64) {
        if self.memories.iter().any(|m| m.kind == "person") {
            return;
        }
        for p in people.as_array().into_iter().flatten() {
            let person = Person { name: p["name"].as_str().unwrap_or("").into(), email: p["email"].as_str().unwrap_or("").into(), role: p["role"].as_str().unwrap_or("").into() };
            if person.name.is_empty() {
                continue;
            }
            let text = format!("{} <{}>{}", person.name, person.email, if person.role.is_empty() { String::new() } else { format!(", {}", person.role) });
            self.memories.push(Memory { id: new_id(), text, kind: "person".into(), group: "People".into(), labels: vec![], source: "your contacts".into(), created: now, last_used: 0, uses: 0, person: Some(person), links: vec![], by: String::new(), superseded_by: None, superseded_at: None, deleted_at: None });
        }
        self.save();
    }

    fn visible(&self, m: &Memory, v: &Viewer) -> bool {
        if !m.live() {
            return false;
        }
        if v.online && m.labels.iter().any(|l| l == "Sensitive") {
            return false;
        }
        v.own || self.shares.get(v.principal).is_some_and(|g| g.contains(&m.group))
    }

    /// Best matches for a query: words in common, plus group and label names,
    /// then the most used and most recent. Only what this viewer may see.
    pub fn search(&self, query: &str, v: &Viewer, limit: usize) -> Vec<Memory> {
        let q = words(query);
        let ql = query.to_lowercase();
        // recency counts days back from the newest memory (0..999), so it never wraps around
        let newest = self.memories.iter().map(|m| m.last_used.max(m.created)).max().unwrap_or(0);
        let mut scored: Vec<(i64, &Memory)> = self
            .memories
            .iter()
            .filter(|m| self.visible(m, v))
            .filter_map(|m| {
                // its subject too, so "where do I live" finds "I moved to Boston"
                let hay = format!("{} {} {} {}", m.text, m.group, m.labels.join(" "), subject(&m.text).unwrap_or_default()).to_lowercase();
                let hits = q.iter().filter(|w| hay.contains(w.as_str())).count() as i64;
                let group_hit = ql.contains(&m.group.to_lowercase()) as i64;
                let score = hits * 10 + group_hit * 5;
                let recency = 999 - (newest.saturating_sub(m.last_used.max(m.created)) / 86400).min(999) as i64;
                (score > 0).then_some((score * 1000 + m.uses.min(50) as i64 * 5 + recency, m))
            })
            .collect();
        scored.sort_by(|a, b| b.0.cmp(&a.0));
        // what you told SIOS answers first; past tasks only when nothing else does,
        // and never more than 3 (they carry old names and places)
        let facts: Vec<Memory> = scored.iter().filter(|(_, m)| m.kind != "episode").take(limit).map(|(_, m)| (*m).clone()).collect();
        if !facts.is_empty() {
            return facts;
        }
        scored.into_iter().take(limit.min(3)).map(|(_, m)| m.clone()).collect()
    }

    /// Memories that mention every word of the query (for forgetting: one shared
    /// word is not enough). Episodes included; nothing is hidden from the owner.
    pub fn matching_all(&self, query: &str) -> Vec<Memory> {
        let q = words(query);
        if q.is_empty() {
            return vec![];
        }
        self.memories.iter().filter(|m| m.deleted_at.is_none()).filter(|m| { let hay = m.text.to_lowercase(); q.iter().all(|w| hay.contains(w.as_str())) }).cloned().collect()
    }

    /// How many Sensitive memories matched but were held back from an online model.
    pub fn held_back(&self, query: &str, v: &Viewer) -> usize {
        if !v.online {
            return 0;
        }
        let offline = Viewer { principal: v.principal, own: v.own, online: false };
        self.search(query, &offline, 50).iter().filter(|m| m.labels.iter().any(|l| l == "Sensitive")).count()
    }

    pub fn touch(&mut self, ids: &[String], now: u64) {
        for m in self.memories.iter_mut().filter(|m| ids.contains(&m.id)) {
            m.uses += 1;
            m.last_used = now;
        }
        self.save();
    }

    pub fn add(&mut self, text: &str, kind: &str, group: &str, labels: Vec<String>, source: &str, now: u64) -> Result<Memory, String> {
        let text = text.trim();
        if text.is_empty() {
            return Err("there's nothing to remember".into());
        }
        if let Some(why) = looks_secret(text) {
            return Err(format!("not saved: {why}. Secrets never go into memory; sign-ins belong in the vault (Security Center, Sign-ins)"));
        }
        let kind = if ["fact", "preference", "person", "episode"].contains(&kind) { kind } else { "fact" };
        let group = if GROUPS.contains(&group) { group.to_string() } else if kind == "preference" { "Habits".into() } else { "Personal".into() };
        // the same thing twice is one memory (episodes are a journal: every one is kept)
        if let Some(m) = self.memories.iter_mut().find(|m| kind != "episode" && m.kind != "episode" && m.live() && m.text.eq_ignore_ascii_case(text)) {
            m.last_used = now;
            // saying it again can add a label (say, Sensitive), never drop one
            for l in labels {
                if !m.labels.contains(&l) {
                    m.labels.push(l);
                }
            }
            let m = m.clone();
            self.save();
            return Ok(m);
        }
        // anything with a name and an email is also a person, so "my accountant" resolves
        let person = if kind == "person" || (kind == "fact" && group == "People") { parse_person(text) } else { None };
        let (kind, group) = if person.is_some() { ("person", "People".to_string()) } else { (kind, group) };
        let m = Memory { id: new_id(), text: text.chars().take(500).collect(), kind: kind.into(), group, labels, source: source.into(), created: now, last_used: now, uses: 0, person, links: vec![], by: String::new(), superseded_by: None, superseded_at: None, deleted_at: None };
        // the newer version of something replaces the older one (D73)
        for old in self.memories.iter_mut() {
            if same_subject(&m, old) {
                old.superseded_by = Some(m.id.clone());
                old.superseded_at = Some(now);
            }
        }
        self.memories.push(m.clone());
        if kind == "episode" {
            // oldest episodes go first, like page reclaim
            let episodes = self.memories.iter().filter(|m| m.kind == "episode").count();
            if episodes > MAX_EPISODES {
                if let Some(i) = self.memories.iter().position(|m| m.kind == "episode") {
                    self.memories.remove(i);
                }
            }
        }
        self.save();
        Ok(m)
    }

    /// Into the bin (30 days), not gone: the owner can put it back.
    pub fn soft_delete(&mut self, id: &str, now: u64) -> Option<Memory> {
        let m = self.memories.iter_mut().find(|m| m.id == id && m.deleted_at.is_none())?;
        m.deleted_at = Some(now);
        let m = m.clone();
        self.save();
        Some(m)
    }

    /// Put a memory back: out of the bin, or back in place of what replaced it.
    pub fn revert(&mut self, id: &str) -> Result<Memory, String> {
        let i = self.memories.iter().position(|m| m.id == id).ok_or("no such memory")?;
        if self.memories[i].deleted_at.take().is_none() {
            let newer = self.memories[i].superseded_by.take().ok_or("that memory is already in use")?;
            self.memories[i].superseded_at = None;
            let me = self.memories[i].id.clone();
            if let Some(n) = self.memories.iter_mut().find(|m| m.id == newer) {
                n.superseded_by = Some(me);
            }
        }
        let m = self.memories[i].clone();
        self.save();
        Ok(m)
    }

    /// Empty the bin of anything older than 30 days.
    pub fn purge(&mut self, now: u64) {
        let before = self.memories.len();
        self.memories.retain(|m| m.deleted_at.is_none_or(|d| now.saturating_sub(d) < 30 * 86400));
        if self.memories.len() != before {
            self.save();
        }
    }

    pub fn remove(&mut self, id: &str) -> Option<Memory> {
        let i = self.memories.iter().position(|m| m.id == id)?;
        let m = self.memories.remove(i);
        self.save();
        Some(m)
    }

    pub fn restore(&mut self, m: Memory) {
        if !self.memories.iter().any(|x| x.id == m.id) {
            self.memories.push(m);
            self.save();
        }
    }

    pub fn suggest(&mut self, text: &str, kind: &str, group: &str, why: &str, now: u64) -> Result<Suggestion, String> {
        if let Some(w) = looks_secret(text) {
            return Err(format!("not suggested: {w}"));
        }
        if self.memories.iter().any(|m| m.live() && m.text.eq_ignore_ascii_case(text.trim())) || self.suggestions.iter().any(|s| s.text.eq_ignore_ascii_case(text.trim())) {
            return Err("already known or already suggested".into());
        }
        let s = Suggestion { id: new_id(), text: text.trim().chars().take(300).collect(), kind: kind.into(), group: if GROUPS.contains(&group) { group.into() } else { "Habits".into() }, why: why.chars().take(300).collect(), created: now };
        self.suggestions.push(s.clone());
        self.save();
        Ok(s)
    }

    /// Mark who wrote a memory and what it came from. Links only to memories that exist.
    pub fn attach(&mut self, id: &str, by: &str, links: &[String]) {
        let known: Vec<String> = links.iter().filter(|l| self.memories.iter().any(|m| &m.id == *l)).cloned().collect();
        if let Some(m) = self.memories.iter_mut().find(|m| m.id == id) {
            m.by = by.chars().take(60).collect();
            m.links = known;
        }
        self.save();
    }

    pub fn recent_episodes(&self, n: usize) -> Vec<Memory> {
        let mut e: Vec<Memory> = self.memories.iter().filter(|m| m.kind == "episode").cloned().collect();
        e.sort_by_key(|m| m.created);
        e.split_off(e.len().saturating_sub(n))
    }

    pub fn as_json(&self) -> Value {
        json!({ "memories": self.memories, "suggestions": self.suggestions, "shares": self.shares, "groups": GROUPS })
    }
}

/// "Sara Lee <sara.lee@example.com>, Landlord" or "My accountant is Priya Shah, priya@ledger.example"
/// become a person: the email, the capitalized name next to it, and a role if given.
pub fn parse_person(text: &str) -> Option<Person> {
    let email = text.split(|c: char| c.is_whitespace() || c == '<' || c == '>' || c == ',' || c == '(' || c == ')').find(|w| w.contains('@') && w.contains('.'))?.trim_end_matches('.').to_string();
    let before = text.split(&email).next().unwrap_or("").trim_end_matches(|c: char| c == '<' || c == ',' || c.is_whitespace() || c == '(');
    let after = text.split(&email).nth(1).unwrap_or("").trim_start_matches(|c: char| c == '>' || c == ',' || c == ')' || c.is_whitespace());
    // the name: the run of capitalized words closest to the email
    let words: Vec<&str> = before.split_whitespace().collect();
    let mut name: Vec<&str> = words.iter().rev().take_while(|w| w.chars().next().is_some_and(|c| c.is_uppercase())).copied().collect();
    name.reverse();
    let name = name.join(" ").trim_end_matches(',').to_string();
    if name.is_empty() {
        return None;
    }
    // a role: what follows, or "my accountant is ..." before the name
    let role = if !after.trim().is_empty() {
        after.trim().trim_end_matches('.').to_string()
    } else {
        before.to_lowercase().split(" is ").next().map(|r| r.trim_start_matches("my ").trim().to_string()).filter(|r| !r.is_empty() && r.len() < 40 && !r.contains(&name.to_lowercase())).unwrap_or_default()
    };
    Some(Person { name, email, role })
}

pub fn new_id() -> String {
    format!("m{}", crate::state::random_hex(5))
}

#[cfg(test)]
mod tests {
    #[test]
    fn recency_doesnt_wrap_around() {
        let d = tempfile::tempdir().unwrap();
        let mut st = MemStore::open(&d.path().join("m.json"));
        // day 20999 and day 21000: the old modulo made the newer one look 999 days older
        st.add("Lunch spot is Dizengoff", "fact", "Personal", vec![], "you", 20_999 * 86400).unwrap();
        st.add("Lunch spot is Federal Donuts", "fact", "Personal", vec![], "you", 21_000 * 86400).unwrap();
        let v = Viewer { principal: "you", own: true, online: false };
        assert!(st.search("lunch spot", &v, 5)[0].text.contains("Federal"));
    }

    #[test]
    fn episodes_link_to_the_memories_they_used() {
        let d = tempfile::tempdir().unwrap();
        let mut st = MemStore::open(&d.path().join("m.json"));
        let fact = st.add("My accountant is Priya Shah, priya@ledger.example", "fact", "People", vec![], "you", 1).unwrap();
        let ep = st.add("day 1: emailed the invoice to Priya", "episode", "History", vec![], "goal g1", 2).unwrap();
        st.attach(&ep.id, "Pip (helper)", &[fact.id.clone(), "gone".into()]);
        let back = MemStore::open(&d.path().join("m.json"));
        let e = back.memories.iter().find(|m| m.id == ep.id).unwrap();
        assert_eq!(e.links, vec![fact.id], "only links to memories that exist, and kept across a restart");
        assert_eq!(e.by, "Pip (helper)");
    }

    use super::*;

    fn store() -> (tempfile::TempDir, MemStore) {
        let d = tempfile::tempdir().unwrap();
        let s = MemStore::open(&d.path().join("memory.json"));
        (d, s)
    }

    #[test]
    fn people_are_understood() {
        assert_eq!(parse_person("Sara Lee <sara.lee@example.com>, Landlord").unwrap(), Person { name: "Sara Lee".into(), email: "sara.lee@example.com".into(), role: "Landlord".into() });
        let p = parse_person("My accountant is Priya Shah, priya@ledger.example").unwrap();
        assert_eq!((p.name.as_str(), p.email.as_str(), p.role.as_str()), ("Priya Shah", "priya@ledger.example", "accountant"));
        assert!(parse_person("no email here").is_none());
    }

    #[test]
    fn secrets_never_enter_memory() {
        let (_d, mut s) = store();
        for t in ["my bank password is hunter2", "api key sk-abcdefghijklmnop123", "card 4111 1111 1111 1111", "my pin is 4321"] {
            assert!(s.add(t, "fact", "Personal", vec![], "you", 1).is_err(), "{t}");
        }
        assert!(s.add("My accountant is Priya Shah, priya@ledger.example", "fact", "People", vec![], "you", 1).is_ok());
        assert!(s.suggest("my password is 123456", "fact", "Personal", "x", 1).is_err());
    }

    #[test]
    fn views_follow_shares_and_sensitive_stays_home() {
        let (_d, mut s) = store();
        s.add("Project SIOS ships Phase 0 this month", "fact", "Work", vec![], "you", 1).unwrap();
        s.add("Therapist appointment every Tuesday", "fact", "Personal", vec!["Sensitive".into()], "you", 1).unwrap();
        let own_online = Viewer { principal: "gpt (via brain-d)", own: true, online: true };
        assert_eq!(s.search("project phase", &own_online, 10).len(), 1);
        assert!(s.search("therapist tuesday", &own_online, 10).is_empty(), "Sensitive never goes online");
        assert_eq!(s.held_back("therapist tuesday", &own_online), 1);
        let own_local = Viewer { principal: "local", own: true, online: false };
        assert_eq!(s.search("therapist tuesday", &own_local, 10).len(), 1);
        // an outside AI sees nothing until a group is shared, then only that group
        let claude = Viewer { principal: "Claude Desktop (MCP)", own: false, online: true };
        assert!(s.search("project phase", &claude, 10).is_empty());
        s.shares.insert("Claude Desktop (MCP)".into(), vec!["Work".into()]);
        assert_eq!(s.search("project phase", &claude, 10).len(), 1);
    }

    #[test]
    fn people_import_once_and_episodes_are_reclaimed() {
        let (_d, mut s) = store();
        let people = json!([{ "name": "Sara Okafor", "email": "sara@example.com", "role": "Design" }]);
        s.import_people(&people, 1);
        s.import_people(&people, 2);
        assert_eq!(s.memories.iter().filter(|m| m.kind == "person").count(), 1);
        for i in 0..(MAX_EPISODES + 5) {
            s.add(&format!("episode {i}"), "episode", "History", vec![], "goal", i as u64).unwrap();
        }
        assert_eq!(s.memories.iter().filter(|m| m.kind == "episode").count(), MAX_EPISODES);
        assert!(!s.memories.iter().any(|m| m.text == "episode 0"), "oldest went first");
    }

    #[test]
    fn suggestions_wait_and_persist() {
        let (d, mut s) = store();
        s.suggest("Finance files go in Documents/Finance", "preference", "Habits", "you did this 3 times", 1).unwrap();
        assert!(s.memories.is_empty(), "not saved until confirmed");
        let again = MemStore::open(&d.path().join("memory.json"));
        assert_eq!(again.suggestions.len(), 1);
    }

    #[test]
    fn newer_facts_replace_older_ones_and_can_be_reverted() {
        let (_d, mut s) = store();
        let v = Viewer { principal: "you", own: true, online: false };
        let priya = s.add("My accountant is Priya Shah, priya@ledger.example", "fact", "People", vec![], "you", 1).unwrap();
        s.add("Sara Lee <sara.lee@example.com>, landlord", "fact", "People", vec![], "you", 1).unwrap();
        let marcus = s.add("My accountant is now Marcus Webb <marcus@books.example>", "fact", "People", vec![], "you", 2).unwrap();
        let top = s.search("who is my accountant", &v, 5);
        assert!(top[0].text.contains("Marcus") && !top.iter().any(|m| m.text.contains("Priya")), "{top:?}");
        assert!(!s.search("landlord", &v, 5).is_empty(), "a different role stays");
        // same person, new email: replaces too
        s.add("Marcus Webb <marcus.webb@newfirm.example>, accountant", "fact", "People", vec![], "you", 3).unwrap();
        assert!(s.search("accountant email", &v, 5)[0].text.contains("newfirm"));
        // facts by subject
        s.add("I live in Philadelphia", "fact", "Personal", vec![], "you", 1).unwrap();
        s.add("I moved to Boston", "fact", "Personal", vec![], "you", 4).unwrap();
        let home = s.search("where do I live", &v, 5);
        assert!(home.iter().all(|m| !m.text.contains("Philadelphia")), "{home:?}");
        // revert brings the old one back in place of the new
        s.revert(&priya.id).unwrap();
        assert!(s.memories.iter().find(|m| m.id == marcus.id).unwrap().superseded_by.is_some());
        assert!(s.memories.iter().find(|m| m.id == priya.id).unwrap().live());
    }

    #[test]
    fn deleting_is_soft_for_30_days() {
        let (_d, mut s) = store();
        let v = Viewer { principal: "you", own: true, online: false };
        let m = s.add("Lunch spot is Dizengoff", "fact", "Personal", vec![], "you", 1).unwrap();
        s.soft_delete(&m.id, 10).unwrap();
        assert!(s.search("lunch spot", &v, 5).is_empty());
        s.revert(&m.id).unwrap();
        assert_eq!(s.search("lunch spot", &v, 5).len(), 1);
        s.soft_delete(&m.id, 10).unwrap();
        s.purge(10 + 31 * 86400);
        assert!(s.memories.is_empty(), "gone after 30 days");
    }

    #[test]
    fn two_friends_never_replace_each_other() {
        let (_d, mut s) = store();
        s.add("Ana Ruiz <ana@example.com>, friend", "fact", "People", vec![], "you", 1).unwrap();
        s.add("Ben Cho <ben@example.com>, friend", "fact", "People", vec![], "you", 2).unwrap();
        assert!(s.memories.iter().all(|m| m.live()));
        assert_eq!(subject("Lunch spot is Federal Donuts").as_deref(), Some("lunch spot"));
        assert_eq!(subject("I keep finance files in Documents/Money now").as_deref(), Some("i keep finance files"));
    }
}
