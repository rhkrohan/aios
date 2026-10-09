//! The door for outside AIs (D6). Any MCP client (Claude Desktop, ChatGPT,
//! a coding agent...) launches `brain-d mcp` and gets three things:
//!   - the same briefing our own planner gets, so it knows this computer;
//!   - `sios_do`: hand SIOS a whole goal in plain words; SIOS plans it against
//!     the real state, the broker checks it, the owner grants it once;
//!   - `sios_goal_status`: follow a goal that's waiting for the owner.
//! It never gets raw file access or tokens. Goals go to the running brain-d,
//! so the owner sees and grants them in the SIOS shell like any other.

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::time::{Duration, Instant};

use crate::{state_dir, Brain};

fn brain_call(method: &str, params: Value) -> Result<Value, String> {
    let mut s = UnixStream::connect(state_dir().join("brain.sock")).map_err(|_| "SIOS isn't running its brain (brain-d serve). Ask the owner to switch on the live machine.".to_string())?;
    writeln!(s, "{}", json!({ "method": method, "params": params })).map_err(|e| e.to_string())?;
    let mut line = String::new();
    BufReader::new(s).read_line(&mut line).map_err(|e| e.to_string())?;
    let v: Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
    match v.get("error") {
        Some(e) => Err(e.as_str().unwrap_or("brain-d error").into()),
        None => Ok(v["ok"].clone()),
    }
}

const INSTRUCTIONS: &str = "You are connected to SIOS, an operating system built for AI. \
Read the sios://briefing resource (or call sios_briefing) first: it lists this computer's files with labels, people, off-limits places and what every action costs. \
To get something done, call sios_do with the whole goal in plain words. SIOS plans it, checks every step with its permission broker, and the owner approves once on their screen. \
Don't ask for files or paths step by step; one sios_do is faster and safer. If a goal is still waiting for the owner, call sios_goal_status.";

fn tools() -> Value {
    json!([
        {
            "name": "sios_do",
            "description": "Hand SIOS a goal in plain words (e.g. \"tidy Downloads into Finance and Notes\", \"summarize the board notes into the packet folder and email Sara\"). SIOS plans it against the real computer, the broker checks every step, the owner approves once. Returns the result, or a goal id if it's still waiting for the owner.",
            "inputSchema": { "type": "object", "properties": { "goal": { "type": "string" } }, "required": ["goal"] },
            "annotations": { "destructiveHint": true, "openWorldHint": true }
        },
        {
            "name": "sios_goal_status",
            "description": "Check on a goal started with sios_do: its steps so far and the result when done.",
            "inputSchema": { "type": "object", "properties": { "goal": { "type": "string" } }, "required": ["goal"] },
            "annotations": { "readOnlyHint": true }
        },
        {
            "name": "sios_recall",
            "description": "Search what the owner has let you remember (only the memory groups they shared with you; sensitive memories never leave the computer).",
            "inputSchema": { "type": "object", "properties": { "query": { "type": "string" } }, "required": ["query"] },
            "annotations": { "readOnlyHint": true }
        },
        {
            "name": "sios_briefing",
            "description": "What this computer looks like: files with labels and trust, people, off-limits places, and every action with its risk.",
            "inputSchema": { "type": "object", "properties": {} },
            "annotations": { "readOnlyHint": true }
        }
    ])
}

/// Plain-words account of a goal's events, for the outside AI.
fn summarize(events: &[Value], over: bool, goal: &str) -> String {
    let mut out = Vec::new();
    for e in events {
        match e["t"].as_str().unwrap_or("") {
            "plan" => out.push(format!("Plan ({}): {}", e["source"].as_str().unwrap_or(""), e["understanding"].as_str().unwrap_or(""))),
            "review" => out.push("Waiting for the owner to approve the plan on their screen.".into()),
            "granted" => out.push("The owner approved it.".into()),
            "ask" => out.push(format!("Step {} needs the owner's OK: {}", e["n"], e["reason"].as_str().unwrap_or(""))),
            "step" => out.push(format!(
                "Step {}: {} {}{}",
                e["n"],
                e["tool"].as_str().filter(|s| !s.is_empty()).unwrap_or("compose"),
                e["decision"].as_str().unwrap_or(""),
                e["reason"].as_str().filter(|s| !s.is_empty()).map(|r| format!(" ({r})")).unwrap_or_default()
            )),
            "done" => out.push(format!("Result: {}", e["text"].as_str().unwrap_or(""))),
            "error" => out.push(format!("Error: {}", e["message"].as_str().unwrap_or(""))),
            _ => {}
        }
    }
    if !over {
        out.push(format!("Still running. Call sios_goal_status with goal \"{goal}\" to follow it."));
    }
    out.join("\n")
}

fn wait_for(goal: &str, limit: Duration) -> Result<String, String> {
    let t = Instant::now();
    loop {
        let v = brain_call("goal.events", json!({ "goal": goal, "since": 0 }))?;
        let over = v["over"].as_bool().unwrap_or(false);
        if over || t.elapsed() > limit {
            let events = v["events"].as_array().cloned().unwrap_or_default();
            return Ok(summarize(&events, over, goal));
        }
        std::thread::sleep(Duration::from_millis(400));
    }
}

fn call_tool(name: &str, args: &Value, client: &str) -> Result<String, String> {
    match name {
        "sios_briefing" => Ok(brain_call("briefing", json!({}))?["text"].as_str().unwrap_or("").to_string()),
        "sios_do" => {
            let goal = args["goal"].as_str().filter(|s| !s.trim().is_empty()).ok_or("say what the goal is")?;
            let id = brain_call("goal.start", json!({ "request": goal, "principal": client }))?["goal"].as_str().unwrap_or_default().to_string();
            // most of the wait is the owner approving on screen
            wait_for(&id, Duration::from_secs(50))
        }
        "sios_goal_status" => wait_for(args["goal"].as_str().unwrap_or(""), Duration::from_secs(20)),
        "sios_recall" => {
            let v = brain_call("memory.recall", json!({ "query": args["query"], "principal": client }))?;
            let list: Vec<String> = v["memories"].as_array().into_iter().flatten().filter_map(|m| m.as_str().map(|s| format!("- {s}"))).collect();
            Ok(if list.is_empty() { "Nothing the owner has shared with you matches that.".into() } else { list.join("\n") })
        }
        other => Err(format!("no tool called {other}")),
    }
}

pub fn run(_brain: Brain) {
    let stdin = std::io::stdin();
    let mut out = std::io::stdout();
    let mut client = "outside AI".to_string();
    for line in stdin.lock().lines().map_while(Result::ok) {
        let Ok(msg) = serde_json::from_str::<Value>(&line) else { continue };
        let id = msg.get("id").cloned();
        let method = msg["method"].as_str().unwrap_or("");
        let result: Result<Value, (i64, String)> = match method {
            "initialize" => {
                if let Some(n) = msg["params"]["clientInfo"]["name"].as_str() {
                    client = format!("{n} (MCP)");
                }
                Ok(json!({
                    "protocolVersion": msg["params"]["protocolVersion"].as_str().unwrap_or("2025-06-18"),
                    "capabilities": { "tools": {}, "resources": {} },
                    "serverInfo": { "name": "sios", "version": env!("CARGO_PKG_VERSION") },
                    "instructions": INSTRUCTIONS,
                }))
            }
            "ping" => Ok(json!({})),
            "tools/list" => Ok(json!({ "tools": tools() })),
            "tools/call" => {
                let name = msg["params"]["name"].as_str().unwrap_or("");
                Ok(match call_tool(name, &msg["params"]["arguments"], &client) {
                    Ok(text) => json!({ "content": [{ "type": "text", "text": text }] }),
                    Err(e) => json!({ "content": [{ "type": "text", "text": e }], "isError": true }),
                })
            }
            "resources/list" => Ok(json!({ "resources": [{ "uri": "sios://briefing", "name": "Computer briefing", "description": "Files, labels, people, off-limits places and every action with its risk.", "mimeType": "text/plain" }] })),
            "resources/read" => match brain_call("briefing", json!({})) {
                Ok(v) => Ok(json!({ "contents": [{ "uri": "sios://briefing", "mimeType": "text/plain", "text": v["text"] }] })),
                Err(e) => Err((-32000, e)),
            },
            m if m.starts_with("notifications/") => continue,
            _ => Err((-32601, format!("method not found: {method}"))),
        };
        let Some(id) = id else { continue };
        let resp = match result {
            Ok(r) => json!({ "jsonrpc": "2.0", "id": id, "result": r }),
            Err((code, message)) => json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } }),
        };
        let _ = writeln!(out, "{resp}");
        let _ = out.flush();
    }
}
