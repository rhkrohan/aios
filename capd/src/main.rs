//! capd: the SIOS capability daemon (proof of concept of the permission broker).
//!
//! Run `capd serve` in one terminal. Everything else talks to it over a Unix
//! socket in the state folder (~/.sios by default). Agents only ever hold
//! capability tokens; owner commands prove themselves with ~/.sios/owner.secret.

mod adapters;
mod agents;
mod audit;
mod brains;
mod connectors;
mod exec;
mod fsguard;
mod gateway;
mod iam;
mod kwin;
mod manifest;
mod memory;
mod memsim;
mod packs;
mod meta;
mod owner;
mod peer;
mod policy;
mod registry;
mod review;
mod runner;
mod search;
mod security;
mod state;
mod terminal;
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

/// Where the sockets live: $SIOS_RUNTIME on SIOS ($XDG_RUNTIME_DIR/sios), else the state folder.
fn runtime_dir() -> PathBuf {
    if let Ok(d) = std::env::var("SIOS_RUNTIME") {
        return PathBuf::from(d);
    }
    // on SIOS the broker runs as a service with its sockets here; a CLI started from
    // the desktop (the Control Center) finds it without being told
    if let Ok(x) = std::env::var("XDG_RUNTIME_DIR") {
        let d = PathBuf::from(x).join("sios");
        if d.join("capd.sock").exists() {
            return d;
        }
    }
    state_dir()
}

fn socket() -> PathBuf {
    runtime_dir().join("capd.sock")
}

const HELP: &str = "capd: SIOS capability daemon

  capd serve                      run the daemon (keep it open)
  capd seed                       fill the sandbox with demo files and labels
  capd catalog                    every tool with its argument schema (MCP form)
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
  capd stop                       stop every AI at once (anyone; only the owner resumes)
  capd ai-resume                  let AI act again (owner)
  capd windows [focus APP | arrange LEFT RIGHT | desk NAME [PID] | desk-remove NAME]
                                  windows through KWin (A3 check; no closing here)
  capd extract FILE               the words search would index from FILE (sandbox check)
  capd window approve|settings [page]
                                  open SIOS's approval window or Settings (on a page)
  capd memsim [--days 180] [--seed 7] [--ai] [--out DIR]
                                  run months of made-up life through the memory store

Folders: state in $SIOS_STATE (~/.sios), sandbox in $SIOS_ROOT (~/SIOS-sandbox),
sockets in $SIOS_RUNTIME (the state folder). SIOS_IDENTITY=peer: callers are
known by their program, not by secret files (SIOS sets this).";

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let cmd = args.first().map(String::as_str).unwrap_or("help");
    match cmd {
        "serve" => serve(),
        // inside a terminal command's sandbox (D89): start its stages, write the result
        "pipeline-run" => std::process::exit(terminal::pipeline_run(std::path::Path::new(&args.get(1).cloned().unwrap_or_default()), &args.get(2).cloned().unwrap_or_default())),
        "seed" => seed(),
        // every tool with its exact argument schema, in MCP form (for docs and llm/)
        "catalog" => {
            let all = token::Cap {
                id: "catalog".into(),
                parent: None,
                principal: "catalog".into(),
                goal: "describe every tool".into(),
                tools: tools::TOOLS.iter().map(|t| t.name.to_string()).collect(),
                paths: vec![String::new()],
                expires_at: u64::MAX,
                uses: None,
                no_egress: false,
                budget: None,
                own: false,
            };
            match manifest::build(&all, None, None, 0, "mcp") {
                Ok(m) => println!("{}", serde_json::to_string_pretty(&m["tools"]).unwrap_or_default()),
                Err(e) => eprintln!("{e}"),
            }
        }
        "memsim" => {
            let o = memsim::Options {
                days: num(&args, "--days").unwrap_or(180).clamp(7, 730),
                seed: num(&args, "--seed").unwrap_or(7),
                ai: args.iter().any(|a| a == "--ai"),
                out: flag(&args, "--out").map(PathBuf::from).unwrap_or_else(|| state_dir().join("memsim")),
                brain_sock: runtime_dir().join("brain.sock"),
                start: 0,
            };
            let o = memsim::Options { start: (state::now() / 86400).saturating_sub(o.days) * 86400 + 9 * 3600, ..o };
            match memsim::run(&o) {
                Ok(r) => println!("{}", json!({ "done": true, "findings": r["findings"], "out": o.out.join("run.json") })),
                Err(e) => {
                    eprintln!("memsim failed: {e}");
                    std::process::exit(1);
                }
            }
        }
        // check the KWin module: the open windows (any of the user's programs can list these)
        "windows" => match match args.get(1).map(String::as_str) {
            Some("focus") => kwin::ask("focus", json!({ "app": args.get(2) })),
            Some("arrange") => kwin::ask("arrange", json!({ "left": args.get(2), "right": args.get(3) })),
            Some("desk") => kwin::ask("desk", json!({ "name": args.get(2), "pid": args.get(3).and_then(|p| p.parse::<u32>().ok()), "show": false })),
            Some("desk-remove") => kwin::ask("desk_remove", json!({ "name": args.get(2) })),
            _ => kwin::ask("list", json!({})),
        } {
            Ok(v) => println!("{}", serde_json::to_string_pretty(&v).unwrap_or_default()),
            Err(e) => {
                eprintln!("{e}");
                std::process::exit(1);
            }
        },
        // an agent's live log, for the terminal on its desk: follows the run until its result
        "agent-log" => {
            use std::io::{Read, Seek, SeekFrom};
            let path = args.get(1).cloned().unwrap_or_default();
            let mut pos = 0u64;
            let mut carry = String::new();
            loop {
                if let Ok(mut f) = std::fs::File::open(&path) {
                    let _ = f.seek(SeekFrom::Start(pos));
                    let mut buf = String::new();
                    if let Ok(n) = f.read_to_string(&mut buf) {
                        pos += n as u64;
                        carry.push_str(&buf);
                    }
                }
                let mut done = false;
                while let Some(i) = carry.find('\n') {
                    let line: String = carry.drain(..=i).collect();
                    for out in runner::describe(line.trim()) {
                        println!("{out}");
                        done |= out.starts_with("Done:") || out.starts_with("Stopped:");
                    }
                }
                if done {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(700));
            }
        }
        // check the document reader's sandbox: the words capd would index (files you can read anyway)
        "extract" => {
            let path = args.get(1).cloned().unwrap_or_default();
            match std::fs::File::open(&path).ok().and_then(|f| search::extract(f, &search::ext(&path))) {
                Some(t) => println!("{t}"),
                None => {
                    eprintln!("nothing read from {path} (a kind capd doesn't read, or the sandbox refused)");
                    std::process::exit(1);
                }
            }
        }
        // for whoever keeps SIOS's catalog key (never on a SIOS machine): make a key, sign the catalog
        "catalog-keygen" => {
            let out = args.get(1).cloned().unwrap_or_else(|| "connectors.key".into());
            let mut seed = [0u8; 32];
            getrandom::getrandom(&mut seed).expect("random");
            let sk = ed25519_dalek::SigningKey::from_bytes(&seed);
            {
                use std::os::unix::fs::OpenOptionsExt;
                let mut f = std::fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&out).expect("the key file already exists; not overwriting it");
                std::io::Write::write_all(&mut f, hex::encode(seed).as_bytes()).expect("write");
            }
            let pk = sk.verifying_key().to_bytes();
            println!("[{}]", pk.iter().map(|b| b.to_string()).collect::<Vec<_>>().join(", "));
        }
        "catalog-sign" => {
            use base64::Engine;
            use ed25519_dalek::Signer;
            let (key, cat) = (args.get(1).cloned().unwrap_or_default(), args.get(2).cloned().unwrap_or_default());
            let seed: [u8; 32] = hex::decode(std::fs::read_to_string(&key).expect("key").trim()).ok().and_then(|v| v.try_into().ok()).expect("a 32-byte hex key");
            let sk = ed25519_dalek::SigningKey::from_bytes(&seed);
            let body = std::fs::read(&cat).expect("catalog");
            let c: connectors::Catalog = serde_json::from_slice(&body).expect("the catalog isn't valid JSON for SIOS");
            std::fs::write(format!("{cat}.sig"), base64::engine::general_purpose::STANDARD.encode(sk.sign(&body).to_bytes())).expect("write");
            let dir = std::env::temp_dir();
            match connectors::Catalog::load(std::path::Path::new(&cat), &sk.verifying_key().to_bytes()) {
                Ok(_) => println!("signed {} ({} connectors); matches the built-in key: {}", cat, c.entries.len(), sk.verifying_key().to_bytes() == connectors::CATALOG_KEY),
                Err(e) => {
                    eprintln!("signed, but SIOS would refuse it: {e} ({})", dir.display());
                    std::process::exit(1);
                }
            }
        }
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
        // Stop: no password, anyone (D41). Resuming is the owner's, from a SIOS window
        "stop" => ("ai.stop", json!({ "by": "the stop command" })),
        "ai-resume" => ("ai.resume", json!({})),
        // open SIOS's approval window or Settings, started by the broker (S1)
        "window" => ("windows.open", json!({ "app": first, "page": a.get(1).cloned().unwrap_or_default() })),
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
    // no other program of this user may read or drive the broker's memory, where
    // the keys are (D55); its children (SIOS's windows) are readable again after exec
    #[cfg(target_os = "linux")]
    // SAFETY: prctl with PR_SET_DUMPABLE only changes this process's own flag.
    unsafe {
        libc::prctl(libc::PR_SET_DUMPABLE, 0, 0, 0, 0);
    }
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
    let by_peer = peer::enabled();
    println!(
        "capd listening on {}\nsandbox: {}\nstate:   {}\ncallers: {}",
        sock.display(),
        st.root.display(),
        dir.display(),
        if by_peer { "known by their program (SIOS_IDENTITY=peer)" } else { "prove themselves with secret files" }
    );
    let st = Arc::new(Mutex::new(st));
    // agents that were working when the broker last stopped: watch them again
    let working = st.lock().unwrap_or_else(|p| p.into_inner()).working_runs();
    for ok in working {
        watch_started(&st, &ok);
    }
    schedule_agents(Arc::clone(&st));
    refresh_registry_daily(Arc::clone(&st));
    // approval sessions end when the screen locks or the computer sleeps (D56)
    if by_peer {
        security::watch_lock();
    }
    for conn in listener.incoming() {
        let Ok(conn) = conn else { continue };
        let st = Arc::clone(&st);
        // who connected, by the kernel; asked again before every request, since a
        // process can change its program (exec) after connecting
        // SIOS's windows count only as the exact processes the broker started (S1)
        let ask = move |conn: &UnixStream| {
            by_peer.then(|| {
                let p = peer::of(conn);
                match peer::classify(&p, &peer::OWNER_APPS, Some(peer::SERVICE)) {
                    peer::Who::OwnerApp if !security::is_window(p.pid, p.start) => peer::Who::Agent,
                    w => w,
                }
            })
        };
        let first = ask(&conn);
        // the Store shows Flathub's content; as one of SIOS's windows it may still only use
        // what its pages need (security review), never approvals, memory or the audit log
        let store = by_peer && peer::of(&conn).exe == "/usr/bin/sios-store";
        // brain-d connects every few seconds; say so only for the others
        if let Some(w) = first.filter(|w| *w != peer::Who::Agent && *w != peer::Who::Service) {
            println!("{w:?} connected");
        }
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
                        // the strictest of what it was when it connected and what it is now
                        let mut who = match (first, ask(&writer)) {
                            (Some(a), Some(b)) if a == b => Some(a),
                            (Some(_), Some(_)) => Some(peer::Who::Agent),
                            _ => None,
                        };
                        let method_s = req["method"].as_str().unwrap_or("").to_string();
                        let method = method_s.as_str();
                        if store && !STORE_METHODS.contains(&method) {
                            let resp = json!({ "error": "the Store can't do that" });
                            log_line(&req, &resp);
                            if writeln!(writer, "{resp}").is_err() {
                                break;
                            }
                            continue;
                        }
                        // is this process one of SIOS's windows? Only SIOS's brain may ask (D59)
                        if method == "windows.check" {
                            let resp = if who == Some(peer::Who::Service) {
                                let p = &req["params"];
                                json!({ "ok": { "window": security::is_window(p["pid"].as_u64().unwrap_or(0) as u32, p["start"].as_u64().unwrap_or(0)) } })
                            } else {
                                json!({ "error": "only SIOS's brain can ask that" })
                            };
                            if writeln!(writer, "{resp}").is_err() {
                                break;
                            }
                            continue;
                        }
                        // SIOS's own windows, started by the broker: anyone may ask
                        if method == "windows.open" {
                            let resp = match security::open_window(req["params"]["app"].as_str().unwrap_or(""), req["params"]["page"].as_str().unwrap_or("")) {
                                Ok(v) => json!({ "ok": v }),
                                Err(e) => json!({ "error": e }),
                            };
                            log_line(&req, &resp);
                            if writeln!(writer, "{resp}").is_err() {
                                break;
                            }
                            continue;
                        }
                        // an owner action on SIOS: only from SIOS's own windows, and then the
                        // owner's password through polkit, every time (D39). Anything else never
                        // gets a dialog, so the owner is never asked to confirm a request an AI made.
                        if let (Some(w), Some(action)) = (who, owner::action_for(method)) {
                            if w != peer::Who::Owner && w != peer::Who::OwnerApp {
                                let resp = json!({ "error": "only the owner can do that, from SIOS's own windows" });
                                log_line(&req, &resp);
                                if writeln!(writer, "{resp}").is_err() {
                                    break;
                                }
                                continue;
                            }
                            // inside an approval session, SIOS's own undoable requests are a
                            // click (D56); everything else still needs the password
                            const CLICKABLE: [&str; 7] = ["approve", "grant", "memory.confirm", "memory.dismiss", "memory.edit", "memory.delete", "memory.revert"];
                            let in_session = w == peer::Who::OwnerApp
                                && CLICKABLE.contains(&method)
                                && security::session_is_open()
                                && st.lock().unwrap_or_else(|p| p.into_inner()).session_covers(method, &req["params"]);
                            if in_session {
                                who = Some(peer::Who::Owner);
                            } else if w != peer::Who::Owner {
                                match owner::confirm(action) {
                                    Ok(true) => {
                                        who = Some(peer::Who::Owner);
                                        if CLICKABLE.contains(&method) {
                                            security::session_open(state::now());
                                        }
                                    }
                                    Ok(false) => {
                                        let resp = json!({ "error": "not confirmed: the owner's password wasn't given" });
                                        log_line(&req, &resp);
                                        if writeln!(writer, "{resp}").is_err() {
                                            break;
                                        }
                                        continue;
                                    }
                                    Err(e) => {
                                        let resp = json!({ "error": e });
                                        log_line(&req, &resp);
                                        if writeln!(writer, "{resp}").is_err() {
                                            break;
                                        }
                                        continue;
                                    }
                                }
                            }
                        }
                        // the computer right now, for SIOS's brain before it plans (doc 20): read without
                        // the lock (it asks a few system tools); nothing secret in it
                        if method == "system.now" {
                            let service = match who {
                                Some(w) => w == peer::Who::Service,
                                None => st.lock().unwrap_or_else(|p| p.into_inner()).is_service_secret(&req),
                            };
                            let resp = if !service {
                                json!({ "error": "only SIOS's brain asks for this" })
                            } else if std::env::var("SIOS_ADAPTERS").as_deref() == Ok("real") {
                                json!({ "ok": adapters::state() })
                            } else {
                                json!({ "ok": {} })
                            };
                            if writeln!(writer, "{resp}").is_err() {
                                break;
                            }
                            continue;
                        }
                        // the MCP Registry (D108): fetched and icons downloaded without the lock;
                        // only SIOS's own windows may ask
                        if method == "registry.refresh" || method == "registry.icon" {
                            let viewer = match who {
                                Some(w) => w == peer::Who::Owner || w == peer::Who::OwnerApp,
                                None => st.lock().unwrap_or_else(|p| p.into_inner()).is_owner_secret(&req),
                            };
                            let resp = if !viewer {
                                json!({ "error": "only SIOS's own windows can do that" })
                            } else if method == "registry.refresh" {
                                refresh_registry(&st)
                            } else {
                                let known: Vec<String> = st.lock().unwrap_or_else(|p| p.into_inner()).registry.servers.iter().filter(|s| !s.icon.is_empty()).map(|s| s.icon.clone()).collect();
                                match registry::icon(req["params"]["url"].as_str().unwrap_or(""), &state_dir().join("registry-icons"), &known) {
                                    Ok(f) => json!({ "ok": { "file": f } }),
                                    Err(e) => json!({ "error": e }),
                                }
                            };
                            log_line(&req, &resp);
                            if writeln!(writer, "{resp}").is_err() {
                                break;
                            }
                            continue;
                        }
                        // reviewing or merging an agent's work (D102): git runs without the lock,
                        // so Stop and everything else stay quick however big its work is
                        if method == "agents.changes" || method == "agents.merge" {
                            let job = st.lock().unwrap_or_else(|p| p.into_inner()).review_prepare(&req, who);
                            let out = match job {
                                Err(e) => Err(e),
                                Ok(j) => {
                                    let out = review::run(&j);
                                    st.lock().unwrap_or_else(|p| p.into_inner()).review_done(&j, out)
                                }
                            };
                            let resp = match out { Ok(v) => json!({ "ok": v }), Err(e) => json!({ "error": e }) };
                            log_line(&req, &resp);
                            if writeln!(writer, "{resp}").is_err() {
                                break;
                            }
                            continue;
                        }
                        // a model call: checked under the lock, sent without it, logged under it
                        if method == "model.complete" || method == "model.test" {
                            let (o, s) = match who {
                                Some(w) => (w == peer::Who::Owner, w == peer::Who::Service),
                                None => {
                                    let g = st.lock().unwrap_or_else(|p| p.into_inner());
                                    (g.is_owner_secret(&req), g.is_service_secret(&req))
                                }
                            };
                            let prep = st.lock().unwrap_or_else(|p| p.into_inner()).model_prepare(&req, o, s);
                            let resp = match prep {
                                Err(e) => json!({ "error": e }),
                                Ok(prep) => {
                                    let out = gateway::send(&prep);
                                    st.lock().unwrap_or_else(|p| p.into_inner()).model_done(&prep, &out)
                                }
                            };
                            log_line(&req, &resp);
                            if writeln!(writer, "{resp}").is_err() {
                                break;
                            }
                            continue;
                        }
                        // the unit a session.open comes from, by the kernel (D64): never the caller's word
                        let mut req = req;
                        if method == "session.open" {
                            let unit = if by_peer { peer::of(&writer).cgroup.lines().last().and_then(|l| l.rsplit('/').next()).unwrap_or("").to_string() } else { String::new() };
                            req["params"]["__unit"] = json!(unit);
                        }
                        // one bad request must never take capd down for everyone after it
                        let mut guard = st.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                        let resp = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| guard.handle_as(&req, who)))
                            .unwrap_or_else(|_| json!({ "error": "capd hit an internal error on that request; nothing was changed by it" }));
                        drop(guard);
                        // something now waits for the owner: wake the approval window (M5)
                        let waits = (method == "call" && resp["ok"]["decision"] == "ask") || (method == "request_pass" && resp["ok"]["state"] == "waiting for the owner");
                        if by_peer && waits {
                            security::wake_approval_window();
                        }
                        if by_peer && method == "session.open" && resp.get("ok").is_some() {
                            let p = peer::of(&writer);
                            security::add_door(p.pid, p.start);
                        }
                        // a coding agent's run: watch its unit; when it's gone, its outcome is the report
                        if method == "agents.run" && resp.get("ok").is_some() {
                            let ok = resp["ok"].clone();
                            // its desk (A6): a terminal with its live log, on a desktop named after
                            // it; the owner's view never switches without a click (D67)
                            if by_peer {
                                security::show_on_desk(ok["name"].as_str().unwrap_or("Agent"), ok["run_file"].as_str().unwrap_or(""));
                            }
                            watch_started(&st, &ok);
                        }
                        // Stop also ends every MCP door at once (D41)
                        if by_peer && method == "ai.stop" && resp.get("ok").is_some() {
                            let n = security::kill_doors();
                            println!("stop: ended {n} MCP doors");
                        }
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

/// Watch a coding agent's run until its unit is gone. Its stream is read outside the
/// lock (it can be large); the counts go in briefly, and past a limit the broker stops
/// the unit (the OS enforces, D65). Its outcome becomes the report.
fn watch_run(st: Arc<Mutex<state::State>>, agent: String, brain: String, run: String, unit: String, file: std::path::PathBuf, worktree: std::path::PathBuf) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(3));
        while security::unit_active(&unit) {
            let pr = runner::progress_of(&brain, &file, &worktree);
            let why = st.lock().unwrap_or_else(|p| p.into_inner()).agent_tick(&agent, &run, pr);
            if why.is_some() {
                let _ = exec::run("/usr/bin/systemctl", &["--user", "stop", &format!("{unit}.service")], None, std::time::Duration::from_secs(30));
            }
            std::thread::sleep(std::time::Duration::from_secs(3));
        }
        let pr = runner::progress_of(&brain, &file, &worktree);
        let next = st.lock().unwrap_or_else(|p| p.into_inner()).agent_run_ended(&agent, &run, &file, pr);
        // it handed its work to another agent: that run is watched the same way
        if let Some(ok) = next {
            watch_started(&st, &ok);
        }
    });
}

fn watch_started(st: &Arc<Mutex<state::State>>, ok: &Value) {
    let s = |k: &str| ok[k].as_str().unwrap_or("").to_string();
    watch_run(Arc::clone(st), s("agent"), s("brain"), s("run"), s("unit"), s("run_file").into(), s("worktree").into());
}

/// What the Store may ask the broker: its Connectors page and nothing else.
const STORE_METHODS: [&str; 10] = ["connectors.view", "connectors.install", "connectors.remove", "connectors.set_ais", "registry.view", "registry.refresh", "registry.icon", "iam.apps", "agents.view", "windows.open"];

/// Fetch the MCP Registry (outside the lock), then keep it. One refresh at a time.
fn refresh_registry(st: &Arc<Mutex<state::State>>) -> Value {
    static BUSY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if BUSY.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return json!({ "error": "SIOS is already fetching the MCP Registry" });
    }
    let r = registry::fetch();
    BUSY.store(false, std::sync::atomic::Ordering::SeqCst);
    match r {
        Ok(servers) => {
            let n = servers.len();
            let mut g = st.lock().unwrap_or_else(|p| p.into_inner());
            g.registry = registry::Cache { fetched_at: state::now(), servers };
            let dir = state_dir();
            g.registry.save(&dir);
            json!({ "ok": { "servers": n } })
        }
        Err(e) => json!({ "error": e }),
    }
}

/// The MCP Registry once a day, when the copy is old (D108).
fn refresh_registry_daily(st: Arc<Mutex<state::State>>) {
    std::thread::spawn(move || loop {
        let stale = state::now().saturating_sub(st.lock().unwrap_or_else(|p| p.into_inner()).registry.fetched_at) > registry::STALE_SECS;
        if stale {
            let _ = refresh_registry(&st);
        }
        std::thread::sleep(std::time::Duration::from_secs(3600));
    });
}

/// Coding agents on a schedule (A9a): every 30 seconds, start the ones that are due.
fn schedule_agents(st: Arc<Mutex<state::State>>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(30));
        let started = st.lock().unwrap_or_else(|p| p.into_inner()).agents_due();
        for ok in started {
            watch_started(&st, &ok);
        }
    });
}

/// One line per request on the console, so you can watch decisions happen.
fn log_line(req: &Value, resp: &Value) {
    let m = req["method"].as_str().unwrap_or("?");
    if m == "await" || m == "status" || m == "pending" {
        return;
    }
    // reads that brain-d and the windows repeat every few seconds fill the journal;
    // only their errors are worth a line
    const POLLS: [&str; 6] = ["agents.list", "connectors.tools", "connectors.view", "model.providers", "windows.check", "goal.events"];
    if POLLS.contains(&m) && resp.get("error").is_none() {
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
