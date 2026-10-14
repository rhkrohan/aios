//! AI account keys, encrypted at rest (D33).
//!
//! Each key is sealed with ChaCha20-Poly1305 under one master key, with the
//! provider's id bound in, so a sealed key can't be moved to another provider.
//! On SIOS the master key is itself sealed by systemd-creds (tied to this
//! machine, and to its TPM when there is one), so copying the state folder to
//! another computer gives nothing. Elsewhere (the Mac preview) it's a private
//! file, and `status` says so.
//!
//! A key is decrypted only for the one call that needs it, held in memory that
//! is wiped afterwards, and never logged, returned or written in plain text.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::Duration;
use zeroize::Zeroizing;

pub struct Keys {
    path: PathBuf,
    master: Zeroizing<[u8; 32]>,
    /// "systemd-creds" or "file": how the master key is kept.
    pub sealed_by: &'static str,
}

fn write_private(path: &Path, data: &[u8]) -> Result<(), String> {
    use std::os::unix::fs::OpenOptionsExt;
    let tmp = path.with_extension("tmp");
    let _ = std::fs::remove_file(&tmp);
    let mut f = std::fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&tmp).map_err(|e| e.to_string())?;
    std::io::Write::write_all(&mut f, data).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn random32() -> Result<Zeroizing<[u8; 32]>, String> {
    let mut b = Zeroizing::new([0u8; 32]);
    getrandom::getrandom(b.as_mut()).map_err(|e| e.to_string())?;
    Ok(b)
}

fn from_hex(s: &[u8]) -> Result<Zeroizing<[u8; 32]>, String> {
    let v = Zeroizing::new(hex::decode(String::from_utf8_lossy(s).trim()).map_err(|_| "the master key is damaged")?);
    let mut out = Zeroizing::new([0u8; 32]);
    if v.len() != 32 {
        return Err("the master key is damaged".into());
    }
    out.copy_from_slice(&v);
    Ok(out)
}

/// systemd-creds is used on SIOS (SIOS_IDENTITY=peer) when it's there.
fn use_creds() -> bool {
    crate::peer::enabled() && Path::new("/usr/bin/systemd-creds").exists()
}

fn master(dir: &Path) -> Result<(Zeroizing<[u8; 32]>, &'static str), String> {
    let t = Duration::from_secs(20);
    if use_creds() {
        let cred = dir.join("master.cred");
        let path = cred.to_string_lossy().into_owned();
        if cred.exists() {
            let o = crate::exec::run("/usr/bin/systemd-creds", &["decrypt", "--user", "--name=sios-master", &path, "-"], None, t)?;
            if o.code != Some(0) {
                return Err(format!("couldn't unseal the master key: {}", o.stderr.trim()));
            }
            return Ok((from_hex(&o.stdout)?, "systemd-creds"));
        }
        let k = random32()?;
        let hexed = Zeroizing::new(hex::encode(k.as_ref()));
        let o = crate::exec::run("/usr/bin/systemd-creds", &["encrypt", "--user", "--name=sios-master", "-", &path], Some(hexed.as_bytes()), t)?;
        if o.code != Some(0) {
            return Err(format!("couldn't seal a master key: {}", o.stderr.trim()));
        }
        return Ok((k, "systemd-creds"));
    }
    let file = dir.join("master.key");
    if let Ok(b) = std::fs::read(&file) {
        return Ok((from_hex(&b)?, "file"));
    }
    let k = random32()?;
    write_private(&file, hex::encode(k.as_ref()).as_bytes())?;
    Ok((k, "file"))
}

impl Keys {
    pub fn open(dir: &Path) -> Result<Keys, String> {
        let (master, sealed_by) = master(dir)?;
        Ok(Keys { path: dir.join("keys.json"), master, sealed_by })
    }

    fn load(&self) -> BTreeMap<String, String> {
        std::fs::read(&self.path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
    }

    fn cipher(&self) -> ChaCha20Poly1305 {
        ChaCha20Poly1305::new(Key::from_slice(self.master.as_ref()))
    }

    pub fn has(&self, id: &str) -> bool {
        self.load().contains_key(id)
    }

    pub fn set(&self, id: &str, key: &str) -> Result<(), String> {
        let mut nonce = [0u8; 12];
        getrandom::getrandom(&mut nonce).map_err(|e| e.to_string())?;
        let ct = self.cipher().encrypt(Nonce::from_slice(&nonce), Payload { msg: key.as_bytes(), aad: id.as_bytes() }).map_err(|_| "couldn't encrypt the key")?;
        let mut all = self.load();
        all.insert(id.to_string(), format!("{}.{}", B64.encode(nonce), B64.encode(ct)));
        write_private(&self.path, &serde_json::to_vec_pretty(&all).unwrap_or_default())
    }

    pub fn get(&self, id: &str) -> Result<Option<Zeroizing<String>>, String> {
        let Some(sealed) = self.load().remove(id) else { return Ok(None) };
        let (n, c) = sealed.split_once('.').ok_or("a stored key is damaged")?;
        let (n, c) = (B64.decode(n).map_err(|_| "a stored key is damaged")?, B64.decode(c).map_err(|_| "a stored key is damaged")?);
        if n.len() != 12 {
            return Err("a stored key is damaged".into());
        }
        let plain = Zeroizing::new(self.cipher().decrypt(Nonce::from_slice(&n), Payload { msg: &c, aad: id.as_bytes() }).map_err(|_| "a stored key can't be opened (made on another computer?)")?);
        Ok(Some(Zeroizing::new(String::from_utf8_lossy(&plain).into_owned())))
    }

    pub fn remove(&self, id: &str) -> Result<bool, String> {
        let mut all = self.load();
        let had = all.remove(id).is_some();
        write_private(&self.path, &serde_json::to_vec_pretty(&all).unwrap_or_default())?;
        Ok(had)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_are_sealed_bound_to_their_provider_and_private() {
        let d = tempfile::tempdir().unwrap();
        let k = Keys::open(d.path()).unwrap();
        k.set("anthropic", "sk-test-not-a-real-key-123").unwrap();
        assert_eq!(k.get("anthropic").unwrap().unwrap().as_str(), "sk-test-not-a-real-key-123");
        // never in plain text on disk
        let raw = std::fs::read_to_string(d.path().join("keys.json")).unwrap();
        assert!(!raw.contains("sk-test"));
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(std::fs::metadata(d.path().join("keys.json")).unwrap().permissions().mode() & 0o777, 0o600);
        // moving a sealed key to another provider doesn't open it
        let mut all: BTreeMap<String, String> = serde_json::from_str(&raw).unwrap();
        let v = all.remove("anthropic").unwrap();
        all.insert("openai".into(), v);
        std::fs::write(d.path().join("keys.json"), serde_json::to_vec(&all).unwrap()).unwrap();
        assert!(k.get("openai").is_err());
        // a reopened store reads the same master key; removing works
        let k2 = Keys::open(d.path()).unwrap();
        k2.set("openai", "sk-other").unwrap();
        assert!(k2.has("openai") && k2.remove("openai").unwrap() && !k2.has("openai"));
        assert_eq!(k2.sealed_by, "file");
    }
}
