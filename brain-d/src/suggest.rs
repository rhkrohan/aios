//! Proactive SIOS (A7, D69, D70): SIOS notices things and offers to help.
//! Each suggestion is a card with a headline the OS writes (never file contents
//! or anyone's words) and a fixed request. "Do it" starts a normal goal with that
//! request, so it plans, checks with the broker and asks like any other: file
//! changes still show the plan first (D57). Detectors are plain rules, no model.
//! Dismissing the same kind three times turns it off.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Suggestion {
    pub id: String,
    pub kind: String,
    /// Written by SIOS from counts and folder names, never from what files say.
    pub headline: String,
    /// What "Do it" asks SIOS, word for word.
    pub request: String,
    pub created: u64,
    pub expires: u64,
}

#[derive(Serialize, Deserialize, Default)]
pub struct Suggestions {
    #[serde(default)]
    pub list: Vec<Suggestion>,
    /// kind -> (times dismissed, not again before)
    #[serde(default)]
    pub dismissed: HashMap<String, (u32, u64)>,
    /// kind -> last made (so a kind comes back at most once a day)
    #[serde(default)]
    pub made: HashMap<String, u64>,
    #[serde(skip)]
    path: PathBuf,
}

const DAY: u64 = 86400;

impl Suggestions {
    pub fn open(path: PathBuf) -> Suggestions {
        let mut s: Suggestions = std::fs::read(&path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        s.path = path;
        s
    }

    fn save(&self) {
        let _ = std::fs::write(&self.path, serde_json::to_vec_pretty(self).unwrap_or_default());
    }

    fn off(&self, kind: &str, now: u64) -> bool {
        self.dismissed.get(kind).is_some_and(|(n, until)| *n >= 3 || *until > now)
    }

    /// Offer a card unless this kind is off, already showing, or was made today.
    fn offer(&mut self, kind: &str, headline: String, request: &str, now: u64) {
        if self.off(kind, now) || self.list.iter().any(|s| s.kind == kind) || self.made.get(kind).is_some_and(|t| now.saturating_sub(*t) < DAY) {
            return;
        }
        let id = format!("s{:x}{:x}", now, self.list.len() as u64 + self.made.len() as u64);
        self.list.push(Suggestion { id, kind: kind.into(), headline, request: request.into(), created: now, expires: now + DAY });
        self.made.insert(kind.into(), now);
        self.save();
    }

    /// Look around (every minute): plain rules over names, counts and times.
    pub fn detect(&mut self, root: &Path, now: u64, local_minutes: u64) {
        let before = self.list.len();
        self.list.retain(|s| s.expires > now);
        let recent = |dir: &Path, within: u64| -> Vec<(String, u64)> {
            std::fs::read_dir(dir)
                .map(|d| {
                    d.flatten()
                        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
                        .filter_map(|e| {
                            let name = e.file_name().to_string_lossy().into_owned();
                            let t = e.metadata().ok()?.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_secs();
                            (!name.starts_with('.') && now.saturating_sub(t) <= within).then_some((name, t))
                        })
                        .collect()
                })
                .unwrap_or_default()
        };
        // Downloads filling up
        let new = recent(&root.join("Downloads"), 3 * DAY).len();
        if new >= 8 {
            self.offer("downloads", format!("Downloads has {new} new files. Tidy them into folders?"), "Tidy my Downloads: sort the files into folders by type", now);
        }
        // old screenshots piling up
        let old_shots = ["Downloads", "Pictures", "Desktop"]
            .iter()
            .flat_map(|d| recent(&root.join(d), 3650 * DAY))
            .filter(|(n, t)| n.to_lowercase().starts_with("screenshot") && now.saturating_sub(*t) > 30 * DAY)
            .count();
        if old_shots >= 5 {
            self.offer("screenshots", format!("{old_shots} screenshots are over a month old. Move them into Pictures/Screenshots?"), "Move my screenshots that are over a month old into Pictures/Screenshots", now);
        }
        // a morning look at the day, once, between 5 and 11
        if (5 * 60..11 * 60).contains(&local_minutes) {
            self.offer("morning", "Good morning. Want a quick look at what's new since yesterday?".into(), "Give me a short morning briefing: what's new in Downloads and Documents since yesterday, and anything waiting for my OK", now);
        }
        if self.list.len() != before {
            self.save();
        }
    }

    pub fn take(&mut self, id: &str) -> Option<Suggestion> {
        let i = self.list.iter().position(|s| s.id == id)?;
        let s = self.list.remove(i);
        self.save();
        Some(s)
    }

    /// "Not now". Only the owner's own surfaces count toward turning a kind off; from
    /// anywhere else (the widgets' open CLI) it only quiets the card for a day.
    pub fn dismiss(&mut self, id: &str, now: u64, counts: bool) -> bool {
        let Some(s) = self.take(id) else { return false };
        let e = self.dismissed.entry(s.kind).or_insert((0, 0));
        e.0 += counts as u32;
        e.1 = now + DAY;
        self.save();
        true
    }

    /// For anyone (the desktop widgets): headlines only, written by SIOS.
    pub fn headlines(&self) -> Value {
        json!(self.list.iter().map(|s| json!({ "id": s.id, "headline": s.headline })).collect::<Vec<_>>())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downloads_filling_up_becomes_one_card_and_dismissing_quiets_it() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("Downloads")).unwrap();
        for i in 0..9 {
            std::fs::write(d.path().join(format!("Downloads/f{i}.pdf")), "x").unwrap();
        }
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
        let mut s = Suggestions::open(d.path().join("s.json"));
        s.detect(d.path(), now, 14 * 60);
        assert_eq!(s.list.len(), 1);
        assert!(s.list[0].headline.contains("9 new files"));
        s.detect(d.path(), now + 60, 14 * 60);
        assert_eq!(s.list.len(), 1, "one card per kind");
        let id = s.list[0].id.clone();
        assert!(s.dismiss(&id, now, true));
        // the next day it may come back; three no's turn the kind off for good
        for day in [2, 4] {
            s.offer("downloads", "x".into(), "y", now + day * DAY);
            assert_eq!(s.list.len(), 1, "day {day}");
            let id = s.list[0].id.clone();
            s.dismiss(&id, now + day * DAY, true);
        }
        s.offer("downloads", "x".into(), "y", now + 6 * DAY);
        assert!(s.list.is_empty(), "three no's turn it off");
        // anyone else's "not now" only quiets a kind for the day, never for good
        s.offer("screens", "x".into(), "y", now);
        for day in [0, 2, 4, 6] {
            s.offer("screens", "x".into(), "y", now + day * DAY);
            let id = s.list[0].id.clone();
            s.dismiss(&id, now + day * DAY, false);
        }
        s.offer("screens", "x".into(), "y", now + 8 * DAY);
        assert_eq!(s.list.len(), 1, "open callers can't turn a kind off");
        // the headline never quotes a file
        assert!(!s.headlines().to_string().contains("f1.pdf"));
    }
}
