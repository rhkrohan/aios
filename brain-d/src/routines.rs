//! Routines: plans that worked, kept so the same request next time needs no
//! model at all. They are re-checked with the broker every time they run.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::plan::Plan;

pub struct Routines {
    path: PathBuf,
    map: BTreeMap<String, Plan>,
}

/// "Please tidy my Downloads!" and "tidy downloads" are the same request: case,
/// punctuation and polite filler don't count (doc 20). Words that change what's
/// meant (names, folders, "not", numbers) always do.
pub fn key(request: &str) -> String {
    const FILLER: [&str; 17] = ["please", "pls", "can", "could", "would", "you", "hey", "sios", "the", "my", "a", "an", "just", "now", "thanks", "thank", "kindly"];
    legacy_key(request).split(' ').filter(|w| !FILLER.contains(w)).collect::<Vec<_>>().join(" ")
}

/// The key routines were saved under before doc 20 (every word counts).
fn legacy_key(request: &str) -> String {
    request.to_lowercase().split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()).collect::<Vec<_>>().join(" ")
}

impl Routines {
    pub fn open(path: &Path) -> Routines {
        let map = std::fs::read(path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        Routines { path: path.to_path_buf(), map }
    }

    pub fn get(&self, request: &str) -> Option<Plan> {
        self.map.get(&key(request)).or_else(|| self.map.get(&legacy_key(request))).cloned()
    }

    pub fn save(&mut self, request: &str, plan: &Plan) {
        self.map.insert(key(request), plan.clone());
        let _ = std::fs::write(&self.path, serde_json::to_vec_pretty(&self.map).unwrap_or_default());
    }

    pub fn clear(&mut self) {
        self.map.clear();
        let _ = std::fs::write(&self.path, b"{}");
    }

    pub fn count(&self) -> usize {
        self.map.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn polite_words_and_case_dont_make_a_new_request() {
        assert_eq!(key("Please tidy my Downloads!"), key("tidy downloads"));
        assert_eq!(key("Hey SIOS, can you tidy the Downloads now?"), "tidy downloads");
        assert_ne!(key("don't tidy downloads"), key("tidy downloads"), "meaning words stay");
        assert_ne!(key("move invoices to Finance"), key("move invoices to Work"));
    }

    #[test]
    fn same_words_same_routine() {
        assert_eq!(key("Tidy my Downloads!"), key("tidy  my downloads"));
    }
}
