//! Memory over time: a scripted life run through the real memory store with a
//! fake clock. The owner tells SIOS things, changes their mind, meets people;
//! SIOS, a helper and an outside AI do daily tasks that recall memories and
//! leave episodes. Every week a set of checks asks "does it still remember the
//! right thing?". Optionally a real model (through brain-d) spots patterns and
//! answers the checks from what it was given.
//!
//!   capd memsim --days 180 --seed 7 [--ai] [--out DIR]
//!
//! Writes DIR/run.json (weeks, checks, every memory ever with when it was
//! born and gone) and DIR/memory.json (the store at the end). Never touches
//! the real memory: it runs on its own store.

use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

use crate::memory::{MemStore, Memory, Viewer};

const DAY: u64 = 86400;
const CLAUDE: &str = "Claude Desktop (MCP)";
const CLAUDE_GROUPS: [&str; 2] = ["Work", "People"];

pub struct Options {
    pub days: u64,
    pub seed: u64,
    pub ai: bool,
    pub out: PathBuf,
    pub brain_sock: PathBuf,
    pub start: u64,
}

/// What the owner says on given days.
enum Say {
    Fact(&'static str, &'static str, bool),
    Forget(&'static str),
}

const LIFE: &[(u64, Say)] = &[
    (0, Say::Fact("I live in Philadelphia", "Personal", false)),
    (0, Say::Fact("Priya Shah <priya@ledger.example>, accountant", "People", false)),
    (0, Say::Fact("I keep finance files in Documents/Finance", "Habits", false)),
    (1, Say::Fact("Sara Lee <sara.lee@example.com>, landlord", "People", false)),
    (3, Say::Fact("I'm working on the SIOS launch", "Work", false)),
    (10, Say::Fact("Therapy is on Tuesdays at 5pm", "Personal", true)),
    (20, Say::Fact("Sara Okafor <sara.o@studio.example>, designer", "People", false)),
    (45, Say::Fact("My accountant is now Marcus Webb <marcus@books.example>", "People", false)),
    (60, Say::Fact("I moved to Boston", "Personal", false)),
    (75, Say::Fact("I keep finance files in Documents/Money now", "Habits", false)),
    (90, Say::Forget("Therapy")),
    (100, Say::Fact("I'm working on the SIOS beta now", "Work", false)),
    (120, Say::Fact("Marcus Webb <marcus.webb@newfirm.example>, accountant", "People", false)),
];

const TASKS: &[&str] = &[
    "Email my accountant the invoice",
    "Move the new bank statements to my finance folder",
    "Send the launch notes to Sara",
    "Write the weekly work update about what I'm working on",
    "Tidy my Downloads",
    "Check the weather where I live",
];

/// A check: ask memory a question as someone, and say what the right answer is on a given day.
struct Check {
    id: &'static str,
    title: &'static str,
    query: &'static str,
    question: &'static str,
    /// (from day, expected text, stale text it replaced)
    truth: &'static [(u64, &'static str, &'static str)],
}

const CHECKS: &[Check] = &[
    Check { id: "accountant", title: "Who my accountant is", query: "who is my accountant", question: "Who is my accountant? Name only.", truth: &[(0, "Priya", ""), (45, "Marcus", "Priya")] },
    Check { id: "accountant-email", title: "My accountant's current email", query: "my accountant email address", question: "What is my accountant's email address?", truth: &[(0, "priya@ledger", ""), (45, "marcus@books", "priya@ledger"), (120, "newfirm", "marcus@books")] },
    Check { id: "home", title: "Where I live", query: "where do I live", question: "Which city do I live in?", truth: &[(0, "Philadelphia", ""), (60, "Boston", "Philadelphia")] },
    Check { id: "finance-folder", title: "Where finance files go", query: "where do I keep finance files", question: "Which folder do I keep finance files in?", truth: &[(0, "Documents/Finance", ""), (75, "Documents/Money", "Documents/Finance")] },
    Check { id: "work", title: "What I'm working on", query: "what am I working on", question: "What am I working on right now?", truth: &[(3, "launch", ""), (100, "beta", "SIOS launch")] },
    Check { id: "old-friend", title: "Rarely used people aren't lost", query: "Sara Lee landlord", question: "Who is my landlord?", truth: &[(1, "Sara Lee", "")] },
];

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n.max(1)
    }
}

fn has(text: &str, needle: &str) -> bool {
    !needle.is_empty() && text.to_lowercase().contains(&needle.to_lowercase())
}

/// The truth on a day: the latest entry that has started.
fn truth_on(c: &Check, day: u64) -> Option<(&'static str, &'static str)> {
    c.truth.iter().rev().find(|(from, _, _)| *from <= day).map(|(_, e, s)| (*e, *s))
}

pub fn run(o: &Options) -> Result<Value, String> {
    std::fs::create_dir_all(&o.out).map_err(|e| e.to_string())?;
    let store_path = o.out.join("memory.json");
    let _ = std::fs::remove_file(&store_path);
    let mut st = MemStore::open(&store_path);
    st.shares.insert(CLAUDE.into(), CLAUDE_GROUPS.iter().map(|s| s.to_string()).collect());
    let mut rng = Rng(o.seed.max(1).wrapping_mul(0x9E37_79B9_7F4A_7C15));
    // every memory ever, with when it went away (forgotten, or reclaimed like an old page)
    let mut ledger: BTreeMap<String, (Memory, Option<u64>)> = BTreeMap::new();
    let mut weeks = vec![];
    let mut leaks = vec![];
    let mut confirmed = vec![];
    let mut ai_calls = 0u32;

    for day in 0..o.days {
        let t0 = o.start + day * DAY;
        // morning: what the owner says today
        for (_, say) in LIFE.iter().filter(|(d, _)| *d == day) {
            match say {
                Say::Fact(text, group, sensitive) => {
                    let kind = if text.contains('@') { "person" } else if *group == "Habits" { "preference" } else { "fact" };
                    let m = st.add(text, kind, group, if *sensitive { vec!["Sensitive".into()] } else { vec![] }, "you", t0)?;
                    st.attach(&m.id, "you", &[]);
                }
                Say::Forget(word) => {
                    let ids: Vec<String> = st.memories.iter().filter(|m| m.kind != "episode" && has(&m.text, word)).map(|m| m.id.clone()).collect();
                    for id in ids {
                        st.remove(&id);
                    }
                }
            }
        }
        // the day's tasks
        for k in 0..(1 + rng.below(3)) {
            let t = t0 + 3600 * (1 + k * 3);
            let task = TASKS[rng.below(TASKS.len() as u64) as usize];
            let roll = rng.below(10);
            let (by, own) = if roll < 7 { ("SIOS", true) } else if roll < 9 { ("Pip (helper)", true) } else { (CLAUDE, false) };
            let v = Viewer { principal: by, own, online: true };
            let recalled = st.search(task, &v, 12);
            if !own {
                for m in &recalled {
                    if !CLAUDE_GROUPS.contains(&m.group.as_str()) || m.labels.iter().any(|l| l == "Sensitive") {
                        leaks.push(json!({ "day": day, "memory": m.text, "group": m.group }));
                    }
                }
            }
            let ids: Vec<String> = recalled.iter().map(|m| m.id.clone()).collect();
            st.touch(&ids, t);
            let result = act(task, &recalled);
            let ep = st.add(&format!("day {}: {task}. {result}", t / DAY), "episode", "History", vec![], &format!("{by}, simulated day {day}"), t)?;
            st.attach(&ep.id, by, &ids);
        }
        // evening, once a week: spot a pattern, then the checks
        let week_end = day % 7 == 6 || day + 1 == o.days;
        if week_end {
            let t = t0 + 20 * 3600;
            let eps: Vec<String> = st.recent_episodes(14).iter().map(|e| e.text.clone()).collect();
            let found = if o.ai && (day / 7) % 2 == 1 {
                ai_calls += 1;
                brain(&o.brain_sock, "memsim.pattern", json!({ "episodes": eps })).ok().filter(|v| v["found"] == true).map(|v| (v["text"].as_str().unwrap_or("").to_string(), v["group"].as_str().unwrap_or("Habits").to_string()))
            } else {
                scripted_pattern(&eps)
            };
            if let Some((text, group)) = found {
                // the scripted owner says yes to what SIOS noticed
                if let Ok(s) = st.suggest(&text, "preference", &group, "seen in recent tasks", t) {
                    st.suggestions.retain(|x| x.id != s.id);
                    if let Ok(m) = st.add(&s.text, "preference", &s.group, vec![], "suggested by SIOS, confirmed by you", t) {
                        st.attach(&m.id, "SIOS", &[]);
                        confirmed.push(json!({ "day": day, "text": m.text }));
                    }
                }
            }
            let ask_ai = o.ai && ((day / 7) % 4 == 3 || day + 1 == o.days);
            let mut results = vec![];
            for c in CHECKS {
                let Some((expect, stale)) = truth_on(c, day) else { continue };
                let v = Viewer { principal: "SIOS", own: true, online: true };
                let found = st.search(c.query, &v, 12);
                let pos = |needle: &str| found.iter().position(|m| has(&m.text, needle));
                let (status, why) = match (pos(expect), if stale.is_empty() { None } else { pos(stale) }) {
                    (None, _) => ("fail", format!("can't find \"{expect}\" any more")),
                    (Some(e), Some(s)) if s < e => ("fail", format!("the old \"{}\" ranks above \"{expect}\"{}", stale.trim(), if found[s].kind == "episode" { " (carried by a past task)" } else { "" })),
                    (Some(0), Some(_)) => ("warn", format!("right answer first, but the old \"{}\" is still in the briefing", stale.trim())),
                    (Some(0), None) => ("pass", String::new()),
                    (Some(e), _) => ("warn", format!("right answer is only #{} of {}", e + 1, found.len())),
                };
                let mut r = json!({ "id": c.id, "status": status, "why": why, "top": found.iter().take(3).map(|m| m.text.clone()).collect::<Vec<_>>() });
                if ask_ai {
                    ai_calls += 1;
                    let mems: Vec<String> = found.iter().map(|m| format!("- {}", m.text)).collect();
                    if let Ok(a) = brain(&o.brain_sock, "memsim.answer", json!({ "question": c.question, "memories": mems })) {
                        let a = a.as_str().unwrap_or("").to_string();
                        // right if it gives the new answer, and leads with it when it mentions the old one too
                        let at = |n: &str| a.to_lowercase().find(&n.trim().to_lowercase());
                        let ok = match (at(expect), if stale.is_empty() { None } else { at(stale) }) {
                            (Some(e), Some(s)) => e < s,
                            (Some(_), None) => true,
                            (None, _) => false,
                        };
                        r["ai"] = json!({ "answer": a, "right": ok });
                    }
                }
                results.push(r);
            }
            // privacy holds over time too: online never sees Sensitive, the outside AI only its groups
            let sens = st.search("therapy tuesday", &Viewer { principal: "SIOS", own: true, online: true }, 12).iter().any(|m| m.labels.iter().any(|l| l == "Sensitive"));
            results.push(json!({ "id": "sensitive", "status": if sens { "fail" } else { "pass" }, "why": if sens { "a Sensitive memory reached an online model" } else { "" }, "top": [] }));
            let week_leaks = leaks.iter().filter(|l| l["day"].as_u64().unwrap_or(0) + 7 > day).count();
            results.push(json!({ "id": "claude-view", "status": if week_leaks > 0 { "fail" } else { "pass" }, "why": if week_leaks > 0 { format!("{week_leaks} memories outside its groups") } else { String::new() }, "top": [] }));
            let count = |s: &str| results.iter().filter(|r| r["status"] == s).count();
            let episodes = st.memories.iter().filter(|m| m.kind == "episode").count();
            let w = json!({ "day": day, "t": t, "pass": count("pass"), "warn": count("warn"), "fail": count("fail"), "memories": st.memories.len(), "episodes": episodes, "results": results });
            println!("{}", json!({ "progress": day + 1, "of": o.days, "pass": count("pass"), "fail": count("fail") }));
            let _ = std::io::stdout().flush();
            weeks.push(w);
        }
        // ledger: who's here, who left today
        let here: Vec<String> = st.memories.iter().map(|m| m.id.clone()).collect();
        for m in &st.memories {
            ledger.entry(m.id.clone()).and_modify(|e| e.0 = m.clone()).or_insert((m.clone(), None));
        }
        for (id, e) in ledger.iter_mut() {
            if e.1.is_none() && !here.contains(id) {
                e.1 = Some(t0 + 23 * 3600);
            }
        }
    }

    // the first week each check went wrong, in plain words
    let mut findings = vec![];
    for id in CHECKS.iter().map(|c| c.id).chain(["sensitive", "claude-view"]) {
        let first = weeks.iter().find_map(|w| w["results"].as_array()?.iter().find(|r| r["id"] == id && r["status"] == "fail").map(|r| (w["day"].clone(), r["why"].clone())));
        if let Some((day, why)) = first {
            let title = CHECKS.iter().find(|c| c.id == id).map(|c| c.title).unwrap_or(if id == "sensitive" { "Sensitive stays offline" } else { "Claude Desktop sees only its groups" });
            findings.push(json!({ "id": id, "title": title, "day": day, "why": why }));
        }
    }
    let memories: Vec<Value> = ledger
        .into_values()
        .map(|(m, gone)| {
            let mut v = json!(m);
            if let Some(g) = gone {
                v["gone"] = json!(g);
            }
            v
        })
        .collect();
    let checks: Vec<Value> = CHECKS.iter().map(|c| json!({ "id": c.id, "title": c.title })).chain([json!({ "id": "sensitive", "title": "Sensitive stays offline" }), json!({ "id": "claude-view", "title": "Claude Desktop sees only its groups" })]).collect();
    let report = json!({
        "days": o.days, "seed": o.seed, "ai": o.ai, "ai_calls": ai_calls, "start": o.start,
        "life": LIFE.iter().filter(|(d, _)| *d < o.days).map(|(d, say)| json!({ "day": d, "text": match say { Say::Fact(t, _, _) => format!("You: \"{t}\""), Say::Forget(w) => format!("You: \"forget {}\"", w.to_lowercase()) } })).collect::<Vec<_>>(),
        "checks": checks, "weeks": weeks, "findings": findings, "confirmed": confirmed,
        "memories": memories, "shares": st.shares,
    });
    std::fs::write(o.out.join("run.json"), serde_json::to_vec(&report).unwrap_or_default()).map_err(|e| e.to_string())?;
    Ok(report)
}

/// What a plain planner would do with what it recalled: trust the first match.
fn act(task: &str, recalled: &[Memory]) -> String {
    let first = |f: &dyn Fn(&Memory) -> bool| recalled.iter().find(|m| f(m)).cloned();
    if task.contains("accountant") {
        return match first(&|m| m.person.as_ref().is_some_and(|p| has(&p.role, "accountant"))) {
            Some(m) => {
                let p = m.person.unwrap();
                format!("Emailed it to {} <{}>.", p.name, p.email)
            }
            None => "Asked who the accountant is.".into(),
        };
    }
    if task.contains("finance folder") {
        return match first(&|m| has(&m.text, "finance files in ")) {
            Some(m) => {
                let folder = m.text.split(" in ").nth(1).unwrap_or("").split_whitespace().next().unwrap_or("").to_string();
                format!("Moved 3 statements into {folder}.")
            }
            None => "Asked where finance files go.".into(),
        };
    }
    if task.contains("Sara") {
        let saras: Vec<&Memory> = recalled.iter().filter(|m| m.person.as_ref().is_some_and(|p| p.name.starts_with("Sara"))).collect();
        return match saras.len() {
            0 => "Asked who Sara is.".into(),
            1 => format!("Sent them to {}.", saras[0].person.as_ref().unwrap().name),
            _ => "Asked which Sara.".into(),
        };
    }
    if task.contains("work update") {
        return match first(&|m| m.kind != "episode" && has(&m.text, "working on")) {
            Some(m) => format!("Wrote it about: {}.", m.text),
            None => "Wrote a general update.".into(),
        };
    }
    if task.contains("weather") {
        return match first(&|m| m.kind != "episode" && has(&m.text, "live in")) {
            Some(m) => format!("Checked the weather in {}.", m.text.rsplit(' ').next().unwrap_or("")),
            None => "Asked where you live.".into(),
        };
    }
    "Done.".into()
}

/// Without a model: the same destination three times in two weeks is a habit.
fn scripted_pattern(eps: &[String]) -> Option<(String, String)> {
    let mut seen: BTreeMap<String, usize> = BTreeMap::new();
    for e in eps {
        if let Some(rest) = e.split("statements into ").nth(1) {
            *seen.entry(rest.trim_end_matches('.').to_string()).or_default() += 1;
        }
    }
    seen.into_iter().filter(|(_, n)| *n >= 3).max_by_key(|(_, n)| *n).map(|(f, _)| (format!("Bank statements go in {f}"), "Habits".to_string()))
}

/// Ask brain-d (which holds the model) one question. The broker itself never talks to a model.
fn brain(sock: &Path, method: &str, params: Value) -> Result<Value, String> {
    let mut s = std::os::unix::net::UnixStream::connect(sock).map_err(|e| format!("brain-d isn't running: {e}"))?;
    s.set_read_timeout(Some(std::time::Duration::from_secs(90))).ok();
    writeln!(s, "{}", json!({ "method": method, "params": params })).map_err(|e| e.to_string())?;
    let mut line = String::new();
    BufReader::new(s).read_line(&mut line).map_err(|e| e.to_string())?;
    let v: Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
    v.get("ok").cloned().ok_or_else(|| v["error"].as_str().unwrap_or("brain-d said no").to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_year_runs_and_is_the_same_every_time() {
        let d = tempfile::tempdir().unwrap();
        let o = |sub: &str| Options { days: 120, seed: 7, ai: false, out: d.path().join(sub), brain_sock: d.path().join("none.sock"), start: 1_700_000_000 };
        let a = run(&o("a")).unwrap();
        let b = run(&o("b")).unwrap();
        assert_eq!(a["weeks"], b["weeks"], "same seed, same life");
        assert!(a["weeks"].as_array().unwrap().len() >= 17);
        // the privacy checks hold the whole way
        for w in a["weeks"].as_array().unwrap() {
            for r in w["results"].as_array().unwrap() {
                if r["id"] == "sensitive" || r["id"] == "claude-view" {
                    assert_eq!(r["status"], "pass", "day {}: {}", w["day"], r["why"]);
                }
            }
        }
        // forgetting shows up in the ledger
        let mems = a["memories"].as_array().unwrap();
        assert!(mems.iter().any(|m| has(m["text"].as_str().unwrap(), "therapy") && m["gone"].is_u64()));
    }
}
