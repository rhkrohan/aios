//! Plans: the model's whole answer in one go, as typed steps the OS can check
//! before anything runs (D14). Two kinds of step:
//!   tool     a broker call with exact arguments
//!   compose  "write text from these files": brain-d reads the files through
//!            capd and asks the model for just that text
//! A later step can use a compose step's text by writing {{N}} (N = step number).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeSet;

use crate::briefing::TOOLS;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Step {
    pub kind: String,
    #[serde(default)]
    pub tool: String,
    /// Tool arguments as a JSON object (written as a string so the schema stays strict).
    #[serde(default)]
    pub args_json: String,
    #[serde(default)]
    pub sources: Vec<String>,
    #[serde(default)]
    pub instruction: String,
    #[serde(default)]
    pub why: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Plan {
    pub understanding: String,
    pub steps: Vec<Step>,
    /// What to tell the owner at the end. May use {{N}}.
    pub reply: String,
    /// If the request is unclear: one short question for the owner, and no steps.
    #[serde(default)]
    pub question: String,
    /// "undo that": undo the last goal in this conversation, and no steps.
    #[serde(default)]
    pub undo_last: bool,
    /// When it can't or shouldn't do something: one-click actions the owner can take themselves.
    #[serde(default)]
    pub manual: Vec<Manual>,
    /// Look first (A7, D72): read-only lookups to run before planning the real steps.
    #[serde(default)]
    pub look: Vec<Look>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Look {
    pub tool: String,
    pub args_json: String,
}

/// What a plan may look up first: finding and listing, never reading contents.
pub const LOOK_TOOLS: [&str; 2] = ["files.find", "files.list"];

/// The lookups that may run: look tools (and connectors' read tools) only, at most 3 (one round, D72).
pub fn look_calls<'a>(looks: &'a [Look], connector_reads: &[String]) -> Vec<&'a Look> {
    looks.iter().filter(|l| LOOK_TOOLS.contains(&l.tool.as_str()) || connector_reads.contains(&l.tool)).take(3).collect()
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Manual {
    pub label: String,
    pub tool: String,
    pub args_json: String,
}

/// The plan's shape, with installed connectors' tools (C1) as valid names too;
/// their read tools may also be looked up first.
pub fn schema_with(connector_tools: &[String], connector_reads: &[String]) -> Value {
    let tools: Vec<&str> = TOOLS.iter().map(|(n, _)| *n).chain(connector_tools.iter().map(String::as_str)).chain([""]).collect();
    let look_tools: Vec<&str> = LOOK_TOOLS.iter().copied().chain(connector_reads.iter().map(String::as_str)).collect();
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["understanding", "steps", "reply", "question", "undo_last", "manual", "look"],
        "properties": {
            "understanding": { "type": "string", "description": "One sentence: what the owner wants." },
            "steps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["kind", "tool", "args_json", "sources", "instruction", "why"],
                    "properties": {
                        "kind": { "type": "string", "enum": ["tool", "compose"] },
                        "tool": { "type": "string", "enum": tools, "description": "For tool steps. Empty for compose." },
                        "args_json": { "type": "string", "description": "For tool steps: the arguments as a JSON object. Use {{N}} for the text of compose step N. Empty for compose." },
                        "sources": { "type": "array", "items": { "type": "string" }, "description": "For compose: files to read (exact paths). Empty for tool steps." },
                        "instruction": { "type": "string", "description": "For compose: what text to write. Empty for tool steps." },
                        "why": { "type": "string", "description": "A few plain words for the owner." }
                    }
                }
            },
            "reply": { "type": "string", "description": "What to tell the owner when it's done. May use {{N}}." },
            "question": { "type": "string", "description": "Only if the request is genuinely unclear (two people match, no file matches, it contradicts itself): one short question, and no steps. Otherwise empty." },
            "undo_last": { "type": "boolean", "description": "True only if the owner asks to undo or reverse what was just done. Then no steps." },
            "look": {
                "type": "array",
                "description": "Only when you must find things before you can act on them (\"move my invoices to Finance\", \"trash the old screenshots\"): up to 3 lookups; leave steps empty, and you'll be asked again with what they found. Otherwise empty.",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["tool", "args_json"],
                    "properties": {
                        "tool": { "type": "string", "enum": look_tools },
                        "args_json": { "type": "string", "description": "The arguments as a JSON object, e.g. {\"path\": \"\", \"query\": \"invoices\"}." }
                    }
                }
            },
            "manual": {
                "type": "array",
                "description": "Only when you can't or shouldn't do something (off limits, no tool, unsafe): up to 3 one-click actions that SHOW the owner where to do it themselves (open a folder or app, preview a file). Never anything that changes things. Otherwise empty.",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["label", "tool", "args_json"],
                    "properties": {
                        "label": { "type": "string", "description": "Button text, e.g. \"Open Taxes 2025\"." },
                        "tool": { "type": "string", "enum": MANUAL_TOOLS },
                        "args_json": { "type": "string" }
                    }
                }
            }
        }
    })
}

/// The only actions the model may suggest for the owner to click: they show things, they change nothing.
pub const MANUAL_TOOLS: [&str; 4] = ["files.show", "apps.open", "files.preview", "apps.focus"];

pub const PLANNER: &str = "You plan work on a personal computer called SIOS. You get a briefing (files, labels, people, tools) and a request. \
Return the WHOLE plan at once; the operating system checks it with the broker and runs it without asking you again. \
Rules: use exact paths from the briefing; never invent files or people; prefer few, big steps (files.organize for many moves, files.find to search); \
use a compose step whenever text must be written from file contents, then pass its text to later steps as {{N}}; \
to find things, use one files.find step with path \"\" (the whole home) unless the owner named a folder, and write the reply around its results ({{N}}, e.g. \"Here is what I found: {{1}}\"); never ask where something is before searching; to change files you must find first (\"move my invoices to Finance\"), put the search in look and leave steps empty: you'll get what it found and plan again with those exact paths; ask only when a change or a send needs one exact file and what you found can't tell which; \
files.organize and files.move create missing destination folders, so don't create folders separately; \
for anything that only shows something to the owner, use files.show, files.preview or apps.open; \
use exactly the argument fields listed for each tool; \
to duplicate a file use files.copy, never a compose step (that would rewrite its contents); \
when the owner says \"remember\", \"note that\" or \"from now on\", save it with memory.save in their words; \
use WHAT I REMEMBER and PEOPLE directly instead of asking again; \
if the request doesn't say WHAT to change or WHERE (\"fix my files\", \"sort everything\", \"clean up\" with no folder), ask a question instead of guessing, never reorganize many files on a guess; \
if something is off limits or you have no tool for it, return no steps, say why, and put a manual action that shows the owner where to do it (files.show or apps.open); \
if the request can't be done, return no steps and say why in reply. \
Use the conversation so far to resolve words like \"it\", \"that\" or \"also\". \
Look at SYSTEM RIGHT NOW before changing a setting. \
Write reply as the finished result, in past tense (\"Moved 3 files into Finance and Notes.\"), short and plain.";

/// Fill {{N}} with the text of compose step N (1-based), JSON-safe.
pub fn fill(s: &str, texts: &[(usize, String)], json_escape: bool) -> String {
    let mut out = s.to_string();
    for (n, t) in texts {
        let v = if json_escape { serde_json::to_string(t).map(|q| q[1..q.len() - 1].to_string()).unwrap_or_default() } else { t.clone() };
        out = out.replace(&format!("{{{{{n}}}}}"), &v);
    }
    out
}

pub fn args_of(step: &Step) -> Result<Value, String> {
    if step.args_json.trim().is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_str(&step.args_json).map_err(|e| format!("step arguments aren't valid JSON: {e}"))
}

/// Path fields must be written in the plan itself. A path can't come from
/// generated text ({{N}}), which an untrusted file could steer.
pub fn placeholder_paths(step: &Step) -> Option<String> {
    let a = args_of(step).ok()?;
    let mut fields: Vec<String> = ["path", "from", "to", "attach"].iter().filter_map(|k| a.get(*k).and_then(|v| v.as_str()).map(String::from)).collect();
    for m in a.get("moves").and_then(|v| v.as_array()).into_iter().flatten() {
        fields.extend(["from", "to"].iter().filter_map(|k| m.get(*k).and_then(|v| v.as_str()).map(String::from)));
    }
    fields.into_iter().find(|f| f.contains("{{")).map(|f| format!("the path \"{f}\" comes from generated text; write paths out exactly"))
}

/// The least the plan needs: its tools, and the exact paths (or the folders new files go in).
pub fn pass_for(plan: &Plan, exists: impl Fn(&str) -> Option<bool>) -> (Vec<String>, Vec<String>) {
    let mut tools: BTreeSet<String> = BTreeSet::new();
    let mut paths: BTreeSet<String> = BTreeSet::new();
    let mut add_path = |p: &str| {
        let p = p.trim().trim_start_matches("./").trim_end_matches('/').to_string();
        match exists(&p) {
            // an existing file or folder: exactly that
            Some(_) => {
                paths.insert(p);
            }
            // something new: the folder it goes in, or exactly itself at the top of the home
            // (never the whole home just because a new file has no folder)
            None => {
                paths.insert(p.rsplit_once('/').map(|(a, _)| a.to_string()).unwrap_or(p));
            }
        }
    };
    for s in &plan.steps {
        if s.kind == "compose" {
            tools.insert("files.read".into());
            for src in &s.sources {
                add_path(src);
            }
            continue;
        }
        tools.insert(s.tool.clone());
        let Ok(a) = args_of(s) else { continue };
        for k in ["path", "from", "to", "attach"] {
            if let Some(p) = a.get(k).and_then(|v| v.as_str()) {
                add_path(p);
            }
        }
        for m in a.get("moves").and_then(|v| v.as_array()).into_iter().flatten() {
            for k in ["from", "to"] {
                if let Some(p) = m.get(k).and_then(|v| v.as_str()) {
                    add_path(p);
                }
            }
        }
    }
    tools.remove("");
    (tools.into_iter().collect(), paths.into_iter().collect())
}

#[cfg(test)]
mod tests {
    /// The prompts the training data uses are the ones SIOS runs (llm/prompts/). Skipped
    /// where the llm folder isn't present (the image build compiles brain-d alone).
    #[test]
    fn the_training_prompts_match_the_code() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../llm/prompts");
        if !dir.is_dir() {
            return;
        }
        let file = |n: &str| std::fs::read_to_string(dir.join(n)).unwrap().trim_end_matches('\n').to_string();
        assert_eq!(file("planner-v1.txt"), PLANNER);
        assert_eq!(file("compose-v1.txt"), crate::goal::COMPOSE);
        assert_eq!(file("pattern-v1.txt"), crate::memory::PATTERN);
        assert_eq!(file("answer-from-memory-v1.txt"), crate::memory::ANSWER);
        assert_eq!(file("mcp-door-v1.txt"), crate::mcp::INSTRUCTIONS);
        assert_eq!(file("mcp-door-paired-v1.txt"), crate::mcp::TYPED);
        // the sample briefing lists exactly the planner's tools
        let seed = file("briefing-seed-v1.txt");
        let tools: Vec<String> = crate::briefing::TOOLS.iter().map(|(n, d)| format!("  {n}: {d}")).collect();
        assert!(seed.contains(&format!("TOOLS\n{}\n\nRULES", tools.join("\n"))), "briefing-seed-v1.txt's TOOLS block differs from briefing::TOOLS");
    }

    use super::*;

    fn step(tool: &str, args: &str) -> Step {
        Step { kind: "tool".into(), tool: tool.into(), args_json: args.into(), sources: vec![], instruction: String::new(), why: String::new() }
    }

    #[test]
    fn pass_is_the_least_the_plan_needs() {
        let plan = Plan { look: vec![],
            question: String::new(),
            undo_last: false,
            manual: vec![],
            understanding: String::new(),
            steps: vec![
                Step { kind: "compose".into(), tool: String::new(), args_json: String::new(), sources: vec!["Downloads/notes.txt".into()], instruction: "sum".into(), why: String::new() },
                step("files.write", r#"{"path":"Projects/packet/summary.md","text":"{{1}}"}"#),
                step("files.organize", r#"{"moves":[{"from":"Downloads/a.csv","to":"Downloads/Finance/a.csv"}]}"#),
            ],
            reply: String::new(),
        };
        let existing = ["Downloads/notes.txt", "Downloads/a.csv", "Projects/packet"];
        let (tools, paths) = pass_for(&plan, |p| existing.contains(&p).then_some(true));
        assert_eq!(tools, vec!["files.organize", "files.read", "files.write"]);
        assert_eq!(paths, vec!["Downloads/Finance", "Downloads/a.csv", "Downloads/notes.txt", "Projects/packet"]);
    }

    #[test]
    fn new_top_level_files_and_generated_paths() {
        let plan = Plan { look: vec![], question: String::new(), undo_last: false, manual: vec![], understanding: String::new(), reply: String::new(), steps: vec![step("files.write", r#"{"path":"summary.md","text":"x"}"#)] };
        let (_, paths) = pass_for(&plan, |_| None);
        assert_eq!(paths, vec!["summary.md"], "not the whole home");
        assert!(placeholder_paths(&step("files.write", r#"{"path":"Projects/{{1}}","text":"x"}"#)).is_some());
        assert!(placeholder_paths(&step("files.organize", r#"{"moves":[{"from":"a","to":"{{2}}"}]}"#)).is_some());
        assert!(placeholder_paths(&step("files.write", r#"{"path":"Projects/a.md","text":"{{1}}"}"#)).is_none());
    }

    #[test]
    fn compose_text_fills_in_safely() {
        let t = vec![(1, "line \"one\"\nline two".to_string())];
        let a = fill(r#"{"body":"{{1}}"}"#, &t, true);
        let v: Value = serde_json::from_str(&a).unwrap();
        assert_eq!(v["body"], "line \"one\"\nline two");
    }
}

#[cfg(test)]
mod look_tests {
    use super::*;

    #[test]
    fn look_runs_only_finding_and_listing_three_at_most() {
        let l = |t: &str| Look { tool: t.into(), args_json: "{}".into() };
        let looks = vec![l("files.read"), l("mail.send"), l("files.find"), l("files.list"), l("files.find"), l("files.find")];
        let ok = look_calls(&looks, &[]);
        assert_eq!(ok.len(), 3);
        assert!(ok.iter().all(|x| x.tool == "files.find" || x.tool == "files.list"));
        // a connector's read tool may be looked up only when it's installed for this AI
        let gh = vec![l("github.prs")];
        assert!(look_calls(&gh, &[]).is_empty());
        assert_eq!(look_calls(&gh, &["github.prs".to_string()]).len(), 1);
    }
}
