//! Reflex (D95): the everyday one-step commands, understood by code with no model.
//! "dark mode", "volume 30", "a bit louder", "brighter", "wifi off", "do not disturb on",
//! "lock the screen", "open terminal", "remind me in 10 minutes to stretch", "wallpaper lake".
//!
//! A match becomes an ordinary one-step plan that goes through the broker exactly like a
//! model's plan (the same pass, the same checks), so nothing gets around the rules; it
//! only skips the model, which makes these instant and lets them work offline. Anything
//! not matched exactly goes to the planner as before: Reflex never guesses.

use serde_json::{json, Value};

/// The apps apps.open knows (capd's list).
const APPS: [&str; 9] = ["files", "browser", "mail", "settings", "terminal", "store", "security", "goals", "activity"];

/// Lowercase words, without polite filler and punctuation ("Please turn on dark mode!" ->
/// "turn on dark mode").
fn words(request: &str) -> Vec<String> {
    let clean: String = request.to_lowercase().chars().map(|c| if c.is_alphanumeric() || c == '%' || c == '-' { c } else { ' ' }).collect();
    let filler = ["please", "pls", "sios", "hey", "can", "could", "would", "you", "for", "me", "now", "the", "my", "a", "an", "just", "thanks", "thank"];
    let mut w: Vec<String> = clean.split_whitespace().map(String::from).collect();
    // "remind me" keeps its "me" (the text after "to" is the owner's own words)
    let keep_me = w.first().is_some_and(|x| x == "remind");
    w.retain(|x| !filler.contains(&x.as_str()) || (keep_me && x == "me"));
    w
}

fn number(s: &str) -> Option<u64> {
    s.trim_end_matches('%').parse().ok().filter(|n: &u64| *n <= 100)
}

fn on_off(w: &[String]) -> Option<bool> {
    let on = w.iter().any(|x| x == "on" || x == "enable" || x == "start");
    let off = w.iter().any(|x| x == "off" || x == "disable" || x == "stop");
    match (on, off) {
        (true, false) => Some(true),
        (false, true) => Some(false),
        _ => None,
    }
}

/// The one step a request means, if it's one of the everyday commands: (tool, args, reply).
/// `now` is the computer's state (volume, brightness) for "louder", "dimmer".
pub fn understand(request: &str, now: &Value) -> Option<(String, Value, String)> {
    let w = words(request);
    let s = w.join(" ");
    let has = |x: &str| w.iter().any(|y| y == x);
    let step = |t: &str, a: Value, r: String| Some((t.to_string(), a, r));
    if w.is_empty() || w.len() > 9 {
        return None;
    }

    // the look: "dark mode", "switch to light", "turn off dark mode"
    let dark = has("dark");
    let light = has("light");
    if (dark ^ light) && w.iter().all(|x| ["dark", "light", "mode", "theme", "look", "switch", "to", "turn", "on", "off", "use", "go", "make", "it", "set"].contains(&x.as_str())) {
        let want_dark = dark != (has("off") && !has("on"));
        let theme = if want_dark { "dark" } else { "light" };
        return step("settings.set_theme", json!({ "theme": theme }), format!("Switched to the {theme} look."));
    }

    // volume: "volume 30", "set volume to 30%", "louder", "turn it down", "mute"
    if s == "mute" || s == "mute sound" || s == "mute volume" {
        return step("settings.set_volume", json!({ "level": 0 }), "Muted.".into());
    }
    let vol_words = has("volume") || has("louder") || has("quieter") || has("sound");
    if vol_words && w.iter().all(|x| ["volume", "sound", "set", "to", "up", "down", "louder", "quieter", "bit", "little", "turn", "it", "percent"].contains(&x.as_str()) || number(x).is_some()) {
        if let Some(n) = w.iter().find_map(|x| number(x)) {
            return step("settings.set_volume", json!({ "level": n }), format!("Volume set to {n}%."));
        }
        let cur = now["volume"].as_u64()?;
        let up = has("up") || has("louder");
        let down = has("down") || has("quieter");
        if up ^ down {
            let n = if up { (cur + 10).min(100) } else { cur.saturating_sub(10) };
            return step("settings.set_volume", json!({ "level": n }), format!("Volume set to {n}%."));
        }
        return None;
    }

    // brightness: "brightness 50", "brighter", "dim the screen"
    let bri_words = has("brightness") || has("brighter") || has("dimmer") || has("dim");
    if bri_words && w.iter().all(|x| ["brightness", "screen", "set", "to", "up", "down", "brighter", "dimmer", "dim", "bit", "little", "turn", "it", "percent"].contains(&x.as_str()) || number(x).is_some()) {
        if let Some(n) = w.iter().find_map(|x| number(x)) {
            return step("settings.set_brightness", json!({ "level": n }), format!("Brightness set to {n}%."));
        }
        let cur = now["brightness"].as_u64()?;
        let up = has("up") || has("brighter");
        let down = has("down") || has("dimmer") || has("dim");
        if up ^ down {
            let n = if up { (cur + 15).min(100) } else { cur.saturating_sub(15).max(5) };
            return step("settings.set_brightness", json!({ "level": n }), format!("Brightness set to {n}%."));
        }
        return None;
    }

    // switches: Do Not Disturb, Wi-Fi, Bluetooth
    let switch_words = ["turn", "switch", "on", "off", "enable", "disable", "set", "to"];
    let only = |extra: &[&str]| w.iter().all(|x| switch_words.contains(&x.as_str()) || extra.contains(&x.as_str()));
    if (s.contains("do not disturb") || has("dnd")) && only(&["do", "not", "disturb", "dnd", "mode"]) {
        let on = on_off(&w)?;
        return step("settings.dnd", json!({ "on": on }), format!("Do Not Disturb is {}.", if on { "on" } else { "off" }));
    }
    if (has("wifi") || has("wi-fi")) && only(&["wifi", "wi-fi"]) {
        let on = on_off(&w)?;
        return step("network.wifi_power", json!({ "on": on }), format!("Wi-Fi is {}.", if on { "on" } else { "off" }));
    }
    if has("bluetooth") && only(&["bluetooth"]) {
        let on = on_off(&w)?;
        return step("network.bluetooth_power", json!({ "on": on }), format!("Bluetooth is {}.", if on { "on" } else { "off" }));
    }

    // lock: "lock the screen", "lock my computer"
    if w.first().is_some_and(|x| x == "lock") && w.iter().all(|x| ["lock", "screen", "computer", "it", "up"].contains(&x.as_str())) {
        return step("system.lock", json!({}), "Locked the screen.".into());
    }

    // open an app: "open terminal", "launch the browser", "open firefox"
    if w.len() == 2 && ["open", "launch", "start", "show"].contains(&w[0].as_str()) {
        let app = match w[1].as_str() {
            "firefox" | "web" | "internet" => "browser",
            "email" | "inbox" => "mail",
            "konsole" | "shell" | "console" => "terminal",
            "file" | "dolphin" => "files",
            other => other,
        };
        if APPS.contains(&app) {
            return step("apps.open", json!({ "app": app }), format!("Opened {app}."));
        }
        return None;
    }

    // a reminder: "remind me in 10 minutes to stretch", "remind me in 2 hours to call the bank"
    if w.len() >= 6 && w[0] == "remind" && w[1] == "me" && w[2] == "in" {
        let n: u64 = w[3].parse().ok()?;
        let unit = w[4].as_str();
        let minutes = match unit {
            "minute" | "minutes" | "min" | "mins" => n,
            "hour" | "hours" | "hr" | "hrs" => n * 60,
            _ => return None,
        };
        if w[5] != "to" || !(1..=1440).contains(&minutes) {
            return None;
        }
        // the owner's own words after "to", as they typed them
        let lower = request.to_lowercase();
        let at = lower.find(" to ")? + 4;
        let text: String = request[at..].trim().trim_end_matches(['.', '!']).chars().take(200).collect();
        if text.is_empty() {
            return None;
        }
        return step("system.remind", json!({ "minutes": minutes, "text": text }), format!("I'll remind you in {} to {text}.", if minutes % 60 == 0 && minutes >= 60 { format!("{} hour{}", minutes / 60, if minutes == 60 { "" } else { "s" }) } else { format!("{minutes} minute{}", if minutes == 1 { "" } else { "s" }) }));
    }

    // the wallpaper: "wallpaper lake", "change wallpaper to dusk"
    if has("wallpaper") {
        let name = ["dusk", "lake", "tunnel"].into_iter().find(|n| has(n))?;
        if w.iter().all(|x| ["wallpaper", "change", "set", "use", "to", name].contains(&x.as_str())) {
            return step("settings.set_wallpaper", json!({ "name": name }), format!("Changed the wallpaper to {name}."));
        }
    }
    None
}

/// A matched command as an ordinary plan (the planner's own shape), for the broker.
pub fn plan(tool: &str, args: &Value, reply: &str) -> Value {
    json!({
        "understanding": reply,
        "steps": [{ "kind": "tool", "tool": tool, "args_json": args.to_string(), "sources": [], "instruction": "", "why": "an everyday command (Reflex)" }],
        "reply": reply, "question": "", "undo_last": false, "manual": [], "look": []
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tool(req: &str) -> Option<(String, Value)> {
        understand(req, &json!({ "volume": 40, "brightness": 70 })).map(|(t, a, _)| (t, a))
    }

    #[test]
    fn everyday_commands_are_understood_without_a_model() {
        assert_eq!(tool("dark mode"), Some(("settings.set_theme".into(), json!({ "theme": "dark" }))));
        assert_eq!(tool("Please switch to light mode!"), Some(("settings.set_theme".into(), json!({ "theme": "light" }))));
        assert_eq!(tool("turn off dark mode"), Some(("settings.set_theme".into(), json!({ "theme": "light" }))));
        assert_eq!(tool("volume 30"), Some(("settings.set_volume".into(), json!({ "level": 30 }))));
        assert_eq!(tool("set the volume to 75%"), Some(("settings.set_volume".into(), json!({ "level": 75 }))));
        assert_eq!(tool("a bit louder"), Some(("settings.set_volume".into(), json!({ "level": 50 }))));
        assert_eq!(tool("turn it down"), None, "no 'volume' word: not sure, so the planner decides");
        assert_eq!(tool("volume down"), Some(("settings.set_volume".into(), json!({ "level": 30 }))));
        assert_eq!(tool("mute"), Some(("settings.set_volume".into(), json!({ "level": 0 }))));
        assert_eq!(tool("brighter"), Some(("settings.set_brightness".into(), json!({ "level": 85 }))));
        assert_eq!(tool("brightness 20"), Some(("settings.set_brightness".into(), json!({ "level": 20 }))));
        assert_eq!(tool("turn on do not disturb"), Some(("settings.dnd".into(), json!({ "on": true }))));
        assert_eq!(tool("wifi off"), Some(("network.wifi_power".into(), json!({ "on": false }))));
        assert_eq!(tool("turn bluetooth on"), Some(("network.bluetooth_power".into(), json!({ "on": true }))));
        assert_eq!(tool("lock the screen"), Some(("system.lock".into(), json!({}))));
        assert_eq!(tool("open terminal"), Some(("apps.open".into(), json!({ "app": "terminal" }))));
        assert_eq!(tool("open firefox"), Some(("apps.open".into(), json!({ "app": "browser" }))));
        assert_eq!(tool("change wallpaper to lake"), Some(("settings.set_wallpaper".into(), json!({ "name": "lake" }))));
        let (_, a, r) = understand("Remind me in 2 hours to call the Bank.", &json!({})).unwrap();
        assert_eq!(a, json!({ "minutes": 120, "text": "call the Bank" }));
        assert_eq!(r, "I'll remind you in 2 hours to call the Bank.");
    }

    #[test]
    fn anything_else_goes_to_the_planner() {
        for req in [
            "dark mode for the terminal only",
            "move my invoices to Finance",
            "volume 300",
            "open my invoices",
            "turn wifi on and off",
            "what's the volume",
            "remind me to stretch",
            "lock the screen and email Sara",
            "make the wallpaper of my presentation dark",
            "set brightness to 50 then open terminal",
        ] {
            assert!(tool(req).is_none(), "{req}");
        }
        // "louder" without a known current volume isn't guessed
        assert!(understand("louder", &json!({})).is_none());
    }
}
