//! Test packs: ready-made homes for trying features on the live machine.
//! A pack lists folders, files (with labels, trust and origin), places that
//! are off limits, links, and generated bulk files. Packs are built into the
//! binary. "standard-home" is the same home as the simulated machine.
//!
//! Resetting only ever wipes a folder capd marked as its sandbox
//! (`.sios-sandbox`), never anything else.

use serde::Deserialize;
use serde_json::{json, Value};
use std::path::Path;

use crate::meta::{FileMeta, Store};

pub const MARKER: &str = ".sios-sandbox";

const PACKS: &[&str] = &[
    include_str!("../packs/standard-home.json"),
    include_str!("../packs/messy-downloads.json"),
    include_str!("../packs/hidden-instruction.json"),
    include_str!("../packs/finance-leak.json"),
    include_str!("../packs/big-folder.json"),
    include_str!("../packs/off-limits.json"),
];

#[derive(Deserialize)]
struct Pack {
    name: String,
    title: String,
    about: String,
    #[serde(default, rename = "try")]
    tries: Vec<String>,
    #[serde(default)]
    folders: Vec<String>,
    #[serde(default)]
    blocked: Vec<String>,
    #[serde(default)]
    files: Vec<PackFile>,
    #[serde(default)]
    links: Vec<Link>,
    #[serde(default)]
    generate: Vec<Generate>,
}

#[derive(Deserialize)]
struct PackFile {
    path: String,
    text: String,
    #[serde(default)]
    labels: Vec<String>,
    #[serde(default)]
    untrusted: bool,
    #[serde(default)]
    origin: String,
}

#[derive(Deserialize)]
struct Link {
    path: String,
    to: String,
}

#[derive(Deserialize)]
struct Generate {
    folder: String,
    count: usize,
    name: String,
    text: String,
}

fn packs() -> Vec<Pack> {
    PACKS.iter().map(|s| serde_json::from_str(s).expect("built-in pack is valid JSON")).collect()
}

pub fn list() -> Value {
    json!(packs()
        .iter()
        .map(|p| json!({ "name": p.name, "title": p.title, "about": p.about, "try": p.tries, "files": p.files.len() + p.generate.iter().map(|g| g.count).sum::<usize>() }))
        .collect::<Vec<_>>())
}

/// Wipe the sandbox back to empty. Refuses unless it carries capd's marker (or is empty).
pub fn wipe(root: &Path, state: &Path, meta: &mut Store) -> Result<(), String> {
    if root.exists() {
        let has_marker = root.join(MARKER).exists();
        let empty = std::fs::read_dir(root).map(|mut d| d.next().is_none()).unwrap_or(true);
        if !has_marker && !empty {
            return Err(format!("{} isn't a SIOS sandbox (no {MARKER} marker), so capd won't wipe it", root.display()));
        }
        for e in std::fs::read_dir(root).map_err(|e| e.to_string())?.flatten() {
            if e.file_name() == MARKER {
                continue;
            }
            let ft = e.file_type().map_err(|e| e.to_string())?;
            // links are removed as links; real folders recursively (this never follows links)
            if ft.is_dir() && !ft.is_symlink() {
                std::fs::remove_dir_all(e.path()).map_err(|e| e.to_string())?;
            } else {
                std::fs::remove_file(e.path()).map_err(|e| e.to_string())?;
            }
        }
    }
    for d in ["outbox", "trash", "snapshots"] {
        let _ = std::fs::remove_dir_all(state.join(d));
    }
    meta.files.clear();
    meta.blocked.clear();
    Ok(())
}

/// Put a pack's files into the sandbox (after wiping it, if `reset`).
pub fn apply(root: &Path, state: &Path, meta: &mut Store, name: &str, reset: bool) -> Result<Value, String> {
    let pack = packs().into_iter().find(|p| p.name == name).ok_or_else(|| format!("no pack called {name}"))?;
    if reset {
        wipe(root, state, meta)?;
    }
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    std::fs::write(root.join(MARKER), "This folder is a SIOS sandbox. capd may reset it.\n").map_err(|e| e.to_string())?;
    let mut n = 0;
    for f in &pack.folders {
        std::fs::create_dir_all(root.join(f)).map_err(|e| e.to_string())?;
    }
    for f in &pack.files {
        let p = root.join(&f.path);
        std::fs::create_dir_all(p.parent().unwrap()).map_err(|e| e.to_string())?;
        std::fs::write(&p, &f.text).map_err(|e| e.to_string())?;
        meta.files.insert(f.path.clone(), FileMeta { labels: f.labels.clone(), untrusted: f.untrusted, origin: f.origin.clone(), from: vec![], trashed_from: None });
        n += 1;
    }
    let topics = ["invoices", "hiring", "infrastructure", "sales", "the roadmap"];
    for g in &pack.generate {
        std::fs::create_dir_all(root.join(&g.folder)).map_err(|e| e.to_string())?;
        for i in 1..=g.count {
            let year = 2024 + (i % 3);
            let fill = |s: &str| s.replace("{n}", &format!("{i:03}")).replace("{year}", &year.to_string()).replace("{topic}", topics[i % topics.len()]);
            std::fs::write(root.join(&g.folder).join(fill(&g.name)), fill(&g.text)).map_err(|e| e.to_string())?;
            n += 1;
        }
    }
    for b in &pack.blocked {
        // a blocked folder gets labels from the pack's files; make sure it exists and is listed
        std::fs::create_dir_all(root.join(b)).map_err(|e| e.to_string())?;
        if !meta.blocked.contains(b) {
            meta.blocked.push(b.clone());
        }
    }
    for l in &pack.links {
        let p = root.join(&l.path);
        std::fs::create_dir_all(p.parent().unwrap()).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&p);
        std::os::unix::fs::symlink(root.join(&l.to), &p).map_err(|e| e.to_string())?;
    }
    meta.save().map_err(|e| e.to_string())?;
    Ok(json!({ "pack": pack.name, "title": pack.title, "files": n, "try": pack.tries }))
}

/// One test file, made by the owner from the Test lab.
pub fn create_file(root: &Path, meta: &mut Store, rel: &str, text: &str, labels: Vec<String>, untrusted: bool, origin: &str) -> Result<Value, String> {
    let r = crate::fsguard::resolve(root, rel).map_err(|e| e.to_string())?;
    if r.rel.is_empty() {
        return Err("give the file a name".into());
    }
    std::fs::create_dir_all(r.real.parent().unwrap()).map_err(|e| e.to_string())?;
    std::fs::write(&r.real, text).map_err(|e| e.to_string())?;
    meta.files.insert(r.rel.clone(), FileMeta { labels, untrusted, origin: if origin.is_empty() { "made by you (test file)".into() } else { origin.into() }, from: vec![], trashed_from: None });
    meta.save().map_err(|e| e.to_string())?;
    Ok(json!({ "path": r.rel }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_packs_load_and_reset_only_wipes_a_marked_sandbox() {
        let root = tempfile::tempdir().unwrap();
        let state = tempfile::tempdir().unwrap();
        let mut meta = Store::open(&state.path().join("meta.json"));
        for p in list().as_array().unwrap() {
            let name = p["name"].as_str().unwrap();
            let r = apply(root.path(), state.path(), &mut meta, name, true).unwrap();
            assert!(r["files"].as_u64().unwrap() > 0, "{name}");
        }
        // the last pack (off-limits) leaves a blocked folder and a link into it
        assert!(meta.blocked.contains(&"Documents/Health".to_string()));
        assert!(root.path().join("Projects/shortcut").symlink_metadata().unwrap().file_type().is_symlink());
        // a reset with a link pointing outside never touches what it points at
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("keep.txt"), "x").unwrap();
        std::os::unix::fs::symlink(outside.path(), root.path().join("out")).unwrap();
        apply(root.path(), state.path(), &mut meta, "standard-home", true).unwrap();
        assert!(outside.path().join("keep.txt").exists());
        assert!(root.path().join("Downloads/budget-2026.xlsx").exists());
        // a folder without the marker is never wiped
        let other = tempfile::tempdir().unwrap();
        std::fs::write(other.path().join("mine.txt"), "x").unwrap();
        assert!(wipe(other.path(), state.path(), &mut meta).is_err());
        assert!(other.path().join("mine.txt").exists());
    }
}
