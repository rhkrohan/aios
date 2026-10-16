//! Coding agents' brains (D100): Claude Code, OpenAI Codex CLI, Cursor CLI and Gemini
//! CLI, each run headless in the same sandbox (runner.rs) and reporting back through
//! the same SIOS door. What differs per CLI lives here, and only here:
//!   - where its official installer puts it, and what must be bound in read-only
//!   - its headless command line (approve edits and commands itself: the systemd
//!     sandbox around it is the boundary, not the CLI's own prompts)
//!   - how the SIOS door is configured for it (a file bound read-only over its
//!     config path, or flags), and its environment
//!   - its stream of JSON events, read into SIOS's common progress and outcome
//!   - its sign-in command, run in the same sandbox
//! Other MCP servers an agent might configure would run inside its sandbox too, so
//! they can't reach more than its shell can; the SIOS door is the only way out.
//! Formats from each CLI's docs and source (2026-10); not run live yet: spike on the VM.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Brain {
    Claude,
    Codex,
    Cursor,
    Gemini,
}

/// How each is installed, its maker's own way (the broker runs it on the owner's
/// password, as the owner, into ~/.local; shown in the Agents app). No `$` in any.
pub const INSTALL: [(&str, &str); 4] = [
    ("claude-code", "curl -fsSL https://claude.ai/install.sh | bash"),
    ("codex", "curl -fsSL https://chatgpt.com/codex/install.sh | sh"),
    ("cursor", "curl -fsS https://cursor.com/install | bash"),
    ("gemini", "npm install -g --prefix ~/.local @google/gemini-cli"),
];

/// An installed CLI: what runs, and what is bound read-only so it can.
#[derive(Debug, Clone, PartialEq)]
pub struct Install {
    /// The program and its first arguments (gemini runs under the image's node).
    pub program: Vec<String>,
    pub binds: Vec<PathBuf>,
}

/// One progress-making line, in SIOS's own words (runner::Progress).
#[derive(Default, Debug, PartialEq)]
pub struct Progress {
    pub log: Vec<Value>,
    pub tokens: u64,
    pub too_big: bool,
    pub cost_usd: f64,
    pub commands: u64,
    pub files: Vec<String>,
    /// What it said last and its session, for the outcome.
    pub last_text: String,
    pub session: Option<String>,
    pub finished: bool,
    pub failed: bool,
}

impl Brain {
    pub fn from(name: &str) -> Option<Brain> {
        Some(match name {
            "claude-code" => Brain::Claude,
            "codex" => Brain::Codex,
            "cursor" => Brain::Cursor,
            "gemini" => Brain::Gemini,
            _ => return None,
        })
    }

    pub fn label(&self) -> &'static str {
        match self {
            Brain::Claude => "Claude Code",
            Brain::Codex => "Codex",
            Brain::Cursor => "Cursor",
            Brain::Gemini => "Gemini",
        }
    }

    /// Where its official installer put it in the owner's home; only a real file inside
    /// that vendor's own folder counts (a link elsewhere is refused).
    pub fn find(&self, home: &Path) -> Option<Install> {
        let real = |link: &str| std::fs::canonicalize(home.join(link)).ok().filter(|p| p.is_file());
        match self {
            // ~/.local/bin/claude -> ~/.local/share/claude/versions/<v>
            Brain::Claude => {
                let r = real(".local/bin/claude")?;
                r.starts_with(home.join(".local/share/claude/versions")).then(|| Install { program: vec![s(&r)], binds: vec![r] })
            }
            // ~/.local/bin/codex -> ~/.codex/packages/standalone/...: one static binary
            Brain::Codex => {
                let r = real(".local/bin/codex")?;
                r.starts_with(home.join(".codex/packages/standalone")).then(|| Install { program: vec![s(&r)], binds: vec![r] })
            }
            // ~/.local/bin/cursor-agent -> ~/.local/share/cursor-agent/versions/<v>/cursor-agent,
            // a launcher for the node bundled beside it: the whole version folder goes in
            Brain::Cursor => {
                let r = real(".local/bin/cursor-agent").or_else(|| real(".local/bin/agent"))?;
                let dir = r.parent()?.to_path_buf();
                (dir.parent()? == home.join(".local/share/cursor-agent/versions")).then(|| Install { program: vec![s(&r)], binds: vec![dir] })
            }
            // npm --prefix ~/.local: ~/.local/bin/gemini -> the package's script, run by the image's node
            Brain::Gemini => {
                let pkg = home.join(".local/lib/node_modules/@google/gemini-cli");
                let r = real(".local/bin/gemini")?;
                let node = Path::new("/usr/bin/node");
                (r.starts_with(&pkg) && node.exists()).then(|| Install { program: vec![s(node), s(&r)], binds: vec![pkg] })
            }
        }
    }

    /// Files bound read-only over its config path in the agent's home: (name in the
    /// agent's state folder, where it appears in its home, contents).
    pub fn config_files(&self) -> Vec<(&'static str, &'static str, String)> {
        let door = json!({ "command": "/usr/bin/brain-d", "args": ["mcp"] });
        match self {
            Brain::Claude => vec![("sios-mcp.json", "", json!({ "mcpServers": { "sios": door } }).to_string())],
            Brain::Codex => vec![],
            Brain::Cursor => vec![("cursor-mcp.json", ".cursor/mcp.json", json!({ "mcpServers": { "sios": { "type": "stdio", "command": "/usr/bin/brain-d", "args": ["mcp"] } } }).to_string())],
            Brain::Gemini => vec![(
                "gemini-settings.json",
                ".gemini/settings.json",
                json!({
                    "mcpServers": { "sios": { "command": "/usr/bin/brain-d", "args": ["mcp"], "trust": true, "timeout": 30000 } },
                    "mcp": { "allowed": ["sios"] },
                    "privacy": { "usageStatisticsEnabled": false },
                    "general": { "enableAutoUpdate": false }
                })
                .to_string(),
            )],
        }
    }

    pub fn env(&self, home: &Path) -> Vec<(String, String)> {
        let e = |k: &str, v: &str| (k.to_string(), v.to_string());
        match self {
            Brain::Claude => vec![],
            Brain::Codex => vec![e("CODEX_HOME", &format!("{}/.codex", home.display()))],
            Brain::Cursor => vec![e("NO_OPEN_BROWSER", "1")],
            Brain::Gemini => vec![e("GEMINI_CLI_TRUST_WORKSPACE", "true"), e("GEMINI_TELEMETRY_ENABLED", "false"), e("GEMINI_FORCE_FILE_STORAGE", "true"), e("NO_BROWSER", "true")],
        }
    }

    /// The headless command after the program: the prompt is one argument, never a flag.
    /// `rules` is SIOS's working agreement; Claude takes it as a system prompt, the others
    /// get it at the top of the prompt. `mcp` is Claude's door config (read-only).
    pub fn args(&self, prompt: &str, rules: &str, resume: Option<&str>, mcp: &Path) -> Vec<String> {
        let resume = resume.filter(|id| !id.is_empty() && id.len() <= 128 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
        let both = format!("{rules}\n\n{prompt}");
        let v = |xs: &[&str]| xs.iter().map(|x| x.to_string()).collect::<Vec<String>>();
        match self {
            Brain::Claude => {
                let mut a = vec!["-p".to_string(), prompt.to_string()];
                a.extend(v(&["--output-format", "stream-json", "--verbose", "--mcp-config"]));
                a.push(s(mcp));
                a.extend(v(&["--strict-mcp-config", "--permission-mode", "acceptEdits", "--append-system-prompt"]));
                a.push(rules.to_string());
                if let Some(id) = resume {
                    a.extend(["--resume".to_string(), id.to_string()]);
                }
                a
            }
            Brain::Codex => {
                let mut a = v(&[
                    "exec", "--json", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox",
                    "-c", "mcp_servers.sios.command=\"/usr/bin/brain-d\"", "-c", "mcp_servers.sios.args=[\"mcp\"]",
                    "-c", "analytics.enabled=false", "-c", "feedback.enabled=false", "-c", "check_for_update_on_startup=false",
                ]);
                if let Some(id) = resume {
                    a.extend(["resume".to_string(), id.to_string()]);
                }
                a.push(both);
                a
            }
            Brain::Cursor => {
                let mut a = v(&["-p", "--output-format", "stream-json", "--force", "--trust", "--approve-mcps", "--sandbox", "disabled"]);
                if let Some(id) = resume {
                    a.extend(["--resume".to_string(), id.to_string()]);
                }
                a.push(both);
                a
            }
            Brain::Gemini => {
                let mut a = vec!["-p".to_string(), both];
                a.extend(v(&["-o", "stream-json", "--approval-mode=yolo", "--skip-trust", "--allowed-mcp-server-names", "sios"]));
                if let Some(id) = resume {
                    a.extend(["-r".to_string(), id.to_string()]);
                }
                a
            }
        }
    }

    /// The interactive command for signing in (in the same sandbox, in a terminal).
    pub fn signin_args(&self) -> (Vec<String>, &'static str) {
        let v = |xs: &[&str]| xs.iter().map(|x| x.to_string()).collect::<Vec<String>>();
        match self {
            Brain::Claude => (vec![], "type /login there and follow the steps"),
            Brain::Codex => (v(&["login", "--device-auth"]), "open the link it shows and enter the code"),
            Brain::Cursor => (v(&["login"]), "open the link it shows and sign in to Cursor"),
            Brain::Gemini => (vec![], "choose Sign in with Google and follow the link it shows"),
        }
    }

    /// Read a run's stream into SIOS's progress: the live log, the counts the limits
    /// are checked on, and the outcome. Counts never come from what the agent says.
    pub fn progress(&self, text: &str, worktree: &Path) -> Progress {
        let root = format!("{}/", worktree.display());
        let rel = |p: &str| clean(p.strip_prefix(&root).unwrap_or(p), 160);
        let mut out = Progress::default();
        // a command's output and status go with the command that started it
        let mut at: HashMap<String, usize> = HashMap::new();
        let file = |out: &mut Progress, kind: &str, path: String| {
            if !path.is_empty() && !out.files.contains(&path) && out.files.len() < 50 {
                out.files.push(path.clone());
            }
            out.log.push(json!({ "kind": kind, "text": path }));
        };
        for line in text.lines() {
            let Ok(v) = serde_json::from_str::<Value>(line) else { continue };
            match self {
                Brain::Claude => unreachable!("Claude's stream is read by runner::progress"),
                Brain::Codex => match v["type"].as_str().unwrap_or("") {
                    "thread.started" => {
                        out.session = v["thread_id"].as_str().map(String::from);
                        out.log.push(json!({ "kind": "start", "text": "Workspace ready. Starting." }));
                    }
                    "item.started" | "item.completed" => {
                        let it = &v["item"];
                        let id = it["id"].as_str().unwrap_or("").to_string();
                        let done = v["type"] == "item.completed";
                        match it["type"].as_str().unwrap_or("") {
                            "agent_message" if done => {
                                let t = clean(it["text"].as_str().unwrap_or(""), 1200);
                                if !t.is_empty() {
                                    out.last_text = t.clone();
                                    out.log.push(json!({ "kind": "say", "text": t }));
                                }
                            }
                            "command_execution" => {
                                let i = *at.entry(id).or_insert_with(|| {
                                    out.commands += 1;
                                    out.log.push(json!({ "kind": "run", "text": clean(it["command"].as_str().unwrap_or(""), 300) }));
                                    out.log.len() - 1
                                });
                                if done {
                                    out.log[i]["detail"] = json!(tail(it["aggregated_output"].as_str().unwrap_or("")));
                                    out.log[i]["failed"] = json!(it["exit_code"].as_i64().is_some_and(|c| c != 0) || it["status"] == "failed");
                                }
                            }
                            "file_change" if done => {
                                for c in it["changes"].as_array().into_iter().flatten() {
                                    let kind = if c["kind"] == "add" { "new" } else { "edit" };
                                    file(&mut out, kind, rel(c["path"].as_str().unwrap_or("")));
                                }
                            }
                            "mcp_tool_call" if done => out.log.push(door(it["tool"].as_str().unwrap_or(""), &it["arguments"])),
                            "todo_list" if done => out.log.push(plan(it["items"].as_array().into_iter().flatten().map(|x| (x["text"].as_str().unwrap_or(""), x["completed"] == true)))),
                            _ => {}
                        }
                    }
                    "turn.completed" => {
                        let u = &v["usage"];
                        let n = |k: &str| u[k].as_u64().unwrap_or(0);
                        // per turn; input includes cached reads, which (as for Claude) aren't counted
                        out.tokens += n("input_tokens").saturating_sub(n("cached_input_tokens")) + n("output_tokens") + n("cache_write_input_tokens");
                        out.finished = true;
                    }
                    "turn.failed" | "error" => {
                        let m = clean(v["error"]["message"].as_str().or(v["message"].as_str()).unwrap_or("it stopped with an error"), 600);
                        out.failed = true;
                        out.finished = true;
                        out.last_text = m.clone();
                        out.log.push(json!({ "kind": "failed", "text": m }));
                    }
                    _ => {}
                },
                Brain::Cursor => match v["type"].as_str().unwrap_or("") {
                    "system" if v["subtype"] == "init" => {
                        out.session = v["session_id"].as_str().map(String::from);
                        out.log.push(json!({ "kind": "start", "text": "Workspace ready. Starting." }));
                    }
                    "assistant" => {
                        for c in v["message"]["content"].as_array().into_iter().flatten().filter(|c| c["type"] == "text") {
                            let t = clean(c["text"].as_str().unwrap_or(""), 1200);
                            if !t.is_empty() {
                                out.last_text = t.clone();
                                out.log.push(json!({ "kind": "say", "text": t }));
                            }
                        }
                    }
                    "tool_call" => {
                        let id = v["call_id"].as_str().unwrap_or("").to_string();
                        let Some((kind, call)) = v["tool_call"].as_object().and_then(|o| o.iter().next()) else { continue };
                        let a = &call["args"];
                        if v["subtype"] == "started" {
                            let entry = match kind.as_str() {
                                "shellToolCall" => {
                                    out.commands += 1;
                                    json!({ "kind": "run", "text": clean(a["command"].as_str().unwrap_or(""), 300) })
                                }
                                "readToolCall" => json!({ "kind": "read", "text": rel(a["path"].as_str().unwrap_or("")) }),
                                "writeToolCall" | "editToolCall" | "deleteToolCall" => {
                                    let p = rel(a["path"].as_str().unwrap_or(""));
                                    file(&mut out, if kind == "writeToolCall" { "new" } else { "edit" }, p);
                                    continue;
                                }
                                "grepToolCall" | "globToolCall" | "lsToolCall" => json!({ "kind": "search", "text": clean(a["pattern"].as_str().or(a["path"].as_str()).unwrap_or(""), 160) }),
                                "mcpToolCall" => door(a["toolName"].as_str().or(a["name"].as_str()).unwrap_or(""), &a["args"]),
                                k => json!({ "kind": "tool", "text": clean(k.trim_end_matches("ToolCall"), 60) }),
                            };
                            out.log.push(entry);
                            at.insert(id, out.log.len() - 1);
                        } else if let (Some(&i), "shellToolCall") = (at.get(&id), kind.as_str()) {
                            let r = &call["result"];
                            let ok = r.get("success").is_some();
                            let body = r.as_object().and_then(|o| o.values().next()).cloned().unwrap_or(Value::Null);
                            let printed = format!("{}\n{}", body["stdout"].as_str().unwrap_or(""), body["stderr"].as_str().unwrap_or(""));
                            out.log[i]["detail"] = json!(tail(&printed));
                            out.log[i]["failed"] = json!(!ok || body["exitCode"].as_i64().is_some_and(|c| c != 0));
                        }
                    }
                    "result" => {
                        let u = &v["usage"];
                        let n = |k: &str| u[k].as_u64().unwrap_or(0);
                        // summed over the run (inputTokens leaves out cached reads)
                        out.tokens = out.tokens.max(n("inputTokens") + n("outputTokens") + n("cacheWriteTokens"));
                        out.session = v["session_id"].as_str().map(String::from).or(out.session.take());
                        out.failed = v["is_error"] == true || v["subtype"].as_str().is_some_and(|s| s != "success");
                        out.finished = true;
                        let t = clean(v["result"].as_str().unwrap_or(""), 2000);
                        if !t.is_empty() {
                            out.last_text = t;
                        }
                        out.log.push(json!({ "kind": if out.failed { "failed" } else { "done" }, "text": clean(&out.last_text, 1200) }));
                    }
                    _ => {}
                },
                Brain::Gemini => match v["type"].as_str().unwrap_or("") {
                    "init" => {
                        out.session = v["session_id"].as_str().map(String::from);
                        out.log.push(json!({ "kind": "start", "text": "Workspace ready. Starting." }));
                    }
                    // text arrives in pieces: one entry per message, grown as it comes
                    "message" if v["role"] == "assistant" => {
                        let piece = v["content"].as_str().unwrap_or("");
                        let grow = v["delta"] == true && out.log.last().is_some_and(|e| e["kind"] == "say" && e["open"] == true);
                        // the raw text is kept while it grows (cleaning trims, which would eat the spaces between pieces)
                        if grow {
                            let e = out.log.last_mut().unwrap();
                            let raw: String = format!("{}{}", e["raw"].as_str().unwrap_or(""), piece).chars().take(4000).collect();
                            e["text"] = json!(clean(&raw, 1200));
                            e["raw"] = json!(raw);
                        } else {
                            out.log.push(json!({ "kind": "say", "text": clean(piece, 1200), "raw": piece.chars().take(4000).collect::<String>(), "open": true }));
                        }
                        out.last_text = out.log.last().and_then(|e| e["text"].as_str()).unwrap_or("").to_string();
                    }
                    "tool_use" => {
                        close(&mut out);
                        let id = v["tool_id"].as_str().unwrap_or("").to_string();
                        let p = &v["parameters"];
                        let path = || rel(p["file_path"].as_str().or(p["absolute_path"].as_str()).or(p["path"].as_str()).unwrap_or(""));
                        let entry = match v["tool_name"].as_str().unwrap_or("") {
                            "run_shell_command" => {
                                out.commands += 1;
                                json!({ "kind": "run", "text": clean(p["command"].as_str().unwrap_or(""), 300) })
                            }
                            "read_file" | "read_many_files" => json!({ "kind": "read", "text": path() }),
                            "write_file" => {
                                file(&mut out, "new", path());
                                continue;
                            }
                            "replace" | "edit" => {
                                file(&mut out, "edit", path());
                                continue;
                            }
                            "list_directory" | "glob" | "grep_search" | "search_file_content" => json!({ "kind": "search", "text": clean(p["pattern"].as_str().or(p["path"].as_str()).unwrap_or(""), 160) }),
                            n => door(n, p),
                        };
                        out.log.push(entry);
                        at.insert(id, out.log.len() - 1);
                    }
                    "tool_result" => {
                        if let Some(&i) = at.get(v["tool_id"].as_str().unwrap_or("")) {
                            if out.log[i]["kind"] == "run" {
                                out.log[i]["detail"] = json!(tail(v["output"].as_str().or(v["error"]["message"].as_str()).unwrap_or("")));
                                out.log[i]["failed"] = json!(v["status"] != "success");
                            }
                        }
                    }
                    "error" if v["severity"] == "error" => {
                        out.failed = true;
                        out.log.push(json!({ "kind": "failed", "text": clean(v["message"].as_str().unwrap_or(""), 600) }));
                    }
                    "result" => {
                        close(&mut out);
                        let st = &v["stats"];
                        let n = |k: &str| st[k].as_u64().unwrap_or(0);
                        out.tokens = out.tokens.max(n("input_tokens").saturating_sub(n("cached")) + n("output_tokens"));
                        out.failed = out.failed || v["status"] != "success";
                        out.finished = true;
                        out.log.push(json!({ "kind": if out.failed { "failed" } else { "done" }, "text": clean(&out.last_text, 1200) }));
                    }
                    _ => {}
                },
            }
        }
        close(&mut out);
        out
    }
}

/// Gemini's open message is finished once anything else happens.
fn close(out: &mut Progress) {
    if let Some(e) = out.log.last_mut().filter(|e| e["open"] == true) {
        if let Some(o) = e.as_object_mut() {
            o.remove("open");
            o.remove("raw");
        }
    }
}

/// A call into the SIOS door, as the live log shows it.
fn door(tool: &str, args: &Value) -> Value {
    let say = || clean(args["question"].as_str().or(args["text"].as_str()).or(args["summary"].as_str()).unwrap_or(""), 600);
    match tool {
        t if t.ends_with("sios_ask_owner") => json!({ "kind": "ask", "text": say() }),
        t if t.ends_with("sios_report") || t.ends_with("sios_done") => json!({ "kind": "report", "text": say() }),
        t => json!({ "kind": "tool", "text": clean(t, 60) }),
    }
}

/// An agent's own plan (its todo list), for the Workspace's Goal and plan pane.
fn plan<'a>(items: impl Iterator<Item = (&'a str, bool)>) -> Value {
    let steps: Vec<Value> = items.take(30).map(|(t, done)| json!({ "text": clean(t, 200), "done": done })).collect();
    json!({ "kind": "plan", "text": format!("{} steps", steps.len()), "steps": steps })
}

fn s(p: &Path) -> String {
    p.display().to_string()
}

/// The last few lines a command printed.
fn tail(raw: &str) -> String {
    let lines: Vec<&str> = raw.lines().filter(|l| !l.trim().is_empty()).collect();
    clean(&lines[lines.len().saturating_sub(4)..].join("\n"), 400)
}

/// Text from the agent, safe to show: no control characters, no direction tricks.
pub fn clean(s: &str, n: usize) -> String {
    let t: String = s.chars().filter(|c| (!c.is_control() || *c == '\n') && !('\u{202a}'..='\u{202e}').contains(c) && !('\u{2066}'..='\u{2069}').contains(c)).take(n).collect();
    t.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_cli_is_found_only_where_its_installer_puts_it() {
        let d = tempfile::tempdir().unwrap();
        let h = d.path().canonicalize().unwrap();
        let mk = |rel: &str, link: &str| {
            let f = h.join(rel);
            std::fs::create_dir_all(f.parent().unwrap()).unwrap();
            std::fs::write(&f, "x").unwrap();
            std::fs::create_dir_all(h.join(".local/bin")).unwrap();
            let _ = std::fs::remove_file(h.join(link));
            std::os::unix::fs::symlink(&f, h.join(link)).unwrap();
        };
        assert!(Brain::Codex.find(&h).is_none());
        mk(".codex/packages/standalone/releases/0.90.0/codex", ".local/bin/codex");
        assert_eq!(Brain::Codex.find(&h).unwrap().binds, vec![h.join(".codex/packages/standalone/releases/0.90.0/codex")]);
        mk("Downloads/codex", ".local/bin/codex");
        assert!(Brain::Codex.find(&h).is_none(), "a link to somewhere else isn't it");
        mk(".local/share/cursor-agent/versions/2026.10.14/cursor-agent", ".local/bin/cursor-agent");
        let c = Brain::Cursor.find(&h).unwrap();
        assert_eq!(c.binds, vec![h.join(".local/share/cursor-agent/versions/2026.10.14")], "its bundled node comes with it");
    }

    #[test]
    fn the_command_lines_keep_the_prompt_one_argument_and_the_door_only() {
        let mcp = Path::new("/s/sios-mcp.json");
        let a = Brain::Codex.args("Task from the owner: fix it", "RULES", Some("th_1"), mcp);
        assert_eq!(&a[..4], ["exec", "--json", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox"]);
        assert_eq!(a[a.len() - 3..], ["resume".to_string(), "th_1".into(), "RULES\n\nTask from the owner: fix it".into()]);
        assert!(a.contains(&"mcp_servers.sios.command=\"/usr/bin/brain-d\"".to_string()));
        let g = Brain::Gemini.args("Task", "R", Some("bad id; rm"), mcp);
        assert_eq!(g[0..2], ["-p".to_string(), "R\n\nTask".into()]);
        assert!(!g.contains(&"-r".to_string()), "an odd session id is dropped");
        assert!(g.windows(2).any(|w| w[0] == "--allowed-mcp-server-names" && w[1] == "sios"));
        let c = Brain::Cursor.args("Task", "R", None, mcp);
        assert!(c.contains(&"--trust".to_string()) && c.last().unwrap() == "R\n\nTask");
        let cl = Brain::Claude.args("Task", "R", None, mcp);
        assert!(cl.contains(&"--strict-mcp-config".to_string()) && cl[1] == "Task");
    }

    #[test]
    fn codex_events_become_progress() {
        let lines = [
            r#"{"type":"thread.started","thread_id":"th_9"}"#,
            r#"{"type":"turn.started"}"#,
            r#"{"type":"item.started","item":{"id":"i1","type":"command_execution","command":"npm test","aggregated_output":"","exit_code":null,"status":"in_progress"}}"#,
            r#"{"type":"item.completed","item":{"id":"i1","type":"command_execution","command":"npm test","aggregated_output":"a\n12 passed\n1 failed","exit_code":1,"status":"failed"}}"#,
            r#"{"type":"item.completed","item":{"id":"i2","type":"file_change","changes":[{"path":"/w/site/form.js","kind":"update"},{"path":"/w/site/contact.html","kind":"add"}],"status":"completed"}}"#,
            r#"{"type":"item.completed","item":{"id":"i3","type":"mcp_tool_call","server":"sios","tool":"sios_ask_owner","arguments":{"question":"Email or file?"},"status":"completed"}}"#,
            r#"{"type":"item.completed","item":{"id":"i4","type":"agent_message","text":"Form added."}}"#,
            r#"{"type":"turn.completed","usage":{"input_tokens":9000,"cached_input_tokens":8000,"output_tokens":300}}"#,
        ];
        let p = Brain::Codex.progress(&lines.join("\n"), Path::new("/w/site"));
        assert_eq!(p.session.as_deref(), Some("th_9"));
        assert_eq!((p.tokens, p.commands), (1300, 1), "cached reads aren't counted; the command once");
        assert_eq!(p.files, ["form.js", "contact.html"]);
        let kinds: Vec<&str> = p.log.iter().map(|e| e["kind"].as_str().unwrap()).collect();
        assert_eq!(kinds, ["start", "run", "edit", "new", "ask", "say"]);
        assert_eq!((p.log[1]["failed"].clone(), p.log[1]["detail"].as_str().unwrap()), (json!(true), "a\n12 passed\n1 failed"));
        assert!(p.finished && !p.failed && p.last_text == "Form added.");
    }

    #[test]
    fn cursor_events_become_progress() {
        let lines = [
            r#"{"type":"system","subtype":"init","session_id":"cs_1","model":"auto"}"#,
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Reading the layout."}]},"session_id":"cs_1"}"#,
            r#"{"type":"tool_call","subtype":"started","call_id":"c1","tool_call":{"readToolCall":{"args":{"path":"/w/site/index.html"}}}}"#,
            r#"{"type":"tool_call","subtype":"started","call_id":"c2","tool_call":{"shellToolCall":{"args":{"command":"npm test"}}}}"#,
            r#"{"type":"tool_call","subtype":"completed","call_id":"c2","tool_call":{"shellToolCall":{"args":{"command":"npm test"},"result":{"success":{"exitCode":0,"stdout":"12 passed\n","stderr":""}}}}}"#,
            r#"{"type":"tool_call","subtype":"started","call_id":"c3","tool_call":{"editToolCall":{"args":{"path":"/w/site/form.js"}}}}"#,
            r#"{"type":"result","subtype":"success","is_error":false,"result":"Done: form added.","session_id":"cs_1","usage":{"inputTokens":1200,"outputTokens":300,"cacheReadTokens":50000,"cacheWriteTokens":100}}"#,
        ];
        let p = Brain::Cursor.progress(&lines.join("\n"), Path::new("/w/site"));
        assert_eq!((p.session.as_deref(), p.tokens, p.commands), (Some("cs_1"), 1600, 1));
        assert_eq!(p.files, ["form.js"]);
        assert_eq!(p.log[3]["detail"], "12 passed");
        assert_eq!(p.log[3]["failed"], false);
        assert!(p.finished && !p.failed && p.last_text == "Done: form added.");
    }

    #[test]
    fn gemini_events_become_progress_and_text_pieces_join() {
        let lines = [
            r#"{"type":"init","timestamp":"t","session_id":"gs_1","model":"gemini"}"#,
            r#"{"type":"message","role":"assistant","content":"Adding ","delta":true}"#,
            r#"{"type":"message","role":"assistant","content":"the form.","delta":true}"#,
            r#"{"type":"tool_use","tool_name":"write_file","tool_id":"t1","parameters":{"file_path":"/w/site/contact.html"}}"#,
            r#"{"type":"tool_use","tool_name":"run_shell_command","tool_id":"t2","parameters":{"command":"npm test"}}"#,
            r#"{"type":"tool_result","tool_id":"t2","status":"error","output":"1 failed"}"#,
            r#"{"type":"tool_use","tool_name":"sios_done","tool_id":"t3","parameters":{"summary":"Form added."}}"#,
            r#"{"type":"result","status":"success","stats":{"total_tokens":5000,"input_tokens":4000,"output_tokens":500,"cached":3000}}"#,
        ];
        let p = Brain::Gemini.progress(&lines.join("\n"), Path::new("/w/site"));
        assert_eq!((p.session.as_deref(), p.tokens, p.commands), (Some("gs_1"), 1500, 1));
        assert_eq!(p.log[1]["text"], "Adding the form.");
        assert!(p.log[1].get("open").is_none() && p.log[1].get("raw").is_none());
        assert_eq!(p.files, ["contact.html"]);
        assert_eq!((p.log[3]["kind"].as_str(), p.log[3]["failed"].clone()), (Some("run"), json!(true)));
        assert_eq!(p.log[4]["kind"], "report");
        assert!(p.finished && !p.failed);
    }

    #[test]
    fn agent_text_is_plain() {
        let p = Brain::Codex.progress(r#"{"type":"item.completed","item":{"id":"x","type":"agent_message","text":"hi\u001b[2J\u202ethere"}}"#, Path::new("/w"));
        assert_eq!(p.log[0]["text"], "hi[2Jthere");
    }
}
