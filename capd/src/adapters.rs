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
            let id = APPS.iter().find(|(n, _)| *n == app).map(|(_, d)| *d).ok_or_else(|| format!("no app called {app}"))?;
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
        // the rest of the system tools arrive in M9; never pretend they ran
        "settings.dnd" | "network.bluetooth_power" | "apps.focus" | "apps.close" | "apps.arrange" | "apps.list" | "system.remind" | "apps.install" | "apps.remove" => {
            Err(format!("{tool} isn't connected on this computer yet"))
        }
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
        assert!(run("settings.dnd", &json!({ "on": true }), d.path()).unwrap().is_err());
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
    }
}
