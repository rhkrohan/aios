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
mod peer;
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

/// "Claude Desktop" -> "claude-desktop": the id part of an identity.
pub fn slug(name: &str) -> String {
    let s: String = name.to_lowercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    let s = s.split('-').filter(|x| !x.is_empty()).collect::<Vec<_>>().join("-");
    if s.is_empty() { "unnamed".into() } else { s.chars().take(40).collect() }
}

/// The shell proves it is the owner's with this (on SIOS: its identity over D-Bus).
/// Made on first start, readable only by the owner, never handed to a model.
fn brain_secret() -> String {
    use std::io::Read;
    use std::os::unix::fs::OpenOptionsExt;
    let path = state_dir().join("brain.secret");
    if let Ok(s) = std::fs::read_to_string(&path) {
        if s.trim().len() >= 32 {
            return s.trim().to_string();
        }
    }
    let mut b = [0u8; 24];
    std::fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut b)).expect("system randomness");
    let v: String = b.iter().map(|x| format!("{x:02x}")).collect();
    let _ = std::fs::remove_file(&path);
    let mut f = std::fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&path).expect("can't write brain.secret");
    std::io::Write::write_all(&mut f, v.as_bytes()).expect("can't write brain.secret");
    v
}

fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    !b.is_empty() && a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

pub fn state_dir() -> PathBuf {
    std::env::var("SIOS_STATE").map(PathBuf::from).unwrap_or_else(|_| home().join(".sios"))
}

/// Where the sockets live: $SIOS_RUNTIME on SIOS ($XDG_RUNTIME_DIR/sios), else the state folder.
pub fn runtime_dir() -> PathBuf {
    std::env::var("SIOS_RUNTIME").map(PathBuf::from).unwrap_or_else(|_| state_dir())
}

/// The broker, where this brain-d finds it.
pub fn capd_link() -> capd::Capd {
    capd::Capd { sock: runtime_dir().join("capd.sock"), state: state_dir() }
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
                capd: capd_link(),
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
        // a conversation belongs to whoever started it: the same thread id from someone
        // else is a different conversation (no history, no "undo that" of their goals)
        let thread = thread.filter(|t| !t.is_empty()).map(String::from).unwrap_or_else(|| format!("t{}", random_hex(12)));
        let key = format!("{principal}\u{1}{thread}");
        let turns = self.threads.lock().unwrap().get(&key).cloned().unwrap_or_default();
        let history = if turns.is_empty() {
            String::new()
        } else {
            let lines: Vec<String> = turns.iter().rev().take(3).rev().map(|t| format!("- Owner: {}
  You understood: {}
  Result: {}", t.request, t.understanding, t.reply)).collect();
            format!("\n\nCONVERSATION SO FAR (oldest first)\n{}", lines.join("\n"))
        };
        let last_goal = turns.iter().rev().find_map(|t| t.goal.clone());
        // a goal id can't be guessed: holding it is what lets a caller follow the goal
        let id = format!("g{}", random_hex(12));
        let shared: goal::Shared = Arc::new(Mutex::new(goal::Goal::default()));
        self.goals.lock().unwrap().insert(id.clone(), shared.clone());
        self.recent.lock().unwrap().push((id.clone(), request.to_string(), principal.to_string()));
        let ctx = self.ctx.clone();
        let threads = self.threads.clone();
        let (request, principal, th) = (request.to_string(), principal.to_string(), key);
        std::thread::spawn(move || {
            let turn = goal::run(&ctx, &shared, &request, &principal, own, &history, last_goal);
            threads.lock().unwrap().entry(th).or_default().push(turn);
        });
        (id, thread)
    }

    /// Who is asking. The owner's shell: SIOS acting for the owner. An outside AI:
    /// the identity its pairing token proves ("app:..."), or else
    /// "unpaired:<the name it gave>", which the broker keeps apart from paired
    /// apps and never gives roles: a name alone proves nothing.
    fn requester(&self, p: &Value, owner: bool) -> Result<(String, bool), String> {
        if owner && p["principal"].as_str().is_none_or(|x| x == "owner") && p["pair"].is_null() {
            return Ok(("owner".into(), true));
        }
        if let Some(tok) = p["pair"].as_str().filter(|t| !t.is_empty()) {
            let v = self.ctx.capd.call("iam.resolve", json!({ "token": tok })).map_err(|_| "that pairing token isn't known; pair this app again in the Security Center".to_string())?;
            return Ok((v["id"].as_str().unwrap_or_default().to_string(), false));
        }
        let name = p["principal"].as_str().unwrap_or("outside AI");
        Ok((format!("unpaired:{}", slug(name)), false))
    }

    fn save_watchers(&self) {
        let _ = std::fs::write(self.ctx.state.join("watchers.json"), serde_json::to_vec_pretty(&*self.watchers.lock().unwrap()).unwrap_or_default());
    }

    pub fn events(&self, id: &str, since: usize) -> Option<Value> {
        let g = self.goals.lock().unwrap().get(id)?.clone();
        let g = g.lock().unwrap();
        Some(json!({ "events": g.events.get(since..).unwrap_or(&[]), "next": g.events.len(), "over": g.over }))
    }

    /// `owner`: the caller proved it is the owner's shell (brain.secret; on SIOS,
    /// the shell's identity over D-Bus). Without it, only what an outside AI may do.
    pub fn handle(&self, req: &Value, owner: bool) -> Value {
        self.handle_from(req, owner, false, false)
    }

    /// `shell`: the caller is the owner's Ask bar, known by its program. Its goals
    /// run in the owner's name; every pass still waits for the owner's password.
    /// `viewer`: one of SIOS's windows that capd started: may look at every goal.
    pub fn handle_from(&self, req: &Value, owner: bool, shell: bool, viewer: bool) -> Value {
        let p = &req["params"];
        let method = req["method"].as_str().unwrap_or("");
        const OWNER_ONLY: [&str; 8] = ["state.update", "routines.clear", "helpers.add", "helpers.update", "helpers.remove", "helpers.run_now", "watch.add", "watch.remove"];
        if OWNER_ONLY.contains(&method) && !owner {
            return json!({ "error": "only the owner's shell can do that" });
        }
        let r: Result<Value, String> = match method {
            "status" => Ok(json!({ "model": std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-5.5".into()), "key": std::env::var("OPENAI_API_KEY").is_ok(), "routines": self.ctx.routines.lock().unwrap().count() })),
            "briefing" => Ok(json!({ "text": briefing::build(&self.ctx.root, &self.ctx.state, p["request"].as_str().unwrap_or("")).text })),
            "goal.start" => match p["request"].as_str().map(str::trim).filter(|s| !s.is_empty()) {
                // "principal" is attribution (who asked); the broker still needs the owner's grant
                Some(r) => match self.requester(p, owner || shell) {
                    // the owner's shell, or an outside AI through the MCP door (never "own")
                    Ok((principal, own)) => {
                        let (goal, thread) = self.start(&r.chars().take(2000).collect::<String>(), &principal, own, p["thread"].as_str());
                        Ok(json!({ "goal": goal, "thread": thread }))
                    }
                    Err(e) => Err(e),
                },
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
            "helpers.add" => self.helpers.lock().unwrap().add(p).map(|h| {
                // each helper is its own identity in the broker, created by SIOS
                let _ = self.ctx.capd.call("iam.register", json!({ "id": h.principal(), "name": format!("{} (helper)", h.name) }));
                json!(h)
            }),
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
                .requester(p, false)
                .and_then(|(principal, _)| self.ctx.capd.call("memory.brief", json!({ "request": p["query"].as_str().unwrap_or(""), "principal": principal, "limit": 10 })))
                .map(|b| json!({ "memories": b["items"].as_array().into_iter().flatten().map(|m| m["text"].clone()).collect::<Vec<_>>(), "held_back_sensitive": b["held_back_sensitive"] })),
            // the memory simulation (capd memsim --ai) borrows the model for two small jobs
            "memsim.pattern" => {
                let eps: Vec<String> = p["episodes"].as_array().into_iter().flatten().filter_map(|e| e.as_str().map(String::from)).take(20).collect();
                model::Model::from_env().map(|m| memory::find_pattern(&m, &eps).unwrap_or(json!({ "found": false })))
            }
            "memsim.answer" => {
                let mems: Vec<String> = p["memories"].as_array().into_iter().flatten().filter_map(|e| e.as_str().map(String::from)).take(12).collect();
                model::Model::from_env().and_then(|m| memory::answer_from(&m, p["question"].as_str().unwrap_or(""), &mems)).map(Value::from)
            }
            // SIOS's own windows see every goal (D59); others never list them
            "goals.recent" if !(owner || shell || viewer) => Err("only SIOS's own windows can list goals".into()),
            "goals.recent" => Ok(json!(self.recent.lock().unwrap().iter().rev().take(20).map(|(g, r, p)| json!({ "goal": g, "request": r, "principal": p })).collect::<Vec<_>>())),
            // a goal's events can hold email bodies: SIOS's windows see every goal; anyone
            // else needs the goal's id, which can't be guessed and only its starter got
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
    let secret = Arc::new(brain_secret());
    let sock = runtime_dir().join("brain.sock");
    let by_peer = peer::enabled();
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
        let (brain, secret) = (brain.clone(), secret.clone());
        // on SIOS the owner's shell is known by its program, asked once when it connects:
        // it may start goals in the owner's name; the owner's controls stay with brain.secret
        let proc = by_peer.then(|| peer::of(&conn));
        let who = proc.as_ref().map(|p| peer::classify(p, &peer::OWNER_APPS, None));
        // SIOS's windows may look at goals, once capd confirms it started that very process
        let viewer = who.is_some_and(|w| w == peer::Who::OwnerApp)
            || proc.as_ref().is_some_and(|p| {
                peer::classify(p, &peer::VIEWER_APPS, None) == peer::Who::OwnerApp
                    && brain.ctx.capd.call("windows.check", json!({ "pid": p.pid, "start": p.start })).is_ok_and(|v| v["window"] == true)
            });
        let shell = who.map(|w| w == peer::Who::Owner);
        let asks_for_owner = who.is_some_and(|w| w == peer::Who::Owner || w == peer::Who::OwnerApp);
        std::thread::spawn(move || {
            let Ok(mut w) = conn.try_clone() else { return };
            for line in BufReader::new(conn).lines().map_while(Result::ok) {
                if line.trim().is_empty() {
                    continue;
                }
                let resp = serde_json::from_str::<Value>(&line)
                    .map(|r| {
                        let owner = shell.unwrap_or_else(|| r["owner"].as_str().is_some_and(|g| ct_eq(g.as_bytes(), secret.as_bytes())));
                        // "Run now" needs the shared brain to start a goal
                        // Run now: the owner, or SIOS's Agents window (a run still asks for its passes)
                        if (r["method"] == "helpers.run_now" || r["method"] == "agents.run_now") && !(owner || viewer) {
                            json!({ "error": "only the owner's shell can do that" })
                        } else if r["method"] == "helpers.run_now" || r["method"] == "agents.run_now" {
                            match helpers::run_now(&brain, r["params"]["id"].as_str().unwrap_or("")) {
                                Some(goal) => json!({ "ok": { "goal": goal } }),
                                None => json!({ "error": "that helper is busy or doesn't exist" }),
                            }
                        } else {
                            brain.handle_from(&r, owner, asks_for_owner, viewer)
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
                // a watcher is the owner's own standing request, so SIOS runs it for them
                let (id, _) = brain.start(&w.request, "owner", true, None);
                if let Some(g) = brain.goals.lock().unwrap().get(&id).cloned() {
                    running.insert(w.id.clone(), g);
                }
            }
        }
    });
}

/// Random hex from the kernel's generator.
fn random_hex(n: usize) -> String {
    use std::io::Read;
    let mut b = vec![0u8; n];
    if std::fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut b)).is_err() {
        // never a predictable id: fall back to the clock mixed with the pid, and say so
        eprintln!("brain-d: /dev/urandom unavailable");
        let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0) ^ (std::process::id() as u128) << 64;
        return format!("{t:x}");
    }
    b.iter().map(|x| format!("{x:02x}")).collect()
}
