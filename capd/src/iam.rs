//! Agent IAM (proposed D22): who each AI is, and what its roles let it do.
//!
//! An identity has a stable id ("sios", "helper:pip", "app:claude-desktop"),
//! a kind, how it proved who it is, who added it, and roles. A role is a list
//! of statements: allow or deny some tools in some places under some
//! conditions; an allow runs on its own ("auto") or asks the owner ("ask").
//! Global roles apply to every AI. An explicit deny wins; nothing that fits
//! means no. The owner ("you") isn't limited by roles. Anything irreversible
//! still always asks (policy.rs), whatever a role says.
//!
//! Same JSON shape as the shell's lib/iam.ts. Saved in the state folder as
//! iam.json; only the owner may change it. Places are sandbox-relative
//! ("Projects"); a leading "~/" is accepted and ignored.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::policy::{Level, Res};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Effect {
    Allow,
    Deny,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Auto,
    Ask,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct When {
    /// Only for actions at most this risky: "read", "reversible", "irreversible".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_risk: Option<String>,
    /// Only after (true) or only before (false) the goal read untrusted content.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tainted: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Statement {
    pub id: String,
    pub effect: Effect,
    /// Tool names; "*" matches any run of characters ("fs.*", "*").
    pub tools: Vec<String>,
    /// Places it covers. Empty: anywhere.
    #[serde(default)]
    pub places: Vec<String>,
    #[serde(default = "auto")]
    pub mode: Mode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub when: Option<When>,
    #[serde(default)]
    pub note: String,
}

fn auto() -> Mode {
    Mode::Auto
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Role {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub about: String,
    #[serde(default)]
    pub statements: Vec<Statement>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub global: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    pub id: String,
    pub name: String,
    /// owner, assistant, helper, app, device
    pub kind: String,
    pub proof: String,
    pub created_by: String,
    #[serde(default)]
    pub roles: Vec<String>,
    /// Unix seconds.
    pub since: u64,
}

#[derive(Serialize, Deserialize, Default)]
pub struct Iam {
    #[serde(default)]
    pub identities: Vec<Identity>,
    #[serde(default)]
    pub roles: Vec<Role>,
    /// Identities the owner paused. Kept across restarts.
    #[serde(default)]
    pub paused: Vec<String>,
    /// sha256(pairing token) -> identity id. The token itself is shown once.
    #[serde(default)]
    pub pairings: BTreeMap<String, String>,
    #[serde(skip)]
    path: PathBuf,
}

pub const OWNER: &str = "you";
pub const SIOS: &str = "sios";
/// Role given to SIOS itself, helpers it creates, and AIs the owner mints a pass for.
pub const ACTS_FOR_YOU: &str = "acts-for-you";

fn st(id: &str, effect: Effect, tools: &[&str], places: &[&str], mode: Mode, note: &str, when: Option<When>) -> Statement {
    Statement { id: id.into(), effect, tools: tools.iter().map(|s| s.to_string()).collect(), places: places.iter().map(|s| s.to_string()).collect(), mode, when, note: note.into() }
}

fn seed_roles() -> Vec<Role> {
    let read_only = Some(When { max_risk: Some("read".into()), tainted: None });
    let undoable = Some(When { max_risk: Some("reversible".into()), tainted: None });
    vec![
        Role { id: "everyone".into(), name: "Every AI".into(), about: "Applies to every AI that isn't you. Denies here beat any allow.".into(), statements: vec![], global: true },
        Role {
            id: ACTS_FOR_YOU.into(),
            name: "Acts for you".into(),
            about: "Whatever its pass covers. For SIOS itself and helpers you create; anything that can't be undone still asks.".into(),
            statements: vec![st("a1", Effect::Allow, &["*"], &[], Mode::Auto, "Do what its pass covers", None)],
            global: false,
        },
        Role {
            id: "reader".into(),
            name: "Reader".into(),
            about: "Can look and search. Changes nothing.".into(),
            statements: vec![st("r1", Effect::Allow, &["fs.list", "fs.read", "fs.find", "memory.search", "people.resolve", "ui.*"], &[], Mode::Auto, "Look at and search anything not denied", read_only)],
            global: false,
        },
        Role {
            id: "organizer".into(),
            name: "Organizer".into(),
            about: "Tidies files in your working folders. Everything it does can be undone.".into(),
            statements: vec![st("o1", Effect::Allow, &["fs.move", "fs.organize", "fs.mkdir", "fs.write", "fs.copy", "fs.trash", "fs.restore"], &["Downloads", "Projects"], Mode::Auto, "Move and tidy files in Downloads and Projects", undoable)],
            global: false,
        },
        Role {
            id: "mailer".into(),
            name: "Mailer".into(),
            about: "Can send email, after you say yes each time.".into(),
            statements: vec![st("m1", Effect::Allow, &["mail.send"], &[], Mode::Ask, "Send email, after you say yes", None)],
            global: false,
        },
    ]
}

fn seed_identities(now: u64) -> Vec<Identity> {
    vec![
        Identity { id: OWNER.into(), name: "You".into(), kind: "owner".into(), proof: "owner.secret (on SIOS: your login)".into(), created_by: "Setup".into(), roles: vec![], since: now },
        Identity { id: SIOS.into(), name: "SIOS".into(), kind: "assistant".into(), proof: "service.secret (on SIOS: its systemd unit)".into(), created_by: "Setup".into(), roles: vec![ACTS_FOR_YOU.into()], since: now },
    ]
}

// ---------------------------------------------------------------- matching

pub fn tool_matches(pattern: &str, tool: &str) -> bool {
    // "*" is any run of characters; everything else is literal
    let parts: Vec<&str> = pattern.split('*').collect();
    if parts.len() == 1 {
        return pattern == tool;
    }
    let mut rest = tool;
    for (i, part) in parts.iter().enumerate() {
        if i == 0 {
            match rest.strip_prefix(part) {
                Some(r) => rest = r,
                None => return false,
            }
        } else if i == parts.len() - 1 {
            return rest.ends_with(part);
        } else {
            match rest.find(part) {
                Some(at) => rest = &rest[at + part.len()..],
                None => return false,
            }
        }
    }
    true
}

fn place(p: &str) -> &str {
    p.trim_start_matches("~/").trim_start_matches('~').trim_matches('/')
}

fn risk(l: Level) -> u8 {
    match l {
        Level::Read => 0,
        Level::Reversible => 1,
        Level::Irreversible => 2,
    }
}

fn risk_named(s: &str) -> u8 {
    match s {
        "read" => 0,
        "reversible" => 1,
        _ => 2,
    }
}

pub struct Action<'a> {
    pub tool: &'a str,
    pub level: Level,
    /// Sandbox-relative paths it touches.
    pub places: &'a [String],
    pub tainted: bool,
}

fn covers(s: &Statement, a: &Action) -> bool {
    if !s.tools.iter().any(|t| tool_matches(t, a.tool)) {
        return false;
    }
    if !s.places.is_empty() && (a.places.is_empty() || !a.places.iter().all(|p| s.places.iter().any(|sp| crate::token::within(p, place(sp))))) {
        return false;
    }
    if let Some(w) = &s.when {
        if w.max_risk.as_deref().is_some_and(|m| risk(a.level) > risk_named(m)) {
            return false;
        }
        if w.tainted.is_some_and(|t| t != a.tainted) {
            return false;
        }
    }
    true
}

pub struct Decided {
    pub result: Res,
    pub detail: String,
}

impl Iam {
    pub fn open(path: &Path, now: u64) -> Iam {
        let mut iam: Iam = std::fs::read(path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        iam.path = path.to_path_buf();
        // the built-ins are always there, even in an older or hand-edited file
        for r in seed_roles() {
            if !iam.roles.iter().any(|x| x.id == r.id) {
                iam.roles.push(r);
            }
        }
        for i in seed_identities(now) {
            if !iam.identities.iter().any(|x| x.id == i.id) {
                iam.identities.push(i);
            }
        }
        iam
    }

    pub fn save(&self) {
        if let Ok(b) = serde_json::to_vec_pretty(self) {
            let tmp = self.path.with_extension("json.tmp");
            if std::fs::write(&tmp, b).is_ok() {
                let _ = std::fs::rename(tmp, &self.path);
            }
        }
    }

    pub fn get(&self, id: &str) -> Option<&Identity> {
        self.identities.iter().find(|i| i.id == id)
    }

    pub fn is_paused(&self, id: &str) -> bool {
        self.paused.iter().any(|p| p == id)
    }

    /// Add an identity if it isn't there yet. Returns false if the id is taken.
    pub fn register(&mut self, id: &str, name: &str, kind: &str, proof: &str, created_by: &str, roles: Vec<String>, now: u64) -> bool {
        if self.get(id).is_some() {
            return false;
        }
        self.identities.push(Identity { id: id.into(), name: name.into(), kind: kind.into(), proof: proof.into(), created_by: created_by.into(), roles, since: now });
        self.save();
        true
    }

    fn roles_of(&self, id: &str) -> Vec<&Role> {
        let mine = self.get(id).map(|i| i.roles.clone()).unwrap_or_default();
        self.roles.iter().filter(|r| r.global || mine.contains(&r.id)).collect()
    }

    pub fn decide(&self, principal: &str, a: &Action) -> Decided {
        if principal == OWNER {
            return Decided { result: Res::Pass, detail: "You did this yourself. Roles limit AIs, not you.".into() };
        }
        let Some(me) = self.get(principal) else {
            return Decided { result: Res::Fail, detail: format!("{principal} isn't a registered identity, so it can't do anything.") };
        };
        let roles = self.roles_of(principal);
        for r in &roles {
            for s in &r.statements {
                if s.effect == Effect::Deny && covers(s, a) {
                    return Decided { result: Res::Fail, detail: format!("Denied by \"{}\" ({}).", s.note, r.name) };
                }
            }
        }
        let mut ask: Option<Decided> = None;
        for r in &roles {
            for s in &r.statements {
                if s.effect != Effect::Allow || !covers(s, a) {
                    continue;
                }
                if s.mode == Mode::Auto {
                    return Decided { result: Res::Pass, detail: format!("Allowed by \"{}\" ({}).", s.note, r.name) };
                }
                if ask.is_none() {
                    ask = Some(Decided { result: Res::Ask, detail: format!("\"{}\" ({}) allows this, but asks you first.", s.note, r.name) });
                }
            }
        }
        if let Some(a) = ask {
            return a;
        }
        let names: Vec<&str> = roles.iter().filter(|r| !r.global).map(|r| r.name.as_str()).collect();
        Decided {
            result: Res::Fail,
            detail: if names.is_empty() {
                format!("{} has no roles yet, so it can't do anything.", me.name)
            } else {
                format!("None of its roles ({}) allow {}{}.", names.join(", "), a.tool, if a.places.is_empty() { String::new() } else { format!(" in {}", a.places.join(" and ")) })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn iam() -> Iam {
        let mut i = Iam::open(Path::new("/nonexistent/iam.json"), 0);
        i.register("app:claude", "Claude", "app", "pairing", "you", vec!["reader".into(), "organizer".into()], 0);
        i
    }

    fn act<'a>(tool: &'a str, level: Level, places: &'a [String]) -> Action<'a> {
        Action { tool, level, places, tainted: false }
    }

    #[test]
    fn globs() {
        assert!(tool_matches("*", "fs.read"));
        assert!(tool_matches("fs.*", "fs.read"));
        assert!(!tool_matches("fs.*", "mail.send"));
        assert!(tool_matches("*.send", "mail.send"));
        assert!(tool_matches("ui.*", "ui.open_app"));
        assert!(!tool_matches("fs.read", "fs.readx"));
    }

    #[test]
    fn roles_allow_deny_and_default_no() {
        let mut i = iam();
        let p = |s: &str| vec![s.to_string()];
        assert_eq!(i.decide("app:claude", &act("fs.read", Level::Read, &p("Documents/a.txt"))).result, Res::Pass);
        assert_eq!(i.decide("app:claude", &act("fs.move", Level::Reversible, &p("Downloads/a"))).result, Res::Pass);
        assert_eq!(i.decide("app:claude", &act("fs.move", Level::Reversible, &p("Documents/a"))).result, Res::Fail);
        assert_eq!(i.decide("app:claude", &act("mail.send", Level::Irreversible, &[])).result, Res::Fail);
        assert_eq!(i.decide("nobody", &act("fs.read", Level::Read, &[])).result, Res::Fail);
        assert_eq!(i.decide(OWNER, &act("fs.delete", Level::Irreversible, &[])).result, Res::Pass);
        // a global deny beats any allow, "~/" places work too
        i.roles[0].statements.push(st("d", Effect::Deny, &["*"], &["~/Documents/Taxes"], Mode::Auto, "Never Taxes", None));
        let d = i.decide("app:claude", &act("fs.read", Level::Read, &p("Documents/Taxes/r.txt")));
        assert_eq!(d.result, Res::Fail);
        assert!(d.detail.contains("Never Taxes"));
        // ask mode
        i.get_mut_for_test("app:claude").roles.push("mailer".into());
        assert_eq!(i.decide("app:claude", &act("mail.send", Level::Irreversible, &[])).result, Res::Ask);
    }

    #[test]
    fn same_shape_as_the_shell() {
        // a role written by the shell (lib/iam.ts) reads back here
        let r: Role = serde_json::from_str(r#"{"id":"x","name":"X","about":"","statements":[{"id":"s","effect":"allow","tools":["files.*"],"places":["~/Projects"],"mode":"ask","when":{"maxRisk":"reversible","tainted":false},"note":"n"}]}"#).unwrap();
        assert_eq!(r.statements[0].when.as_ref().unwrap().max_risk.as_deref(), Some("reversible"));
        let i: Identity = serde_json::from_str(r#"{"id":"a","name":"A","kind":"app","proof":"p","createdBy":"You","roles":[],"since":1}"#).unwrap();
        assert_eq!(i.created_by, "You");
    }

    impl Iam {
        fn get_mut_for_test(&mut self, id: &str) -> &mut Identity {
            self.identities.iter_mut().find(|i| i.id == id).unwrap()
        }
    }
}
