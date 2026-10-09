//! capd: the SIOS capability daemon (proof of concept of the permission broker).
//!
//! Run `capd serve` in one terminal. Everything else talks to it over a Unix
//! socket in the state folder (~/.sios by default). Agents only ever hold
//! capability tokens; owner commands prove themselves with ~/.sios/owner.secret.

mod audit;
mod fsguard;
mod manifest;
mod memory;
mod packs;
mod meta;
mod policy;
mod state;
mod token;
mod tools;

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| ".".into()))
}

fn state_dir() -> PathBuf {
    std::env::var("SIOS_STATE").map(PathBuf::from).unwrap_or_else(|_| home().join(".sios"))
}

fn root_dir() -> PathBuf {
    std::env::var("SIOS_ROOT").map(PathBuf::from).unwrap_or_else(|_| home().join("SIOS-sandbox"))
}

fn socket() -> PathBuf {
    state_dir().join("capd.sock")
}

const HELP: &str = "capd: SIOS capability daemon

  capd serve                      run the daemon (keep it open)
  capd seed                       fill the sandbox with demo files and labels
  capd status                     tools, pending approvals, paused agents
  capd mint --principal P --goal G --tools a,b [--paths x,y] [--ttl secs]
            [--uses n] [--budget n] [--no-egress]
  capd attenuate --cap TOKEN [--principal P] [--tools ..] [--paths ..] [--uses n] [--no-egress]
  capd call --cap TOKEN --tool T --args JSON
  capd manifest --cap TOKEN [--dialect capd|openai|anthropic|mcp]
                                  what a model holding this capability is told
  capd pending | approve ID | deny ID
  capd revoke ID | pause P | resume P
  capd undo GOAL_ID|*             undo everything a goal changed
  capd audit [n]                  verify the log and show the last n decisions

Folders: state in $SIOS_STATE (~/.sios), sandbox in $SIOS_ROOT (~/SIOS-sandbox).";

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let cmd = args.first().map(String::as_str).unwrap_or("help");
    match cmd {
        "serve" => serve(),
        "seed" => seed(),
        "help" | "-h" | "--help" => println!("{HELP}"),
        _ => {
            let req = match build_request(cmd, &args[1..]) {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("{e}\n\n{HELP}");
                    std::process::exit(2);
                }
            };
            match send(&req) {
                Ok(v) => {
                    println!("{}", serde_json::to_string_pretty(&v).unwrap());
                    if v.get("error").is_some() {
                        std::process::exit(1);
                    }
                }
                Err(e) => {
                    eprintln!("can't reach capd at {}: {e}\nStart it with: capd serve", socket().display());
                    std::process::exit(1);
                }
            }
        }
    }
}

fn flag(args: &[String], name: &str) -> Option<String> {
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned()
}

fn list(args: &[String], name: &str) -> Option<Value> {
    flag(args, name).map(|s| json!(s.split(',').map(|x| x.trim()).collect::<Vec<_>>()))
}

fn num(args: &[String], name: &str) -> Option<u64> {
    flag(args, name).and_then(|s| s.parse().ok())
}

fn build_request(cmd: &str, a: &[String]) -> Result<Value, String> {
    let owner = std::fs::read_to_string(state_dir().join("owner.secret")).unwrap_or_default().trim().to_string();
    let first = a.first().cloned().unwrap_or_default();
    let (method, params) = match cmd {
        "status" => ("status", json!({})),
        "mint" => (
            "mint",
            json!({
                "principal": flag(a, "--principal").ok_or("--principal is required")?,
                "goal": flag(a, "--goal").unwrap_or_default(),
                "tools": list(a, "--tools").ok_or("--tools is required")?,
                "paths": list(a, "--paths"),
                "ttl": num(a, "--ttl"),
                "uses": num(a, "--uses"),
                "budget": num(a, "--budget"),
                "no_egress": a.iter().any(|x| x == "--no-egress"),
            }),
        ),
        "attenuate" => {
            let mut p = json!({ "cap": flag(a, "--cap").ok_or("--cap is required")? });
            if let Some(v) = flag(a, "--principal") { p["principal"] = json!(v); }
            if let Some(v) = list(a, "--tools") { p["tools"] = v; }
            if let Some(v) = list(a, "--paths") { p["paths"] = v; }
            if let Some(v) = num(a, "--uses") { p["uses"] = json!(v); }
            if let Some(v) = num(a, "--ttl") { p["ttl"] = json!(v); }
            if a.iter().any(|x| x == "--no-egress") { p["no_egress"] = json!(true); }
            ("attenuate", p)
        }
        "call" => (
            "call",
            json!({
                "cap": flag(a, "--cap").ok_or("--cap is required")?,
                "tool": flag(a, "--tool").ok_or("--tool is required")?,
                "args": serde_json::from_str::<Value>(&flag(a, "--args").unwrap_or("{}".into())).map_err(|e| format!("--args isn't JSON: {e}"))?,
            }),
        ),
        "manifest" => ("manifest", json!({ "cap": flag(a, "--cap").ok_or("--cap is required")?, "dialect": flag(a, "--dialect").unwrap_or("capd".into()) })),
        "pending" => ("pending", json!({})),
        "approve" => ("approve", json!({ "id": first })),
        "deny" => ("deny", json!({ "id": first })),
        "revoke" => ("revoke", json!({ "id": first })),
        "pause" => ("pause", json!({ "principal": first })),
        "resume" => ("resume", json!({ "principal": first })),
        "undo" => ("undo", json!({ "goal": first })),
        "audit" => ("audit", json!({ "n": first.parse::<u64>().unwrap_or(20) })),
        other => return Err(format!("unknown command {other}")),
    };
    Ok(json!({ "method": method, "params": params, "owner": owner }))
}

fn send(req: &Value) -> std::io::Result<Value> {
    let mut s = UnixStream::connect(socket())?;
    writeln!(s, "{req}")?;
    let mut line = String::new();
    BufReader::new(s).read_line(&mut line)?;
    serde_json::from_str(&line).map_err(std::io::Error::other)
}

fn serve() {
    let dir = state_dir();
    let st = match state::State::open(&dir, &root_dir()) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("can't open state in {}: {e}", dir.display());
            std::process::exit(1);
        }
    };
    let sock = socket();
    let _ = std::fs::remove_file(&sock);
    let listener = UnixListener::bind(&sock).unwrap_or_else(|e| {
        eprintln!("can't listen on {}: {e}", sock.display());
        std::process::exit(1)
    });
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&sock, std::fs::Permissions::from_mode(0o600));
    }
    println!("capd listening on {}\nsandbox: {}\nstate:   {}", sock.display(), st.root.display(), dir.display());
    let st = Arc::new(Mutex::new(st));
    for conn in listener.incoming() {
        let Ok(conn) = conn else { continue };
        let st = Arc::clone(&st);
        std::thread::spawn(move || {
            let mut writer = match conn.try_clone() {
                Ok(w) => w,
                Err(_) => return,
            };
            for line in BufReader::new(conn).lines() {
                let Ok(line) = line else { break };
                if line.trim().is_empty() {
                    continue;
                }
                let resp = match serde_json::from_str::<Value>(&line) {
                    Ok(req) => {
                        // one bad request must never take capd down for everyone after it
                        let mut guard = st.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                        let resp = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| guard.handle(&req)))
                            .unwrap_or_else(|_| json!({ "error": "capd hit an internal error on that request; nothing was changed by it" }));
                        drop(guard);
                        log_line(&req, &resp);
                        resp
                    }
                    Err(e) => json!({ "error": format!("not JSON: {e}") }),
                };
                if writeln!(writer, "{resp}").is_err() {
                    break;
                }
            }
        });
    }
}

/// One line per request on the console, so you can watch decisions happen.
fn log_line(req: &Value, resp: &Value) {
    let m = req["method"].as_str().unwrap_or("?");
    if m == "await" || m == "status" || m == "pending" {
        return;
    }
    let what = match m {
        "call" => format!("{} {}", req["params"]["tool"].as_str().unwrap_or("?"), req["params"]["args"]),
        _ => String::new(),
    };
    let outcome = resp["ok"]["decision"].as_str().map(String::from).or_else(|| resp["error"].as_str().map(|e| format!("error: {e}"))).unwrap_or_else(|| "ok".into());
    println!("{m:<10} {outcome:<8} {what}");
}

fn seed() {
    let root = root_dir();
    let dir = state_dir();
    std::fs::create_dir_all(&dir).unwrap();
    let mut m = meta::Store::open(&dir.join("meta.json"));
    match packs::apply(&root, &dir, &mut m, "standard-home", true) {
        Ok(r) => println!("Set up {} with the standard home ({} files).", root.display(), r["files"]),
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    }
    // people the owner works with (on SIOS this comes from contacts in Vault)
    let people = dir.join("people.json");
    if !people.exists() {
        std::fs::write(&people, r#"[
  { "name": "Muhammad Rashid", "email": "m.rashid@example.com", "role": "Co-founder" },
  { "name": "Sara Okafor", "email": "sara.okafor@example.com", "role": "Design" },
  { "name": "Daniel Kim", "email": "dkim@example.com", "role": "Advisor" }
]"#).unwrap();
    }
}
