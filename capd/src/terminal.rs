//! Terminal commands for AIs (D89): `terminal.read` and `terminal.run`.
//!
//! Every program on the image is in the command catalog (build_files/cmdcat, made at
//! image build, /usr/share/sios/commands/catalog.json) with a risk class per
//! program, subcommand and flag: R reads, C changes, X can't be undone, S sends
//! out, ask (no rule yet), block (never for an AI). A call is `{argv: [...]}` or
//! `{pipeline: [[...], [...]]}`: never a shell string; the highest class of any
//! stage wins.
//!
//! The sandbox is the real guarantee, not the class: every command runs in its
//! own transient unit with an empty home (only the pass's folders bound in:
//! read-only for R, writable for C and X; never dot folders, SIOS's state or the
//! owner's off-limits places), no session bus or sound server, a private /tmp,
//! no new privileges, CPU, memory, task and time limits, and **no network unless
//! the class is S** (which always asks). So a command that's really more than
//! its class says can still only read what it was given, and can't send it.
//!
//! The unit runs `capd pipeline-run`, which starts each stage itself (pipes, no
//! shell), caps the output and writes the result for the broker. Commands start
//! in the background and the result is collected with `terminal.result`, so the
//! broker's lock is never held while a command runs.

use serde_json::{json, Value};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

pub const CATALOG: &str = "/usr/share/sios/commands/catalog.json";
const MAX_OUT: usize = 64 * 1024;
const MAX_ERR: usize = 16 * 1024;
const MAX_STDIN: usize = 64 * 1024;
const MAX_ARGS: usize = 64;
const MAX_STAGES: usize = 6;

/// The risk of a command, lowest first; the highest one in a call wins.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub enum Class {
    R,
    C,
    Ask,
    S,
    X,
    Block,
}

impl Class {
    fn named(s: &str) -> Class {
        match s {
            "R" => Class::R,
            "C" => Class::C,
            "S" => Class::S,
            "X" => Class::X,
            "block" => Class::Block,
            _ => Class::Ask,
        }
    }
    pub fn name(self) -> &'static str {
        match self {
            Class::R => "R",
            Class::C => "C",
            Class::Ask => "ask",
            Class::S => "S",
            Class::X => "X",
            Class::Block => "block",
        }
    }
}

#[cfg(test)]
fn catalog() -> &'static Value {
    // the broker's tests use a small fixed catalog
    static CAT: OnceLock<Value> = OnceLock::new();
    CAT.get_or_init(|| json!({ "commands": {
        "ls": { "class": "R" }, "du": { "class": "R" }, "rm": { "class": "X" }, "mkdir": { "class": "C" },
        "curl": { "class": "S" }, "sudo": { "class": "block", "why": "never" },
        "git": { "class": "ask", "needs_sub": true, "sub_class": { "status": "R", "push": "S" } }
    }}))
}

#[cfg(not(test))]
fn catalog() -> &'static Value {
    static CAT: OnceLock<Value> = OnceLock::new();
    CAT.get_or_init(|| {
        let path = std::env::var("SIOS_COMMANDS").unwrap_or_else(|_| CATALOG.into());
        std::fs::read(path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or(Value::Null)
    })
}

/// The stages of a call: one argv, or a pipeline of them. Plain names only for programs.
pub fn stages(args: &Value) -> Result<Vec<Vec<String>>, String> {
    let to_argv = |v: &Value| -> Result<Vec<String>, String> {
        let a: Vec<String> = v.as_array().ok_or("each command is a list of words")?.iter().map(|x| x.as_str().map(String::from).ok_or("each word is text")).collect::<Result<_, _>>()?;
        if a.is_empty() || a.len() > MAX_ARGS {
            return Err(format!("a command has 1 to {MAX_ARGS} words"));
        }
        if a.iter().any(|w| w.contains('\0') || w.len() > 4096) {
            return Err("a word is too long or has a NUL in it".into());
        }
        if !a[0].chars().all(|c| c.is_ascii_alphanumeric() || "._+-".contains(c)) || a[0].starts_with('-') {
            return Err(format!("\"{}\" isn't a program name (plain names only, no paths)", a[0].chars().take(40).collect::<String>()));
        }
        Ok(a)
    };
    match (args.get("argv"), args.get("pipeline")) {
        (Some(a), None) => Ok(vec![to_argv(a)?]),
        (None, Some(p)) => {
            let p = p.as_array().ok_or("pipeline is a list of commands")?;
            if p.is_empty() || p.len() > MAX_STAGES {
                return Err(format!("a pipeline has 1 to {MAX_STAGES} commands"));
            }
            p.iter().map(to_argv).collect()
        }
        _ => Err("give argv (one command) or pipeline (commands joined by pipes), not both".into()),
    }
}

/// One stage's class from the catalog: the program, its subcommand, its flags.
pub fn classify_argv(argv: &[String], cat: &Value) -> (Class, String) {
    let name = &argv[0];
    let Some(e) = cat["commands"].get(name.as_str()) else {
        return (Class::Block, format!("{name} isn't a program on this computer"));
    };
    let why = |c: Class, w: &str| (c, if w.is_empty() { format!("{name}: {}", c.name()) } else { format!("{name}: {w}") });
    let default = Class::named(e["class"].as_str().unwrap_or("ask"));
    let note = e["why"].as_str().unwrap_or("");
    if default == Class::Block {
        return why(Class::Block, note);
    }
    let rest = &argv[1..];
    let positional: Vec<&String> = rest.iter().filter(|a| !a.starts_with('-')).collect();
    // subcommands: every positional word that names one counts (so "-C status push" is push)
    let subs = e["sub_class"].as_object();
    let mut class = default;
    let mut by_sub = false;
    if let Some(subs) = subs {
        let found: Vec<Class> = positional.iter().filter_map(|p| subs.get(p.as_str())).map(|c| Class::named(c.as_str().unwrap_or("ask"))).collect();
        if let Some(m) = found.iter().max() {
            class = *m;
            by_sub = true;
        }
    }
    if !by_sub && !positional.is_empty() {
        if let Some(d) = e["sub_default"].as_str() {
            class = Class::named(d);
            by_sub = true;
        }
    }
    if !by_sub && e["needs_sub"] == true {
        class = class.max(Class::Ask);
    }
    // flags: one that raises the class always counts; one that lowers it (a listing
    // mode, like tar -t) only when no subcommand decided
    if let Some(flags) = e["flag_class"].as_object() {
        let mut lowest: Option<Class> = None;
        for a in rest {
            for (k, c) in flags {
                let hit = a == k
                    || (k.starts_with("--") && a.starts_with(&format!("{k}=")))
                    || (k.len() == 2 && k.starts_with('-') && !k.starts_with("--") && a.starts_with('-') && !a.starts_with("--") && a[1..].contains(&k[1..]));
                if hit {
                    let c = Class::named(c.as_str().unwrap_or("ask"));
                    if c >= class {
                        class = c;
                    } else if !by_sub {
                        lowest = Some(lowest.map_or(c, |l| l.max(c)));
                    }
                }
            }
        }
        if let Some(l) = lowest {
            if class == default && !by_sub {
                class = l;
            }
        }
    }
    why(class, note)
}

/// The whole call's class: the highest stage. A missing catalog blocks everything.
pub fn classify(args: &Value) -> Result<(Class, String), String> {
    let st = stages(args)?;
    let cat = catalog();
    if cat.is_null() {
        return Ok((Class::Block, "the command catalog isn't on this computer".into()));
    }
    let mut out = (Class::R, String::new());
    for s in &st {
        let c = classify_argv(s, cat);
        if c.0 >= out.0 {
            out = c;
        }
    }
    Ok(out)
}

/// What the broker needs to start one command.
pub struct Job {
    pub id: String,
    pub stages: Vec<Vec<String>>,
    pub stdin: String,
    pub cwd: PathBuf,
    /// folders the command may see: (path, writable)
    pub binds: Vec<(PathBuf, bool)>,
    /// places inside those that stay hidden (the owner's off-limits places)
    pub hide: Vec<PathBuf>,
    pub network: bool,
    pub timeout: u64,
    pub out_dir: PathBuf,
    pub home: PathBuf,
    pub capd: PathBuf,
}

pub fn unit(id: &str) -> String {
    format!("sios-term-{id}")
}

fn plain(p: &Path) -> Result<String, String> {
    let s = p.to_string_lossy().to_string();
    if s.is_empty() || !p.is_absolute() || s.contains("..") || s.chars().any(|c| c.is_control() || c == ':' || c == ' ' || c == '"' || c == '\\' || c == '$' || c == '%') {
        return Err(format!("{s} can't be given to the sandbox (spaces and odd characters aren't allowed in folder names here)"));
    }
    Ok(s)
}

/// The systemd-run arguments for a job. Pure: every sandbox property is here, and
/// nothing the command says becomes one.
pub fn unit_args(j: &Job) -> Result<Vec<String>, String> {
    if !j.id.chars().all(|c| c.is_ascii_hexdigit()) || j.id.is_empty() {
        return Err("bad job id".into());
    }
    let spec = json!({ "stages": j.stages, "stdin": j.stdin });
    let b64 = base64_encode(spec.to_string().as_bytes());
    let mut a: Vec<String> = vec![
        "--user".into(), "--quiet".into(), "--collect".into(),
        format!("--unit={}", unit(&j.id)), "--slice=sios-terminal.slice".into(),
        "-p".into(), "ProtectHome=tmpfs".into(),
        "-p".into(), "PrivateTmp=yes".into(),
        "-p".into(), "NoNewPrivileges=yes".into(),
        // other programs' /proc: their root, cwd, environment and memory are refused (the unit's
        // own user namespace; checked on the VM: "Permission denied"), so /proc/<pid>/root is no
        // way into the real home. The process list and command lines stay visible, as on any
        // Linux; ProtectProc only hides them under a system manager, so it's set for when it can
        "-p".into(), "ProtectProc=invisible".into(),
        "-p".into(), "ProcSubset=pid".into(),
        // no system bus: a "read" like nmcli could otherwise ask services to change things
        "-p".into(), "InaccessiblePaths=-/run/dbus".into(),
        "-p".into(), "MemoryMax=2G".into(),
        "-p".into(), "CPUQuota=200%".into(),
        "-p".into(), "TasksMax=256".into(),
        "-p".into(), format!("RuntimeMaxSec={}", j.timeout.clamp(1, 120)),
        "-p".into(), format!("BindPaths={}", plain(&j.out_dir)?),
        // the runner itself (in /usr/bin on SIOS; a test build may live in the home)
        "-p".into(), format!("BindReadOnlyPaths={}", plain(&j.capd)?),
        "-p".into(), format!("WorkingDirectory={}", plain(&j.cwd)?),
        "-p".into(), "StandardOutput=null".into(),
        "-p".into(), "StandardError=null".into(),
        "-E".into(), "PATH=/usr/bin".into(),
        "-E".into(), format!("HOME={}", plain(&j.home)?),
        "-E".into(), "LANG=C.UTF-8".into(),
    ];
    if j.network {
        // the internet only: no local sockets (an abstract X11 or other desktop socket)
        a.push("-p".into());
        a.push("RestrictAddressFamilies=AF_INET AF_INET6".into());
    } else {
        a.push("-p".into());
        a.push("PrivateNetwork=yes".into());
    }
    for (p, rw) in &j.binds {
        a.push("-p".into());
        a.push(format!("{}={}", if *rw { "BindPaths" } else { "BindReadOnlyPaths" }, plain(p)?));
    }
    for p in &j.hide {
        a.push("-p".into());
        a.push(format!("InaccessiblePaths=-{}", plain(p)?));
    }
    a.push("--".into());
    a.push(plain(&j.capd)?);
    a.push("pipeline-run".into());
    a.push(plain(&j.out_dir.join("result.json"))?);
    a.push(b64);
    Ok(a)
}

/// Inside the sandbox: start each stage (pipes, no shell), cap the output, write
/// the result where the broker reads it. `capd pipeline-run <out> <base64 spec>`.
pub fn pipeline_run(out: &Path, b64: &str) -> i32 {
    use std::process::{Command, Stdio};
    let started = std::time::Instant::now();
    let write = |v: Value| {
        let tmp = out.with_extension("tmp");
        if std::fs::write(&tmp, v.to_string()).is_ok() {
            let _ = std::fs::rename(&tmp, out);
        }
    };
    let spec: Value = match base64_decode(b64).ok().and_then(|b| serde_json::from_slice(&b).ok()) {
        Some(v) => v,
        None => {
            write(json!({ "exit": -1, "error": "bad job" }));
            return 2;
        }
    };
    let stages: Vec<Vec<String>> = serde_json::from_value(spec["stages"].clone()).unwrap_or_default();
    let mut children = Vec::new();
    let mut prev: Option<std::process::ChildStdout> = None;
    let mut err_files = Vec::new();
    for (i, argv) in stages.iter().enumerate() {
        let program = Path::new("/usr/bin").join(&argv[0]);
        let err_path = out.with_file_name(format!("stderr-{i}"));
        let err = std::fs::File::create(&err_path).map(Stdio::from).unwrap_or(Stdio::null());
        err_files.push(err_path);
        let mut c = Command::new(&program);
        c.args(&argv[1..]).env_clear().env("PATH", "/usr/bin").env("LANG", "C.UTF-8").env("HOME", std::env::var("HOME").unwrap_or_default()).stderr(err).stdout(Stdio::piped());
        c.stdin(match prev.take() {
            Some(p) => Stdio::from(p),
            None if i == 0 && !spec["stdin"].as_str().unwrap_or("").is_empty() => Stdio::piped(),
            None => Stdio::null(),
        });
        match c.spawn() {
            Ok(mut ch) => {
                if i == 0 {
                    if let Some(mut si) = ch.stdin.take() {
                        let text = spec["stdin"].as_str().unwrap_or("").to_string();
                        std::thread::spawn(move || {
                            let _ = si.write_all(text.as_bytes());
                        });
                    }
                }
                prev = ch.stdout.take();
                children.push(ch);
            }
            Err(e) => {
                write(json!({ "exit": 127, "error": format!("couldn't start {}: {e}", argv[0]) }));
                return 127;
            }
        }
    }
    // the last stage's output, capped (the rest is read and dropped so nothing blocks)
    let mut stdout = Vec::new();
    let mut truncated = false;
    if let Some(mut so) = prev {
        let mut buf = [0u8; 8192];
        loop {
            match so.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if stdout.len() + n > MAX_OUT {
                        stdout.extend_from_slice(&buf[..MAX_OUT.saturating_sub(stdout.len())]);
                        truncated = true;
                    } else {
                        stdout.extend_from_slice(&buf[..n]);
                    }
                }
            }
        }
    }
    let mut exit = 0;
    for mut ch in children {
        let code = ch.wait().ok().and_then(|s| s.code()).unwrap_or(-1);
        if code != 0 {
            exit = code;
        }
    }
    let mut stderr = String::new();
    for p in err_files {
        let t = std::fs::read(&p).unwrap_or_default();
        stderr.push_str(&String::from_utf8_lossy(&t[..t.len().min(MAX_ERR)]));
        let _ = std::fs::remove_file(p);
    }
    let stderr: String = stderr.chars().take(MAX_ERR).collect();
    write(json!({ "exit": exit, "stdout": String::from_utf8_lossy(&stdout), "stderr": stderr, "truncated": truncated, "ms": started.elapsed().as_millis() as u64 }));
    0
}

/// A finished job's result, cleaned for the model and the screen: no control
/// characters (terminal escapes) and no direction tricks; newlines and tabs kept.
pub fn read_result(out_dir: &Path) -> Option<Value> {
    let v: Value = serde_json::from_slice(&std::fs::read(out_dir.join("result.json")).ok()?).ok()?;
    let clean = |s: &str| -> String { s.chars().filter(|c| (!c.is_control() || *c == '\n' || *c == '\t') && !('\u{202a}'..='\u{202e}').contains(c) && !('\u{2066}'..='\u{2069}').contains(c)).collect() };
    Some(json!({
        "exit": v["exit"],
        "stdout": clean(v["stdout"].as_str().unwrap_or("")),
        "stderr": clean(v["stderr"].as_str().unwrap_or("")),
        "truncated": v["truncated"],
        "ms": v["ms"],
        "error": v.get("error").map(|e| clean(e.as_str().unwrap_or(""))),
        "untrusted": true,
    }))
}

pub fn stdin_ok(s: &str) -> Result<(), String> {
    if s.len() > MAX_STDIN {
        Err("stdin is at most 64 KB".into())
    } else {
        Ok(())
    }
}

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64_encode(b: &[u8]) -> String {
    let mut s = String::new();
    for c in b.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        for i in 0..4 {
            if i <= c.len() {
                s.push(B64[(n >> (18 - 6 * i) & 63) as usize] as char);
            } else {
                s.push('=');
            }
        }
    }
    s
}

fn base64_decode(s: &str) -> Result<Vec<u8>, ()> {
    let mut out = Vec::new();
    let vals: Vec<u32> = s.bytes().filter(|c| *c != b'=').map(|c| B64.iter().position(|x| *x == c).map(|p| p as u32).ok_or(())).collect::<Result<_, _>>()?;
    for c in vals.chunks(4) {
        let n = c.iter().enumerate().fold(0u32, |acc, (i, v)| acc | v << (18 - 6 * i));
        for i in 0..c.len().saturating_sub(1) {
            out.push((n >> (16 - 8 * i) & 255) as u8);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cat() -> Value {
        json!({ "commands": {
            "ls": { "class": "R" },
            "rm": { "class": "X" },
            "sudo": { "class": "block", "why": "never" },
            "curl": { "class": "S" },
            "tar": { "class": "C", "flag_class": { "-t": "R", "--list": "R" } },
            "sed": { "class": "R", "flag_class": { "-i": "C", "--in-place": "C" } },
            "git": { "class": "ask", "needs_sub": true, "sub_class": { "status": "R", "commit": "C", "push": "S" }, "flag_class": { "--force": "X", "-c": "block" } },
            "kscreen-doctor": { "class": "R", "sub_default": "C", "flag_class": { "-o": "R" } },
            "mystery": { "class": "ask" }
        }})
    }
    fn class(argv: &[&str]) -> Class {
        classify_argv(&argv.iter().map(|s| s.to_string()).collect::<Vec<_>>(), &cat()).0
    }

    #[test]
    fn the_catalog_decides_and_the_highest_part_wins() {
        assert_eq!(class(&["ls", "-la", "Documents"]), Class::R);
        assert_eq!(class(&["rm", "-rf", "x"]), Class::X);
        assert_eq!(class(&["sudo", "ls"]), Class::Block);
        assert_eq!(class(&["nosuch"]), Class::Block, "not on this computer");
        assert_eq!(class(&["mystery"]), Class::Ask, "no rule yet asks");
        assert_eq!(class(&["git", "status"]), Class::R);
        assert_eq!(class(&["git"]), Class::Ask, "a subcommand is needed");
        assert_eq!(class(&["git", "-C", "status", "push"]), Class::S, "every subcommand word counts");
        assert_eq!(class(&["git", "push", "--force"]), Class::X);
        assert_eq!(class(&["git", "-c", "core.pager=sh", "log"]), Class::Block);
        assert_eq!(class(&["tar", "-tf", "a.tar"]), Class::R, "a listing flag lowers");
        assert_eq!(class(&["tar", "-xf", "a.tar"]), Class::C);
        assert_eq!(class(&["sed", "-n", "p", "f"]), Class::R);
        assert_eq!(class(&["sed", "-ibak", "s/a/b/", "f"]), Class::C, "combined short flags count");
        assert_eq!(class(&["sed", "--in-place=.b", "s/a/b/", "f"]), Class::C);
        assert_eq!(class(&["kscreen-doctor", "-o"]), Class::R);
        assert_eq!(class(&["kscreen-doctor", "-o", "output.1.mode.1"]), Class::C, "a lowering flag can't undo a positional");
    }

    #[test]
    fn calls_are_words_never_a_shell() {
        assert!(stages(&json!({ "argv": ["/bin/rm", "x"] })).is_err(), "no paths for programs");
        assert!(stages(&json!({ "argv": ["-rf"] })).is_err());
        assert!(stages(&json!({ "argv": [] })).is_err());
        assert!(stages(&json!({ "argv": ["ls"], "pipeline": [["ls"]] })).is_err());
        assert!(stages(&json!({ "pipeline": [["ls"], ["grep", "x"], ["wc", "-l"]] })).is_ok());
        assert!(stages(&json!({ "argv": ["ls; rm -rf ~"] })).is_err(), "a shell line is not a program name");
        let st = stages(&json!({ "argv": ["echo", "$(rm -rf ~)", "`x`", "a|b"] })).unwrap();
        assert_eq!(st[0][1], "$(rm -rf ~)", "words stay words");
    }

    fn job(network: bool) -> Job {
        Job {
            id: "a1b2".into(),
            stages: vec![vec!["ls".into(), "-la".into()]],
            stdin: String::new(),
            cwd: "/home/r/Documents".into(),
            binds: vec![("/home/r/Documents".into(), false), ("/home/r/Projects".into(), true)],
            hide: vec!["/home/r/Documents/Taxes".into()],
            network,
            timeout: 500,
            out_dir: "/home/r/.local/share/sios/terminal/a1b2".into(),
            home: "/home/r".into(),
            capd: "/usr/bin/capd".into(),
        }
    }

    #[test]
    fn the_sandbox_is_fixed_and_network_only_for_sending() {
        let a = unit_args(&job(false)).unwrap();
        for must in ["ProtectHome=tmpfs", "PrivateTmp=yes", "NoNewPrivileges=yes", "PrivateNetwork=yes", "ProtectProc=invisible", "ProcSubset=pid", "InaccessiblePaths=-/run/dbus", "RuntimeMaxSec=120", "BindReadOnlyPaths=/home/r/Documents", "BindPaths=/home/r/Projects", "InaccessiblePaths=-/home/r/Documents/Taxes", "--slice=sios-terminal.slice"] {
            assert!(a.iter().any(|x| x == must), "{must}");
        }
        let net = unit_args(&job(true)).unwrap();
        assert!(!net.iter().any(|x| x == "PrivateNetwork=yes"));
        assert!(net.iter().any(|x| x == "RestrictAddressFamilies=AF_INET AF_INET6"), "internet only, no local sockets");
        // the command itself is only ever base64 data for pipeline-run, never unit properties
        let i = a.iter().position(|x| x == "pipeline-run").unwrap();
        assert_eq!(a.len(), i + 3);
        let spec: Value = serde_json::from_slice(&base64_decode(&a[i + 2]).unwrap()).unwrap();
        assert_eq!(spec["stages"][0][0], "ls");
        // odd folder names never reach systemd
        let mut j = job(false);
        j.binds.push(("/home/r/My Files".into(), false));
        assert!(unit_args(&j).is_err());
        let mut j = job(false);
        j.cwd = "/home/r/a:b".into();
        assert!(unit_args(&j).is_err());
    }

    #[test]
    fn pipelines_run_without_a_shell_and_output_is_capped_and_clean() {
        let d = tempfile::tempdir().unwrap();
        let out = d.path().join("result.json");
        // /usr/bin/printf and /usr/bin/tr exist on macOS and Linux
        let spec = json!({ "stages": [["printf", "a\\033[2Jb\\n$(id)\\n"], ["tr", "a-z", "A-Z"]], "stdin": "" });
        assert_eq!(pipeline_run(&out, &base64_encode(spec.to_string().as_bytes())), 0);
        let r = read_result(d.path()).unwrap();
        assert_eq!(r["exit"], 0);
        assert_eq!(r["stdout"], "A[2JB\n$(ID)\n", "no escape codes, no command substitution");
        assert_eq!(r["untrusted"], true);
        let spec = json!({ "stages": [["tr", "a", "b"]], "stdin": "aaa" });
        pipeline_run(&out, &base64_encode(spec.to_string().as_bytes()));
        assert_eq!(read_result(d.path()).unwrap()["stdout"], "bbb");
    }

    #[test]
    fn base64_round_trips() {
        for s in ["", "a", "ab", "abc", "abcd", "{\"x\":[1,2]}"] {
            assert_eq!(base64_decode(&base64_encode(s.as_bytes())).unwrap(), s.as_bytes());
        }
    }
}
