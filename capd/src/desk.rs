//! An agent's own desktop (D109): a hidden KWin in its own sandbox, never the owner's screen.
//!
//! One transient `systemd-run --user` unit per agent in `sios-agents.slice`, built here
//! (no unit files an AI could edit):
//!   - `pasta` gives it a private network with internet but its own loopback; every
//!     port forward and the gateway-to-host mapping are off, so nothing outside reaches
//!     its ports and it reaches nothing that listens only on the owner's computer
//!   - an empty home (ProtectHome=tmpfs) with only its workspace, its private home and
//!     its places (read-only here) bound in; no system bus, no devices (software
//!     drawing; only /dev/net/tun for pasta), no owner session bus, PipeWire or screen
//!   - inside, `capd desk-session` runs its own PipeWire, a virtual KWin with one
//!     screen, KDE's VNC sharer on its private loopback, and a bridge that serves that
//!     screen only on a Unix socket in a folder of its own, to whoever first sends the
//!     token the broker made for this start (a systemd credential, never in argv)
//! Stop and Pause freeze it with the rest of the slice; the broker stops it when idle.

use std::io::{BufRead, Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// The desktop's size: fixed, so the agent's clicks and the owner's view agree.
pub const WIDTH: u32 = 1280;
pub const HEIGHT: u32 = 800;
/// The VNC sharer's port inside the desktop's own network (never forwarded).
const VNC_PORT: u16 = 5900;
/// Its Wayland socket name, inside its own runtime folder.
const DISPLAY: &str = "desk-0";

pub fn unit(slug: &str) -> String {
    format!("sios-desk-{slug}")
}

/// The folder of one agent's desktop socket: outside SIOS's socket folder, which agents see.
pub fn dir(runtime_parent: &Path, slug: &str) -> PathBuf {
    runtime_parent.join("sios-desks").join(slug)
}

pub struct Desk<'a> {
    pub slug: &'a str,
    /// Where its socket appears (made by the broker, mode 0700).
    pub dir: &'a Path,
    pub token_file: &'a Path,
    pub worktree: &'a Path,
    pub agent_home: &'a Path,
    /// Its places, as for its runs: (the owner's folder, where it appears); read-only here.
    pub places: &'a [(PathBuf, PathBuf)],
    pub hide: &'a [PathBuf],
    /// Its lease left: systemd stops the desktop then, even without the broker.
    pub max_secs: u64,
    /// The GPU's render nodes (/dev/dri/renderD*): KDE's sharer crashes drawing the cursor
    /// without one (checked on the VM). Never card* (the display controller).
    pub render: &'a [PathBuf],
}

/// The computer's render nodes, for `Desk::render`.
pub fn render_nodes() -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = std::fs::read_dir("/dev/dri").into_iter().flatten().flatten().map(|e| e.path()).filter(|p| render_ok(p)).collect();
    v.sort();
    v
}

fn render_ok(p: &Path) -> bool {
    p.parent() == Some(Path::new("/dev/dri")) && p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.strip_prefix("renderD").is_some_and(|d| !d.is_empty() && d.chars().all(|c| c.is_ascii_digit())))
}

/// The whole `systemd-run` argument list. Pure, so it can be tested.
pub fn build(d: &Desk) -> Result<Vec<String>, String> {
    for p in [d.dir, d.token_file, d.worktree, d.agent_home] {
        if !crate::runner::safe_path(p) {
            return Err(format!("{} isn't a plain path", p.display()));
        }
    }
    if d.slug.is_empty() || !d.slug.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("bad agent name".into());
    }
    let s = |p: &Path| p.display().to_string();
    let q = |spec: String| if spec.contains(' ') { format!("\"{spec}\"") } else { spec };
    let mut a: Vec<String> = vec!["--user".into(), "--quiet".into(), "--collect".into(), format!("--unit={}", unit(d.slug)), "--slice=sios-agents.slice".into()];
    let mut p = |v: String| a.extend(["-p".into(), v]);
    p("ProtectHome=tmpfs".into());
    p(format!("BindPaths={}", s(d.worktree)));
    p(format!("BindPaths={}", s(d.agent_home)));
    p(format!("BindPaths={}", s(d.dir)));
    for (src, dst) in d.places {
        if !crate::runner::place_path_ok(src) || !crate::runner::safe_path(dst) {
            return Err(format!("{} can't be shown on its desktop", src.display()));
        }
        p(format!("BindReadOnlyPaths={}", q(format!("{}:{}", s(src), s(dst)))));
    }
    for h in d.hide {
        if !crate::runner::place_path_ok(h) {
            return Err(format!("{} can't be hidden safely", h.display()));
        }
        p(format!("InaccessiblePaths={}", q(format!("-{}", s(h)))));
    }
    for v in [
        // the system read-only; removable disks and other mounts out of sight (security review)
        "ProtectSystem=strict",
        "InaccessiblePaths=-/run/media",
        "InaccessiblePaths=-/media",
        "InaccessiblePaths=-/mnt",
        "InaccessiblePaths=-/var/mnt",
        "InaccessiblePaths=-/srv",
        "PrivateTmp=yes",
        // no disks, cameras, microphones or GPU; pasta needs only its tun device
        "PrivateDevices=yes",
        "BindPaths=/dev/net/tun",
        // no system bus: no udisks mounts, no NetworkManager, no logind (checked on the VM)
        "InaccessiblePaths=/run/dbus",
        "InaccessiblePaths=-/run/udev",
        "InaccessiblePaths=-/var/run/dbus",
        "ProtectProc=invisible",
        "ProcSubset=pid",
        "NoNewPrivileges=yes",
        "MemoryMax=3G",
        "CPUQuota=200%",
        "TasksMax=768",
    ] {
        p(v.into());
    }
    for r in d.render {
        if !render_ok(r) {
            return Err(format!("{} isn't a GPU render node", r.display()));
        }
        p(format!("BindPaths={}", s(r)));
    }
    p(format!("RuntimeMaxSec={}", d.max_secs.clamp(60, 8 * 3600)));
    p(format!("LoadCredential=sios-desk:{}", s(d.token_file)));
    p(format!("WorkingDirectory={}", s(d.worktree)));
    a.extend([
        "-E".into(), format!("HOME={}", s(d.agent_home)),
        "-E".into(), "PATH=/usr/bin:/bin".into(),
        "-E".into(), format!("SIOS_DESK={}", s(d.dir)),
        "-E".into(), format!("SIOS_AGENT={}", d.slug),
        "--".into(),
        "/usr/bin/pasta".into(), "--config-net".into(), "--quiet".into(), "--foreground".into(),
        // nothing forwarded either way, and the gateway isn't the owner's computer
        "-t".into(), "none".into(), "-u".into(), "none".into(), "-T".into(), "none".into(), "-U".into(), "none".into(), "--no-map-gw".into(),
        "--".into(),
        "/usr/bin/dbus-run-session".into(), "--".into(), "/usr/bin/capd".into(), "desk-session".into(),
    ]);
    Ok(a)
}

// ------------------------------------------------------------------ inside the sandbox

/// The token as the broker made it: hex only, so a compare can't be fooled by encoding.
fn token() -> Result<String, String> {
    let dir = std::env::var("CREDENTIALS_DIRECTORY").map_err(|_| "no credentials")?;
    let t = std::fs::read_to_string(Path::new(&dir).join("sios-desk")).map_err(|e| e.to_string())?;
    let t = t.trim().to_string();
    if t.len() < 32 || !t.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("bad desk token".into());
    }
    Ok(t)
}

/// Equal without leaking where they differ through timing.
fn same(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// `capd desk-session`: the desktop and its bridge, run by pasta and dbus-run-session.
/// Ends when KWin ends; systemd stops the rest of the unit.
pub fn session() -> Result<(), String> {
    let token = token()?;
    let dir = PathBuf::from(std::env::var("SIOS_DESK").map_err(|_| "no SIOS_DESK")?);
    // its own runtime folder, in its private /tmp: no owner sockets in it
    let run = PathBuf::from("/tmp/run");
    {
        use std::os::unix::fs::DirBuilderExt;
        let _ = std::fs::DirBuilder::new().mode(0o700).create(&run);
    }
    let log = std::fs::OpenOptions::new().create(true).append(true).open(run.join("session.log")).map_err(|e| e.to_string())?;
    let spawn = |prog: &str, args: &[&str]| -> Result<std::process::Child, String> {
        std::process::Command::new(prog)
            .args(args)
            .env("XDG_RUNTIME_DIR", &run)
            .env("WAYLAND_DISPLAY", DISPLAY)
            .env("QT_QPA_PLATFORM", "wayland")
            .env_remove("DISPLAY")
            .stdin(std::process::Stdio::null())
            .stdout(log.try_clone().map_err(|e| e.to_string())?)
            .stderr(log.try_clone().map_err(|e| e.to_string())?)
            .spawn()
            .map_err(|e| format!("couldn't start {prog}: {e}"))
    };
    let _pw = spawn("/usr/bin/pipewire", &[])?;
    std::thread::sleep(Duration::from_millis(500));
    let _wp = spawn("/usr/bin/wireplumber", &[])?;
    let (w, h) = (WIDTH.to_string(), HEIGHT.to_string());
    let mut kwin = spawn("/usr/bin/kwin_wayland", &["--virtual", "--width", &w, "--height", &h, "--no-lockscreen", "--socket", DISPLAY, "--xwayland"])?;
    let socket = run.join(DISPLAY);
    for _ in 0..100 {
        if socket.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    if !socket.exists() {
        let _ = kwin.kill();
        return Err("its desktop didn't start".into());
    }
    // the sharer's password stays inside this private network; the token is the real gate
    let pass = &token[..16];
    let res = format!("{w}x{h}");
    let _vnc = spawn("/usr/bin/krfb-virtualmonitor", &["--name", "agent", "--resolution", &res, "--password", pass, "--port", &VNC_PORT.to_string()])?;
    // one screen only: the sharer's. Windows open there, where the owner and the agent look
    for _ in 0..40 {
        std::thread::sleep(Duration::from_millis(250));
        let ok = std::process::Command::new("/usr/bin/kscreen-doctor").arg("output.Virtual-0.disable").env("XDG_RUNTIME_DIR", &run).env("WAYLAND_DISPLAY", DISPLAY).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).status().is_ok_and(|s| s.success());
        if ok {
            break;
        }
    }
    // the bridge: the desktop's screen on a Unix socket, only after the token
    let sock = dir.join("vnc.sock");
    let _ = std::fs::remove_file(&sock);
    let listener = std::os::unix::net::UnixListener::bind(&sock).map_err(|e| e.to_string())?;
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&sock, std::fs::Permissions::from_mode(0o600));
    }
    // the password for VNC goes to whoever passed the token, in the same reply
    let pass = pass.to_string();
    std::thread::spawn(move || {
        let live = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        for c in listener.incoming().flatten() {
            // two at a time: the owner's view and the broker (for the agent's tools)
            if live.load(std::sync::atomic::Ordering::SeqCst) >= 2 {
                continue;
            }
            let (token, pass, live) = (token.clone(), pass.clone(), live.clone());
            live.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            std::thread::spawn(move || {
                let _ = bridge(c, &token, &pass);
                live.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
            });
        }
    });
    let _ = kwin.wait();
    Ok(())
}

/// One client: a token line within 5 seconds, then the bytes both ways.
fn bridge(c: std::os::unix::net::UnixStream, token: &str, pass: &str) -> Result<(), String> {
    c.set_read_timeout(Some(Duration::from_secs(5))).map_err(|e| e.to_string())?;
    let mut line = Vec::new();
    std::io::BufReader::new((&c).take(128)).read_until(b'\n', &mut line).map_err(|e| e.to_string())?;
    if !same(line.trim_ascii(), token.as_bytes()) {
        std::thread::sleep(Duration::from_millis(500));
        return Err("wrong token".into());
    }
    c.set_read_timeout(None).map_err(|e| e.to_string())?;
    let up = std::net::TcpStream::connect(("127.0.0.1", VNC_PORT)).map_err(|e| e.to_string())?;
    (&c).write_all(format!("ok {pass}\n").as_bytes()).map_err(|e| e.to_string())?;
    let (mut c2, mut up2) = (c.try_clone().map_err(|e| e.to_string())?, up.try_clone().map_err(|e| e.to_string())?);
    let t = std::thread::spawn(move || {
        let _ = std::io::copy(&mut up2, &mut c2);
        let _ = c2.shutdown(std::net::Shutdown::Both);
    });
    let (mut c, mut up) = (c, up);
    let _ = std::io::copy(&mut c, &mut up);
    let _ = up.shutdown(std::net::Shutdown::Both);
    let _ = t.join();
    Ok(())
}

/// Whether its desktop is certainly gone: systemd answered, and the unit is inactive or
/// failed. Shutting down, frozen, unknown or no answer all count as still there (fail
/// closed), since apps on a desktop that's closing can still write its workspace.
pub fn closed(slug: &str) -> bool {
    // no systemd here (the Mac, tests): no desktop can exist
    if !Path::new("/usr/bin/systemctl").exists() {
        return true;
    }
    let unit = format!("{}.service", unit(slug));
    match crate::exec::run("/usr/bin/systemctl", &["--user", "show", "-p", "ActiveState", "--value", &unit], None, Duration::from_secs(5)) {
        Ok(o) if o.code == Some(0) => state_closed(String::from_utf8_lossy(&o.stdout).trim()),
        _ => false,
    }
}

fn state_closed(state: &str) -> bool {
    state == "inactive" || state == "failed"
}

/// The processes in its unit, from its cgroup (pasta itself stays outside; what it starts is inside).
pub fn session_pids(unit: &str) -> Vec<u32> {
    let cg = crate::exec::run("/usr/bin/systemctl", &["--user", "show", "-p", "ControlGroup", "--value", unit], None, Duration::from_secs(5))
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();
    if cg.is_empty() || cg.contains("..") {
        return vec![];
    }
    std::fs::read_to_string(format!("/sys/fs/cgroup{cg}/cgroup.procs")).unwrap_or_default().lines().filter_map(|l| l.trim().parse().ok()).collect()
}

/// Whether a process sits in a network namespace other than the broker's: systemd skips
/// some isolation in a user unit without saying so, so the broker checks it took.
pub fn own_network(pid: u32) -> bool {
    let theirs = std::fs::read_link(format!("/proc/{pid}/ns/net")).ok();
    let mine = std::fs::read_link("/proc/self/ns/net").ok();
    theirs.is_some() && mine.is_some() && theirs != mine
}

#[cfg(test)]
mod tests {
    use super::*;

    fn desk<'a>(places: &'a [(PathBuf, PathBuf)], hide: &'a [PathBuf]) -> Desk<'a> {
        Desk {
            slug: "pipo",
            dir: Path::new("/run/user/1000/sios-desks/pipo"),
            token_file: Path::new("/home/r/.local/state/sios/agents/pipo/desk-token"),
            worktree: Path::new("/home/r/Agents/pipo/site"),
            agent_home: Path::new("/home/r/.local/state/sios/agents/pipo/home"),
            places,
            hide,
            max_secs: 7200,
            render: &[],
        }
    }

    #[test]
    fn the_desktop_is_sealed() {
        let a = build(&desk(&[], &[])).unwrap();
        let has = |s: &str| a.iter().any(|x| x == s);
        for must in ["ProtectSystem=strict", "InaccessiblePaths=-/run/media", "InaccessiblePaths=-/mnt", "ProtectHome=tmpfs", "PrivateDevices=yes", "InaccessiblePaths=/run/dbus", "ProtectProc=invisible", "NoNewPrivileges=yes", "PrivateTmp=yes", "--slice=sios-agents.slice", "--no-map-gw"] {
            assert!(has(must), "{must}");
        }
        // every forward off, both ways
        for flag in ["-t", "-u", "-T", "-U"] {
            let i = a.iter().position(|x| x == flag).unwrap_or_else(|| panic!("{flag}"));
            assert_eq!(a[i + 1], "none", "{flag}");
        }
        // the token is a credential file, never on the command line
        assert!(a.iter().any(|x| x.starts_with("LoadCredential=sios-desk:")));
        assert!(!a.iter().any(|x| x.contains("token=") || x.contains("--password")));
        // no owner session folder bound in
        assert!(!a.iter().any(|x| x.contains("/run/user/1000/bus") || x.contains("/run/user/1000/sios:") || x == "BindPaths=/run/user/1000/sios"));
        assert_eq!(a.last().unwrap(), "desk-session");
        // it ends with the lease, never past the 8-hour ceiling
        assert!(has("RuntimeMaxSec=7200"));
        let mut d = desk(&[], &[]);
        d.max_secs = 99_999;
        assert!(build(&d).unwrap().contains(&"RuntimeMaxSec=28800".to_string()));
    }

    #[test]
    fn only_a_stopped_desktop_counts_as_closed() {
        assert!(state_closed("inactive") && state_closed("failed"));
        for st in ["active", "deactivating", "activating", "reloading", "refreshing", "maintenance", "", "garbage"] {
            assert!(!state_closed(st), "{st}");
        }
    }

    #[test]
    fn only_render_nodes_of_the_gpu() {
        let ok = [PathBuf::from("/dev/dri/renderD128")];
        let mut d = desk(&[], &[]);
        d.render = &ok;
        assert!(build(&d).unwrap().contains(&"BindPaths=/dev/dri/renderD128".to_string()));
        for bad in ["/dev/dri/card0", "/dev/dri/renderD", "/dev/dri/../sda", "/dev/sda", "/dev/dri/renderD12a"] {
            let b = [PathBuf::from(bad)];
            let mut d = desk(&[], &[]);
            d.render = &b;
            assert!(build(&d).is_err(), "{bad}");
        }
    }

    #[test]
    fn places_are_read_only_on_the_desktop() {
        let places = vec![(PathBuf::from("/home/r/Photos 2026"), PathBuf::from("/home/r/Agents/pipo/site/photos"))];
        let a = build(&desk(&places, &[PathBuf::from("/home/r/Agents/pipo/site/photos/Private")])).unwrap();
        assert!(a.contains(&"BindReadOnlyPaths=\"/home/r/Photos 2026:/home/r/Agents/pipo/site/photos\"".to_string()));
        assert!(a.contains(&"InaccessiblePaths=-/home/r/Agents/pipo/site/photos/Private".to_string()));
        let bad = vec![(PathBuf::from("/home/r/a:b"), PathBuf::from("/home/r/Agents/pipo/site/x"))];
        assert!(build(&desk(&bad, &[])).is_err());
    }

    #[test]
    fn bad_names_never_reach_systemd() {
        let mut d = desk(&[], &[]);
        d.slug = "pipo;rm";
        assert!(build(&d).is_err());
        let mut d = desk(&[], &[]);
        d.worktree = Path::new("/home/r/Agents/pipo/a b");
        assert!(build(&d).is_err());
    }

    #[test]
    fn the_bridge_wants_the_token_first() {
        assert!(same(b"abc", b"abc"));
        assert!(!same(b"abc", b"abd"));
        assert!(!same(b"abc", b"abcd"));
        let (a, b) = std::os::unix::net::UnixStream::pair().unwrap();
        (&b).write_all(b"0000000000000000000000000000000000000000\n").unwrap();
        assert_eq!(bridge(a, &"f".repeat(40), "pass").unwrap_err(), "wrong token");
        // nothing of the password went back to a wrong token
        let mut got = String::new();
        let _ = b.set_read_timeout(Some(Duration::from_millis(200)));
        let _ = (&b).read_to_string(&mut got);
        assert!(!got.contains("pass"));
    }
}
