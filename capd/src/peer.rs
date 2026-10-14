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

pub const OWNER_APPS: [&str; 2] = ["/usr/bin/sios-approve", "/usr/bin/sios-settings"];
pub const SERVICE: (&str, &str) = ("/usr/bin/brain-d", "/sios-brain.service");

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

    fn p(exe: &str, cgroup: &str) -> Proc {
        Proc { same_user: true, exe: exe.into(), cgroup: cgroup.into(), traced: false, injected: false }
    }

    #[test]
    fn programs_in_the_image_are_who_they_say() {
        let user = "0::/user.slice/user-1000.slice/user@1000.service/app.slice/app-org.sios.settings-2.scope";
        assert_eq!(classify(&p("/usr/bin/sios-settings", user), &OWNER_APPS, Some(SERVICE)), Who::Owner);
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
        // nothing known (no kernel answer)
        assert_eq!(classify(&Proc::default(), &OWNER_APPS, Some(SERVICE)), Who::Agent);
    }
}
