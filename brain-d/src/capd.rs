//! brain-d's link to the broker. brain-d is an ordinary client of capd: it can
//! request passes, dry-run and make calls with them, and wait for answers. It
//! never holds the owner secret, so it can't grant, approve or undo anything.
//! (On SIOS: a Unix socket in /run/sios, identity from SO_PEERCRED.)

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::time::Duration;

#[derive(Clone)]
pub struct Capd {
    pub sock: PathBuf,
    /// capd's state folder, where it keeps service.secret (the Mac preview's proof;
    /// on SIOS capd knows brain-d by its program and unit, and ignores the file).
    pub state: PathBuf,
}

impl Capd {
    pub fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        self.call_within(method, params, Duration::from_secs(20))
    }

    /// For calls that wait on something slow: a model answering, or the owner's password.
    pub fn call_slow(&self, method: &str, params: Value) -> Result<Value, String> {
        self.call_within(method, params, Duration::from_secs(180))
    }

    /// As an ordinary agent, with no service secret: for the MCP door, which runs
    /// as a child of an outside AI and must never act as SIOS's brain.
    pub fn call_as_agent(&self, method: &str, params: Value) -> Result<Value, String> {
        self.send(method, params, Duration::from_secs(20), false)
    }

    fn call_within(&self, method: &str, params: Value, wait: Duration) -> Result<Value, String> {
        self.send(method, params, wait, true)
    }

    fn send(&self, method: &str, params: Value, wait: Duration, as_service: bool) -> Result<Value, String> {
        let mut s = UnixStream::connect(&self.sock).map_err(|e| format!("can't reach capd: {e}"))?;
        s.set_read_timeout(Some(wait)).ok();
        // brain-d proves who it is with the service secret capd made (on SIOS: SO_PEERCRED)
        let service = if as_service { std::fs::read_to_string(self.state.join("service.secret")).unwrap_or_default() } else { String::new() };
        writeln!(s, "{}", json!({ "method": method, "params": params, "service": service.trim() })).map_err(|e| e.to_string())?;
        let mut line = String::new();
        BufReader::new(s).read_line(&mut line).map_err(|e| e.to_string())?;
        let v: Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
        match v.get("error") {
            Some(e) => Err(e.as_str().unwrap_or("capd error").to_string()),
            None => Ok(v["ok"].clone()),
        }
    }

    pub fn tool(&self, cap: &str, tool: &str, args: &Value, dry_run: bool) -> Result<Value, String> {
        self.call("call", json!({ "cap": cap, "tool": tool, "args": args, "dry_run": dry_run }))
    }
}
