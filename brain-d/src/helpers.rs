//! Helpers: the pet team. Each helper is its own AI identity ("Pip (helper)")
//! with one long-running job, and it reports back when a run finishes:
//!   watch  when new files land in a folder, run the request
//!   every  run the request every N minutes
//!   once   work on one big request now, then rest
//! Every run is an ordinary goal: briefed, planned, checked by capd, asking the
//! owner unless a standing rule covers it. On SIOS each helper is a systemd
//! user timer or an inotify watch owned by brain-d.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::Brain;

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HelperRun {
    pub goal: String,
    pub at: u64,
    pub text: String,
    pub failed: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Helper {
    pub id: String,
    pub name: String,
    pub color: String,
    /// watch, every, once
    pub kind: String,
    #[serde(default)]
    pub folder: String,
    #[serde(default)]
    pub every_min: u64,
    pub request: String,
    pub active: bool,
    pub created: u64,
    #[serde(default)]
    pub last_run: u64,
    #[serde(default)]
    pub runs: Vec<HelperRun>,
    /// Off the desktop, still working (reports still come through the leader).
    #[serde(default)]
    pub hidden: bool,
    /// Which AI drives it. Only connected brains can be chosen (D15: any model can drive).
    #[serde(default = "default_brain")]
    pub brain: String,
}

fn default_brain() -> String {
    "openai".into()
}

/// The brains an agent can run on. Only connected ones can be picked; the rest are slots for later.
pub const BRAINS: [(&str, bool); 4] = [("openai", true), ("claude", false), ("muse", false), ("local", false)];

pub fn check_brain(b: &str) -> Result<(), String> {
    match BRAINS.iter().find(|(id, _)| *id == b) {
        Some((_, true)) => Ok(()),
        Some((id, false)) => Err(format!("{id} isn't connected yet")),
        None => Err(format!("there's no brain called {b}")),
    }
}

impl Helper {
    pub fn principal(&self) -> String {
        format!("helper:{}", crate::slug(&self.name))
    }
}

pub struct Helpers {
    path: PathBuf,
    pub list: Vec<Helper>,
    /// helper id -> the goal it's working on right now
    pub running: HashMap<String, String>,
}

impl Helpers {
    pub fn open(path: PathBuf) -> Helpers {
        let list = std::fs::read(&path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        Helpers { path, list, running: HashMap::new() }
    }

    pub fn save(&self) {
        let _ = std::fs::write(&self.path, serde_json::to_vec_pretty(&self.list).unwrap_or_default());
    }

    pub fn add(&mut self, p: &Value) -> Result<Helper, String> {
        let name: String = p["name"].as_str().unwrap_or("").trim().chars().filter(|c| c.is_alphanumeric() || *c == ' ').take(20).collect();
        let request = p["request"].as_str().unwrap_or("").trim().chars().take(500).collect::<String>();
        let kind = p["kind"].as_str().unwrap_or("");
        if name.is_empty() || request.is_empty() {
            return Err("a helper needs a name and a job".into());
        }
        if !["watch", "every", "once"].contains(&kind) {
            return Err("the job is watch, every or once".into());
        }
        if self.list.iter().any(|h| h.name.eq_ignore_ascii_case(&name)) {
            return Err(format!("there's already a helper called {name}"));
        }
        let folder = p["folder"].as_str().unwrap_or("").trim().trim_matches('/').to_string();
        if kind == "watch" && (folder.is_empty() || folder.contains("..")) {
            return Err("which folder should it watch?".into());
        }
        let every_min = p["every_min"].as_u64().unwrap_or(60).clamp(1, 7 * 24 * 60);
        let h = Helper {
            id: format!("h{:x}", SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)),
            name,
            color: p["color"].as_str().unwrap_or("mint").chars().take(12).collect(),
            kind: kind.into(),
            folder,
            every_min,
            request,
            active: true,
            created: now(),
            last_run: if kind == "every" { now() } else { 0 },
            runs: vec![],
            hidden: false,
            brain: p["brain"].as_str().unwrap_or("openai").to_string(),
        };
        check_brain(&h.brain)?;
        self.list.push(h.clone());
        self.save();
        Ok(h)
    }
}

/// What each helper is doing right now, for the pets on screen.
pub fn status(brain: &Brain) -> Value {
    let helpers = brain.helpers.lock().unwrap();
    let goals = brain.goals.lock().unwrap();
    json!(helpers
        .list
        .iter()
        .map(|h| {
            let state = match helpers.running.get(&h.id).and_then(|g| goals.get(g)) {
                Some(g) => {
                    let g = g.lock().unwrap();
                    if g.over {
                        "done"
                    } else {
                        // waiting on the owner: a plan to approve or a step that asks
                        let last = g.events.iter().rev().find(|e| ["review", "granted", "ask", "step"].contains(&e["t"].as_str().unwrap_or("")));
                        match last.and_then(|e| e["t"].as_str()) {
                            Some("review") if last.is_some_and(|e| e["pass"]["rule"].is_null()) => "waiting",
                            Some("ask") => "waiting",
                            _ => "working",
                        }
                    }
                }
                None if !h.active => "paused",
                None => "idle",
            };
            json!({ "helper": h, "state": state, "goal": helpers.running.get(&h.id) })
        })
        .collect::<Vec<_>>())
}

/// The loop that gives helpers their jobs (and runs the plain watchers too).
pub fn spawn(brain: Arc<Brain>) {
    std::thread::spawn(move || {
        let mut seen: HashMap<String, HashSet<String>> = HashMap::new();
        loop {
            std::thread::sleep(Duration::from_secs(3));
            let list = brain.helpers.lock().unwrap().list.clone();
            for h in list {
                // finish bookkeeping for a run that just ended: that's the report
                let running = brain.helpers.lock().unwrap().running.get(&h.id).cloned();
                if let Some(goal) = running {
                    let ended = brain.goals.lock().unwrap().get(&goal).cloned().map(|g| {
                        let g = g.lock().unwrap();
                        let done = g.events.iter().rev().find(|e| e["t"] == "done" || e["t"] == "error").cloned();
                        (g.over, done)
                    });
                    match ended {
                        Some((true, done)) => {
                            let mut hs = brain.helpers.lock().unwrap();
                            hs.running.remove(&h.id);
                            if let Some(x) = hs.list.iter_mut().find(|x| x.id == h.id) {
                                let d = done.unwrap_or(json!({}));
                                let text = d["text"].as_str().or(d["message"].as_str()).unwrap_or("Finished.").to_string();
                                x.runs.insert(0, HelperRun { goal: goal.clone(), at: now(), text, failed: d["failed"].as_bool().unwrap_or(false) || d["t"] == "error" });
                                x.runs.truncate(10);
                                if x.kind == "once" {
                                    x.active = false;
                                }
                            }
                            hs.save();
                        }
                        Some((false, _)) => continue,
                        None => {
                            brain.helpers.lock().unwrap().running.remove(&h.id);
                        }
                    }
                    continue;
                }
                if !h.active {
                    continue;
                }
                let due = match h.kind.as_str() {
                    "once" => h.runs.is_empty(),
                    "every" => now().saturating_sub(h.last_run) >= h.every_min * 60,
                    "watch" => {
                        let dir = brain.ctx.root.join(&h.folder);
                        let files: HashSet<String> = std::fs::read_dir(&dir)
                            .map(|d| d.flatten().filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false)).map(|e| e.file_name().to_string_lossy().into_owned()).filter(|n| !n.starts_with('.')).collect())
                            .unwrap_or_default();
                        match seen.insert(h.id.clone(), files.clone()) {
                            Some(before) => files.difference(&before).next().is_some(),
                            None => false,
                        }
                    }
                    _ => false,
                };
                if due {
                    run_now(&brain, &h.id);
                }
            }
        }
    });
}

/// Start a helper's job right away (also used by "Run now").
pub fn run_now(brain: &Arc<Brain>, id: &str) -> Option<String> {
    let h = brain.helpers.lock().unwrap().list.iter().find(|h| h.id == id).cloned()?;
    if brain.helpers.lock().unwrap().running.contains_key(id) {
        return None;
    }
    // a helper is the owner's own: it sees the owner's memory, but has its own name, passes and log lines
    let (goal, _) = brain.start(&h.request, &h.principal(), true, None);
    let mut hs = brain.helpers.lock().unwrap();
    hs.running.insert(id.to_string(), goal.clone());
    if let Some(x) = hs.list.iter_mut().find(|x| x.id == id) {
        x.last_run = now();
    }
    hs.save();
    Some(goal)
}

pub type Shared = Arc<Mutex<Helpers>>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn helpers_need_a_name_a_job_and_a_folder_to_watch() {
        let d = tempfile::tempdir().unwrap();
        let mut hs = Helpers::open(d.path().join("helpers.json"));
        assert!(hs.add(&json!({ "name": "Pip", "kind": "watch", "request": "sort new files" })).is_err(), "watch needs a folder");
        assert!(hs.add(&json!({ "name": "Pip", "kind": "watch", "folder": "../etc", "request": "x" })).is_err());
        assert!(hs.add(&json!({ "name": "", "kind": "once", "request": "x" })).is_err());
        assert!(hs.add(&json!({ "name": "Pip", "kind": "dance", "request": "x" })).is_err());
        let h = hs.add(&json!({ "name": "Pip", "color": "mint", "kind": "watch", "folder": "Downloads/", "request": "Sort new files" })).unwrap();
        assert_eq!(h.folder, "Downloads");
        assert_eq!(h.principal(), "helper:pip");
        assert!(hs.add(&json!({ "name": "pip", "kind": "once", "request": "x" })).is_err(), "names are unique");
        let every = hs.add(&json!({ "name": "Momo", "kind": "every", "every_min": 0, "request": "check big files" })).unwrap();
        assert_eq!(every.every_min, 1, "at least a minute apart");
        assert_eq!(Helpers::open(d.path().join("helpers.json")).list.len(), 2, "saved");
        assert!(hs.add(&json!({ "name": "Bean", "kind": "once", "request": "x", "brain": "muse" })).is_err(), "muse isn't connected yet");
        assert!(check_brain("openai").is_ok() && check_brain("claude").is_err() && check_brain("nope").is_err());
    }
}
