//! Who is on the other end of the socket (D32). On SIOS the kernel says which
//! process connected (SO_PEERCRED); capd then looks at that process's program,
//! which lives in the read-only image, and at the service unit it runs in:
//!
//!   /usr/bin/sios-approve, /usr/bin/sios-settings   the owner (their own windows)
//!   /usr/bin/brain-d in sios-brain.service          the service (SIOS's brain)
//!   anything else run by the same user             an agent: tokens only
//!
//! Turned on by SIOS_IDENTITY=peer (set in the systemd unit). Then the secret
//! files are ignored, so an AI that can read them still can't approve itself.
//! On the Mac (the preview) the secret files stay the proof.
//!
//! Limit: a process of the same user can open the socket, keep a copy of the
//! connection, and then turn a child into one of these programs (exec), or move
//! it into the brain's unit first. The kernel then names the trusted program
//! while the copy writes the requests. So on its own this can't prove the OWNER:
//! until the owner has an anchor an AI can't fake (M5: a password prompt through
//! polkit, or the broker under its own account), no caller is the owner by
//! program (OWNER_BY_PROGRAM). The service check is repeated on every request,
//! which narrows the trick but doesn't close it (12-risks).

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Who {
    Owner,
    /// One of SIOS's own window apps (Approve, Settings), known by its program.
    /// Not proof of the owner (see the limit above), so it may only look at what
    /// waits for the owner and say no; anything else still needs the password.
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
    /// Its process id and when it started (clock ticks since boot): together they
    /// name this one process, even after the pid is reused (S1, D55).
    pub pid: u32,
    pub start: u64,
}

/// When a process started, from field 22 of /proc/<pid>/stat (after the name,
/// which can contain spaces and brackets, so count from the last ')').
pub fn start_time(pid: u32) -> Option<u64> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    let rest = &stat[stat.rfind(')')? + 1..];
    rest.split_whitespace().nth(19)?.parse().ok()
}

pub const OWNER_APPS: [&str; 2] = ["/usr/bin/sios-approve", "/usr/bin/sios-settings"];
/// Off until the owner has an anchor an AI can't fake (see the limit above).
pub const OWNER_BY_PROGRAM: bool = false;
pub const SERVICE: (&str, &str) = ("/usr/bin/brain-d", "/sios-brain.service");

/// Plasma sets `QT_WAYLAND_RECONNECT=1` for every app it launches (seen on the
/// image 2026-10-14); it only lets the app survive a compositor restart.
const HARMLESS: [&[u8]; 1] = [b"QT_WAYLAND_RECONNECT=1"];

/// Variables that make a program load code it wasn't shipped with: whole families,
/// so a new loader variable in a later release is caught too.
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
    // a program that hides its memory (PR_SET_DUMPABLE 0) hides its path and environment
    // too: it reads as no program at all, so SIOS's own windows must not do that
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

    fn p(exe: &str, cgroup: &str) -> Proc {
        Proc { same_user: true, exe: exe.into(), cgroup: cgroup.into(), traced: false, injected: false, pid: 0, start: 0 }
    }

    #[test]
    fn programs_in_the_image_are_who_they_say() {
        let user = "0::/user.slice/user-1000.slice/user@1000.service/app.slice/app-org.sios.settings-2.scope";
        // the owner is never proven by program alone (see the limit at the top)
        assert_eq!(classify(&p("/usr/bin/sios-settings", user), &OWNER_APPS, Some(SERVICE)), if OWNER_BY_PROGRAM { Who::Owner } else { Who::OwnerApp });
        let brain = "0::/user.slice/user-1000.slice/user@1000.service/app.slice/sios-brain.service";
        assert_eq!(classify(&p("/usr/bin/brain-d", brain), &OWNER_APPS, Some(SERVICE)), Who::Service);
    }

    #[test]
    fn copies_tricks_and_strangers_are_agents() {
        let shell = "0::/user.slice/user-1000.slice/user@1000.service/app.slice/app-org.kde.konsole-1.scope";
        // brain-d started by hand (an outside AI's MCP door, or anyone) isn't the service
        assert_eq!(classify(&p("/usr/bin/brain-d", shell), &OWNER_APPS, Some(SERVICE)), Who::Agent);
        // a copy of an owner app outside the image
        assert_eq!(classify(&p("/home/rohan/.local/bin/sios-settings", shell), &OWNER_APPS, Some(SERVICE)), Who::Agent);
        assert_eq!(classify(&p("/usr/bin/capd", shell), &OWNER_APPS, Some(SERVICE)), Who::Agent);
        // the right program, but driven by a debugger, loaded with outside code, or another user
        assert_eq!(classify(&Proc { traced: true, ..p("/usr/bin/sios-settings", shell) }, &OWNER_APPS, Some(SERVICE)), Who::Agent);
        assert_eq!(classify(&Proc { injected: true, ..p("/usr/bin/sios-settings", shell) }, &OWNER_APPS, Some(SERVICE)), Who::Agent);
        assert_eq!(classify(&Proc { same_user: false, ..p("/usr/bin/sios-settings", shell) }, &OWNER_APPS, Some(SERVICE)), Who::Agent);
        // loader variables, whole families
        assert!(injecting(b"LD_PRELOAD=/tmp/x.so") && injecting(b"LD_AUDIT=x") && injecting(b"QT_QPA_PLATFORM_PLUGIN_PATH=/tmp") && injecting(b"QML_XHR_ALLOW_FILE_READ=1") && injecting(b"GCONV_PATH=/tmp"));
        // what Plasma gives every app is fine, but only with that exact value
        assert!(!injecting(b"QT_WAYLAND_RECONNECT=1") && injecting(b"QT_WAYLAND_RECONNECT=/tmp/x.so"));
        assert!(!injecting(b"HOME=/home/rohan") && !injecting(b"LANG=en_US.UTF-8") && !injecting(b"XDG_RUNTIME_DIR=/run/user/1000"));
        // nothing known (no kernel answer)
        assert_eq!(classify(&Proc::default(), &OWNER_APPS, Some(SERVICE)), Who::Agent);
    }
}
