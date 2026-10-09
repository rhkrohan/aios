//! What capd knows about each file beyond its bytes: labels, trust, where it
//! came from, and what it was made from. Stored next to capd's state, keyed by
//! the file's path inside the sandbox. (On the real OS this moves to extended
//! attributes plus an index in Vault.)

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::token::within;

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct FileMeta {
    #[serde(default)]
    pub labels: Vec<String>,
    /// Content from the web, email or anywhere unknown is untrusted.
    #[serde(default)]
    pub untrusted: bool,
    #[serde(default)]
    pub origin: String,
    /// Paths of the files this one was made from.
    #[serde(default)]
    pub from: Vec<String>,
    /// Set while it's in the Trash: where it came from, so it can be put back.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trashed_from: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
pub struct Store {
    #[serde(default)]
    pub files: BTreeMap<String, FileMeta>,
    /// Places no AI may touch, whatever its capability says.
    #[serde(default)]
    pub blocked: Vec<String>,
    #[serde(skip)]
    path: PathBuf,
}

impl Store {
    pub fn open(path: &Path) -> Store {
        let mut s: Store = std::fs::read(path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        s.path = path.to_path_buf();
        s
    }

    pub fn save(&self) -> std::io::Result<()> {
        std::fs::write(&self.path, serde_json::to_vec_pretty(self).expect("store serializes"))
    }

    /// Labels on the file itself plus every folder above it.
    pub fn labels_at(&self, rel: &str) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        for (p, m) in &self.files {
            if within(rel, p) && !p.is_empty() {
                for l in &m.labels {
                    if !out.contains(l) {
                        out.push(l.clone());
                    }
                }
            }
        }
        out
    }

    pub fn untrusted_at(&self, rel: &str) -> bool {
        self.files.iter().any(|(p, m)| m.untrusted && within(rel, p) && !p.is_empty())
    }

    /// Is this path a blocked place or inside one?
    pub fn is_blocked(&self, rel: &str) -> Option<&str> {
        self.blocked.iter().find(|b| within(rel, b)).map(|s| s.as_str())
    }

    /// Does this path contain a blocked place? Moving or trashing it would carry the place along.
    pub fn contains_blocked(&self, rel: &str) -> Option<&str> {
        self.blocked.iter().find(|b| within(b, rel)).map(|s| s.as_str())
    }

    /// A file was made from `sources`: it inherits their labels and their distrust.
    pub fn derive(&mut self, rel: &str, by: &str, sources: &[(String, Vec<String>, bool)]) {
        let m = self.files.entry(rel.to_string()).or_default();
        for (path, labels, untrusted) in sources {
            if path == rel {
                continue;
            }
            if !m.from.contains(path) {
                m.from.push(path.clone());
            }
            for l in labels {
                if !m.labels.contains(l) {
                    m.labels.push(l.clone());
                }
            }
            m.untrusted |= *untrusted;
        }
        if m.origin.is_empty() {
            m.origin = format!("made by {by}");
        }
    }

    /// Keep metadata attached when a file or folder moves.
    pub fn rename(&mut self, from: &str, to: &str) {
        for b in self.blocked.iter_mut() {
            if within(b, from) {
                *b = format!("{to}{}", &b[from.len()..]);
            }
        }
        let moved: Vec<(String, FileMeta)> = self.files.iter().filter(|(p, _)| within(p, from)).map(|(p, m)| (p.clone(), m.clone())).collect();
        for (p, m) in moved {
            self.files.remove(&p);
            let newp = format!("{to}{}", &p[from.len()..]);
            self.files.insert(newp, m);
        }
        for m in self.files.values_mut() {
            for f in m.from.iter_mut() {
                if within(f, from) {
                    *f = format!("{to}{}", &f[from.len()..]);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_flow_down_folders_and_into_derived_files() {
        let mut s = Store::default();
        s.files.insert("Documents/Taxes".into(), FileMeta { labels: vec!["Sensitive".into()], ..Default::default() });
        assert_eq!(s.labels_at("Documents/Taxes/2025.pdf"), vec!["Sensitive"]);
        s.derive("Projects/summary.md", "openai-agent", &[("Downloads/budget.csv".into(), vec!["Finance".into()], false), ("Downloads/deck.txt".into(), vec![], true)]);
        let m = &s.files["Projects/summary.md"];
        assert_eq!(m.labels, vec!["Finance"]);
        assert!(m.untrusted);
        assert_eq!(m.from.len(), 2);
    }

    #[test]
    fn rename_keeps_metadata_and_lineage() {
        let mut s = Store::default();
        s.files.insert("Downloads/a.csv".into(), FileMeta { labels: vec!["Finance".into()], ..Default::default() });
        s.derive("Projects/b.md", "x", &[("Downloads/a.csv".into(), vec!["Finance".into()], false)]);
        s.rename("Downloads/a.csv", "Documents/a.csv");
        assert!(s.files.contains_key("Documents/a.csv"));
        assert_eq!(s.files["Projects/b.md"].from, vec!["Documents/a.csv"]);
    }
}
