//! Who is on the other end of brain.sock (D32), the same way capd asks
//! (capd/src/peer.rs, kept in step with it). The owner's shell is SIOS's own
//! apps in the read-only image; everyone else (outside AIs' MCP doors, scripts)
//! may start goals and read the briefing, never the owner's controls.
//!
//! Turned on by SIOS_IDENTITY=peer (set in the systemd unit); then brain.secret
//! proves nothing. On the Mac (the preview) brain.secret stays the proof.
//!
//! Limit (D31): this stops AIs and impersonating programs, not malware already
//! running as the owner, which could rebuild its own copy of the whole setup.

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Who {
    Owner,
    /// The owner's shell, known by its program: may start goals in the owner's name
    /// (each pass still needs the owner's password), not the owner's controls.
    OwnerApp,
    Service,
    Agent,
}

/// What capd learned about the connecting process.
#[derive(Debug, Default)]
pub struct Proc {
    /// Same user as capd.
    pub same_user: bool,
    /// The program's real path, from /proc/<pid>/exe.
    pub exe: String,
    /// /proc/<pid>/cgroup: which systemd unit or app scope it runs in.
    pub cgroup: String,
    /// Being debugged (TracerPid isn't 0): someone else could be driving it.
    pub traced: bool,
    /// Started with variables that load outside code into it (LD_PRELOAD...).
    pub injected: bool,
    /// Which process exactly (pid and start time), to ask capd whether it started it.
    pub pid: u32,
    pub start: u64,
}

/// When a process started (field 22 of /proc/<pid>/stat, counted after the name).
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub fn start_time(pid: u32) -> Option<u64> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    let rest = &stat[stat.rfind(')')? + 1..];
    rest.split_whitespace().nth(19)?.parse().ok()
}

/// The owner's shell on brain.sock: the Ask bar. Only it starts goals in the owner's name.
pub const OWNER_APPS: [&str; 1] = ["/usr/bin/sios-ask"];
/// SIOS's windows that may look at goals (never start them in the owner's name),
/// and only when capd confirms it started that exact process (security review 2026-10-15).
pub const VIEWER_APPS: [&str; 3] = ["/usr/bin/sios-settings", "/usr/bin/sios-agents", "/usr/bin/sios-memory"];
/// Off for the same reason as capd's (capd/src/peer.rs): a copied connection can pose as the shell.
pub const OWNER_BY_PROGRAM: bool = false;

/// Plasma sets `QT_WAYLAND_RECONNECT=1` for every app it launches (seen on the
/// image 2026-10-14); it only lets the app survive a compositor restart.
const HARMLESS: [&[u8]; 1] = [b"QT_WAYLAND_RECONNECT=1"];

/// Variables that make a program load code it wasn't shipped with (whole families).
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub(crate) fn injecting(var: &[u8]) -> bool {
    // settings the desktop gives every app it starts, which load nothing (exact value)
    if HARMLESS.contains(&var) {
        return false;
    }
    let name = var.split(|b| *b == b'=').next().unwrap_or_default();
    ["LD_", "QT_", "QML", "GCONV_PATH", "GIO_EXTRA_MODULES", "GTK_PATH", "PYTHONPATH", "KDE_FORK_SLAVES"].iter().any(|p| name.starts_with(p.as_bytes()))
}

pub fn enabled() -> bool {
    std::env::var("SIOS_IDENTITY").is_ok_and(|v| v == "peer")
}

pub fn classify(p: &Proc, owners: &[&str], service: Option<(&str, &str)>) -> Who {
    if !p.same_user || p.traced || p.injected {
        return Who::Agent;
    }
    if owners.contains(&p.exe.as_str()) {
        return if OWNER_BY_PROGRAM { Who::Owner } else { Who::OwnerApp };
    }
    if let Some((exe, unit)) = service {
        if p.exe == exe && p.cgroup.lines().any(|l| l.ends_with(unit)) {
            return Who::Service;
        }
    }
    Who::Agent
}

#[cfg(target_os = "linux")]
pub fn of(conn: &std::os::unix::net::UnixStream) -> Proc {
    use std::os::unix::io::AsRawFd;
    let mut cred = libc::ucred { pid: 0, uid: 0, gid: 0 };
    let mut len = std::mem::size_of::<libc::ucred>() as libc::socklen_t;
    // SAFETY: getsockopt fills `cred` (of the size we pass) for this socket's fd.
    let rc = unsafe { libc::getsockopt(conn.as_raw_fd(), libc::SOL_SOCKET, libc::SO_PEERCRED, &mut cred as *mut _ as *mut libc::c_void, &mut len) };
    if rc != 0 || cred.pid <= 0 {
        return Proc::default();
    }
    // SAFETY: getuid has no preconditions.
    let me = unsafe { libc::getuid() };
    let dir = format!("/proc/{}", cred.pid);
    let read = |f: &str| std::fs::read(format!("{dir}/{f}")).unwrap_or_default();
    let status = String::from_utf8_lossy(&read("status")).into_owned();
    let traced = status.lines().find_map(|l| l.strip_prefix("TracerPid:")).map(|v| v.trim() != "0").unwrap_or(true);
    // environ is unreadable for programs that hide their memory; then only the program path counts
    let injected = read("environ").split(|b| *b == 0).any(injecting);
    Proc {
        same_user: cred.uid == me,
        exe: std::fs::read_link(format!("{dir}/exe")).map(|p| p.to_string_lossy().into_owned()).unwrap_or_default(),
        cgroup: String::from_utf8_lossy(&read("cgroup")).into_owned(),
        traced,
        injected,
        pid: cred.pid as u32,
        start: start_time(cred.pid as u32).unwrap_or(0),
    }
}

#[cfg(not(target_os = "linux"))]
pub fn of(_conn: &std::os::unix::net::UnixStream) -> Proc {
    Proc::default() // no kernel answer here: everyone is an agent in peer mode
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(exe: &str) -> Proc {
        Proc { same_user: true, exe: exe.into(), cgroup: String::new(), traced: false, injected: false, pid: 0, start: 0 }
    }

    #[test]
    fn only_the_shell_is_the_owner() {
        assert_eq!(classify(&p("/usr/bin/sios-ask"), &OWNER_APPS, None), if OWNER_BY_PROGRAM { Who::Owner } else { Who::OwnerApp });
        assert_eq!(classify(&p("/usr/bin/brain-d"), &OWNER_APPS, None), Who::Agent, "an MCP door isn't the owner");
        assert_eq!(classify(&p("/usr/bin/python3"), &OWNER_APPS, None), Who::Agent);
        assert_eq!(classify(&Proc { traced: true, ..p("/usr/bin/sios-ask") }, &OWNER_APPS, None), Who::Agent);
        // SIOS's other windows may look, never start goals in the owner's name
        for w in VIEWER_APPS {
            assert_eq!(classify(&p(w), &OWNER_APPS, None), Who::Agent, "{w} isn't the shell");
        }
    }
}
