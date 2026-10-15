//! Windows on the desktop, through KWin (A3, D68): list, focus, close and put
//! two side by side. KWin runs small fixed scripts (written here, with every
//! value JSON-escaped) and answers over the session bus to capd's own endpoint
//! `org.sios.Capd1 /Kwin Result(nonce, json)`. Only an answer carrying the
//! nonce of a question capd just asked is accepted, so no other program can
//! feed it a fake window list. SIOS's own windows are never closed, focused or
//! moved by an AI.

use serde_json::{json, Value};

/// Windows the AI may never touch: SIOS's own (approvals, Settings, Memory, Agents).
pub const OWN: [&str; 4] = ["sios-approve", "sios-settings", "sios-memory", "sios-agents"];

/// The script for one question. `{nonce}` and `{arg}` are JSON string literals.
fn script(what: &str, nonce: &str, arg: &Value) -> Option<String> {
    let nonce = serde_json::to_string(nonce).ok()?;
    let arg = serde_json::to_string(arg).ok()?;
    let own = serde_json::to_string(&OWN).ok()?;
    let body = match what {
        "list" => "const out = wins.map(info);",
        "focus" => "const w = find(arg.app); let out; if (busy) out = {error: 'you are in a SIOS window or a password prompt; SIOS won\\'t switch windows now'}; else if (!w) out = {error: 'no open window for ' + arg.app}; else if (mine(w) || auth(w)) out = {error: 'that is one of SIOS\\'s own windows or a password prompt'}; else { workspace.activeWindow = w; out = {focused: info(w)}; }",
        "close" => "const w = find(arg.app); let out; if (busy) out = {error: 'you are in a SIOS window or a password prompt; SIOS won\\'t touch windows now'}; else if (!w) out = {error: 'no open window for ' + arg.app}; else if (mine(w) || auth(w)) out = {error: 'SIOS never closes its own windows or a password prompt for an AI'}; else { const i = info(w); w.closeWindow(); out = {closed: i}; }",
        "arrange" => "const a = find(arg.left), b = find(arg.right); let out; if (busy) out = {error: 'you are in a SIOS window or a password prompt; SIOS won\\'t move windows now'}; else if (!a || !b) out = {error: 'both apps need an open window'}; else if (mine(a) || mine(b) || auth(a) || auth(b)) out = {error: 'SIOS never moves its own windows for an AI'}; else { const r = workspace.clientArea(KWin.MaximizeArea, a); const h = Math.floor(r.width / 2); a.setMaximize(false, false); b.setMaximize(false, false); a.frameGeometry = {x: r.x, y: r.y, width: h, height: r.height}; b.frameGeometry = {x: r.x + h, y: r.y, width: r.width - h, height: r.height}; out = {left: info(a), right: info(b)}; }",
        // an agent's desk (A6): never an AI tool, only the broker for its own agents
        "desk" => "let d = workspace.desktops.find(x => x.name === arg.name); if (!d) { workspace.createDesktop(workspace.desktops.length, arg.name); d = workspace.desktops.find(x => x.name === arg.name); } let placed = 0; if (d && arg.pid) { for (const w of workspace.windowList()) { if (w.pid === arg.pid) { w.desktops = [d]; placed++; } } } if (d && arg.show) workspace.currentDesktop = d; const out = d ? {desk: String(d.id), placed: placed} : {error: 'KWin made no desk'};",
        "desk_remove" => "const d = workspace.desktops.find(x => x.name === arg.name); if (d && workspace.desktops.length > 1) workspace.removeDesktop(d); const out = {removed: !!d};",
        _ => return None,
    };
    Some(format!(
        "const nonce = {nonce}; const arg = {arg}; const own = {own};\n\
         const wins = workspace.windowList().filter(w => w.normalWindow && !w.skipTaskbar);\n\
         function info(w) {{ return {{ app: String(w.resourceClass), title: String(w.caption).slice(0, 120), active: w === workspace.activeWindow }}; }}\n\
         function mine(w) {{ return own.indexOf(String(w.resourceClass)) >= 0 || own.indexOf(String(w.desktopFileName).replace('org.sios.', 'sios-')) >= 0; }}\n\
         function auth(w) {{ const c = (String(w.resourceClass) + ' ' + String(w.desktopFileName)).toLowerCase(); return c.indexOf('polkit') >= 0 || c.indexOf('authentication') >= 0 || c.indexOf('kwallet') >= 0 || c.indexOf('pinentry') >= 0; }}\n\
         const busy = workspace.activeWindow && (mine(workspace.activeWindow) || auth(workspace.activeWindow));\n\
         function find(q) {{ q = String(q || '').toLowerCase(); if (!q) return null; return wins.find(w => String(w.resourceClass).toLowerCase() === q) || wins.find(w => String(w.resourceClass).toLowerCase().indexOf(q) >= 0 || String(w.caption).toLowerCase().indexOf(q) >= 0) || null; }}\n\
         {body}\n\
         callDBus('org.sios.Capd1', '/Kwin', 'org.sios.Capd1', 'Result', nonce, JSON.stringify(out));\n"
    ))
}

/// Ask KWin one question; its JSON answer, or a plain error.
pub fn ask(what: &str, arg: Value) -> Result<Value, String> {
    let nonce = crate::state::random_hex(16);
    let src = script(what, &nonce, &arg).ok_or("no such window action")?;
    let v = imp::run(&nonce, &src)?;
    match v.get("error").and_then(|e| e.as_str()) {
        Some(e) => Err(e.to_string()),
        None => Ok(v),
    }
}

#[cfg(target_os = "linux")]
mod imp {
    use serde_json::Value;
    use std::collections::HashMap;
    use std::sync::{Condvar, Mutex, OnceLock};
    use std::time::Duration;

    /// Answers waiting to be picked up: nonce -> json (only for questions asked).
    static WAITING: Mutex<Option<HashMap<String, Option<String>>>> = Mutex::new(None);
    static ARRIVED: Condvar = Condvar::new();
    static BUS: OnceLock<Result<zbus::blocking::Connection, String>> = OnceLock::new();

    struct Sink;

    #[zbus::interface(name = "org.sios.Capd1")]
    impl Sink {
        fn result(&self, nonce: String, json: String) {
            let mut w = WAITING.lock().unwrap_or_else(|p| p.into_inner());
            // only an answer to a question capd is waiting on; anything else is dropped
            if let Some(slot) = w.as_mut().and_then(|m| m.get_mut(&nonce)) {
                if slot.is_none() {
                    *slot = Some(json.chars().take(256 * 1024).collect());
                    ARRIVED.notify_all();
                }
            }
        }
    }

    fn bus() -> Result<&'static zbus::blocking::Connection, String> {
        BUS.get_or_init(|| {
            zbus::blocking::connection::Builder::session()
                .and_then(|b| b.name("org.sios.Capd1"))
                .and_then(|b| b.serve_at("/Kwin", Sink))
                .and_then(|b| b.build())
                .map_err(|e| format!("couldn't reach the desktop's session bus: {e}"))
        })
        .as_ref()
        .map_err(|e| e.clone())
    }

    pub fn run(nonce: &str, src: &str) -> Result<Value, String> {
        let conn = bus()?;
        // the script goes in capd's private runtime folder (0700), readable by KWin as the same user
        let dir = std::path::PathBuf::from(std::env::var("XDG_RUNTIME_DIR").map_err(|_| "no runtime folder")?).join("sios");
        let path = dir.join(format!("kwin-{nonce}.js"));
        {
            use std::os::unix::fs::OpenOptionsExt;
            let mut f = std::fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&path).map_err(|e| e.to_string())?;
            std::io::Write::write_all(&mut f, src.as_bytes()).map_err(|e| e.to_string())?;
        }
        WAITING.lock().unwrap_or_else(|p| p.into_inner()).get_or_insert_with(HashMap::new).insert(nonce.to_string(), None);
        let plugin = format!("sios-{nonce}");
        let result = (|| {
            let reply = conn
                .call_method(Some("org.kde.KWin"), "/Scripting", Some("org.kde.kwin.Scripting"), "loadScript", &(path.to_string_lossy().as_ref(), plugin.as_str()))
                .map_err(|e| format!("KWin didn't take the script: {e}"))?;
            let id: i32 = reply.body().deserialize().map_err(|e| e.to_string())?;
            if id < 0 {
                return Err("KWin refused the script".to_string());
            }
            conn.call_method(Some("org.kde.KWin"), format!("/Scripting/Script{id}").as_str(), Some("org.kde.kwin.Script"), "run", &())
                .map_err(|e| format!("KWin didn't run the script: {e}"))?;
            // wait up to 3 s for this nonce's answer
            let mut w = WAITING.lock().unwrap_or_else(|p| p.into_inner());
            let deadline = std::time::Instant::now() + Duration::from_secs(3);
            loop {
                if let Some(Some(json)) = w.as_ref().and_then(|m| m.get(nonce)) {
                    return serde_json::from_str::<Value>(json).map_err(|e| e.to_string());
                }
                let left = deadline.saturating_duration_since(std::time::Instant::now());
                if left.is_zero() {
                    return Err("KWin didn't answer".to_string());
                }
                w = ARRIVED.wait_timeout(w, left).unwrap_or_else(|p| p.into_inner()).0;
            }
        })();
        if let Some(m) = WAITING.lock().unwrap_or_else(|p| p.into_inner()).as_mut() {
            m.remove(nonce);
        }
        let _ = conn.call_method(Some("org.kde.KWin"), "/Scripting", Some("org.kde.kwin.Scripting"), "unloadScript", &(plugin.as_str(),));
        let _ = std::fs::remove_file(&path);
        result
    }
}

#[cfg(not(target_os = "linux"))]
mod imp {
    pub fn run(_nonce: &str, _src: &str) -> Result<serde_json::Value, String> {
        Err("window control needs KWin (SIOS)".into())
    }
}

/// For tests and docs: the script for one question.
#[cfg(test)]
pub fn script_for(what: &str, arg: Value) -> Option<String> {
    script(what, "n0nce", &arg)
}

pub fn args(tool: &str, a: &Value) -> Result<(&'static str, Value), String> {
    let s = |k: &str| a.get(k).and_then(|v| v.as_str()).map(|x| x.chars().take(80).collect::<String>()).unwrap_or_default();
    Ok(match tool {
        "apps.list" => ("list", json!({})),
        "apps.focus" => ("focus", json!({ "app": s("app") })),
        "apps.close" => ("close", json!({ "app": s("app") })),
        "apps.arrange" => ("arrange", json!({ "left": s("left"), "right": s("right") })),
        _ => return Err("not a window tool".into()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn values_are_escaped_into_the_script() {
        let s = script_for("focus", json!({ "app": "x'); callDBus('evil'); ('" })).unwrap();
        assert!(s.contains(r#"const arg = {"app":"x'); callDBus('evil'); ('"};"#), "{s}");
        assert!(script_for("rm -rf", json!({})).is_none());
        // SIOS's own windows and password prompts are refused inside the script too, and
        // nothing switches while one of them is in front (focus stealing during a password)
        let close = script_for("close", json!({ "app": "sios-approve" })).unwrap();
        assert!(close.contains("never closes its own windows") && close.contains("polkit"));
        for what in ["focus", "close", "arrange"] {
            assert!(script_for(what, json!({ "app": "x", "left": "a", "right": "b" })).unwrap().contains("if (busy)"), "{what}");
        }
    }
}
