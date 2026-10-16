//! System tools for real (M6, D38). On SIOS (SIOS_ADAPTERS=real) the broker
//! carries these out itself, after every check has passed: the model never
//! touches D-Bus or the desktop. Each runs a stock program with a fixed list of
//! arguments (never a shell) and a time limit, reads the value it is about to
//! change so undo can put it back, and answers with the new state.
//!
//! Elsewhere (the Mac preview) the tools return an `effect` that the page acts
//! out, as before (tools.rs).

use serde_json::{json, Value};
use std::path::Path;
use std::time::Duration;

use crate::exec;

pub fn enabled() -> bool {
    std::env::var("SIOS_ADAPTERS").is_ok_and(|v| v == "real")
}

/// A changed value: the answer, and the arguments that would put the old value back.
#[derive(Debug)]
pub struct Done {
    pub result: Value,
    pub undo: Option<Value>,
}

fn ok(result: Value) -> Result<Done, String> {
    Ok(Done { result, undo: None })
}

/// Run a program; its output, or a plain error naming what failed.
fn sh(prog: &str, args: &[&str]) -> Result<String, String> {
    sh_within(prog, args, Duration::from_secs(5))
}

/// For changes the whole desktop redraws for (theme, wallpaper): the first one
/// after login can take several seconds.
fn sh_slow(prog: &str, args: &[&str]) -> Result<String, String> {
    sh_within(prog, args, Duration::from_secs(30))
}

fn sh_within(prog: &str, args: &[&str], limit: Duration) -> Result<String, String> {
    let o = exec::run(prog, args, None, limit)?;
    match o.code {
        Some(0) => Ok(String::from_utf8_lossy(&o.stdout).trim().to_string()),
        None => Err(format!("{} took too long", prog.rsplit('/').next().unwrap_or(prog))),
        Some(_) => Err(o.stderr.lines().find(|l| !l.trim().is_empty()).unwrap_or("it failed").trim().chars().take(200).collect()),
    }
}

// ------------------------------------------------------------ reading state

fn volume() -> Result<i64, String> {
    // "Volume: 0.40" or "Volume: 0.40 [MUTED]"
    let out = sh("/usr/bin/wpctl", &["get-volume", "@DEFAULT_AUDIO_SINK@"])?;
    let v: f64 = out.split_whitespace().nth(1).and_then(|x| x.parse().ok()).ok_or("couldn't read the volume")?;
    Ok((v * 100.0).round() as i64)
}

/// The first display KDE can dim: (D-Bus path, current, max).
fn brightness() -> Result<(String, i64, i64), String> {
    let names = sh("/usr/bin/busctl", &["--user", "get-property", "org.kde.ScreenBrightness", "/org/kde/ScreenBrightness", "org.kde.ScreenBrightness", "DisplaysDBusNames"])?;
    // as 1 "display0"
    let first = names.split('"').nth(1).filter(|n| !n.is_empty()).ok_or("this screen's brightness can't be changed from SIOS")?;
    if !first.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err("unexpected display name".into());
    }
    let path = format!("/org/kde/ScreenBrightness/{first}");
    let num = |prop: &str| -> Result<i64, String> {
        let s = sh("/usr/bin/busctl", &["--user", "get-property", "org.kde.ScreenBrightness", &path, "org.kde.ScreenBrightness.Display", prop])?;
        s.split_whitespace().nth(1).and_then(|x| x.parse().ok()).ok_or_else(|| format!("couldn't read {prop}"))
    };
    let (max, cur) = (num("MaxBrightness")?, num("Brightness")?);
    if max <= 0 {
        return Err("this screen's brightness can't be changed from SIOS".into());
    }
    Ok((path, cur, max))
}

fn theme() -> Result<String, String> {
    let pkg = sh("/usr/bin/kreadconfig6", &["--file", "kdeglobals", "--group", "KDE", "--key", "LookAndFeelPackage"])?;
    Ok(if pkg.ends_with(".dark") { "dark".into() } else { "light".into() })
}

const WALLPAPERS: [(&str, &str); 3] = [("dusk", "SIOS-Dusk"), ("lake", "SIOS-Lake"), ("tunnel", "SIOS-Tunnel")];

fn wallpaper() -> Option<&'static str> {
    let home = std::env::var("HOME").ok()?;
    let conf = std::fs::read_to_string(Path::new(&home).join(".config/plasma-org.kde.plasma.desktop-appletsrc")).ok()?;
    let image = conf.lines().find(|l| l.starts_with("Image="))?;
    WALLPAPERS.iter().find(|(_, dir)| image.contains(dir)).map(|(n, _)| *n)
}

fn wifi_on() -> Result<bool, String> {
    Ok(sh("/usr/bin/nmcli", &["-t", "radio", "wifi"])? == "enabled")
}

/// Active connection on the Wi-Fi device, if any.
fn wifi_connection() -> Option<String> {
    let out = sh("/usr/bin/nmcli", &["-t", "-f", "TYPE,STATE,CONNECTION", "device"]).ok()?;
    out.lines().filter_map(|l| {
        let f: Vec<&str> = l.splitn(3, ':').collect();
        (f.len() == 3 && f[0] == "wifi" && f[1] == "connected").then(|| f[2].to_string())
    }).next()
}

fn networks() -> Value {
    let devices: Vec<Value> = sh("/usr/bin/nmcli", &["-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device"])
        .unwrap_or_default()
        .lines()
        .filter_map(|l| {
            let f: Vec<&str> = l.splitn(4, ':').collect();
            (f.len() == 4 && f[1] != "loopback").then(|| json!({ "device": f[0], "type": f[1], "state": f[2], "connection": f[3] }))
        })
        .collect();
    json!({ "devices": devices })
}

/// The computer right now (system.state): only what can be read here.
pub fn state() -> Value {
    let mut s = json!({});
    if let Ok(v) = volume() {
        s["volume"] = json!(v);
    }
    if let Ok((_, b, max)) = brightness() {
        s["brightness"] = json!(b * 100 / max);
    }
    if let Ok(t) = theme() {
        s["theme"] = json!(t);
    }
    if let Some(w) = wallpaper() {
        s["wallpaper"] = json!(w);
    }
    if let Ok(on) = wifi_on() {
        s["wifi"] = json!(on);
    }
    s["network"] = networks()["devices"].clone();
    s
}

// ------------------------------------------------------------ apps

/// SIOS's names for apps, and the desktop files they start.
const APPS: [(&str, &str); 9] = [
    ("files", "org.sios.files"),
    ("browser", "org.mozilla.firefox"),
    ("mail", "org.mozilla.Thunderbird"),
    ("settings", "org.sios.settings"),
    ("terminal", "org.kde.konsole"),
    ("store", "org.sios.store"),
    ("security", "org.sios.settings"),
    ("goals", "org.sios.monitor"),
    ("activity", "org.sios.monitor"),
];

/// A file:// URL that means exactly this path: every byte outside the plain set is
/// percent-encoded, so a name with %, #, ? or spaces can't be read as another place.
pub fn file_url(path: &Path) -> String {
    use std::os::unix::ffi::OsStrExt;
    let mut out = String::from("file://");
    for &b in path.as_os_str().as_bytes() {
        if b.is_ascii_alphanumeric() || b"-._~/".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// Short names the model (or the owner) may use for common Flathub apps.
const KNOWN_APPS: &[(&str, &str)] = &[
    ("slack", "com.slack.Slack"), ("vlc", "org.videolan.VLC"), ("spotify", "com.spotify.Client"), ("discord", "com.discordapp.Discord"),
    ("zoom", "us.zoom.Zoom"), ("gimp", "org.gimp.GIMP"), ("obs", "com.obsproject.Studio"), ("calculator", "org.gnome.Calculator"),
    ("vscode", "com.visualstudio.code"), ("code", "com.visualstudio.code"), ("chrome", "com.google.Chrome"), ("telegram", "org.telegram.desktop"),
    ("signal", "org.signal.Signal"), ("steam", "com.valvesoftware.Steam"), ("blender", "org.blender.Blender"), ("libreoffice", "org.libreoffice.LibreOffice"),
    ("thunderbird", "org.mozilla.Thunderbird"), ("inkscape", "org.inkscape.Inkscape"), ("krita", "org.kde.krita"), ("kdenlive", "org.kde.kdenlive"),
    ("audacity", "org.audacityteam.Audacity"), ("obsidian", "md.obsidian.Obsidian"), ("bitwarden", "com.bitwarden.desktop"), ("postman", "com.getpostman.Postman"),
];

fn dnd_on() -> bool {
    // "2099,12,31,23,59,0": on until then; empty or in the past: off
    sh("/usr/bin/kreadconfig6", &["--file", "plasmanotifyrc", "--group", "DoNotDisturb", "--key", "Until"])
        .ok()
        .and_then(|v| v.split(',').next().and_then(|y| y.trim().parse::<i64>().ok()))
        .is_some_and(|year| year >= 2026)
}

fn bluetooth_on() -> Option<bool> {
    // "b true"
    let v = sh("/usr/bin/busctl", &["--system", "get-property", "org.bluez", "/org/bluez/hci0", "org.bluez.Adapter1", "Powered"]).ok()?;
    Some(v.trim().ends_with("true"))
}


// ------------------------------------------------------------ devices (wave 1, D104)
// The same commands the native Settings pages use (apps/sios-settings/src).

/// busctl's JSON: {"type": ..., "data": ...}, one per line; the data of each line.
fn bus_json(args: &[&str]) -> Result<Vec<Value>, String> {
    let out = sh_within("/usr/bin/busctl", args, Duration::from_secs(10))?;
    Ok(out.lines().filter_map(|l| serde_json::from_str::<Value>(l).ok()).map(|v| v["data"].clone()).collect())
}

const UPOWER_STATES: [&str; 7] = ["unknown", "charging", "discharging", "empty", "full", "waiting to charge", "waiting to discharge"];

fn battery() -> Value {
    let props = bus_json(&["--system", "--json=short", "get-property", "org.freedesktop.UPower", "/org/freedesktop/UPower/devices/DisplayDevice", "org.freedesktop.UPower.Device", "IsPresent", "Percentage", "State", "TimeToEmpty", "TimeToFull"]).unwrap_or_default();
    let mut b = if props.len() >= 5 && props[0] == true {
        let state = props[2].as_u64().unwrap_or(0) as usize;
        let mins = |v: &Value| v.as_i64().filter(|s| *s > 0).map(|s| s / 60);
        json!({ "present": true, "percent": props[1].as_f64().map(|p| p.round() as i64), "state": UPOWER_STATES.get(state).unwrap_or(&"unknown"),
                "minutes_to_empty": mins(&props[3]), "minutes_to_full": mins(&props[4]) })
    } else {
        json!({ "present": false, "note": "this computer runs on mains power (no battery)" })
    };
    if let Ok(p) = power_profile() {
        b["power_profile"] = json!(p);
    }
    b
}

const PP: [&str; 3] = ["org.freedesktop.UPower.PowerProfiles", "/org/freedesktop/UPower/PowerProfiles", "org.freedesktop.UPower.PowerProfiles"];

fn power_profile() -> Result<String, String> {
    let v = bus_json(&["--system", "--json=short", "get-property", PP[0], PP[1], PP[2], "ActiveProfile"])?;
    v.first().and_then(|x| x.as_str()).map(String::from).ok_or_else(|| "power profiles aren't available here".into())
}

fn night_light_on() -> bool {
    sh("/usr/bin/kreadconfig6", &["--file", "kwinrc", "--group", "NightColor", "--key", "Active"]).is_ok_and(|v| v == "true")
}

fn kwin_reconfigure() {
    let _ = sh("/usr/bin/gdbus", &["call", "--session", "--dest", "org.kde.KWin", "--object-path", "/KWin", "--method", "org.kde.KWin.reconfigure"]);
}

/// The screens KScreen knows that are on: (name, scale).
fn screens() -> Result<Vec<(String, f64)>, String> {
    let out = sh_within("/usr/bin/kscreen-doctor", &["-j"], Duration::from_secs(10))?;
    let v: Value = out.find('{').and_then(|i| serde_json::from_str(&out[i..]).ok()).ok_or("couldn't read the screens")?;
    Ok(v["outputs"].as_array().into_iter().flatten()
        .filter(|o| o["connected"] == true && o["enabled"] != false)
        .filter_map(|o| Some((o["name"].as_str()?.to_string(), o["scale"].as_f64().unwrap_or(1.0))))
        .filter(|(n, _)| !n.is_empty() && n.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'))
        .collect())
}

const SCALES: [f64; 7] = [1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];

/// Sound outputs and inputs PipeWire knows (pactl's JSON), with the defaults marked.
fn audio_devices() -> Result<Value, String> {
    let def_sink = sh("/usr/bin/pactl", &["get-default-sink"]).unwrap_or_default();
    let def_src = sh("/usr/bin/pactl", &["get-default-source"]).unwrap_or_default();
    let list = |what: &str, def: &str| -> Result<Vec<Value>, String> {
        let v: Value = serde_json::from_str(&sh("/usr/bin/pactl", &["-f", "json", "list", what])?).map_err(|_| "couldn't read the sound devices")?;
        Ok(v.as_array().into_iter().flatten()
            // a microphone list without the speakers' "monitor" copies
            .filter(|d| !d["name"].as_str().unwrap_or("").ends_with(".monitor"))
            .map(|d| json!({ "id": d["name"], "name": d["description"], "default": d["name"].as_str() == Some(def), "muted": d["mute"] }))
            .collect())
    };
    Ok(json!({ "outputs": list("sinks", &def_sink)?, "inputs": list("sources", &def_src)? }))
}

fn mic_muted() -> Result<bool, String> {
    // "Mute: yes"
    Ok(sh("/usr/bin/pactl", &["get-source-mute", "@DEFAULT_SOURCE@"])?.ends_with("yes"))
}

/// Bluetooth devices BlueZ knows: (D-Bus path, name, address, paired, connected).
fn bt_devices() -> Result<Vec<(String, String, String, bool, bool)>, String> {
    let v = bus_json(&["--system", "--json=short", "call", "org.bluez", "/", "org.freedesktop.DBus.ObjectManager", "GetManagedObjects"])?;
    let objs = v.first().and_then(|d| d.as_array()).and_then(|a| a.first()).and_then(|o| o.as_object()).cloned().unwrap_or_default();
    let mut out = vec![];
    for (path, ifaces) in objs {
        let Some(d) = ifaces.get("org.bluez.Device1") else { continue };
        let p = |k: &str| d[k]["data"].clone();
        let ok_path = path.strip_prefix("/org/bluez/hci").and_then(|r| r.split_once("/dev_")).is_some_and(|(n, a)| n.chars().all(|c| c.is_ascii_digit()) && a.len() == 17 && a.chars().all(|c| c.is_ascii_hexdigit() || c == '_'));
        if !ok_path {
            continue;
        }
        let name: String = p("Alias").as_str().or(p("Name").as_str()).unwrap_or("").chars().filter(|c| !c.is_control()).take(60).collect();
        out.push((path.clone(), name, p("Address").as_str().unwrap_or("").to_string(), p("Paired") == true, p("Connected") == true));
    }
    Ok(out)
}

/// The keyboard layouts the owner set up, and which one is on: ([(code, name)], index).
fn layouts() -> Result<(Vec<(String, String)>, u64), String> {
    let l = bus_json(&["--user", "--json=short", "call", "org.kde.keyboard", "/Layouts", "org.kde.KeyboardLayouts", "getLayoutsList"])?;
    let list: Vec<(String, String)> = l.first().and_then(|d| d.as_array()).and_then(|a| a.first()).and_then(|a| a.as_array()).into_iter().flatten()
        .filter_map(|t| Some((t[0].as_str()?.to_string(), t[2].as_str().unwrap_or("").to_string()))).collect();
    let cur = bus_json(&["--user", "--json=short", "call", "org.kde.keyboard", "/Layouts", "org.kde.KeyboardLayouts", "getLayout"])?;
    let i = cur.first().and_then(|d| d.as_array()).and_then(|a| a.first()).and_then(|x| x.as_u64()).unwrap_or(0);
    Ok((list, i))
}

fn set_layout(i: u64) -> Result<(), String> {
    bus_json(&["--user", "--json=short", "call", "org.kde.keyboard", "/Layouts", "org.kde.KeyboardLayouts", "setLayout", "u", &i.to_string()]).map(|_| ())
}

fn printers() -> Value {
    let out = sh("/usr/bin/lpstat", &["-p", "-d"]).unwrap_or_default();
    let default = out.lines().find_map(|l| l.strip_prefix("system default destination: ")).unwrap_or("").trim().to_string();
    let list: Vec<Value> = out.lines().filter_map(|l| {
        let rest = l.strip_prefix("printer ")?;
        let (name, state) = rest.split_once(' ')?;
        let state = if state.contains("disabled") { "off" } else if state.contains("printing") { "printing" } else { "ready" };
        Some(json!({ "name": name, "state": state, "default": name == default }))
    }).collect();
    json!({ "printers": list })
}

fn updates() -> Result<Value, String> {
    let v: Value = serde_json::from_str(&sh_within("/usr/bin/rpm-ostree", &["status", "--json"], Duration::from_secs(20))?).map_err(|_| "couldn't read the system version")?;
    let deps = v["deployments"].as_array().cloned().unwrap_or_default();
    let booted = deps.iter().find(|d| d["booted"] == true);
    let staged = deps.iter().find(|d| d["staged"] == true);
    Ok(json!({
        "version": booted.and_then(|d| d["version"].as_str()),
        "built": booted.and_then(|d| d["timestamp"].as_u64()),
        "update_ready": staged.and_then(|d| d["version"].as_str()),
        "note": if staged.is_some() { "an update is downloaded: it's used after the next restart" } else { "no update waiting; Settings > System checks for new ones" },
    }))
}


// ------------------------------------------------------------ everyday (wave 2, D104)

/// Media players on the session bus (MPRIS), the playing one first.
fn players() -> Vec<String> {
    let names = bus_json(&["--user", "--json=short", "call", "org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus", "ListNames"]).unwrap_or_default();
    let mut list: Vec<String> = names.first().and_then(|d| d.as_array()).and_then(|a| a.first()).and_then(|a| a.as_array()).into_iter().flatten()
        .filter_map(|n| n.as_str()).filter(|n| n.starts_with("org.mpris.MediaPlayer2.") && n.len() < 120 && n.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c)))
        .map(String::from).collect();
    list.sort_by_key(|p| player_status(p).as_deref() != Some("Playing"));
    list
}

fn player_status(p: &str) -> Option<String> {
    bus_json(&["--user", "--json=short", "get-property", p, "/org/mpris/MediaPlayer2", "org.mpris.MediaPlayer2.Player", "PlaybackStatus"]).ok()?.first()?.as_str().map(String::from)
}

fn now_playing() -> Value {
    let Some(p) = players().into_iter().next() else { return json!({ "playing": false, "note": "nothing is playing (no media player is open)" }) };
    let meta = bus_json(&["--user", "--json=short", "get-property", &p, "/org/mpris/MediaPlayer2", "org.mpris.MediaPlayer2.Player", "Metadata"]).unwrap_or_default();
    let m = meta.first().cloned().unwrap_or(Value::Null);
    let text = |k: &str| -> String {
        let v = &m[k]["data"];
        let t = v.as_str().map(String::from).or_else(|| v.as_array().map(|a| a.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join(", "))).unwrap_or_default();
        t.chars().filter(|c| !c.is_control()).take(120).collect()
    };
    let app = bus_json(&["--user", "--json=short", "get-property", &p, "/org/mpris/MediaPlayer2", "org.mpris.MediaPlayer2", "Identity"]).ok().and_then(|v| v.first().and_then(|x| x.as_str()).map(|s| s.chars().take(60).collect::<String>())).unwrap_or_default();
    json!({ "playing": player_status(&p).as_deref() == Some("Playing"), "status": player_status(&p), "title": text("xesam:title"), "artist": text("xesam:artist"), "app": app })
}

/// A program that leaves a helper running (wl-copy keeps serving the clipboard; a browser
/// keeps going): started with its output nowhere, so nothing waits on it.
fn spawn_detached(prog: &str, args: &[&str], stdin: Option<&[u8]>) -> Result<(), String> {
    use std::io::Write;
    use std::process::{Command, Stdio};
    let mut c = Command::new(prog).args(args).stdin(if stdin.is_some() { Stdio::piped() } else { Stdio::null() }).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|e| format!("can't run {prog}: {e}"))?;
    if let (Some(data), Some(mut w)) = (stdin, c.stdin.take()) {
        w.write_all(data).map_err(|e| e.to_string())?;
    }
    // the first process exits once its helper is running; never wait more than a few seconds
    for _ in 0..100 {
        if let Ok(Some(st)) = c.try_wait() {
            return if st.success() { Ok(()) } else { Err(format!("{} failed", prog.rsplit('/').next().unwrap_or(prog))) };
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    Ok(())
}

/// Does every address this name resolves to belong to the public internet?
pub fn resolves_public(name: &str) -> bool {
    use std::net::{IpAddr, ToSocketAddrs};
    let Ok(addrs) = (name, 443).to_socket_addrs() else { return false };
    let addrs: Vec<IpAddr> = addrs.map(|a| a.ip()).collect();
    !addrs.is_empty() && addrs.iter().all(|ip| match ip {
        IpAddr::V4(v) => {
            let o = v.octets();
            !(v.is_loopback() || v.is_private() || v.is_link_local() || v.is_unspecified() || v.is_broadcast() || v.is_multicast() || o[0] == 0 || (o[0] == 100 && (64..128).contains(&o[1])) || (o[0] == 198 && (18..20).contains(&o[1])))
        }
        IpAddr::V6(v) => {
            let s = v.segments();
            let mapped = v.to_ipv4_mapped().is_some_and(|m| m.is_loopback() || m.is_private() || m.is_link_local() || m.is_unspecified());
            !(v.is_loopback() || v.is_unspecified() || v.is_multicast() || (s[0] & 0xfe00) == 0xfc00 || (s[0] & 0xffc0) == 0xfe80 || mapped)
        }
    })
}

/// Opened by the desktop as the owner's own click would be, in its own job (nothing of it
/// stays attached to the broker). `$` is doubled for systemd.
fn open_detached(target: &str) -> Result<(), String> {
    let t = target.replace('$', "$$");
    sh("/usr/bin/systemd-run", &["--user", "--quiet", "--collect", "--", "/usr/bin/xdg-open", &t]).map(|_| ())
}

/// What files.open may open: documents, pictures, sound and video only. Anything else
/// (launchers, scripts, programs, packages, web pages that run code) is refused: an
/// allow-list, so a new kind of runnable file isn't let through by default (security review).
const OPENS: [&str; 44] = [
    "pdf", "txt", "md", "rtf", "csv", "tsv", "log", "epub",
    "odt", "ods", "odp", "odg", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "heic", "avif",
    "mp3", "m4a", "ogg", "oga", "opus", "flac", "wav",
    "mp4", "m4v", "mkv", "webm", "mov", "avi",
    "zip", "tar", "7z",
];

/// Installed apps from their .desktop files: (id, name, about), hidden ones left out.
fn installed_apps() -> Vec<(String, String, String)> {
    let home = std::env::var("HOME").unwrap_or_default();
    let dirs = [
        "/usr/share/applications".to_string(),
        "/var/lib/flatpak/exports/share/applications".to_string(),
        format!("{home}/.local/share/applications"),
        format!("{home}/.local/share/flatpak/exports/share/applications"),
    ];
    let mut out: Vec<(String, String, String)> = vec![];
    for d in dirs {
        for e in std::fs::read_dir(&d).into_iter().flatten().flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let Some(id) = name.strip_suffix(".desktop") else { continue };
            if !id.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c)) || out.iter().any(|(x, ..)| x == id) {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(e.path()) else { continue };
            let entry = text.split("\n[").next().unwrap_or("");
            let field = |k: &str| entry.lines().find_map(|l| l.strip_prefix(&format!("{k}="))).unwrap_or("").chars().filter(|c| !c.is_control()).take(100).collect::<String>();
            if field("NoDisplay") == "true" || field("Hidden") == "true" || field("Type") != "Application" || field("Name").is_empty() {
                continue;
            }
            out.push((id.to_string(), field("Name"), field("Comment")));
        }
    }
    out
}

/// SIOS's reminders waiting now: (timer, minutes left, text).
fn reminders() -> Vec<Value> {
    let out = sh("/usr/bin/systemctl", &["--user", "list-timers", "sios-remind-*", "--all", "--no-legend", "--output=json"]).unwrap_or_default();
    let list: Value = serde_json::from_str(&out).unwrap_or(json!([]));
    let now_us = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_micros() as u64).unwrap_or(0);
    list.as_array().into_iter().flatten().filter_map(|t| {
        let unit = t["unit"].as_str()?.strip_suffix(".timer")?.to_string();
        let ok = unit.strip_prefix("sios-remind-").is_some_and(|h| h.len() == 10 && h.chars().all(|c| c.is_ascii_hexdigit()));
        if !ok {
            return None;
        }
        let next = t["next"].as_u64().unwrap_or(0);
        // its text is the notification's body: an argument of its service's command
        let exec = sh("/usr/bin/systemctl", &["--user", "show", &format!("{unit}.service"), "-p", "ExecStart", "--value"]).unwrap_or_default();
        // "... Notify SIOS 0 sios-logo Reminder <text> [] {} 0 ; ignore_errors=no ..."
        let text: String = exec.split(" Reminder ").nth(1).and_then(|r| r.split(" [] {} 0").next()).unwrap_or("").trim().chars().filter(|c| !c.is_control()).take(200).collect();
        Some(json!({ "id": unit, "in_minutes": next.saturating_sub(now_us) / 60_000_000, "text": text }))
    }).collect()
}

// ------------------------------------------------------------ the tools

/// Carry out a system tool for real. None: not one of these (the caller decides).
pub fn run(tool: &str, args: &Value, root: &Path) -> Option<Result<Done, String>> {
    let s = |k: &str| args.get(k).and_then(|v| v.as_str()).unwrap_or("");
    let level = || args.get("level").and_then(|v| v.as_i64()).filter(|l| (0..=100).contains(l)).ok_or_else(|| "level is 0 to 100".to_string());
    let on = || args.get("on").and_then(|v| v.as_bool()).ok_or_else(|| "missing \"on\" (true or false)".to_string());
    Some(match tool {
        "system.state" => ok(state()),
        "network.list" => {
            let mut v = networks();
            let wifi: Vec<Value> = sh("/usr/bin/nmcli", &["-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "device", "wifi", "list"])
                .unwrap_or_default()
                .lines()
                .filter_map(|l| {
                    let f: Vec<&str> = l.splitn(4, ':').collect();
                    (f.len() == 4 && !f[1].is_empty()).then(|| json!({ "ssid": f[1], "connected": f[0] == "*", "signal": f[2].parse::<i64>().unwrap_or(0), "secured": !f[3].is_empty() }))
                })
                .collect();
            v["wifi"] = json!(wifi);
            ok(v)
        }
        "settings.set_volume" => (|| {
            let (want, was) = (level()?, volume()?);
            sh("/usr/bin/wpctl", &["set-volume", "@DEFAULT_AUDIO_SINK@", &format!("{:.2}", want as f64 / 100.0)])?;
            Ok(Done { result: json!({ "volume": volume()?, "was": was }), undo: Some(json!({ "level": was })) })
        })(),
        "settings.set_brightness" => (|| {
            let want = level()?;
            let (path, cur, max) = brightness()?;
            let raw = (want * max + 50) / 100;
            sh("/usr/bin/busctl", &["--user", "call", "org.kde.ScreenBrightness", &path, "org.kde.ScreenBrightness.Display", "SetBrightness", "iu", &raw.to_string(), "0"])?;
            Ok(Done { result: json!({ "brightness": want, "was": cur * 100 / max }), undo: Some(json!({ "level": cur * 100 / max })) })
        })(),
        "settings.set_theme" => (|| {
            let want = s("theme");
            if want != "light" && want != "dark" {
                return Err("theme is light or dark".to_string());
            }
            let was = theme()?;
            sh_slow("/usr/bin/plasma-apply-lookandfeel", &["-a", if want == "dark" { "org.sios.desktop.dark" } else { "org.sios.desktop" }])?;
            Ok(Done { result: json!({ "theme": theme()?, "was": was }), undo: Some(json!({ "theme": was })) })
        })(),
        "settings.set_wallpaper" => (|| {
            let want = s("name");
            let dir = WALLPAPERS.iter().find(|(n, _)| *n == want).map(|(_, d)| *d).ok_or("wallpapers are dusk, lake or tunnel")?;
            let was = wallpaper();
            sh_slow("/usr/bin/plasma-apply-wallpaperimage", &[&format!("/usr/share/wallpapers/{dir}")])?;
            Ok(Done { result: json!({ "wallpaper": want, "was": was }), undo: was.map(|w| json!({ "name": w })) })
        })(),
        "system.notify" => (|| {
            let text: String = s("text").chars().take(200).collect();
            sh("/usr/bin/gdbus", &["call", "--session", "--dest", "org.freedesktop.Notifications", "--object-path", "/org/freedesktop/Notifications", "--method", "org.freedesktop.Notifications.Notify", "SIOS", "0", "sios-logo", "SIOS", &text, "[]", "{}", "6000"])?;
            ok(json!({ "shown": text }))
        })(),
        "system.lock" => (|| {
            sh("/usr/bin/gdbus", &["call", "--session", "--dest", "org.freedesktop.ScreenSaver", "--object-path", "/ScreenSaver", "--method", "org.freedesktop.ScreenSaver.Lock"])?;
            ok(json!({ "locked": true }))
        })(),
        "network.wifi_power" => (|| {
            let (want, was) = (on()?, wifi_on()?);
            sh("/usr/bin/nmcli", &["radio", "wifi", if want { "on" } else { "off" }])?;
            Ok(Done { result: json!({ "wifi": wifi_on()?, "was": was }), undo: Some(json!({ "on": was })) })
        })(),
        "network.connect_wifi" => (|| {
            let ssid = s("ssid");
            if ssid.is_empty() || ssid.len() > 64 || ssid.starts_with('-') {
                return Err("that isn't a network name".to_string());
            }
            let was = wifi_connection();
            // a network it knows or an open one; passwords are never a model's argument
            sh("/usr/bin/nmcli", &["device", "wifi", "connect", ssid])?;
            Ok(Done { result: json!({ "connected": wifi_connection(), "was": was }), undo: was.map(|w| json!({ "ssid": w })) })
        })(),
        "apps.open" => (|| {
            let app = s("app");
            // SIOS's own names, or any installed app's id from apps.search
            let id = match APPS.iter().find(|(n, _)| *n == app) {
                Some((_, d)) => d.to_string(),
                None => installed_apps().into_iter().find(|(id, ..)| id == app).map(|(id, ..)| id).ok_or_else(|| format!("no app called {app} (apps.search finds installed apps)"))?,
            };
            let id = id.as_str();
            sh("/usr/bin/kstart", &["--application", id])?;
            ok(json!({ "opened": app }))
        })(),
        // Only ever a folder is opened, in the file manager. Opening a file with its default
        // handler would run it if an AI had written a launcher (.desktop) or a script, so a
        // preview shows the file's folder instead and the owner opens the file themselves.
        "files.show" | "files.preview" => (|| {
            let r = crate::fsguard::resolve(root, s("path")).map_err(|e| e.to_string())?;
            if !r.real.exists() {
                return Err(format!("{} doesn't exist", r.rel));
            }
            let folder = if r.real.is_dir() { r.real.clone() } else { r.real.parent().map(|p| p.to_path_buf()).ok_or("no folder")? };
            if tool == "files.show" && !r.real.is_dir() {
                return Err(format!("{} is a file; files.show opens folders (files.preview shows where a file is)", r.rel));
            }
            let meta = std::fs::symlink_metadata(&folder).map_err(|e| e.to_string())?;
            if !meta.is_dir() {
                return Err("that isn't a folder".into());
            }
            sh("/usr/bin/kioclient", &["exec", &file_url(&folder)])?;
            ok(json!({ "shown": r.rel, "opened_folder": folder.strip_prefix(root.canonicalize().unwrap_or(root.to_path_buf())).map(|p| p.display().to_string()).unwrap_or_default() }))
        })(),
        // a notification later, from a timer the user's systemd keeps (survives capd restarts);
        // undo cancels it. Text is escaped for systemd's $ expansion.
        // undo only (not a tool any AI can call): cancel the reminder this call made
        "system.remind.cancel" => (|| {
            let unit = s("cancel");
            let ok_name = unit.strip_prefix("sios-remind-").is_some_and(|h| h.len() == 10 && h.chars().all(|c| c.is_ascii_hexdigit()));
            if !ok_name {
                return Err("not a SIOS reminder".to_string());
            }
            sh("/usr/bin/systemctl", &["--user", "stop", &format!("{unit}.timer")])?;
            ok(json!({ "cancelled": unit }))
        })(),
        "system.remind" => (|| {
            let minutes = args.get("minutes").and_then(|v| v.as_i64()).filter(|m| (1..=1440).contains(m)).ok_or("minutes is 1 to 1440")?;
            let text: String = s("text").chars().filter(|c| !c.is_control()).take(200).collect();
            if text.trim().is_empty() {
                return Err("what should the reminder say?".to_string());
            }
            let unit = format!("sios-remind-{}", crate::state::random_hex(5));
            // systemd-run keeps % as is but expands $ (checked on the VM): "$$" is a plain "$"
            let body = text.replace('$', "$$");
            sh(
                "/usr/bin/systemd-run",
                &["--user", "--quiet", "--collect", &format!("--unit={unit}"), &format!("--on-active={minutes}m"), "--timer-property=AccuracySec=1s", "--",
                  "/usr/bin/gdbus", "call", "--session", "--dest", "org.freedesktop.Notifications", "--object-path", "/org/freedesktop/Notifications",
                  "--method", "org.freedesktop.Notifications.Notify", "SIOS", "0", "sios-logo", "Reminder", &body, "[]", "{}", "0"],
            )?;
            Ok(Done { result: json!({ "reminder": text, "in_minutes": minutes }), undo: Some(json!({ "cancel": unit, "__tool": "system.remind.cancel" })) })
        })(),
        // Plasma's Do Not Disturb: "until" a date in plasmanotifyrc; --notify applies it live
        "settings.dnd" => (|| {
            let (want, was) = (on()?, dnd_on());
            if want {
                sh("/usr/bin/kwriteconfig6", &["--notify", "--file", "plasmanotifyrc", "--group", "DoNotDisturb", "--key", "Until", "2099,12,31,23,59,0"])?;
            } else {
                sh("/usr/bin/kwriteconfig6", &["--notify", "--file", "plasmanotifyrc", "--group", "DoNotDisturb", "--key", "Until", "--delete"])?;
            }
            Ok(Done { result: json!({ "do_not_disturb": dnd_on(), "was": was }), undo: Some(json!({ "on": was })) })
        })(),
        "network.bluetooth_power" => (|| {
            let want = on()?;
            let was = bluetooth_on().ok_or("this computer has no Bluetooth")?;
            sh("/usr/bin/busctl", &["--system", "set-property", "org.bluez", "/org/bluez/hci0", "org.bluez.Adapter1", "Powered", "b", if want { "true" } else { "false" }])?;
            Ok(Done { result: json!({ "bluetooth": bluetooth_on(), "was": was }), undo: Some(json!({ "on": was })) })
        })(),
        // From Flathub, for this user. It can take minutes, so it runs as its own
        // background job (never inside the broker) and a notification says when it
        // finished. Always asks the owner first (irreversible, tools.rs).
        "apps.install" | "apps.remove" => (|| {
            // a short name for a common app, or its full Flathub id
            let asked = s("app").to_lowercase();
            let id = KNOWN_APPS.iter().find(|(n, _)| *n == asked).map(|(_, id)| *id).unwrap_or(s("app"));
            let looks_like_app = id.len() <= 128
                && id.split('.').count() >= 3
                && id.split('.').all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'))
                && id.chars().next().is_some_and(|c| c.is_ascii_alphabetic());
            if !looks_like_app {
                return Err("an app is named by its Flathub id, like org.gnome.Calculator".to_string());
            }
            let installing = tool == "apps.install";
            let unit = format!("sios-{}-{}", if installing { "install" } else { "remove" }, crate::state::random_hex(5));
            let done_note = format!("{} {id} finished. Open the Store to see it.", if installing { "Installing" } else { "Removing" });
            let notify = format!(
                "ExecStopPost=/usr/bin/gdbus call --session --dest org.freedesktop.Notifications --object-path /org/freedesktop/Notifications --method org.freedesktop.Notifications.Notify SIOS 0 sios-logo SIOS \"{}\" [] {{}} 6000",
                done_note.replace('$', "$$")
            );
            let mut cmd = vec!["--user", "--quiet", "--collect", "--unit", unit.as_str(), "--property", notify.as_str(), "--", "/usr/bin/flatpak"];
            if installing {
                cmd.extend(["install", "--user", "-y", "--noninteractive", "flathub", id]);
            } else {
                cmd.extend(["uninstall", "--user", "-y", "--noninteractive", id]);
            }
            sh("/usr/bin/systemd-run", &cmd)?;
            ok(json!({ if installing { "installing" } else { "removing" }: id, "job": unit, "note": "it runs in the background; a notification says when it's done" }))
        })(),
        // ---- everyday (wave 2, D104)
        "media.now_playing" => ok(now_playing()),
        "media.control" => (|| {
            let action = s("action");
            let method = match action {
                "play" => "Play",
                "pause" => "Pause",
                "toggle" => "PlayPause",
                "next" => "Next",
                "previous" => "Previous",
                _ => return Err("the action is play, pause, toggle, next or previous".to_string()),
            };
            let p = players().into_iter().next().ok_or("no media player is open")?;
            let was = player_status(&p);
            sh("/usr/bin/busctl", &["--user", "call", &p, "/org/mpris/MediaPlayer2", "org.mpris.MediaPlayer2.Player", method])?;
            let undo = match (action, was.as_deref()) {
                ("play", Some("Paused")) => Some(json!({ "action": "pause" })),
                ("pause", Some("Playing")) => Some(json!({ "action": "play" })),
                ("toggle", Some("Playing")) => Some(json!({ "action": "play" })),
                ("toggle", Some("Paused")) => Some(json!({ "action": "pause" })),
                _ => None,
            };
            Ok(Done { result: json!({ "done": action, "was": was }), undo })
        })(),
        // the owner's clipboard can hold anything (a password just copied): reading it always
        // asks (tools.rs), and its text only ever goes in the reply (brain-d)
        "clipboard.read" => (|| {
            let o = exec::run_with("/usr/bin/wl-paste", &["--no-newline", "--type", "text/plain"], &[], None, Duration::from_secs(5), 20_000)?;
            let text: String = String::from_utf8_lossy(&o.stdout).chars().filter(|c| !c.is_control() || *c == '\n' || *c == '\t').take(10_000).collect();
            ok(json!({ "text": text, "cut": o.stdout.len() >= 20_000 }))
        })(),
        "clipboard.write" => (|| {
            let text: String = s("text").chars().take(100_000).collect();
            if text.is_empty() {
                return Err("what should go on the clipboard?".to_string());
            }
            spawn_detached("/usr/bin/wl-copy", &["--type", "text/plain"], Some(text.as_bytes()))?;
            ok(json!({ "copied_chars": text.chars().count() }))
        })(),
        // a screenshot saved for the owner; the model never sees it (core rule 7)
        "screen.capture" => (|| {
            let window = match s("what") {
                "" | "screen" => false,
                "window" => true,
                _ => return Err("what is screen or window".to_string()),
            };
            let dir = root.join("Pictures/Screenshots");
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let stamp = sh("/usr/bin/date", &["+%Y-%m-%d %H-%M-%S"]).unwrap_or_else(|_| crate::state::random_hex(4));
            let file = dir.join(format!("Screenshot {stamp}.png"));
            let f = file.to_string_lossy().to_string();
            sh_within("/usr/bin/spectacle", &["-b", "-n", if window { "-a" } else { "-f" }, "-o", &f], Duration::from_secs(20))?;
            if !file.exists() {
                return Err("the screenshot wasn't saved".into());
            }
            ok(json!({ "saved": format!("Pictures/Screenshots/Screenshot {stamp}.png") }))
        })(),
        // a web page in the browser: https only, a plain address; it always asks (tools.rs)
        "web.open" => (|| {
            let url = s("url").trim();
            let host = url.strip_prefix("https://").and_then(|r| r.split(['/', '?', '#']).next()).unwrap_or("");
            let plain = url.len() <= 2000 && !url.chars().any(|c| c.is_whitespace() || c.is_control() || "\"'<>\\`".contains(c));
            if host.is_empty() || !plain || host.contains('@') || !host.chars().all(|c| c.is_ascii_alphanumeric() || ".-:".contains(c)) {
                return Err("only a plain https:// address can be opened".to_string());
            }
            // a site on the internet, by name: never this computer or the local network (a
            // printer's or router's admin page), and never a bare IP address
            let name = host.split(':').next().unwrap_or("").trim_end_matches('.').to_lowercase();
            let local = name == "localhost" || name.ends_with(".localhost") || name.ends_with(".local") || name.ends_with(".lan") || name.ends_with(".internal") || name.ends_with(".home.arpa") || !name.contains('.');
            // a name's last part has a letter and isn't a hex number (0x7f.0.0.1 is 127.0.0.1 to a browser)
            let last = name.rsplit('.').next().unwrap_or("");
            let ip = host.starts_with('[') || !last.chars().any(|c| c.is_ascii_alphabetic()) || last.starts_with("0x") || name.split('.').any(|p| p.starts_with("0x"));
            if local || ip {
                return Err("only a site on the internet can be opened by name, not this computer, the local network or an IP address".to_string());
            }
            // and the name must lead to the internet: one that resolves to this computer or the
            // local network (localtest.me, nip.io tricks) is refused too (security review)
            if !resolves_public(&name) {
                return Err(format!("{name} leads to this computer or the local network (or doesn't resolve), so SIOS won't open it"));
            }
            open_detached(url)?;
            ok(json!({ "opened": url }))
        })(),
        // a file with its usual app, as the owner's double-click would; never anything that
        // runs (launchers, scripts, programs, packages). It always asks (tools.rs).
        "files.open" => (|| {
            let r = crate::fsguard::resolve(root, s("path")).map_err(|e| e.to_string())?;
            let meta = std::fs::symlink_metadata(&r.real).map_err(|_| format!("{} doesn't exist", r.rel))?;
            if !meta.is_file() {
                return Err(format!("{} isn't a file (files.show opens folders)", r.rel));
            }
            use std::os::unix::fs::PermissionsExt;
            let ext = r.real.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
            if meta.permissions().mode() & 0o111 != 0 || !OPENS.contains(&ext.as_str()) {
                return Err(format!("{} isn't a document, picture, sound or video SIOS opens (it could run something), so open it yourself if you trust it", r.rel));
            }
            open_detached(&file_url(&r.real))?;
            ok(json!({ "opened": r.rel }))
        })(),
        "apps.search" => (|| {
            let q = s("query").to_lowercase();
            if q.trim().is_empty() {
                return Err("what app are you looking for?".to_string());
            }
            let words: Vec<&str> = q.split_whitespace().collect();
            let mut hits: Vec<(usize, Value)> = installed_apps().into_iter().filter_map(|(id, name, about)| {
                let hay = format!("{} {} {}", name.to_lowercase(), about.to_lowercase(), id.to_lowercase());
                let n = words.iter().filter(|w| hay.contains(*w)).count();
                (n > 0).then(|| (n * 10 + usize::from(name.to_lowercase().starts_with(words[0])) * 5, json!({ "app": id, "name": name, "about": about })))
            }).collect();
            hits.sort_by(|a, b| b.0.cmp(&a.0));
            ok(json!({ "apps": hits.into_iter().take(10).map(|(_, v)| v).collect::<Vec<_>>() }))
        })(),
        "reminders.list" => ok(json!({ "reminders": reminders() })),
        "reminders.cancel" => (|| {
            let unit = s("id");
            let ok_name = unit.strip_prefix("sios-remind-").is_some_and(|h| h.len() == 10 && h.chars().all(|c| c.is_ascii_hexdigit()));
            if !ok_name {
                return Err("not a SIOS reminder (ids come from reminders.list)".to_string());
            }
            sh("/usr/bin/systemctl", &["--user", "stop", &format!("{unit}.timer")])?;
            ok(json!({ "cancelled": unit }))
        })(),
        // ---- devices (wave 1, D104)
        "system.battery" => ok(battery()),
        "power.profile" => (|| {
            let want = s("profile");
            if !["power-saver", "balanced", "performance"].contains(&want) {
                return Err("the profile is power-saver, balanced or performance".to_string());
            }
            let was = power_profile()?;
            sh("/usr/bin/busctl", &["--system", "set-property", PP[0], PP[1], PP[2], "ActiveProfile", "s", want])?;
            Ok(Done { result: json!({ "power_profile": power_profile()?, "was": was }), undo: Some(json!({ "profile": was })) })
        })(),
        "settings.night_light" => (|| {
            let (want, was) = (on()?, night_light_on());
            sh("/usr/bin/kwriteconfig6", &["--notify", "--file", "kwinrc", "--group", "NightColor", "--key", "Active", "--type", "bool", if want { "true" } else { "false" }])?;
            kwin_reconfigure();
            Ok(Done { result: json!({ "night_light": night_light_on(), "was": was }), undo: Some(json!({ "on": was })) })
        })(),
        "settings.display_scale" => (|| {
            // the usual steps, or (to undo) whatever it was before, within reason
            let want = args.get("scale").and_then(|v| v.as_f64()).filter(|x| SCALES.iter().any(|s| (s - x).abs() < 0.001) || (args.get("screen").is_some() && (0.5..=4.0).contains(x))).ok_or("the scale is 1, 1.25, 1.5, 1.75, 2, 2.5 or 3")?;
            let list = screens()?;
            let (name, was) = match s("screen") {
                "" => list.first().cloned().ok_or("no screen is on")?,
                n => list.iter().find(|(x, _)| x == n).cloned().ok_or_else(|| format!("no screen called {n}"))?,
            };
            let num = |x: f64| { let t = format!("{x:.2}"); t.trim_end_matches('0').trim_end_matches('.').to_string() };
            sh_within("/usr/bin/kscreen-doctor", &[&format!("output.{name}.scale.{}", num(want))], Duration::from_secs(15))?;
            Ok(Done { result: json!({ "screen": name, "scale": want, "was": was }), undo: Some(json!({ "scale": was, "screen": name })) })
        })(),
        "audio.outputs" => audio_devices().map(|v| Done { result: v, undo: None }),
        "audio.set_output" => (|| {
            let want = s("output");
            let devs = audio_devices()?;
            let list = devs["outputs"].as_array().cloned().unwrap_or_default();
            // by its id or its name as shown; only one PipeWire lists
            let hit = list.iter().find(|d| d["id"] == want || d["name"].as_str().is_some_and(|n| n.eq_ignore_ascii_case(want))).ok_or_else(|| format!("no sound output called {want}"))?;
            let id = hit["id"].as_str().unwrap_or("").to_string();
            let was = list.iter().find(|d| d["default"] == true).and_then(|d| d["id"].as_str()).map(String::from);
            sh("/usr/bin/pactl", &["set-default-sink", &id])?;
            Ok(Done { result: json!({ "output": hit["name"], "was": was }), undo: was.map(|w| json!({ "output": w })) })
        })(),
        "audio.mic_mute" => (|| {
            let (want, was) = (on()?, mic_muted()?);
            sh("/usr/bin/pactl", &["set-source-mute", "@DEFAULT_SOURCE@", if want { "1" } else { "0" }])?;
            Ok(Done { result: json!({ "mic_muted": mic_muted()?, "was": was }), undo: Some(json!({ "on": was })) })
        })(),
        "bluetooth.devices" => (|| {
            if bluetooth_on().is_none() {
                return ok(json!({ "devices": [], "note": "this computer has no Bluetooth" }));
            }
            let d: Vec<Value> = bt_devices()?.into_iter().map(|(_, name, addr, paired, conn)| json!({ "name": name, "address": addr, "paired": paired, "connected": conn })).collect();
            ok(json!({ "bluetooth_on": bluetooth_on(), "devices": d }))
        })(),
        // only devices the owner already paired (pairing is the owner's, in Settings)
        "bluetooth.connect" => (|| {
            let (want, who) = (on()?, s("device"));
            let devs = bt_devices()?;
            let (path, name, _, _, was) = devs.into_iter().find(|(_, n, a, p, _)| *p && (n.eq_ignore_ascii_case(who) || a.eq_ignore_ascii_case(who))).ok_or_else(|| format!("no paired device called {who}"))?;
            sh_within("/usr/bin/busctl", &["--system", "call", "org.bluez", &path, "org.bluez.Device1", if want { "Connect" } else { "Disconnect" }], Duration::from_secs(25))?;
            Ok(Done { result: json!({ "device": name, "connected": want, "was": was }), undo: Some(json!({ "device": name, "on": was })) })
        })(),
        "keyboard.layout" => (|| {
            let want = s("layout");
            let (list, cur) = layouts()?;
            let i = list.iter().position(|(c, n)| c.eq_ignore_ascii_case(want) || n.eq_ignore_ascii_case(want)).ok_or_else(|| format!("{want} isn't one of your layouts ({}); add layouts in Settings > Keyboard", list.iter().map(|(c, _)| c.as_str()).collect::<Vec<_>>().join(", ")))?;
            set_layout(i as u64)?;
            let was = list.get(cur as usize).map(|(c, _)| c.clone());
            Ok(Done { result: json!({ "layout": list[i].0, "name": list[i].1, "was": was }), undo: was.map(|w| json!({ "layout": w })) })
        })(),
        "printers.list" => ok(printers()),
        "system.update_check" => updates().map(|v| Done { result: v, undo: None }),
        // windows, through KWin (kwin.rs); SIOS's own windows are refused inside the script
        "apps.list" | "apps.focus" | "apps.close" | "apps.arrange" => (|| {
            let (what, a) = crate::kwin::args(tool, args)?;
            ok(crate::kwin::ask(what, a)?)
        })(),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn other_tools_are_left_alone_and_unconnected_ones_never_pretend() {
        let d = tempfile::tempdir().unwrap();
        assert!(run("files.read", &json!({}), d.path()).is_none());
        assert!(run("memory.save", &json!({}), d.path()).is_none());
        // bad names stop before anything runs
        assert!(run("apps.install", &json!({ "app": "--from=evil" }), d.path()).unwrap().unwrap_err().contains("Flathub id"));
        assert!(run("apps.install", &json!({ "app": "org.gnome" }), d.path()).unwrap().is_err());
        assert!(KNOWN_APPS.iter().all(|(_, id)| id.split('.').count() >= 3), "known names map to full ids");
        assert!(run("apps.remove", &json!({ "app": "org.x.y z" }), d.path()).unwrap().is_err());
        assert!(run("system.remind", &json!({ "minutes": 0, "text": "x" }), d.path()).unwrap().unwrap_err().contains("1 to 1440"));
        assert!(run("system.remind.cancel", &json!({ "cancel": "sshd" }), d.path()).unwrap().unwrap_err().contains("not a SIOS reminder"));
        // a reminder call can't cancel anything: it needs minutes and text
        assert!(run("system.remind", &json!({ "cancel": "sios-remind-0123456789" }), d.path()).unwrap().unwrap_err().contains("1 to 1440"));
        assert!(crate::tools::spec("system.remind.cancel").is_none(), "undo-only, never a tool");
        // bad arguments stop before anything runs
        assert!(run("settings.set_volume", &json!({ "level": 140 }), d.path()).unwrap().unwrap_err().contains("0 to 100"));
        assert!(run("settings.set_theme", &json!({ "theme": "neon" }), d.path()).unwrap().is_err());
        assert!(run("network.connect_wifi", &json!({ "ssid": "--help" }), d.path()).unwrap().is_err());
        assert!(run("files.show", &json!({ "path": "../etc" }), d.path()).unwrap().is_err());
        // a file is never opened by files.show (a launcher or script would run)
        std::fs::write(d.path().join("evil.desktop"), "[Desktop Entry]\nExec=sh -c x").unwrap();
        assert!(run("files.show", &json!({ "path": "evil.desktop" }), d.path()).unwrap().unwrap_err().contains("opens folders"));
        // names that a URL parser would read as another place stay one plain path
        assert_eq!(file_url(Path::new("/home/r/a%2Fevil.desktop")), "file:///home/r/a%252Fevil.desktop");
        assert_eq!(file_url(Path::new("/home/r/x#y?z w")), "file:///home/r/x%23y%3Fz%20w");
        // wave 1: bad arguments stop before anything runs
        assert!(run("power.profile", &json!({ "profile": "turbo" }), d.path()).unwrap().unwrap_err().contains("power-saver"));
        assert!(run("settings.display_scale", &json!({ "scale": 1.3 }), d.path()).unwrap().unwrap_err().contains("1.25"));
        assert!(run("settings.night_light", &json!({}), d.path()).unwrap().unwrap_err().contains("on"));
        assert!(run("audio.mic_mute", &json!({ "on": "yes" }), d.path()).unwrap().is_err());
        assert!(run("bluetooth.connect", &json!({ "device": "x" }), d.path()).unwrap().unwrap_err().contains("on"));
        // wave 2: bad arguments stop before anything runs
        assert!(run("media.control", &json!({ "action": "rewind" }), d.path()).unwrap().is_err());
        for bad in ["http://x.com", "https://", "javascript:alert(1)", "https://a b.com", "https://user@evil.com/", "file:///etc/passwd", "https://x.com/\"$(id)\""] {
            assert!(run("web.open", &json!({ "url": bad }), d.path()).unwrap().is_err(), "{bad}");
        }
        std::fs::write(d.path().join("run.sh"), "x").unwrap();
        std::fs::write(d.path().join("app.desktop"), "x").unwrap();
        assert!(run("files.open", &json!({ "path": "run.sh" }), d.path()).unwrap().unwrap_err().contains("run something"));
        assert!(run("files.open", &json!({ "path": "app.desktop" }), d.path()).unwrap().unwrap_err().contains("run something"));
        for f in ["page.html", "logo.svg", "x.ps1", "y.vbs", "z.command", "w.url", "noext"] {
            std::fs::write(d.path().join(f), "x").unwrap();
            assert!(run("files.open", &json!({ "path": f }), d.path()).unwrap().unwrap_err().contains("run something"), "{f}: only documents, pictures, sound and video");
        }
        for bad in ["https://localhost/", "https://127.0.0.1/", "https://192.168.1.1/admin", "https://printer.local/", "https://router/", "https://[::1]/", "https://10.0.0.1:631/", "https://0x7f.0.0.1/", "https://0x7f000001/", "https://1.1.1.1/"] {
            assert!(run("web.open", &json!({ "url": bad }), d.path()).unwrap().is_err(), "{bad}");
        }
        std::fs::write(d.path().join("notes.bin2"), "x").unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(d.path().join("notes.bin2"), std::fs::Permissions::from_mode(0o755)).unwrap();
        assert!(run("files.open", &json!({ "path": "notes.bin2" }), d.path()).unwrap().unwrap_err().contains("run something"), "anything executable");
        assert!(run("reminders.cancel", &json!({ "id": "sshd" }), d.path()).unwrap().unwrap_err().contains("not a SIOS reminder"));
        assert!(run("screen.capture", &json!({ "what": "everything" }), d.path()).unwrap().is_err());
    }
}
