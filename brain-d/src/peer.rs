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
}

/// The owner's shell on brain.sock: the Ask bar, Monitor and Settings.
pub const OWNER_APPS: [&str; 3] = ["/usr/bin/sios-ask", "/usr/bin/sios-monitor", "/usr/bin/sios-settings"];

/// Variables that make a program load code it wasn't shipped with.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub(crate) const INJECTING: [&str; 6] = ["LD_PRELOAD", "LD_LIBRARY_PATH", "LD_AUDIT", "QT_PLUGIN_PATH", "QML2_IMPORT_PATH", "QML_IMPORT_PATH"];

pub fn enabled() -> bool {
    std::env::var("SIOS_IDENTITY").is_ok_and(|v| v == "peer")
}

pub fn classify(p: &Proc, owners: &[&str], service: Option<(&str, &str)>) -> Who {
    if !p.same_user || p.traced || p.injected {
        return Who::Agent;
    }
    if owners.contains(&p.exe.as_str()) {
        return Who::Owner;
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
    let injected = read("environ").split(|b| *b == 0).any(|kv| INJECTING.iter().any(|k| kv.starts_with(format!("{k}=").as_bytes())));
    Proc {
        same_user: cred.uid == me,
        exe: std::fs::read_link(format!("{dir}/exe")).map(|p| p.to_string_lossy().into_owned()).unwrap_or_default(),
        cgroup: String::from_utf8_lossy(&read("cgroup")).into_owned(),
        traced,
        injected,
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
        Proc { same_user: true, exe: exe.into(), cgroup: String::new(), traced: false, injected: false }
    }

    #[test]
    fn only_the_shell_is_the_owner() {
        assert_eq!(classify(&p("/usr/bin/sios-ask"), &OWNER_APPS, None), Who::Owner);
        assert_eq!(classify(&p("/usr/bin/brain-d"), &OWNER_APPS, None), Who::Agent, "an MCP door isn't the owner");
        assert_eq!(classify(&p("/usr/bin/python3"), &OWNER_APPS, None), Who::Agent);
        assert_eq!(classify(&Proc { traced: true, ..p("/usr/bin/sios-ask") }, &OWNER_APPS, None), Who::Agent);
    }
}
