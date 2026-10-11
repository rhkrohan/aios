//! The decision log. One JSON line per decision, each carrying the SHA-256 of
//! the line before it. Editing, deleting or reordering any line breaks the
//! chain from that point on, and `verify` says where.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

use crate::policy::Check;

pub const GENESIS: &str = "0000000000000000000000000000000000000000000000000000000000000000";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Entry {
    pub seq: u64,
    pub at: u64,
    pub principal: String,
    pub cap: String,
    pub tool: String,
    pub target: String,
    /// allowed, asked, approved, denied, blocked
    pub decision: String,
    pub reason: String,
    pub checks: Vec<Check>,
    pub prev: String,
    #[serde(default)]
    pub hash: String,
}

fn hash_of(e: &Entry) -> String {
    let mut body = e.clone();
    body.hash = String::new();
    let mut h = Sha256::new();
    h.update(serde_json::to_vec(&body).expect("entry serializes"));
    hex::encode(h.finalize())
}

pub struct Log {
    path: PathBuf,
    head: String,
    seq: u64,
}

impl Log {
    /// Open (or create) the log and pick up where the chain left off.
    pub fn open(path: &Path) -> std::io::Result<Log> {
        let mut log = Log { path: path.to_path_buf(), head: GENESIS.into(), seq: 0 };
        if path.exists() {
            for line in BufReader::new(File::open(path)?).lines() {
                if let Ok(e) = serde_json::from_str::<Entry>(&line?) {
                    log.head = e.hash;
                    log.seq = e.seq;
                }
            }
        }
        Ok(log)
    }

    pub fn append(&mut self, mut e: Entry) -> std::io::Result<Entry> {
        e.seq = self.seq + 1;
        e.prev = self.head.clone();
        e.hash = hash_of(&e);
        let mut f = OpenOptions::new().create(true).append(true).open(&self.path)?;
        writeln!(f, "{}", serde_json::to_string(&e).expect("entry serializes"))?;
        self.head = e.hash.clone();
        self.seq = e.seq;
        Ok(e)
    }

    pub fn tail(&self, n: usize) -> Vec<Entry> {
        let Ok(f) = File::open(&self.path) else { return vec![] };
        let all: Vec<Entry> = BufReader::new(f).lines().map_while(Result::ok).filter_map(|l| serde_json::from_str(&l).ok()).collect();
        all[all.len().saturating_sub(n)..].to_vec()
    }
}

/// Check the whole chain. Ok(count) if intact, Err((line, why)) at the first break.
/// Hex SHA-256 of some bytes (pairing tokens are kept only as this).
pub fn sha256_hex(b: &[u8]) -> String {
    hex::encode(Sha256::digest(b))
}

pub fn verify(path: &Path) -> Result<u64, (u64, String)> {
    let Ok(f) = File::open(path) else { return Ok(0) };
    let mut prev = GENESIS.to_string();
    let mut n = 0;
    for (i, line) in BufReader::new(f).lines().enumerate() {
        let line_no = i as u64 + 1;
        let line = line.map_err(|e| (line_no, e.to_string()))?;
        let e: Entry = serde_json::from_str(&line).map_err(|_| (line_no, "line isn't a valid entry".to_string()))?;
        if e.prev != prev {
            return Err((line_no, "doesn't link to the entry before it (removed or reordered)".into()));
        }
        if hash_of(&e) != e.hash {
            return Err((line_no, "its contents were changed after it was written".into()));
        }
        prev = e.hash;
        n += 1;
    }
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(tool: &str) -> Entry {
        Entry { seq: 0, at: 1, principal: "p".into(), cap: "c".into(), tool: tool.into(), target: "t".into(), decision: "allowed".into(), reason: "".into(), checks: vec![], prev: String::new(), hash: String::new() }
    }

    #[test]
    fn chain_detects_edits_and_deletes() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("audit.jsonl");
        let mut log = Log::open(&p).unwrap();
        for t in ["a", "b", "c"] {
            log.append(entry(t)).unwrap();
        }
        assert_eq!(verify(&p), Ok(3));

        // reopening continues the chain
        let mut log = Log::open(&p).unwrap();
        log.append(entry("d")).unwrap();
        assert_eq!(verify(&p), Ok(4));

        // edit line 2
        let text = std::fs::read_to_string(&p).unwrap();
        std::fs::write(&p, text.replacen("\"tool\":\"b\"", "\"tool\":\"x\"", 1)).unwrap();
        assert_eq!(verify(&p).unwrap_err().0, 2);

        // delete line 2 instead
        let lines: Vec<&str> = text.lines().collect();
        std::fs::write(&p, format!("{}\n{}\n{}\n", lines[0], lines[2], lines[3])).unwrap();
        assert_eq!(verify(&p).unwrap_err().0, 2);
    }
}
