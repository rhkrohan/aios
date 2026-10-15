//! Agents (A4, D60): the pet team, kept by the broker. Each agent is its own
//! identity (`agent:<slug>`, kind "agent"), with a brain, a job and reports.
//!   brain  builtin: SIOS's planner on the AI you chose in Settings (brain-d runs it)
//!          claude-code: Claude Code in its own sandboxed workspace (A5, runner.rs)
//!   job    on demand, watch a folder, every N minutes, daily at a time, or a project
//! Only the owner adds, changes or removes agents (password). SIOS's windows may
//! look (D59). brain-d reads the list as the service and posts each run's report.
//! Report text written by an agent is untrusted data: shown, never instructions.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub const BRAINS: [&str; 2] = ["builtin", "claude-code"];
pub const JOBS: [&str; 5] = ["on-demand", "watch", "every", "daily", "project"];
const COLORS: [&str; 8] = ["mint", "sky", "violet", "peach", "rose", "lemon", "slate", "coral"];
const MAX_REPORTS: usize = 200;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Agent {
    /// "agent:<slug>"
    pub id: String,
    pub name: String,
    pub color: String,
    pub brain: String,
    pub job: String,
    /// What it does, in the owner's words ("Sort new files into folders").
    pub instructions: String,
    /// watch: the folder; project: the project folder (home-relative).
    #[serde(default)]
    pub folder: String,
    /// every: minutes between runs.
    #[serde(default)]
    pub every_min: u64,
    /// daily: "HH:MM".
    #[serde(default)]
    pub at: String,
    pub active: bool,
    pub created: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Report {
    pub at: u64,
    pub agent: String,
    /// run, progress, question, done
    pub kind: String,
    /// What happened, in the agent's (or SIOS's) words: untrusted, capped.
    pub text: String,
    #[serde(default)]
    pub failed: bool,
    #[serde(default)]
    pub goal: String,
    #[serde(default)]
    pub read: bool,
}

#[derive(Serialize, Deserialize, Default)]
pub struct Registry {
    #[serde(default)]
    pub agents: Vec<Agent>,
    #[serde(default)]
    pub reports: Vec<Report>,
    #[serde(skip)]
    path: PathBuf,
}

pub fn slug(name: &str) -> String {
    name.to_lowercase().split(|c: char| !c.is_ascii_alphanumeric()).filter(|x| !x.is_empty()).collect::<Vec<_>>().join("-")
}

/// A home-relative folder an agent may name: no "..", no hidden parts, not absolute.
fn folder_ok(f: &str) -> bool {
    !f.is_empty() && !f.starts_with('/') && f.split('/').all(|p| !p.is_empty() && p != ".." && p != "." && !p.starts_with('.'))
}

impl Registry {
    pub fn open(dir: &Path) -> Registry {
        let path = dir.join("agents.json");
        let mut r: Registry = std::fs::read(&path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        r.path = path;
        r
    }

    pub fn save(&self) {
        use std::os::unix::fs::OpenOptionsExt;
        let tmp = self.path.with_extension("json.tmp");
        let ok = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&tmp)
            .and_then(|mut f| std::io::Write::write_all(&mut f, &serde_json::to_vec_pretty(self).unwrap_or_default()));
        if ok.is_ok() {
            let _ = std::fs::rename(&tmp, &self.path);
        }
    }

    pub fn get(&self, id: &str) -> Option<&Agent> {
        self.agents.iter().find(|a| a.id == id)
    }

    /// A new agent from the owner's form. Checked here; the identity is made by the caller.
    pub fn add(&mut self, p: &Value, now: u64) -> Result<Agent, String> {
        let name: String = p["name"].as_str().unwrap_or("").trim().chars().filter(|c| c.is_alphanumeric() || *c == ' ').take(20).collect();
        let s = slug(&name);
        if s.is_empty() {
            return Err("an agent needs a name".into());
        }
        if self.agents.iter().any(|a| a.id == format!("agent:{s}")) {
            return Err(format!("there's already an agent called {name}"));
        }
        let a = Agent {
            id: format!("agent:{s}"),
            name,
            color: COLORS.iter().find(|c| Some(**c) == p["color"].as_str()).unwrap_or(&COLORS[self.agents.len() % COLORS.len()]).to_string(),
            brain: String::new(),
            job: String::new(),
            instructions: String::new(),
            folder: String::new(),
            every_min: 0,
            at: String::new(),
            active: true,
            created: now,
        };
        let a = Self::apply(a, p)?;
        self.agents.push(a.clone());
        self.save();
        Ok(a)
    }

    /// Change what an agent does (name and id stay).
    pub fn update(&mut self, p: &Value) -> Result<Agent, String> {
        let id = p["id"].as_str().unwrap_or("");
        let i = self.agents.iter().position(|a| a.id == id).ok_or("no such agent")?;
        let a = Self::apply(self.agents[i].clone(), p)?;
        self.agents[i] = a.clone();
        self.save();
        Ok(a)
    }

    fn apply(mut a: Agent, p: &Value) -> Result<Agent, String> {
        if let Some(b) = p["brain"].as_str() {
            if !BRAINS.contains(&b) {
                return Err("the brain is builtin (SIOS) or claude-code".into());
            }
            a.brain = b.into();
        }
        if let Some(j) = p["job"].as_str() {
            if !JOBS.contains(&j) {
                return Err("the job is on-demand, watch, every, daily or project".into());
            }
            a.job = j.into();
        }
        if let Some(t) = p["instructions"].as_str() {
            a.instructions = t.trim().chars().take(1000).collect();
        }
        if let Some(f) = p["folder"].as_str() {
            a.folder = f.trim().trim_matches('/').to_string();
        }
        if let Some(m) = p["every_min"].as_u64() {
            a.every_min = m.clamp(5, 7 * 24 * 60);
        }
        if let Some(t) = p["at"].as_str() {
            a.at = t.trim().to_string();
        }
        if let Some(on) = p["active"].as_bool() {
            a.active = on;
        }
        if a.brain.is_empty() {
            a.brain = "builtin".into();
        }
        if a.job.is_empty() {
            a.job = "on-demand".into();
        }
        // what each job needs, so nothing half-made is saved
        if a.instructions.is_empty() {
            return Err("say what the agent should do".into());
        }
        if (a.job == "watch" || a.job == "project" || a.brain == "claude-code") && !folder_ok(&a.folder) {
            return Err("pick a folder in your home (no hidden folders)".into());
        }
        if a.job == "every" && a.every_min == 0 {
            a.every_min = 60;
        }
        if a.job == "daily" {
            let ok = a.at.split_once(':').is_some_and(|(h, m)| h.parse::<u8>().is_ok_and(|h| h < 24) && m.len() == 2 && m.parse::<u8>().is_ok_and(|m| m < 60));
            if !ok {
                return Err("a daily job needs a time like 08:30".into());
            }
        }
        Ok(a)
    }

    pub fn remove(&mut self, id: &str) -> Option<Agent> {
        let i = self.agents.iter().position(|a| a.id == id)?;
        let a = self.agents.remove(i);
        self.reports.retain(|r| r.agent != id);
        self.save();
        Some(a)
    }

    /// A report from a run (brain-d) or from the agent itself (A5). Text is capped.
    pub fn report(&mut self, agent: &str, kind: &str, text: &str, failed: bool, goal: &str, now: u64) -> Result<(), String> {
        if self.get(agent).is_none() {
            return Err("no such agent".into());
        }
        let kind = if ["run", "progress", "question", "done"].contains(&kind) { kind } else { "run" };
        let text: String = text.chars().filter(|c| !c.is_control() || *c == '\n').take(2000).collect();
        self.reports.insert(0, Report { at: now, agent: agent.into(), kind: kind.into(), text, failed, goal: goal.chars().take(64).collect(), read: false });
        self.reports.truncate(MAX_REPORTS);
        self.save();
        Ok(())
    }

    pub fn mark_read(&mut self, agent: Option<&str>) {
        for r in self.reports.iter_mut().filter(|r| agent.is_none_or(|a| r.agent == a)) {
            r.read = true;
        }
        self.save();
    }

    pub fn view(&self) -> Value {
        let unread = self.reports.iter().filter(|r| !r.read).count();
        json!({ "agents": self.agents, "reports": self.reports.iter().take(100).collect::<Vec<_>>(), "unread": unread, "brains": BRAINS, "jobs": JOBS, "colors": COLORS })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agents_need_what_their_job_needs() {
        let d = tempfile::tempdir().unwrap();
        let mut r = Registry::open(d.path());
        assert!(r.add(&json!({ "name": "", "instructions": "x" }), 1).is_err());
        assert!(r.add(&json!({ "name": "Pip" }), 1).is_err(), "says what to do");
        assert!(r.add(&json!({ "name": "Pip", "job": "watch", "instructions": "sort", "folder": "../etc" }), 1).is_err());
        assert!(r.add(&json!({ "name": "Pip", "job": "watch", "instructions": "sort", "folder": ".ssh" }), 1).is_err());
        assert!(r.add(&json!({ "name": "Pip", "job": "daily", "instructions": "brief", "at": "25:00" }), 1).is_err());
        assert!(r.add(&json!({ "name": "Coder", "brain": "claude-code", "instructions": "help on the parser" }), 1).is_err(), "a coding agent needs its project folder");
        let a = r.add(&json!({ "name": "Pip", "job": "watch", "instructions": "Sort new files", "folder": "Downloads/" }), 1).unwrap();
        assert_eq!((a.id.as_str(), a.folder.as_str(), a.brain.as_str()), ("agent:pip", "Downloads", "builtin"));
        assert!(r.add(&json!({ "name": "pip", "instructions": "x" }), 1).is_err(), "names are unique");
        let every = r.add(&json!({ "name": "Momo", "job": "every", "every_min": 1, "instructions": "check big files" }), 1).unwrap();
        assert_eq!(every.every_min, 5, "at least 5 minutes apart");
        assert_eq!(Registry::open(d.path()).agents.len(), 2, "saved");
    }

    #[test]
    fn reports_are_capped_and_belong_to_an_agent() {
        let d = tempfile::tempdir().unwrap();
        let mut r = Registry::open(d.path());
        r.add(&json!({ "name": "Pip", "instructions": "x" }), 1).unwrap();
        assert!(r.report("agent:nobody", "run", "x", false, "", 2).is_err());
        r.report("agent:pip", "weird", &"y".repeat(5000), false, "g1", 2).unwrap();
        assert_eq!(r.reports[0].kind, "run");
        assert_eq!(r.reports[0].text.len(), 2000);
        assert_eq!(r.view()["unread"], 1);
        r.mark_read(None);
        assert_eq!(r.view()["unread"], 0);
        r.remove("agent:pip");
        assert!(r.reports.is_empty(), "its reports go with it");
    }
}
