//! Routines: plans that worked, kept so the same request next time needs no
//! model at all. They are re-checked with the broker every time they run.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::plan::Plan;

pub struct Routines {
    path: PathBuf,
    map: BTreeMap<String, Plan>,
}

/// "Tidy my Downloads!" and "tidy my downloads" are the same request.
pub fn key(request: &str) -> String {
    request.to_lowercase().split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()).collect::<Vec<_>>().join(" ")
}

impl Routines {
    pub fn open(path: &Path) -> Routines {
        let map = std::fs::read(path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        Routines { path: path.to_path_buf(), map }
    }

    pub fn get(&self, request: &str) -> Option<Plan> {
        self.map.get(&key(request)).cloned()
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
    fn same_words_same_routine() {
        assert_eq!(key("Tidy my Downloads!"), key("tidy  my downloads"));
    }
}
