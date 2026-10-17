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
    // KDE's sharer may only watch its screen (its desktop file grants screencast, not fake
    // input), so clicks from the view were dropped. Inside this desktop only, a copy of that
    // file, first in the data path, lets it pass the owner's and the agent's input to KWin
    let share = run.join("share");
    std::fs::create_dir_all(share.join("applications")).map_err(|e| e.to_string())?;
    std::fs::write(
        share.join("applications/org.kde.krfb.virtualmonitor.desktop"),
        "[Desktop Entry]\nType=Application\nName=Agent desktop sharer\nExec=/usr/bin/krfb-virtualmonitor\nNoDisplay=true\nX-KDE-Wayland-Interfaces=zkde_screencast_unstable_v1,org_kde_kwin_fake_input\n",
    )
    .map_err(|e| e.to_string())?;
    std::fs::write(
        share.join("applications/sios-desk-session.desktop"),
        "[Desktop Entry]\nType=Application\nName=SIOS agent desktop input\nExec=/usr/bin/capd\nNoDisplay=true\nX-KDE-Wayland-Interfaces=org_kde_kwin_fake_input\n",
    )
    .map_err(|e| e.to_string())?;
    let data_dirs = format!("{}:/usr/local/share:/usr/share", share.display());
    // no first-run welcome on an agent's desktop: marked seen in its own settings, once
    if let Ok(home) = std::env::var("HOME") {
        // the sharer lets a viewer drive only when told so (krfb's allowDesktopControl, off by
        // default): its settings here, in the agent's own home, written fresh each start
        let _ = std::fs::create_dir_all(Path::new(&home).join(".config"));
        let _ = std::fs::write(Path::new(&home).join(".config/krfbrc"), "[Security]\nallowDesktopControl=true\n");
        let rc = Path::new(&home).join(".config/plasma-welcomerc");
        if !rc.exists() {
            let version = std::process::Command::new("/usr/bin/rpm").args(["-q", "--qf", "%{VERSION}", "plasma-welcome"]).output().ok().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).filter(|v| v.chars().all(|c| c.is_ascii_digit() || c == '.') && !v.is_empty());
            if let Some(v) = version {
                let _ = std::fs::create_dir_all(rc.parent().unwrap_or(Path::new(&home)));
                let _ = std::fs::write(&rc, format!("[General]\nLastSeenVersion={v}\nShowUpdatePage=false\n"));
            }
        }
    }
    let log = std::fs::OpenOptions::new().create(true).append(true).open(run.join("session.log")).map_err(|e| e.to_string())?;
    let spawn = |prog: &str, args: &[&str]| -> Result<std::process::Child, String> {
        std::process::Command::new(prog)
            .args(args)
            .env("XDG_RUNTIME_DIR", &run)
            .env("WAYLAND_DISPLAY", DISPLAY)
            .env("QT_QPA_PLATFORM", "wayland")
            .env("XDG_SESSION_TYPE", "wayland")
            .env("XDG_CURRENT_DESKTOP", "KDE")
            .env("KDE_FULL_SESSION", "true")
            .env("XDG_DATA_DIRS", &data_dirs)
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
    // a real desktop on it: Plasma's shell (wallpaper, panel, launcher), its own instance
    // with its own settings in the agent's home; never the owner's
    // services the desktop's own bus starts (Plasma's activity manager...) need to know
    // its screen and runtime folder too, or they can't start and Plasma gives up
    let rd = format!("XDG_RUNTIME_DIR={}", run.display());
    let _ = std::process::Command::new("/usr/bin/dbus-update-activation-environment")
        .args([rd.as_str(), &format!("WAYLAND_DISPLAY={DISPLAY}"), "QT_QPA_PLATFORM=wayland", "XDG_SESSION_TYPE=wayland", "XDG_CURRENT_DESKTOP=KDE", "KDE_FULL_SESSION=true", &format!("XDG_DATA_DIRS={data_dirs}")])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status();
    let _shell = spawn("/usr/bin/plasmashell", &["--no-respawn"])?;
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
    // input into the desktop's KWin (the sharer only shows it), shared by the bridges
    let keys: Input = (0..20).find_map(|_| input::Kwin::connect(&socket).or_else(|| {
        std::thread::sleep(Duration::from_millis(250));
        None
    })).map(|k| std::sync::Arc::new(std::sync::Mutex::new(k)));
    if keys.is_none() {
        eprintln!("desk-session: KWin gave no fake input; the desktop can be watched, not driven");
    }
    std::thread::spawn(move || {
        let live = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        for c in listener.incoming().flatten() {
            // two at a time: the owner's view and the broker (for the agent's tools)
            if live.load(std::sync::atomic::Ordering::SeqCst) >= 2 {
                continue;
            }
            let (token, pass, live, kwin) = (token.clone(), pass.clone(), live.clone(), keys.clone());
            live.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            std::thread::spawn(move || {
                let _ = bridge(c, &token, &pass, kwin);
                live.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
            });
        }
    });
    let _ = kwin.wait();
    Ok(())
}

/// One client: a token line within 5 seconds, then the bytes both ways.
type Input = Option<std::sync::Arc<std::sync::Mutex<input::Kwin>>>;

fn bridge(c: std::os::unix::net::UnixStream, token: &str, pass: &str, kwin: Input) -> Result<(), String> {
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
    // what the viewer sends goes on to the sharer; its clicks and keys also go to KWin
    let (mut c, mut up) = (c, up);
    let mut rfb = input::Rfb::default();
    let mut buf = [0u8; 16384];
    let mut events = Vec::new();
    loop {
        let n = match c.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        if up.write_all(&buf[..n]).is_err() {
            break;
        }
        if let Some(k) = &kwin {
            rfb.feed(&buf[..n], &mut events);
            if !events.is_empty() {
                let mut k = k.lock().unwrap_or_else(|p| p.into_inner());
                for e in events.drain(..) {
                    match e {
                        input::Event::Pointer(m, x, y) => k.pointer(m, x.min(WIDTH as u16 - 1), y.min(HEIGHT as u16 - 1)),
                        input::Event::Key(sym, down) => k.key(sym, down),
                    }
                }
            }
        }
    }
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

// ------------------------------------------------------------- input into its desktop

/// Input for the agent's desktop, from inside its sandbox: KDE's sharer only shows the
/// screen, so the session passes clicks and keys to the desktop's own KWin itself, through
/// KWin's fake-input interface (org_kde_kwin_fake_input, v6 takes X keysyms as VNC sends
/// them). A few Wayland requests, written by hand: no library, nothing else on the wire.
pub mod input {
    use std::io::{Read, Write};
    use std::os::unix::net::UnixStream;

    pub struct Kwin {
        s: UnixStream,
        fake: u32,
        version: u32,
        buttons: u8,
        at: (u16, u16),
    }

    fn msg(id: u32, opcode: u16, args: &[u8]) -> Vec<u8> {
        let mut m = Vec::with_capacity(8 + args.len());
        m.extend_from_slice(&id.to_ne_bytes());
        m.extend_from_slice(&((((8 + args.len()) as u32) << 16) | opcode as u32).to_ne_bytes());
        m.extend_from_slice(args);
        m
    }

    fn string(v: &mut Vec<u8>, s: &str) {
        let len = s.len() + 1;
        v.extend_from_slice(&(len as u32).to_ne_bytes());
        v.extend_from_slice(s.as_bytes());
        v.push(0);
        while v.len() % 4 != 0 {
            v.push(0);
        }
    }

    fn fixed(v: f64) -> [u8; 4] {
        ((v * 256.0) as i32).to_ne_bytes()
    }

    impl Kwin {
        /// Connect to the desktop's KWin (its socket in its own runtime folder) and bind
        /// fake input. None if KWin doesn't offer it to this process.
        pub fn connect(socket: &std::path::Path) -> Option<Kwin> {
            let mut s = UnixStream::connect(socket).ok()?;
            s.set_read_timeout(Some(std::time::Duration::from_secs(3))).ok()?;
            // get_registry (new id 2), then sync (callback 3) to know when globals are done
            s.write_all(&msg(1, 1, &2u32.to_ne_bytes())).ok()?;
            s.write_all(&msg(1, 0, &3u32.to_ne_bytes())).ok()?;
            let mut found: Option<(u32, u32)> = None;
            loop {
                let mut h = [0u8; 8];
                s.read_exact(&mut h).ok()?;
                let id = u32::from_ne_bytes(h[0..4].try_into().ok()?);
                let w = u32::from_ne_bytes(h[4..8].try_into().ok()?);
                let (size, op) = ((w >> 16) as usize, (w & 0xffff) as u16);
                if !(8..=4096).contains(&size) {
                    return None;
                }
                let mut body = vec![0u8; size - 8];
                s.read_exact(&mut body).ok()?;
                if id == 3 && op == 0 {
                    break;
                }
                // wl_registry.global(name, interface, version)
                if id == 2 && op == 0 && body.len() >= 12 {
                    let name = u32::from_ne_bytes(body[0..4].try_into().ok()?);
                    let len = u32::from_ne_bytes(body[4..8].try_into().ok()?) as usize;
                    let iface = body.get(8..8 + len.saturating_sub(1)).map(|b| String::from_utf8_lossy(b).into_owned()).unwrap_or_default();
                    let at = 8 + len.div_ceil(4) * 4;
                    let version = body.get(at..at + 4).and_then(|b| b.try_into().ok()).map(u32::from_ne_bytes).unwrap_or(0);
                    if iface == "org_kde_kwin_fake_input" {
                        found = Some((name, version));
                    }
                }
            }
            let (name, offered) = found?;
            let version = offered.min(6);
            // wl_registry.bind(name, interface, version, new id 4)
            let mut a = Vec::new();
            a.extend_from_slice(&name.to_ne_bytes());
            string(&mut a, "org_kde_kwin_fake_input");
            a.extend_from_slice(&version.to_ne_bytes());
            a.extend_from_slice(&4u32.to_ne_bytes());
            s.write_all(&msg(2, 0, &a)).ok()?;
            let mut k = Kwin { s, fake: 4, version, buttons: 0, at: (u16::MAX, u16::MAX) };
            let mut a = Vec::new();
            string(&mut a, "SIOS agent desktop");
            string(&mut a, "The owner or the agent uses the agent's own desktop");
            k.send(0, &a);
            Some(k)
        }

        fn send(&mut self, op: u16, args: &[u8]) {
            let _ = self.s.write_all(&msg(self.fake, op, args));
        }

        /// A VNC pointer event: where, and which buttons are down (1 left, 2 middle, 4 right, 8/16 wheel)
        pub fn pointer(&mut self, mask: u8, x: u16, y: u16) {
            if self.version >= 3 && (x, y) != self.at {
                let mut a = fixed(x as f64).to_vec();
                a.extend_from_slice(&fixed(y as f64));
                self.send(9, &a);
                self.at = (x, y);
            }
            for (bit, code) in [(1u8, 0x110u32), (2, 0x112), (4, 0x111)] {
                if (mask ^ self.buttons) & bit != 0 {
                    let mut a = code.to_ne_bytes().to_vec();
                    a.extend_from_slice(&u32::from(mask & bit != 0).to_ne_bytes());
                    self.send(2, &a);
                }
            }
            // the wheel: a press is one step (up is negative on the vertical axis)
            for (bit, step) in [(8u8, -15.0), (16, 15.0)] {
                if mask & bit != 0 && self.buttons & bit == 0 {
                    let mut a = 0u32.to_ne_bytes().to_vec();
                    a.extend_from_slice(&fixed(step));
                    self.send(3, &a);
                }
            }
            self.buttons = mask;
        }

        /// A VNC key event: an X keysym, down or up
        pub fn key(&mut self, keysym: u32, down: bool) {
            if self.version >= 6 {
                let mut a = keysym.to_ne_bytes().to_vec();
                a.extend_from_slice(&u32::from(down).to_ne_bytes());
                self.send(12, &a);
            }
        }
    }

    pub enum Event {
        Pointer(u8, u16, u16),
        Key(u32, bool),
    }

    /// Reads what a VNC viewer sends (RFB 3.8): its handshake, then its messages, and picks
    /// out pointer and key events. Anything it doesn't know stops it (input stops, the
    /// picture goes on), so a confused stream can't turn into stray clicks.
    #[derive(Default)]
    pub struct Rfb {
        buf: Vec<u8>,
        stage: u8,
        dead: bool,
    }

    impl Rfb {
        pub fn feed(&mut self, bytes: &[u8], out: &mut Vec<Event>) {
            if self.dead {
                return;
            }
            self.buf.extend_from_slice(bytes);
            if self.buf.len() > 1 << 20 {
                self.dead = true;
                return;
            }
            loop {
                let need = match self.stage {
                    0 => 12, // "RFB 003.008\n"
                    1 => 1,  // the security type it chose
                    2 => 16, // its answer to VNC's challenge
                    3 => 1,  // ClientInit
                    _ => match self.buf.first() {
                        None => return,
                        Some(0) => 20,
                        Some(2) if self.buf.len() >= 4 => 4 + 4 * u16::from_be_bytes([self.buf[2], self.buf[3]]) as usize,
                        Some(3) => 10,
                        Some(4) => 8,
                        Some(5) => 6,
                        Some(6) if self.buf.len() >= 8 => 8 + (u32::from_be_bytes([self.buf[4], self.buf[5], self.buf[6], self.buf[7]]) as usize).min(1 << 20),
                        Some(2) | Some(6) => return,
                        Some(_) => {
                            self.dead = true;
                            return;
                        }
                    },
                };
                if self.buf.len() < need {
                    return;
                }
                let m: Vec<u8> = self.buf.drain(..need).collect();
                match self.stage {
                    0 => self.stage = if m.starts_with(b"RFB 003.") { 1 } else { 9 },
                    // VNC authentication answers a challenge; "none" goes straight to ClientInit
                    1 => self.stage = match m[0] { 2 => 2, 1 => 3, _ => 9 },
                    2 => self.stage = 3,
                    3 => self.stage = 4,
                    _ => match m[0] {
                        4 => out.push(Event::Key(u32::from_be_bytes([m[4], m[5], m[6], m[7]]), m[1] != 0)),
                        5 => out.push(Event::Pointer(m[1], u16::from_be_bytes([m[2], m[3]]), u16::from_be_bytes([m[4], m[5]]))),
                        _ => {}
                    },
                }
                if self.stage == 9 {
                    self.dead = true;
                    return;
                }
            }
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn picks_clicks_and_keys_out_of_a_viewers_stream() {
            let mut r = Rfb::default();
            let mut out = vec![];
            let mut s = b"RFB 003.008\n".to_vec();
            s.push(2);
            s.extend_from_slice(&[7u8; 16]);
            s.push(1);
            s.extend_from_slice(&[2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 1]); // SetEncodings, 2
            s.extend_from_slice(&[5, 1, 0x01, 0x00, 0x00, 0x80]); // left down at 256,128
            s.extend_from_slice(&[4, 1, 0, 0, 0, 0, 0, 0x61]); // 'a' down
            // in two pieces, as a socket may give them
            r.feed(&s[..17], &mut out);
            r.feed(&s[17..], &mut out);
            assert!(matches!(out[0], Event::Pointer(1, 256, 128)));
            assert!(matches!(out[1], Event::Key(0x61, true)));
            // something it doesn't know: no more input from this stream
            let mut out = vec![];
            r.feed(&[99, 5, 1, 0, 0, 0, 0], &mut out);
            r.feed(&[5, 1, 0, 1, 0, 1], &mut out);
            assert!(out.is_empty());
        }

        #[test]
        fn wayland_messages_are_laid_out_right() {
            let m = msg(4, 12, &[1, 0, 0, 0, 1, 0, 0, 0]);
            assert_eq!(u32::from_ne_bytes(m[4..8].try_into().unwrap()), (16 << 16) | 12);
            let mut v = vec![];
            string(&mut v, "abc");
            assert_eq!(v.len(), 8);
            assert_eq!(&v[4..8], b"abc\0");
            assert_eq!(i32::from_ne_bytes(fixed(1.5)), 384);
        }
    }
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
        assert_eq!(bridge(a, &"f".repeat(40), "pass", None).unwrap_err(), "wrong token");
        // nothing of the password went back to a wrong token
        let mut got = String::new();
        let _ = b.set_read_timeout(Some(Duration::from_millis(200)));
        let _ = (&b).read_to_string(&mut got);
        assert!(!got.contains("pass"));
    }
}
