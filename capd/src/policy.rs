//! The broker's decision: allow, ask, or block. A pure function of the facts,
//! so every decision can be replayed and explained. Checks run in order; the
//! first failure blocks, any "ask" asks, otherwise the call is allowed.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Res {
    Pass,
    Ask,
    Fail,
    Skip,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Check {
    pub id: String,
    pub result: Res,
    pub detail: String,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Decision {
    Allow,
    Ask,
    Block,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Read,
    Reversible,
    Irreversible,
}

/// Everything the broker needs to know about one call. Gathered by the state
/// layer; the decision itself never touches disk or the network.
pub struct Facts<'a> {
    /// Signature, expiry and revocation already resolved into one result.
    pub token: Result<(), String>,
    pub principal: &'a str,
    pub paused: bool,
    /// What the requester's roles say (iam.rs): pass, ask, or fail with why.
    pub iam: (Res, String),
    pub tool: &'a str,
    /// None if no such tool exists.
    pub level: Option<Level>,
    pub egress: bool,
    pub cap_tools: &'a [String],
    pub cap_paths: &'a [String],
    pub no_egress: bool,
    /// Every path the call touches (normalized), or the reason one was refused.
    pub targets: Result<Vec<String>, String>,
    /// First blocked place among the targets, if any.
    pub blocked_place: Option<String>,
    pub uses_left: Option<u32>,
    pub budget_left: Option<u32>,
    /// The goal has read untrusted content.
    pub tainted: bool,
    /// Labeled data the goal has read (or is attaching), with where it came from.
    pub carrying: Vec<(String, String)>,
}

pub const FLOW_LABELS: [&str; 2] = ["Sensitive", "Finance"];

pub fn evaluate(f: &Facts) -> (Decision, Vec<Check>, String) {
    let mut checks: Vec<Check> = Vec::new();
    macro_rules! add {
        ($id:expr, $res:expr, $detail:expr) => {
            checks.push(Check { id: $id.into(), result: $res, detail: $detail })
        };
    }
    macro_rules! fail {
        ($id:expr, $detail:expr) => {{
            let d: String = $detail;
            add!($id, Res::Fail, d.clone());
            return (Decision::Block, checks, d);
        }};
    }

    // 1. the token is genuine, current and not revoked
    match &f.token {
        Ok(()) => add!("token", Res::Pass, "Signed by capd, not expired, not revoked.".into()),
        Err(e) => fail!("token", e.clone()),
    };
    // 2. the requester isn't paused
    if f.paused {
        fail!("principal", format!("{} is paused by the owner.", f.principal));
    }
    add!("principal", Res::Pass, format!("{} is active.", f.principal));
    // 2b. its roles: an explicit deny wins, and nothing that fits means no
    let mut asking: Vec<String> = Vec::new();
    match &f.iam {
        (Res::Fail, why) => fail!("iam", why.clone()),
        (Res::Ask, why) => {
            add!("iam", Res::Ask, why.clone());
            asking.push("its role asks first".into());
        }
        (_, why) => add!("iam", Res::Pass, why.clone()),
    }
    // 3. the tool exists
    let Some(level) = f.level else { fail!("tool", format!("{} isn't a real tool.", f.tool)) };
    // 4. the capability covers this tool
    if !f.cap_tools.iter().any(|t| t == f.tool) {
        fail!("grant", format!("This capability doesn't include {}.", f.tool));
    }
    add!("grant", Res::Pass, format!("The capability includes {}.", f.tool));
    // 5. paths are inside the sandbox and the slice
    let targets = match &f.targets {
        Ok(t) => t,
        Err(e) => fail!("slice", e.clone()),
    };
    if let Some(p) = &f.blocked_place {
        fail!("place", format!("{p} is blocked for every AI."));
    }
    if let Some(t) = targets.iter().find(|t| !f.cap_paths.iter().any(|p| crate::token::within(t, p))) {
        let had = if f.cap_paths.iter().any(|p| p.is_empty()) { "everything".to_string() } else { f.cap_paths.join(", ") };
        fail!("slice", format!("{} is outside what it was handed ({had}). Use a path inside one of those.", if t.is_empty() { "the whole sandbox" } else { t }));
    }
    add!("slice", Res::Pass, if targets.is_empty() { "No files involved.".into() } else { "Inside what it was handed.".into() });
    // 6. use count and budget
    if f.uses_left == Some(0) {
        fail!("uses", "This capability has no uses left.".into());
    }
    add!("uses", Res::Pass, f.uses_left.map(|u| format!("{u} uses left.")).unwrap_or("No use limit.".into()));
    if f.budget_left == Some(0) {
        fail!("budget", "The goal has spent its whole budget.".into());
    }
    add!("budget", Res::Pass, f.budget_left.map(|b| format!("{b} actions left in the goal's budget.")).unwrap_or("No budget set.".into()));
    // 7. sending things out
    if f.egress {
        if f.no_egress {
            fail!("egress", "This capability may not send anything off the computer.".into());
        }
        if f.tainted {
            add!("taint", Res::Ask, "The goal read untrusted content, and this sends data out.".into());
            asking.push("it read untrusted content".into());
        } else {
            add!("taint", Res::Pass, "No untrusted content read.".into());
        }
        let flagged: Vec<&(String, String)> = f.carrying.iter().filter(|(_, l)| FLOW_LABELS.contains(&l.as_str())).collect();
        if flagged.is_empty() {
            add!("flow", Res::Pass, "Nothing labeled Sensitive or Finance is leaving.".into());
        } else {
            let list: Vec<String> = flagged.iter().map(|(p, l)| format!("{p} ({l})")).collect();
            add!("flow", Res::Ask, format!("It carries data from {}.", list.join(", ")));
            asking.push("it carries labeled data".into());
        }
    } else {
        add!("taint", Res::Skip, "Nothing leaves the computer.".into());
        add!("flow", Res::Skip, "Nothing leaves the computer.".into());
    }
    // 8. the action's own risk
    match level {
        Level::Irreversible => {
            add!("level", Res::Ask, "Can't be undone, so it always asks.".into());
            asking.push("it can't be undone".into());
        }
        Level::Reversible => {
            add!("level", Res::Pass, "Can be undone; the capability covers it.".into());
        }
        Level::Read => {
            add!("level", Res::Pass, "Only reads.".into());
        }
    }
    if asking.is_empty() {
        (Decision::Allow, checks, "Allowed.".into())
    } else {
        (Decision::Ask, checks, format!("Needs the owner's OK: {}.", asking.join(", ")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn facts<'a>(tools: &'a [String], paths: &'a [String]) -> Facts<'a> {
        Facts {
            token: Ok(()),
            principal: "openai-agent",
            paused: false,
            iam: (Res::Pass, "ok".into()),
            tool: "fs.read",
            level: Some(Level::Read),
            egress: false,
            cap_tools: tools,
            cap_paths: paths,
            no_egress: true,
            targets: Ok(vec!["Projects/a.md".into()]),
            blocked_place: None,
            uses_left: Some(3),
            budget_left: Some(3),
            tainted: false,
            carrying: vec![],
        }
    }

    #[test]
    fn plain_read_is_allowed() {
        let (t, p) = (vec!["fs.read".to_string()], vec!["Projects".to_string()]);
        assert_eq!(evaluate(&facts(&t, &p)).0, Decision::Allow);
    }

    #[test]
    fn outside_the_slice_is_blocked() {
        let (t, p) = (vec!["fs.read".to_string()], vec!["Projects".to_string()]);
        let mut f = facts(&t, &p);
        f.targets = Ok(vec!["Documents/taxes.pdf".into()]);
        let (d, checks, _) = evaluate(&f);
        assert_eq!(d, Decision::Block);
        assert_eq!(checks.last().unwrap().id, "slice");
    }

    #[test]
    fn tool_not_granted_is_blocked() {
        let (t, p) = (vec!["fs.read".to_string()], vec!["".to_string()]);
        let mut f = facts(&t, &p);
        f.tool = "mail.send";
        f.level = Some(Level::Irreversible);
        assert_eq!(evaluate(&f).0, Decision::Block);
    }

    #[test]
    fn send_with_no_egress_is_blocked_and_otherwise_asks_with_reasons() {
        let (t, p) = (vec!["mail.send".to_string()], vec!["".to_string()]);
        let mut f = facts(&t, &p);
        f.tool = "mail.send";
        f.level = Some(Level::Irreversible);
        f.egress = true;
        assert_eq!(evaluate(&f).0, Decision::Block);
        f.no_egress = false;
        f.tainted = true;
        f.carrying = vec![("Downloads/budget.csv".into(), "Finance".into())];
        let (d, checks, why) = evaluate(&f);
        assert_eq!(d, Decision::Ask);
        assert!(why.contains("untrusted") && why.contains("labeled") && why.contains("undone"));
        assert!(checks.iter().any(|c| c.id == "flow" && c.result == Res::Ask));
    }

    #[test]
    fn spent_budget_and_uses_block() {
        let (t, p) = (vec!["fs.read".to_string()], vec!["".to_string()]);
        let mut f = facts(&t, &p);
        f.uses_left = Some(0);
        assert_eq!(evaluate(&f).0, Decision::Block);
        f.uses_left = Some(1);
        f.budget_left = Some(0);
        assert_eq!(evaluate(&f).0, Decision::Block);
    }
}
