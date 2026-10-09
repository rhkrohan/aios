//! brain-d: the SIOS brain. Turns a request into a checked plan and runs it
//! through the broker, with the model used as little as possible.
//!
//!   brain-d serve     socket for the shell (~/.sios/brain.sock; on SIOS a user
//!                     service on D-Bus, org.sios.Brain1)
//!   brain-d mcp       MCP server on stdin/stdout, the door for outside AIs
//!   brain-d brief     print the briefing a model would get

mod briefing;
mod capd;
mod goal;
mod helpers;
mod mcp;
mod memory;
mod model;
mod plan;
mod routines;

use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixListener;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| ".".into()))
}

pub fn state_dir() -> PathBuf {
    std::env::var("SIOS_STATE").map(PathBuf::from).unwrap_or_else(|_| home().join(".sios"))
}

pub fn root_dir() -> PathBuf {
    std::env::var("SIOS_ROOT").map(PathBuf::from).unwrap_or_else(|_| home().join("SIOS-sandbox"))
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct Watcher {
    pub id: String,
    /// Folder inside the home, e.g. "Downloads".
    pub folder: String,
    /// What to ask SIOS when new files land there.
    pub request: String,
}

pub struct Brain {
    pub ctx: Arc<goal::Ctx>,
    pub goals: Mutex<HashMap<String, goal::Shared>>,
    /// Conversations: what each recent turn asked, understood and did.
    pub threads: Arc<Mutex<HashMap<String, Vec<goal::Turn>>>>,
    pub watchers: Mutex<Vec<Watcher>>,
    /// The pet team: helpers with long-running jobs.
    pub helpers: helpers::Shared,
    /// Newest last: (goal, request, who asked). The shell picks up goals outside AIs start.
    pub recent: Mutex<Vec<(String, String, String)>>,
}

impl Brain {
    pub fn new() -> Brain {
        let state = state_dir();
        Brain {
            ctx: Arc::new(goal::Ctx {
                root: root_dir(),
                state: state.clone(),
                capd: capd::Capd { sock: state.join("capd.sock") },
                routines: Arc::new(Mutex::new(routines::Routines::open(&state.join("routines.json")))),
                system: Arc::new(Mutex::new(Value::Null)),
            }),
            goals: Mutex::new(HashMap::new()),
            threads: Arc::new(Mutex::new(HashMap::new())),
            watchers: Mutex::new(std::fs::read(state.join("watchers.json")).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()),
            helpers: Arc::new(Mutex::new(helpers::Helpers::open(state.join("helpers.json")))),
            recent: Mutex::new(Vec::new()),
        }
    }

    /// Start a goal on its own thread, as part of a conversation; returns (goal, thread).
    pub fn start(&self, request: &str, principal: &str, own: bool, thread: Option<&str>) -> (String, String) {
        let thread = thread.filter(|t| !t.is_empty()).map(String::from).unwrap_or_else(|| format!("t{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)));
        let turns = self.threads.lock().unwrap().get(&thread).cloned().unwrap_or_default();
        let history = if turns.is_empty() {
            String::new()
        } else {
            let lines: Vec<String> = turns.iter().rev().take(3).rev().map(|t| format!("- Owner: {}
  You understood: {}
  Result: {}", t.request, t.understanding, t.reply)).collect();
            format!("\n\nCONVERSATION SO FAR (oldest first)\n{}", lines.join("\n"))
        };
        let last_goal = turns.iter().rev().find_map(|t| t.goal.clone());
        let id = format!("g{:x}{:x}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
        let shared: goal::Shared = Arc::new(Mutex::new(goal::Goal::default()));
        self.goals.lock().unwrap().insert(id.clone(), shared.clone());
        self.recent.lock().unwrap().push((id.clone(), request.to_string(), principal.to_string()));
        let ctx = self.ctx.clone();
        let threads = self.threads.clone();
        let (request, principal, th) = (request.to_string(), principal.to_string(), thread.clone());
        std::thread::spawn(move || {
            let turn = goal::run(&ctx, &shared, &request, &principal, own, &history, last_goal);
            threads.lock().unwrap().entry(th).or_default().push(turn);
        });
        (id, thread)
    }

    fn save_watchers(&self) {
        let _ = std::fs::write(self.ctx.state.join("watchers.json"), serde_json::to_vec_pretty(&*self.watchers.lock().unwrap()).unwrap_or_default());
    }

    pub fn events(&self, id: &str, since: usize) -> Option<Value> {
        let g = self.goals.lock().unwrap().get(id)?.clone();
        let g = g.lock().unwrap();
        Some(json!({ "events": g.events.get(since..).unwrap_or(&[]), "next": g.events.len(), "over": g.over }))
    }

    pub fn handle(&self, req: &Value) -> Value {
        let p = &req["params"];
        let r: Result<Value, String> = match req["method"].as_str().unwrap_or("") {
            "status" => Ok(json!({ "model": std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-5.5".into()), "key": std::env::var("OPENAI_API_KEY").is_ok(), "routines": self.ctx.routines.lock().unwrap().count() })),
            "briefing" => Ok(json!({ "text": briefing::build(&self.ctx.root, &self.ctx.state, p["request"].as_str().unwrap_or("")).text })),
            "goal.start" => match p["request"].as_str().map(str::trim).filter(|s| !s.is_empty()) {
                // "principal" is attribution (who asked); the broker still needs the owner's grant
                Some(r) => {
                    // over the socket: the owner's shell, or an outside AI through the MCP door.
                    // Anything that isn't plainly the owner is labeled an outside AI and is never "own".
                    let asked = p["principal"].as_str().unwrap_or("owner");
                    let (principal, own) = if asked == "owner" { ("owner".to_string(), true) } else if asked.ends_with("(MCP)") { (asked.to_string(), false) } else { (format!("{asked} (MCP)"), false) };
                    let (goal, thread) = self.start(&r.chars().take(2000).collect::<String>(), &principal, own, p["thread"].as_str());
                    Ok(json!({ "goal": goal, "thread": thread }))
                }
                None => Err("empty request".into()),
            },
            // the shell reports the system's live state (on SIOS brain-d reads it from D-Bus)
            "state.update" => {
                *self.ctx.system.lock().unwrap() = p["system"].clone();
                Ok(json!({ "ok": true }))
            }
            "routines.clear" => {
                self.ctx.routines.lock().unwrap().clear();
                Ok(json!({ "cleared": true }))
            }
            "helpers.list" => Ok(helpers::status(self)),
            "brains.list" => Ok(json!(helpers::BRAINS.iter().map(|(id, on)| json!({ "id": id, "connected": on })).collect::<Vec<_>>())),
            "helpers.add" => self.helpers.lock().unwrap().add(p).map(|h| json!(h)),
            "helpers.update" => {
                let mut hs = self.helpers.lock().unwrap();
                let brain_ok = p["brain"].as_str().map(helpers::check_brain).unwrap_or(Ok(()));
                match brain_ok {
                    Err(e) => Err(e),
                    Ok(()) => {
                        let out = hs.list.iter_mut().find(|h| h.id == p["id"].as_str().unwrap_or("")).map(|h| {
                            if let Some(a) = p["active"].as_bool() {
                                h.active = a;
                            }
                            if let Some(v) = p["hidden"].as_bool() {
                                h.hidden = v;
                            }
                            if let Some(b) = p["brain"].as_str() {
                                h.brain = b.to_string();
                            }
                            json!(h)
                        });
                        hs.save();
                        out.ok_or_else(|| "no such helper".to_string())
                    }
                }
            }
            "helpers.remove" => {
                let mut hs = self.helpers.lock().unwrap();
                let id = p["id"].as_str().unwrap_or("").to_string();
                hs.list.retain(|h| h.id != id);
                hs.running.remove(&id);
                hs.save();
                Ok(json!({ "removed": id }))
            }
            "watch.list" => Ok(json!(*self.watchers.lock().unwrap())),
            "watch.add" => {
                let folder = p["folder"].as_str().unwrap_or("").trim().trim_matches('/').to_string();
                let request = p["request"].as_str().unwrap_or("").trim().to_string();
                if folder.is_empty() || folder.contains("..") || request.is_empty() {
                    Err("a watcher needs a folder and a request".into())
                } else {
                    let w = Watcher { id: format!("w{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)), folder, request };
                    self.watchers.lock().unwrap().push(w.clone());
                    self.save_watchers();
                    Ok(json!(w))
                }
            }
            "watch.remove" => {
                let id = p["id"].as_str().unwrap_or("");
                self.watchers.lock().unwrap().retain(|w| w.id != id);
                self.save_watchers();
                Ok(json!({ "removed": id }))
            }
            // an outside AI's recall: only the groups the owner shared with it
            "memory.recall" => self
                .ctx
                .capd
                .call("memory.brief", json!({ "request": p["query"].as_str().unwrap_or(""), "principal": p["principal"].as_str().unwrap_or("outside AI"), "limit": 10 }))
                .map(|b| json!({ "memories": b["items"].as_array().into_iter().flatten().map(|m| m["text"].clone()).collect::<Vec<_>>(), "held_back_sensitive": b["held_back_sensitive"] })),
            "goals.recent" => Ok(json!(self.recent.lock().unwrap().iter().rev().take(20).map(|(g, r, p)| json!({ "goal": g, "request": r, "principal": p })).collect::<Vec<_>>())),
            "goal.events" => self.events(p["goal"].as_str().unwrap_or(""), p["since"].as_u64().unwrap_or(0) as usize).ok_or_else(|| "no such goal".into()),
            other => Err(format!("unknown method {other}")),
        };
        match r {
            Ok(v) => json!({ "ok": v }),
            Err(e) => json!({ "error": e }),
        }
    }
}

fn main() {
    let cmd = std::env::args().nth(1).unwrap_or_else(|| "help".into());
    match cmd.as_str() {
        "serve" => serve(),
        "mcp" => mcp::run(Brain::new()),
        "brief" => println!("{}", briefing::build(&root_dir(), &state_dir(), &std::env::args().nth(2).unwrap_or_default()).text),
        _ => println!("brain-d serve | mcp | brief [request]"),
    }
}

fn serve() {
    let brain = Arc::new(Brain::new());
    let sock = state_dir().join("brain.sock");
    let _ = std::fs::remove_file(&sock);
    let listener = UnixListener::bind(&sock).unwrap_or_else(|e| {
        eprintln!("can't listen on {}: {e}", sock.display());
        std::process::exit(1)
    });
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&sock, std::fs::Permissions::from_mode(0o600));
    }
    println!("brain-d listening on {}", sock.display());
    spawn_watchers(brain.clone());
    helpers::spawn(brain.clone());
    for conn in listener.incoming().flatten() {
        let brain = brain.clone();
        std::thread::spawn(move || {
            let Ok(mut w) = conn.try_clone() else { return };
            for line in BufReader::new(conn).lines().map_while(Result::ok) {
                if line.trim().is_empty() {
                    continue;
                }
                let resp = serde_json::from_str::<Value>(&line)
                    .map(|r| {
                        // "Run now" needs the shared brain to start a goal
                        if r["method"] == "helpers.run_now" {
                            match helpers::run_now(&brain, r["params"]["id"].as_str().unwrap_or("")) {
                                Some(goal) => json!({ "ok": { "goal": goal } }),
                                None => json!({ "error": "that helper is busy or doesn't exist" }),
                            }
                        } else {
                            brain.handle(&r)
                        }
                    })
                    .unwrap_or_else(|e| json!({ "error": format!("not JSON: {e}") }));
                if writeln!(w, "{resp}").is_err() {
                    break;
                }
            }
        });
    }
}

/// Watchers: when new files land in a watched folder, start the owner's request
/// for it. The goal still needs the owner's OK, unless a standing rule covers
/// its pass (then capd grants it and SIOS just tells the owner what it did).
fn spawn_watchers(brain: Arc<Brain>) {
    std::thread::spawn(move || {
        let mut seen: HashMap<String, std::collections::HashSet<String>> = HashMap::new();
        let mut running: HashMap<String, goal::Shared> = HashMap::new();
        loop {
            std::thread::sleep(std::time::Duration::from_secs(3));
            let watchers = brain.watchers.lock().unwrap().clone();
            for w in watchers {
                let dir = brain.ctx.root.join(&w.folder);
                let now: std::collections::HashSet<String> = std::fs::read_dir(&dir)
                    .map(|d| d.flatten().filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false)).map(|e| e.file_name().to_string_lossy().into_owned()).filter(|n| !n.starts_with('.')).collect())
                    .unwrap_or_default();
                let before = seen.insert(w.id.clone(), now.clone());
                let Some(before) = before else { continue };
                let fresh: Vec<&String> = now.difference(&before).collect();
                let busy = running.get(&w.id).is_some_and(|g| !g.lock().unwrap().over);
                if fresh.is_empty() || busy {
                    continue;
                }
                let (id, _) = brain.start(&w.request, &format!("Watcher ({})", w.folder), true, None);
                if let Some(g) = brain.goals.lock().unwrap().get(&id).cloned() {
                    running.insert(w.id.clone(), g);
                }
            }
        }
    });
}
