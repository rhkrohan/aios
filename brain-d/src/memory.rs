//! brain-d's side of memory (the "readahead"): before planning, ask capd for
//! the few memories this requester may see, and put them in the briefing. The
//! privacy setting decides how much of that an online model gets:
//!   0  nothing personal: no memories, no people
//!   1  only what the task needs (default): names and emails become
//!      placeholders like [PERSON_1]; brain-d swaps the real ones back in
//!      before anything runs on this computer
//!   2  full context (still never Sensitive: capd holds those back)

use serde_json::json;

use crate::capd::Capd;

/// Swaps real names and emails for placeholders on the way to the model, and back on the way out.
#[derive(Default, Clone)]
pub struct Redactor {
    pairs: Vec<(String, String)>, // (placeholder, real)
}

impl Redactor {
    fn add(&mut self, kind: &str, real: &str) -> String {
        if real.trim().is_empty() {
            return String::new();
        }
        if let Some((p, _)) = self.pairs.iter().find(|(_, r)| r == real) {
            return p.clone();
        }
        let n = self.pairs.iter().filter(|(p, _)| p.starts_with(&format!("[{kind}_"))).count() + 1;
        let p = format!("[{kind}_{n}]");
        self.pairs.push((p.clone(), real.to_string()));
        p
    }

    /// Real to placeholders (longest first, so "Sara Okafor" wins over "Sara").
    pub fn hide(&self, text: &str) -> String {
        let mut pairs = self.pairs.clone();
        pairs.sort_by_key(|(_, r)| std::cmp::Reverse(r.len()));
        let mut out = text.to_string();
        for (p, r) in pairs {
            out = out.replace(&r, &p);
        }
        out
    }

    /// Placeholders back to the real thing, before anything runs here.
    pub fn restore(&self, text: &str) -> String {
        let mut out = text.to_string();
        for (p, r) in &self.pairs {
            out = out.replace(p, r);
        }
        out
    }

    pub fn active(&self) -> bool {
        !self.pairs.is_empty()
    }
}

pub struct Recall {
    /// The briefing sections: WHAT I REMEMBER and PEOPLE.
    pub text: String,
    pub ids: Vec<String>,
    pub shown: Vec<String>,
    pub held_back: u64,
    pub redactor: Redactor,
}

/// `own`: this request is the owner's (their own ask, or their watcher), so every group is visible.
pub fn recall(capd: &Capd, request: &str, principal: &str, own: bool, privacy: u64) -> Recall {
    let mut r = Recall { text: String::new(), ids: vec![], shown: vec![], held_back: 0, redactor: Redactor::default() };
    if privacy == 0 {
        r.text = "\n\nWHAT I REMEMBER\n  (hidden: the owner's privacy setting is \"nothing personal\")".into();
        return r;
    }
    let Ok(b) = capd.call("memory.brief", json!({ "request": request, "principal": principal, "own": own, "limit": 12 })) else { return r };
    r.held_back = b["held_back_sensitive"].as_u64().unwrap_or(0);
    let redact = privacy == 1;
    // people first, so their names get placeholders everywhere else too
    let mut people_lines = Vec::new();
    // a first name two people share stays visible, or "Sara" would silently become one of them
    let firsts: Vec<String> = b["people"].as_array().into_iter().flatten().filter_map(|p| p["person"]["name"].as_str()?.split_whitespace().next().map(String::from)).collect();
    let shared = |f: &str| firsts.iter().filter(|x| x.as_str() == f).count() > 1;
    for p in b["people"].as_array().into_iter().flatten() {
        let (name, email, role) = (p["person"]["name"].as_str().unwrap_or(""), p["person"]["email"].as_str().unwrap_or(""), p["person"]["role"].as_str().unwrap_or(""));
        if name.is_empty() {
            continue;
        }
        let (n, e) = if redact { (r.redactor.add("PERSON", name), r.redactor.add("EMAIL", email)) } else { (name.to_string(), email.to_string()) };
        // a first name on its own also maps to the person, unless two people share it
        let mut note = String::new();
        if redact {
            if let Some(first) = name.split_whitespace().next().filter(|f| *f != name) {
                if shared(first) {
                    note = format!(" (first name {first}; more than one person has it)");
                } else {
                    r.redactor.pairs.push((n.clone(), first.to_string()));
                }
            }
        }
        people_lines.push(format!("  {n} <{e}>{}{note}", if role.is_empty() { String::new() } else { format!(", {role}") }));
    }
    let mut lines = Vec::new();
    for m in b["items"].as_array().into_iter().flatten() {
        let text = m["text"].as_str().unwrap_or("");
        r.ids.push(m["id"].as_str().unwrap_or("").to_string());
        r.shown.push(text.to_string());
        let t = if redact {
            let hidden = r.redactor.hide(text);
            redact_emails(&mut r.redactor, &hidden)
        } else {
            text.to_string()
        };
        lines.push(format!("  [{}] ({}, {}) {t}", m["id"].as_str().unwrap_or(""), m["kind"].as_str().unwrap_or("fact"), m["group"].as_str().unwrap_or("")));
    }
    if r.held_back > 0 {
        lines.push(format!("  ({} sensitive memor{} held back: they never go to an online model)", r.held_back, if r.held_back == 1 { "y" } else { "ies" }));
    }
    r.text = format!(
        "\n\nWHAT I REMEMBER (relevant to this request; use it directly){}\n{}\n\nPEOPLE{}\n{}",
        if redact { ", names hidden as [PERSON_n]/[EMAIL_n]: use the placeholders exactly; SIOS fills in the real ones" } else { "" },
        if lines.is_empty() { "  (nothing relevant)".to_string() } else { lines.join("\n") },
        if redact { " (names hidden as placeholders)" } else { "" },
        if people_lines.is_empty() { "  (none known)".to_string() } else { people_lines.join("\n") },
    );
    r
}

/// Emails not already known as a person's also become placeholders.
fn redact_emails(red: &mut Redactor, text: &str) -> String {
    let mut out = text.to_string();
    for w in text.split(|c: char| c.is_whitespace() || c == ',' || c == '<' || c == '>' || c == '(' || c == ')') {
        if w.contains('@') && w.contains('.') && !w.starts_with('[') {
            let p = red.add("EMAIL", w.trim_end_matches('.'));
            out = out.replace(w.trim_end_matches('.'), &p);
        }
    }
    out
}

/// After a goal: write what happened as an episode (the OS does this, not the model).
pub fn episode(capd: &Capd, goal: &str, understanding: &str, reply: &str, by: &str, recalled: &[String]) {
    let day = {
        let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        format!("day {}", secs / 86400)
    };
    let text = format!("{day}: {understanding} Result: {reply}");
    let _ = capd.call("memory.episode", json!({ "text": text.chars().take(400).collect::<String>(), "goal": goal, "by": by, "links": recalled }));
}

/// Every few episodes, ask the model whether a stable preference shows up.
/// It only ever becomes a suggestion: nothing is remembered until the owner says yes.
pub fn consolidate(capd: &Capd, model: &crate::model::Model) {
    let Ok(eps) = capd.call("memory.episodes", json!({ "n": 8 })) else { return };
    let eps: Vec<String> = eps.as_array().into_iter().flatten().filter_map(|e| e["text"].as_str().map(String::from)).collect();
    if let Some(v) = find_pattern(model, &eps) {
        let _ = capd.call("memory.suggest", json!({ "text": v["text"], "kind": "preference", "group": v["group"], "why": v["why"] }));
    }
}

/// The model's half of consolidation: one stable preference in recent goals, or nothing.
pub fn find_pattern(model: &crate::model::Model, eps: &[String]) -> Option<serde_json::Value> {
    if eps.len() < 3 {
        return None;
    }
    let schema = json!({
        "type": "object", "additionalProperties": false,
        "required": ["found", "text", "group", "why"],
        "properties": {
            "found": { "type": "boolean" },
            "text": { "type": "string", "description": "The preference as one plain sentence about the owner, e.g. \"Rohan keeps invoices in Documents/Finance\"." },
            "group": { "type": "string", "enum": ["Habits", "Work", "Personal", "Finance", "People"] },
            "why": { "type": "string", "description": "Which past goals show it, in a few words." }
        }
    });
    let v = model
        .structured(
            "You look at what an assistant did for its owner recently and decide whether ONE stable preference clearly shows up at least twice (where things go, how they like things done). Never anything about passwords, health or money amounts. If nothing is clear, found=false.",
            &format!("RECENT GOALS (oldest first)\n{}", eps.join("\n")),
            "pattern",
            schema,
        )
        .ok()?;
    (v["found"].as_bool() == Some(true)).then_some(v)
}

/// For the memory simulation: answer a question only from the memories a briefing would hold.
pub fn answer_from(model: &crate::model::Model, question: &str, memories: &[String]) -> Result<String, String> {
    model.text(
        "Answer the owner's question in a few words, using only these memories (most relevant first). If they disagree, say which one you went with.",
        &format!("WHAT I REMEMBER\n{}\n\nQUESTION: {question}", memories.join("\n")),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_go_out_hidden_and_come_back_real() {
        let mut r = Redactor::default();
        let p = r.add("PERSON", "Priya Shah");
        let e = r.add("EMAIL", "priya@ledger.example");
        r.pairs.push((p.clone(), "Priya".into()));
        let hidden = r.hide("Email Priya Shah at priya@ledger.example");
        assert_eq!(hidden, "Email [PERSON_1] at [EMAIL_1]");
        assert_eq!(r.restore(&format!(r#"{{"to":["{e}"],"body":"Hi {p}"}}"#)), r#"{"to":["priya@ledger.example"],"body":"Hi Priya Shah"}"#);
    }
}
