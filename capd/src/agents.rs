//! Agents (A4, D60): the pet team, kept by the broker. Each agent is its own
//! identity (`agent:<slug>`, kind "agent"), with a brain, a job and reports.
//!   brain  builtin: SIOS's planner on the AI you chose in Settings (brain-d runs it)
//!          claude-code, codex, cursor, gemini: a coding CLI in its own sandboxed workspace (A5, D100, runner.rs, brains.rs)
//!   job    on demand, watch a folder, every N minutes, daily at a time, or a project
//! Only the owner adds, changes or removes agents (password). SIOS's windows may
//! look (D59). brain-d reads the list as the service and posts each run's report.
//! Report text written by an agent is untrusted data: shown, never instructions.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub const BRAINS: [&str; 5] = ["builtin", "claude-code", "codex", "cursor", "gemini"];
pub const JOBS: [&str; 5] = ["on-demand", "watch", "every", "daily", "project"];
const COLORS: [&str; 8] = ["mint", "sky", "violet", "peach", "rose", "lemon", "slate", "coral"];
const MAX_REPORTS: usize = 200;
const MAX_RUNS: usize = 300;
/// Token limits (Claude Code's own count: input, output and cache writes; cheap
/// cache reads aren't counted). Defaults: 2M per task, 6M per rolling 24 hours.
pub const TASK_TOKENS: u64 = 2_000_000;
pub const DAY_TOKENS: u64 = 6_000_000;
fn task_tokens() -> u64 {
    TASK_TOKENS
}
fn day_tokens() -> u64 {
    DAY_TOKENS
}

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
    /// A work lease (D65): until when it may start runs without asking again.
    #[serde(default)]
    pub lease_until: u64,
    /// Claude Code's session, so the next task continues where it left off.
    #[serde(default)]
    pub session: String,
    /// The run going on now ("" when resting).
    #[serde(default)]
    pub run: String,
    /// The broker stops a run that goes past these (owner's choice, password).
    #[serde(default = "task_tokens")]
    pub max_task_tokens: u64,
    #[serde(default = "day_tokens")]
    pub max_day_tokens: u64,
    /// Hand-off (A9a): when a task ends well, this agent gets its summary as a task.
    #[serde(default)]
    pub then: String,
    /// When its schedule (every / daily) last started a task.
    #[serde(default)]
    pub last_sched: u64,
}

/// One task a coding agent worked on: what it cost and what it touched, counted
/// by the broker from Claude Code's own stream (never from what the agent says).
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct RunInfo {
    pub id: String,
    pub agent: String,
    /// The owner's words (capped).
    pub task: String,
    pub started: u64,
    #[serde(default)]
    pub ended: u64,
    #[serde(default)]
    pub tokens: u64,
    #[serde(default)]
    pub cost_usd: f64,
    #[serde(default)]
    pub commands: u64,
    /// Files it made or changed, relative to its copy of the project (at most 50).
    #[serde(default)]
    pub files: Vec<String>,
    /// working, done, failed, stopped: limit, stopped: time, stopped: you
    pub state: String,
}

/// A brain that works in its own sandboxed workspace (not SIOS's planner).
pub fn is_coder(brain: &str) -> bool {
    brain != "builtin" && BRAINS.contains(&brain)
}

/// Minutes since local midnight, and which local day it is (for daily jobs).
pub fn local_now(t: u64) -> (u64, i64) {
    #[cfg(target_os = "linux")]
    {
        // SAFETY: localtime_r fills `tm` from `secs`; both live on this stack.
        let mut tm: libc::tm = unsafe { std::mem::zeroed() };
        let secs = t as libc::time_t;
        if !unsafe { libc::localtime_r(&secs, &mut tm) }.is_null() {
            let off = tm.tm_gmtoff;
            return ((tm.tm_hour * 60 + tm.tm_min) as u64, (t as i64 + off).div_euclid(86400));
        }
    }
    ((t % 86400) / 60, (t / 86400) as i64)
}

/// Is a daily job at "HH:MM" due, given when it last started?
pub fn daily_due(at: &str, last: u64, now: u64) -> bool {
    let Some((h, m)) = at.split_once(':').and_then(|(h, m)| Some((h.parse::<u64>().ok()?, m.parse::<u64>().ok()?))) else { return false };
    let (mins, day) = local_now(now);
    mins >= h * 60 + m && (last == 0 || local_now(last).1 < day)
}

impl Agent {
    pub fn slug(&self) -> &str {
        self.id.strip_prefix("agent:").unwrap_or(&self.id)
    }
    pub fn leased(&self, now: u64) -> bool {
        self.lease_until > now
    }
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
    #[serde(default)]
    pub runs: Vec<RunInfo>,
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
        // its units are sios-agent-<name> and sios-agent-<name>-signin: no name may end like the second
        if s.ends_with("-signin") {
            return Err("pick another name (it can't end in \"signin\")".into());
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
            lease_until: 0,
            session: String::new(),
            run: String::new(),
            max_task_tokens: TASK_TOKENS,
            max_day_tokens: DAY_TOKENS,
            then: String::new(),
            last_sched: 0,
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
        // a hand-off never comes back round to this agent (no ping-pong)
        let mut next = a.then.clone();
        for _ in 0..self.agents.len() {
            if next.is_empty() {
                break;
            }
            if next == a.id {
                return Err("that hand-off would come back to this agent".into());
            }
            next = self.get(&next).map(|x| x.then.clone()).unwrap_or_default();
        }
        self.agents[i] = a.clone();
        self.save();
        Ok(a)
    }

    fn apply(mut a: Agent, p: &Value) -> Result<Agent, String> {
        if let Some(b) = p["brain"].as_str() {
            if !BRAINS.contains(&b) {
                return Err(format!("the brain is one of {}", BRAINS.join(", ")));
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
        if let Some(t) = p["then"].as_str() {
            if !t.is_empty() && (!t.starts_with("agent:") || t == a.id) {
                return Err("hand its work to another agent".into());
            }
            a.then = t.into();
        }
        if let Some(n) = p["max_task_tokens"].as_u64() {
            a.max_task_tokens = n.clamp(100_000, 50_000_000);
        }
        if let Some(n) = p["max_day_tokens"].as_u64() {
            a.max_day_tokens = n.clamp(a.max_task_tokens.min(200_000_000), 200_000_000);
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
        if (a.job == "watch" || a.job == "project" || is_coder(&a.brain)) && !folder_ok(&a.folder) {
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

    pub fn get_mut(&mut self, id: &str) -> Option<&mut Agent> {
        self.agents.iter_mut().find(|a| a.id == id)
    }

    pub fn remove(&mut self, id: &str) -> Option<Agent> {
        let i = self.agents.iter().position(|a| a.id == id)?;
        let a = self.agents.remove(i);
        self.reports.retain(|r| r.agent != id);
        self.runs.retain(|r| r.agent != id);
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

    /// A run starts: it's on the list as working.
    pub fn run_started(&mut self, agent: &str, id: &str, task: &str, now: u64) {
        self.runs.insert(0, RunInfo { id: id.into(), agent: agent.into(), task: task.chars().filter(|c| !c.is_control()).take(300).collect(), started: now, state: "working".into(), ..Default::default() });
        self.runs.truncate(MAX_RUNS);
        self.save();
    }

    pub fn run_mut(&mut self, id: &str) -> Option<&mut RunInfo> {
        self.runs.iter_mut().find(|r| r.id == id)
    }

    /// Tokens an agent used in the 24 hours before `now`, its runs together.
    pub fn day_tokens(&self, agent: &str, now: u64) -> u64 {
        self.runs.iter().filter(|r| r.agent == agent && (r.ended == 0 || r.ended + 86_400 > now)).map(|r| r.tokens).sum()
    }

    /// Why a working run must stop now, if it must: its task limit, its day limit,
    /// or its lease running out. Decided here, by the broker, from its own counts.
    pub fn over_limit(&self, run: &str, now: u64) -> Option<&'static str> {
        // a run the broker doesn't know, or whose agent is gone, doesn't go on
        let Some(r) = self.runs.iter().find(|r| r.id == run) else { return Some("stopped: unknown") };
        let Some(a) = self.get(&r.agent) else { return Some("stopped: unknown") };
        if r.tokens >= a.max_task_tokens {
            Some("stopped: task limit")
        } else if self.day_tokens(&r.agent, now) >= a.max_day_tokens {
            Some("stopped: day limit")
        } else if !a.leased(now) {
            Some("stopped: time")
        } else {
            None
        }
    }

    /// Coding agents whose schedule says "now" (A9a): only inside a lease, when on and
    /// resting. Their standing instructions are the task. Marks them as started.
    pub fn due(&mut self, now: u64) -> Vec<(String, String)> {
        let mut out = vec![];
        for a in self.agents.iter_mut().filter(|a| is_coder(&a.brain) && a.active && a.leased(now) && a.run.is_empty()) {
            let due = match a.job.as_str() {
                "every" => a.last_sched == 0 || now >= a.last_sched + a.every_min.max(5) * 60,
                "daily" => daily_due(&a.at, a.last_sched, now),
                _ => false,
            };
            if due {
                a.last_sched = now;
                out.push((a.id.clone(), a.instructions.clone()));
            }
        }
        if !out.is_empty() {
            self.save();
        }
        out
    }

    pub fn view(&self) -> Value {
        let unread = self.reports.iter().filter(|r| !r.read).count();
        json!({ "agents": self.agents, "reports": self.reports.iter().take(100).collect::<Vec<_>>(), "runs": self.runs.iter().take(100).collect::<Vec<_>>(), "unread": unread, "brains": BRAINS, "jobs": JOBS, "colors": COLORS })
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
        assert!(r.add(&json!({ "name": "Coder signin", "instructions": "x" }), 1).is_err(), "no clash with a sign-in unit");
        let every = r.add(&json!({ "name": "Momo", "job": "every", "every_min": 1, "instructions": "check big files" }), 1).unwrap();
        assert_eq!(every.every_min, 5, "at least 5 minutes apart");
        assert_eq!(Registry::open(d.path()).agents.len(), 2, "saved");
    }

    #[test]
    fn the_broker_stops_a_run_at_its_limits_or_when_its_time_is_up() {
        let d = tempfile::tempdir().unwrap();
        let mut r = Registry::open(d.path());
        r.add(&json!({ "name": "Coder", "brain": "claude-code", "instructions": "x", "folder": "Projects/site", "max_task_tokens": 1, "max_day_tokens": 1 }), 1).unwrap();
        let a = r.get("agent:coder").unwrap();
        assert_eq!((a.max_task_tokens, a.max_day_tokens), (100_000, 100_000), "limits have a floor; the day is at least one task");
        r.get_mut("agent:coder").unwrap().lease_until = 10_000;
        r.run_started("agent:coder", "r1", "Add a form", 100);
        assert_eq!(r.over_limit("r1", 200), None);
        assert_eq!(r.over_limit("nope", 200), Some("stopped: unknown"), "fail closed");
        r.run_mut("r1").unwrap().tokens = 100_000;
        assert_eq!(r.over_limit("r1", 200), Some("stopped: task limit"));
        // yesterday's runs still count for 24 hours, then drop off the day
        r.run_mut("r1").unwrap().ended = 300;
        r.run_started("agent:coder", "r2", "Next", 400);
        assert_eq!(r.over_limit("r2", 500), Some("stopped: day limit"));
        r.get_mut("agent:coder").unwrap().lease_until = 100_000;
        assert_eq!(r.over_limit("r2", 300 + 86_400), None);
        assert_eq!(r.over_limit("r2", 100_001), Some("stopped: time"));
        r.remove("agent:coder");
        assert!(r.runs.is_empty(), "its runs go with it");
    }

    #[test]
    fn coding_agents_run_on_their_schedule_only_inside_a_lease() {
        let d = tempfile::tempdir().unwrap();
        let mut r = Registry::open(d.path());
        r.add(&json!({ "name": "Tidy", "brain": "claude-code", "job": "every", "every_min": 30, "instructions": "keep the tests green", "folder": "Projects/site" }), 1).unwrap();
        assert!(r.due(1000).is_empty(), "no lease, no run");
        r.get_mut("agent:tidy").unwrap().lease_until = 10_000;
        assert_eq!(r.due(1000), vec![("agent:tidy".to_string(), "keep the tests green".to_string())]);
        assert!(r.due(1000 + 29 * 60).is_empty(), "not again before 30 minutes");
        r.get_mut("agent:tidy").unwrap().run = "r1".into();
        assert!(r.due(1000 + 31 * 60).is_empty(), "never while it works");
        r.get_mut("agent:tidy").unwrap().run.clear();
        r.get_mut("agent:tidy").unwrap().active = false;
        assert!(r.due(1000 + 31 * 60).is_empty(), "never while paused");
        assert!(r.update(&json!({ "id": "agent:tidy", "then": "agent:tidy" })).is_err(), "not to itself");
        assert!(r.update(&json!({ "id": "agent:tidy", "then": "helper:x" })).is_err());
        assert_eq!(r.update(&json!({ "id": "agent:tidy", "then": "agent:docs" })).unwrap().then, "agent:docs");
        r.add(&json!({ "name": "Docs", "brain": "claude-code", "instructions": "docs", "folder": "Projects/site", "then": "agent:tidy" }), 1).unwrap();
        r.update(&json!({ "id": "agent:tidy", "then": "" })).unwrap();
        r.update(&json!({ "id": "agent:docs", "then": "agent:tidy" })).unwrap();
        assert!(r.update(&json!({ "id": "agent:tidy", "then": "agent:docs" })).is_err(), "no cycles");
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
