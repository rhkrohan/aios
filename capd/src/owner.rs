//! Proving an owner action really comes from the owner, on SIOS (D39).
//!
//! The kernel can't tell the owner's Settings window from an AI that copied a
//! connection (D32), but an AI can't type the owner's password. So before any
//! owner action capd asks polkit, the system's permission service, and KDE's own
//! dialog asks for the password. Every time: nothing is remembered, so an AI
//! can't ride on an earlier answer. One dialog at a time, and a pause after a
//! cancel, so an AI can't flood the screen.
//!
//! polkit lets only privileged callers add details to the dialog, so the kind of
//! change is told by which action is asked for (keys, which AI, anything else),
//! and the dialog says to confirm only what the owner just did themselves.

use std::sync::Mutex;
use std::time::{Duration, Instant};

/// polkit actions (system_files/usr/share/polkit-1/actions/org.sios.policy).
pub const KEYS: &str = "org.sios.owner.keys";
pub const AI: &str = "org.sios.owner.ai";
pub const OWNER: &str = "org.sios.owner";

static ONE_AT_A_TIME: Mutex<Option<Instant>> = Mutex::new(None);

pub fn action_for(method: &str) -> Option<&'static str> {
    if !crate::state::is_owner_method(method) {
        None
    } else if method == "model.set_key" || method == "model.remove_key" {
        Some(KEYS)
    } else if method.starts_with("model.") {
        Some(AI)
    } else {
        Some(OWNER)
    }
}

/// Ask polkit, with the dialog allowed. Ok(false): the owner cancelled or failed.
pub fn confirm(action: &str) -> Result<bool, String> {
    let mut gate = ONE_AT_A_TIME.lock().unwrap_or_else(|p| p.into_inner());
    if gate.is_some_and(|t| t.elapsed() < Duration::from_secs(5)) {
        return Ok(false); // just cancelled: don't put another dialog straight up
    }
    let pid = std::process::id().to_string();
    let o = crate::exec::run("/usr/bin/pkcheck", &["--action-id", action, "--process", &pid, "--allow-user-interaction"], None, Duration::from_secs(120))?;
    let ok = o.code == Some(0);
    *gate = if ok { None } else { Some(Instant::now()) };
    match o.code {
        Some(0) => Ok(true),
        Some(1..=3) | None => Ok(false),
        _ => Err(format!("polkit couldn't check this: {}", o.stderr.trim())),
    }
}
