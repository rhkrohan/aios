//! The security engine, part one (S1, docs/plan/17-security-engine.md).
//!
//! - Stop (D41): one switch any program may press, no password, that cuts every
//!   AI channel at once and stays on across restarts. Only the owner resumes.
//! - Approval sessions (D56): after one password, SIOS's own undoable requests
//!   are approved with a click until the screen locks, the computer sleeps, or
//!   Stop is pressed. A faked click can then only cause something undoable.
//! - SIOS's own windows (D55): the broker starts the approval window and
//!   Settings itself and trusts only those exact processes. No AI is ever their
//!   parent, so none can attach to them and drive them.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

// ------------------------------------------------------------------ Stop

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Stopped {
    pub at: u64,
    /// Who pressed it, in plain words ("the keyboard shortcut", "an AI app"...).
    pub by: String,
}

/// What has to survive a restart: whether AI is stopped.
#[derive(Serialize, Deserialize, Default)]
pub struct SecState {
    pub stopped: Option<Stopped>,
    #[serde(skip)]
    path: PathBuf,
}

impl SecState {
    /// A file that can't be read means stopped: fail closed (D40).
    pub fn load(dir: &Path) -> SecState {
        let path = dir.join("security.json");
        let mut s = match std::fs::read_to_string(&path) {
            Ok(t) => serde_json::from_str(&t).unwrap_or_else(|_| SecState { stopped: Some(Stopped { at: 0, by: "an unreadable security.json".into() }), path: PathBuf::new() }),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => SecState::default(),
            Err(_) => SecState { stopped: Some(Stopped { at: 0, by: "an unreadable security.json".into() }), path: PathBuf::new() },
        };
        s.path = path;
        s
    }

    pub fn save(&self) {
        use std::os::unix::fs::OpenOptionsExt;
        let tmp = self.path.with_extension("json.tmp");
        let ok = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&tmp)
            .and_then(|mut f| std::io::Write::write_all(&mut f, serde_json::to_string_pretty(self).unwrap_or_default().as_bytes()));
        if ok.is_ok() {
            let _ = std::fs::rename(&tmp, &self.path);
        }
    }
}

// ------------------------------------------------------- approval sessions

/// When the owner's current approval session began (None: closed).
static SESSION: Mutex<Option<u64>> = Mutex::new(None);
/// True while capd is watching for the screen locking and the computer sleeping.
/// Without that it can't end a session in time, so sessions never open.
static WATCHING: AtomicBool = AtomicBool::new(false);

pub fn session_open(now: u64) {
    if WATCHING.load(Ordering::SeqCst) {
        let mut s = SESSION.lock().unwrap_or_else(|p| p.into_inner());
        if s.is_none() {
            *s = Some(now);
            println!("approval session opened");
        }
    }
}

pub fn session_end(why: &str) {
    if SESSION.lock().unwrap_or_else(|p| p.into_inner()).take().is_some() {
        println!("approval session ended: {why}");
    }
}

pub fn session_is_open() -> bool {
    WATCHING.load(Ordering::SeqCst) && SESSION.lock().unwrap_or_else(|p| p.into_inner()).is_some()
}

/// Is this line from `gdbus monitor` the screen locking or the computer going to sleep?
pub fn ends_session(line: &str) -> bool {
    (line.contains("org.freedesktop.ScreenSaver.ActiveChanged") && line.contains("(true,)"))
        || (line.contains("org.freedesktop.login1.Manager.PrepareForSleep") && line.contains("(true,)"))
        || line.contains("org.freedesktop.login1.Session.Lock")
}

/// Watch the session bus (screen locker) and the system bus (sleep). If a watcher
/// stops, sessions end and stay closed: the owner types the password again.
pub fn watch_lock() {
    let watchers: [&[&str]; 2] = [
        &["monitor", "--session", "--dest", "org.freedesktop.ScreenSaver"],
        &["monitor", "--system", "--dest", "org.freedesktop.login1"],
    ];
    let alive = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    for args in watchers {
        let alive = alive.clone();
        std::thread::spawn(move || loop {
            let child = std::process::Command::new("/usr/bin/gdbus").args(args).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::null()).spawn();
            if let Ok(mut child) = child {
                if alive.fetch_add(1, Ordering::SeqCst) + 1 == 2 {
                    WATCHING.store(true, Ordering::SeqCst);
                }
                if let Some(out) = child.stdout.take() {
                    use std::io::BufRead;
                    for line in std::io::BufReader::new(out).lines().map_while(Result::ok) {
                        if ends_session(&line) {
                            session_end("the screen locked or the computer went to sleep");
                        }
                    }
                }
                let _ = child.wait();
                alive.fetch_sub(1, Ordering::SeqCst);
            }
            // a watcher is gone: no sessions until it's back
            WATCHING.store(false, Ordering::SeqCst);
            session_end("capd lost track of the screen lock");
            std::thread::sleep(Duration::from_secs(3));
        });
    }
}

// ------------------------------------------------------- SIOS's own windows

pub const WINDOWS: [(&str, &str); 5] = [
    ("approve", "/usr/bin/sios-approve"),
    ("settings", "/usr/bin/sios-settings"),
    ("memory", "/usr/bin/sios-memory"),
    ("agents", "/usr/bin/sios-agents"),
    // the Store's Connectors page talks to the broker (C3, D105, D108)
    ("store", "/usr/bin/sios-store"),
];

/// Windows capd started: pid -> (which window, start time).
static KIDS: Mutex<Option<HashMap<u32, (&'static str, u64)>>> = Mutex::new(None);
static LAST_OPEN: Mutex<Option<HashMap<&'static str, Instant>>> = Mutex::new(None);

/// Is this exact process (pid and start time) a window capd started?
pub fn is_window(pid: u32, start: u64) -> bool {
    pid != 0 && KIDS.lock().unwrap_or_else(|p| p.into_inner()).as_ref().and_then(|k| k.get(&pid)).is_some_and(|(_, s)| *s == start)
}

fn running(app: &str) -> bool {
    KIDS.lock().unwrap_or_else(|p| p.into_inner()).as_ref().is_some_and(|k| k.values().any(|(a, _)| *a == app))
}

/// Start one of SIOS's windows as capd's own child, or bring it forward if it's
/// open (on a page of Settings: "wifi", "brain"...). Anyone may ask: opening
/// SIOS's own window can't do harm. A few per second at most.
pub fn open_window(app: &str, page: &str) -> Result<Value, String> {
    let (name, path) = WINDOWS.iter().find(|(n, _)| *n == app).copied().ok_or("no such SIOS window")?;
    if page.len() > 20 || !page.chars().all(|c| c.is_ascii_lowercase()) {
        return Err("no such page".into());
    }
    if running(name) {
        raise(name, page);
        return Ok(json!({ "opened": name, "already": true }));
    }
    {
        let mut last = LAST_OPEN.lock().unwrap_or_else(|p| p.into_inner());
        let last = last.get_or_insert_with(HashMap::new);
        if last.get(name).is_some_and(|t| t.elapsed() < Duration::from_secs(1)) {
            return Ok(json!({ "opened": name, "already": true }));
        }
        last.insert(name, Instant::now());
    }
    // the desktop's own variables, without any that would load outside code
    let mut cmd = std::process::Command::new(path);
    cmd.env_clear();
    for (k, v) in std::env::vars_os() {
        let (k, v) = (k.to_string_lossy().into_owned(), v.to_string_lossy().into_owned());
        if k.starts_with("SIOS_") || crate::peer::injecting(format!("{k}={v}").as_bytes()) {
            continue;
        }
        cmd.env(k, v);
    }
    cmd.env("SIOS_WINDOW", "1").stdin(std::process::Stdio::null());
    if !page.is_empty() {
        cmd.args(["--page", page]);
    }
    let mut child = cmd.spawn().map_err(|e| format!("couldn't start {path}: {e}"))?;
    let pid = child.id();
    let start = crate::peer::start_time(pid).unwrap_or(0);
    KIDS.lock().unwrap_or_else(|p| p.into_inner()).get_or_insert_with(HashMap::new).insert(pid, (name, start));
    std::thread::spawn(move || {
        let _ = child.wait();
        if let Some(k) = KIDS.lock().unwrap_or_else(|p| p.into_inner()).as_mut() {
            k.remove(&pid);
        }
    });
    Ok(json!({ "opened": name }))
}

/// Something waits for the owner: open the approval window, or bring it forward.
pub fn wake_approval_window() {
    std::thread::spawn(|| {
        let _ = open_window("approve", "");
    });
}

/// Bring an open SIOS window forward over the session bus (it carries no data
/// except the Settings page name, already checked to be a plain word).
fn raise(name: &'static str, page: &str) {
    let page = page.to_string();
    std::thread::spawn(move || {
        // org.sios.<Name>1 at /<Name>, Show() for approvals, Show(page) for the others
        let cap = format!("{}{}", name[..1].to_uppercase(), &name[1..]);
        let (dest, path, method) = (format!("org.sios.{cap}1"), format!("/{cap}"), format!("org.sios.{cap}1.Show"));
        let mut args = vec!["call", "--session", "--dest", dest.as_str(), "--object-path", path.as_str(), "--method", method.as_str()];
        let quoted = format!("'{page}'");
        if name != "approve" {
            args.push(&quoted);
        }
        let _ = crate::exec::run("/usr/bin/gdbus", &args, None, Duration::from_secs(10));
    });
}

// ------------------------------------------------------- agents' sandboxes

/// Stop: every agent sandbox freezes where it is (the cgroup freezer).
pub fn freeze_agents() {
    let _ = crate::exec::run("/usr/bin/systemctl", &["--user", "freeze", "sios-agents.slice"], None, Duration::from_secs(5));
    // terminal commands an AI started just end (D89)
    let _ = crate::exec::run("/usr/bin/systemctl", &["--user", "stop", "sios-terminal.slice"], None, Duration::from_secs(10));
}

/// Resume after Stop: frozen agent runs end (they don't just carry on).
pub fn end_agents() {
    let _ = crate::exec::run("/usr/bin/systemctl", &["--user", "thaw", "sios-agents.slice"], None, Duration::from_secs(5));
    let _ = crate::exec::run("/usr/bin/systemctl", &["--user", "stop", "sios-agents.slice"], None, Duration::from_secs(10));
}

/// An agent's desk: a terminal following its live log, moved to the agent's own
/// desktop (made if missing). Never switches the owner's view.
pub fn show_on_desk(name: &str, run_file: &str) {
    if !run_file.chars().all(|c| c.is_ascii_alphanumeric() || "/._-".contains(c)) {
        return;
    }
    let title = format!("{name} at work");
    let Ok(child) = std::process::Command::new("/usr/bin/konsole")
        .args(["--hold", "--hide-menubar", "-p", &format!("tabtitle={title}"), "-e", "/usr/bin/capd", "agent-log", run_file])
        .stdin(std::process::Stdio::null())
        .spawn()
    else {
        return;
    };
    let pid = child.id();
    // the window shows up a moment later: place it once it does
    for _ in 0..20 {
        std::thread::sleep(Duration::from_millis(500));
        if let Ok(v) = crate::kwin::ask("desk", json!({ "name": name, "pid": pid, "show": false })) {
            if v["placed"].as_u64().unwrap_or(0) > 0 {
                break;
            }
        }
    }
    std::thread::spawn(move || {
        let mut child = child;
        let _ = child.wait();
    });
}

/// Is an agent's unit still running?
pub fn unit_active(unit: &str) -> bool {
    crate::exec::run("/usr/bin/systemctl", &["--user", "is-active", "--quiet", &format!("{unit}.service")], None, Duration::from_secs(5)).is_ok_and(|o| o.code == Some(0))
}

// ------------------------------------------------------- MCP doors

/// The MCP doors (brain-d mcp) that opened a session: pid and start time.
static DOORS: Mutex<Vec<(u32, u64)>> = Mutex::new(Vec::new());

pub fn add_door(pid: u32, start: u64) {
    if pid != 0 {
        DOORS.lock().unwrap_or_else(|p| p.into_inner()).push((pid, start));
    }
}

/// Stop: end every MCP door, but only the exact processes that opened a session
/// (a reused pid belongs to someone else).
pub fn kill_doors() -> usize {
    let doors: Vec<(u32, u64)> = std::mem::take(&mut *DOORS.lock().unwrap_or_else(|p| p.into_inner()));
    #[cfg_attr(not(target_os = "linux"), allow(unused_mut))]
    let mut n = 0;
    for (pid, start) in doors {
        if crate::peer::start_time(pid) == Some(start) {
            #[cfg(target_os = "linux")]
            // SAFETY: kill only sends a signal to the given pid.
            if unsafe { libc::kill(pid as i32, libc::SIGTERM) } == 0 {
                n += 1;
            }
        }
    }
    n
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lock_and_sleep_end_a_session() {
        assert!(ends_session("/ScreenSaver: org.freedesktop.ScreenSaver.ActiveChanged (true,)"));
        assert!(!ends_session("/ScreenSaver: org.freedesktop.ScreenSaver.ActiveChanged (false,)"));
        assert!(ends_session("/org/freedesktop/login1: org.freedesktop.login1.Manager.PrepareForSleep (true,)"));
        assert!(!ends_session("/org/freedesktop/login1: org.freedesktop.login1.Manager.PrepareForSleep (false,)"));
    }

    #[test]
    fn no_session_without_watching_the_lock() {
        WATCHING.store(false, Ordering::SeqCst);
        session_open(1);
        assert!(!session_is_open(), "a session that can't be ended on lock never opens");
    }

    #[test]
    fn stop_survives_a_restart_and_a_broken_file_means_stopped() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = SecState::load(dir.path());
        assert!(s.stopped.is_none());
        s.stopped = Some(Stopped { at: 5, by: "test".into() });
        s.save();
        assert_eq!(SecState::load(dir.path()).stopped.unwrap().by, "test");
        std::fs::write(dir.path().join("security.json"), "{ not json").unwrap();
        assert!(SecState::load(dir.path()).stopped.is_some(), "fail closed");
    }

    #[test]
    fn only_known_windows_open() {
        assert!(open_window("terminal", "").is_err());
        assert!(open_window("settings", "wifi; rm -rf ~").is_err(), "a page is a plain word");
        assert!(!is_window(0, 0));
    }
}
