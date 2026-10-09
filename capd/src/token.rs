//! Capability tokens.
//!
//! A capability says exactly what one requester may do for one goal: which
//! tools, under which folders, until when, how many times, whether anything
//! may leave the computer, and how many actions it may spend. It is signed with
//! a key only capd holds, so it can't be forged or edited. A holder can derive
//! a narrower child for a sub-task, never a wider one.
//!
//! Wire format: `base64url(json) "." base64url(hmac_sha256(key, json))`.

use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64;
use base64::Engine;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Cap {
    pub id: String,
    /// The capability this one was derived from. None for one the owner minted.
    pub parent: Option<String>,
    /// Who holds it: "openai-agent", "claude-desktop", ...
    pub principal: String,
    /// The goal it was minted for, in the owner's words.
    pub goal: String,
    /// Tool names it may call.
    pub tools: Vec<String>,
    /// Folders (relative to the sandbox root) it may touch. "" means the whole root.
    pub paths: Vec<String>,
    /// Unix seconds. Unusable at or after this moment.
    pub expires_at: u64,
    /// How many calls it may make in total. None means no limit (expiry still applies).
    pub uses: Option<u32>,
    /// Nothing may leave the computer under this capability.
    pub no_egress: bool,
    /// How many actions the whole goal may spend.
    pub budget: Option<u32>,
    /// Acting for the owner (SIOS's own brain or the owner): may read every memory group.
    /// Set only by the owner or by brain-d's authenticated request; never gained by a child.
    #[serde(default)]
    pub own: bool,
}

#[derive(Debug, PartialEq)]
pub enum TokenError {
    Malformed,
    BadSignature,
}

impl std::fmt::Display for TokenError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TokenError::Malformed => write!(f, "not a capability token"),
            TokenError::BadSignature => write!(f, "signature doesn't match: forged or edited"),
        }
    }
}

fn mac(key: &[u8]) -> HmacSha256 {
    HmacSha256::new_from_slice(key).expect("hmac accepts any key length")
}

pub fn sign(key: &[u8], cap: &Cap) -> String {
    let body = serde_json::to_vec(cap).expect("cap serializes");
    let mut m = mac(key);
    m.update(&body);
    let tag = m.finalize().into_bytes();
    format!("{}.{}", B64.encode(&body), B64.encode(tag))
}

pub fn verify(key: &[u8], token: &str) -> Result<Cap, TokenError> {
    let (body_b64, tag_b64) = token.trim().split_once('.').ok_or(TokenError::Malformed)?;
    let body = B64.decode(body_b64).map_err(|_| TokenError::Malformed)?;
    let tag = B64.decode(tag_b64).map_err(|_| TokenError::Malformed)?;
    let mut m = mac(key);
    m.update(&body);
    // constant-time comparison
    m.verify_slice(&tag).map_err(|_| TokenError::BadSignature)?;
    serde_json::from_slice(&body).map_err(|_| TokenError::Malformed)
}

/// Is `path` inside `prefix`? Both are normalized relative paths; "" is the root.
pub fn within(path: &str, prefix: &str) -> bool {
    prefix.is_empty() || path == prefix || path.starts_with(&format!("{prefix}/"))
}

/// A child may only narrow its parent. Returns the first way it tries to widen.
pub fn check_narrower(child: &Cap, parent: &Cap) -> Result<(), String> {
    if let Some(t) = child.tools.iter().find(|t| !parent.tools.contains(t)) {
        return Err(format!("the parent can't use {t}, so it can't hand it out"));
    }
    if let Some(p) = child.paths.iter().find(|p| !parent.paths.iter().any(|pp| within(p, pp))) {
        return Err(format!("{} is outside what the parent was given", if p.is_empty() { "the whole folder" } else { p }));
    }
    if child.expires_at > parent.expires_at {
        return Err("it can't outlive its parent".into());
    }
    if child.own && !parent.own {
        return Err("a handed-on pass can't act as the owner".into());
    }
    if parent.no_egress && !child.no_egress {
        return Err("the parent may not send anything out, so the child can't either".into());
    }
    match (child.uses, parent.uses) {
        (None, Some(_)) => return Err("the parent has a use limit, so the child needs one too".into()),
        (Some(c), Some(p)) if c > p => return Err(format!("{c} uses is more than the parent's {p}")),
        _ => {}
    }
    match (child.budget, parent.budget) {
        (None, Some(_)) => return Err("the parent has a budget, so the child needs one too".into()),
        (Some(c), Some(p)) if c > p => return Err(format!("a budget of {c} is more than the parent's {p}")),
        _ => {}
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cap() -> Cap {
        Cap {
            id: "c1".into(),
            parent: None,
            principal: "openai-agent".into(),
            goal: "test".into(),
            tools: vec!["fs.read".into(), "fs.write".into()],
            paths: vec!["Projects".into()],
            expires_at: 2_000_000_000,
            uses: Some(10),
            no_egress: true,
            budget: Some(20),
            own: false,
        }
    }

    #[test]
    fn round_trip() {
        let k = b"key";
        assert_eq!(verify(k, &sign(k, &cap())).unwrap(), cap());
    }

    #[test]
    fn edited_token_is_rejected() {
        let k = b"key";
        let t = sign(k, &cap());
        let (body, tag) = t.split_once('.').unwrap();
        let mut json: serde_json::Value = serde_json::from_slice(&B64.decode(body).unwrap()).unwrap();
        json["tools"] = serde_json::json!(["fs.read", "fs.write", "mail.send"]);
        let forged = format!("{}.{}", B64.encode(serde_json::to_vec(&json).unwrap()), tag);
        assert_eq!(verify(k, &forged), Err(TokenError::BadSignature));
    }

    #[test]
    fn other_key_is_rejected() {
        assert_eq!(verify(b"other", &sign(b"key", &cap())), Err(TokenError::BadSignature));
    }

    #[test]
    fn garbage_is_malformed() {
        assert_eq!(verify(b"key", "hello"), Err(TokenError::Malformed));
    }

    #[test]
    fn within_paths() {
        assert!(within("Projects/a.md", "Projects"));
        assert!(within("Projects", "Projects"));
        assert!(!within("ProjectsX/a.md", "Projects"));
        assert!(within("anything", ""));
    }

    #[test]
    fn narrowing_rules() {
        let p = cap();
        let mut c = p.clone();
        c.paths = vec!["Projects/board".into()];
        c.uses = Some(1);
        assert!(check_narrower(&c, &p).is_ok());

        let mut wider = p.clone();
        wider.tools.push("mail.send".into());
        assert!(check_narrower(&wider, &p).is_err());

        let mut outside = p.clone();
        outside.paths = vec!["Documents".into()];
        assert!(check_narrower(&outside, &p).is_err());

        let mut longer = p.clone();
        longer.expires_at += 1;
        assert!(check_narrower(&longer, &p).is_err());

        let mut egress = p.clone();
        egress.no_egress = false;
        assert!(check_narrower(&egress, &p).is_err());

        let mut unlimited = p.clone();
        unlimited.uses = None;
        assert!(check_narrower(&unlimited, &p).is_err());
    }
}
