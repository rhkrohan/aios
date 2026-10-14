//! Keeps every path inside the sandbox root.
//!
//! An AI names files with relative paths ("Projects/notes.md"). Before capd
//! touches anything, the path is normalized and checked: no absolute paths, no
//! "..", and after following symlinks the real location must still be inside
//! the root. Otherwise a link named "notes" pointing at ~/.ssh would be a way out.

use std::io;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, PartialEq)]
pub enum PathError {
    Absolute,
    ParentDir,
    Escapes,
    Hidden,
    Io(String),
}

impl std::fmt::Display for PathError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PathError::Absolute => write!(f, "absolute paths aren't allowed; name files relative to the sandbox"),
            PathError::ParentDir => write!(f, "\"..\" isn't allowed in paths"),
            PathError::Escapes => write!(f, "that path leads outside the sandbox (through a link)"),
            PathError::Hidden => write!(f, "hidden folders and files (names starting with \".\") are off limits to every AI; only the Trash is allowed"),
            PathError::Io(e) => write!(f, "{e}"),
        }
    }
}

/// A checked path: where it really is on disk, and its normalized name.
#[derive(Debug, Clone)]
pub struct Resolved {
    pub real: PathBuf,
    pub rel: String,
}

/// Normalize a relative path to "a/b/c" form, refusing anything that could climb out.
pub fn normalize(rel: &str) -> Result<String, PathError> {
    let p = Path::new(rel.trim());
    let mut parts: Vec<String> = Vec::new();
    for c in p.components() {
        match c {
            Component::Normal(s) => parts.push(s.to_string_lossy().into_owned()),
            Component::CurDir => {}
            Component::ParentDir => return Err(PathError::ParentDir),
            Component::RootDir | Component::Prefix(_) => return Err(PathError::Absolute),
        }
    }
    Ok(parts.join("/"))
}

/// Resolve `rel` under `root`. The target may not exist yet (for writes); then its
/// nearest existing ancestor is what gets checked.
pub fn resolve(root: &Path, rel: &str) -> Result<Resolved, PathError> {
    let rel = normalize(rel)?;
    check_visible(&rel)?;
    let root_real = root.canonicalize().map_err(|e| PathError::Io(e.to_string()))?;
    let target = root_real.join(&rel);

    // find the deepest part that exists, and canonicalize that
    let mut existing = target.clone();
    let mut rest: Vec<std::ffi::OsString> = Vec::new();
    loop {
        match existing.symlink_metadata() {
            Ok(_) => break,
            Err(e) if e.kind() == io::ErrorKind::NotFound => {
                let name = existing.file_name().map(|n| n.to_owned());
                match (name, existing.parent()) {
                    (Some(n), Some(parent)) => {
                        rest.push(n);
                        existing = parent.to_path_buf();
                    }
                    _ => return Err(PathError::Escapes),
                }
            }
            Err(e) => return Err(PathError::Io(e.to_string())),
        }
    }
    let mut real = existing.canonicalize().map_err(|e| PathError::Io(e.to_string()))?;
    if !real.starts_with(&root_real) {
        return Err(PathError::Escapes);
    }
    for n in rest.into_iter().rev() {
        real.push(n);
    }
    // Name the file by where it really is, not by the name it was asked for:
    // a link inside the sandbox must not disguise a blocked or out-of-slice place.
    let rel = real.strip_prefix(&root_real).map_err(|_| PathError::Escapes)?.to_string_lossy().replace('\\', "/");
    check_visible(&rel)?;
    Ok(Resolved { real, rel })
}

/// Hidden places (.ssh, .config, capd's own state...) are never reachable by name or
/// through a link. The Trash at the top of the root is the one exception.
fn check_visible(rel: &str) -> Result<(), PathError> {
    for (i, part) in rel.split('/').enumerate() {
        if part.starts_with('.') && !(i == 0 && part == crate::tools::TRASH) {
            return Err(PathError::Hidden);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes() {
        assert_eq!(normalize("./Projects//a.md").unwrap(), "Projects/a.md");
        assert_eq!(normalize("").unwrap(), "");
        assert_eq!(normalize("../x"), Err(PathError::ParentDir));
        assert_eq!(normalize("a/../../x"), Err(PathError::ParentDir));
        assert_eq!(normalize("/etc/passwd"), Err(PathError::Absolute));
    }

    #[test]
    fn stays_inside() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("Projects")).unwrap();
        let r = resolve(dir.path(), "Projects/new.md").unwrap();
        assert!(r.real.ends_with("Projects/new.md"));
        assert_eq!(r.rel, "Projects/new.md");
    }

    #[test]
    fn links_are_named_by_where_they_lead() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("Documents/Taxes")).unwrap();
        std::fs::create_dir(dir.path().join("Projects")).unwrap();
        std::os::unix::fs::symlink(dir.path().join("Documents/Taxes"), dir.path().join("Projects/link")).unwrap();
        assert_eq!(resolve(dir.path(), "Projects/link/return.txt").unwrap().rel, "Documents/Taxes/return.txt");
    }

    #[test]
    fn hidden_places_are_off_limits_but_the_trash_is_not() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".ssh")).unwrap();
        std::fs::create_dir_all(dir.path().join(".Trash")).unwrap();
        std::fs::create_dir(dir.path().join("Projects")).unwrap();
        assert_eq!(resolve(dir.path(), ".ssh/id_ed25519").unwrap_err(), PathError::Hidden);
        assert_eq!(resolve(dir.path(), ".local/share/sios/capd.key").unwrap_err(), PathError::Hidden);
        assert_eq!(resolve(dir.path(), "Projects/.env").unwrap_err(), PathError::Hidden);
        assert_eq!(resolve(dir.path(), "Projects/.Trash/x").unwrap_err(), PathError::Hidden);
        assert!(resolve(dir.path(), ".Trash/old.txt").is_ok());
        // a visible link into a hidden place is named by where it leads, and refused
        std::os::unix::fs::symlink(dir.path().join(".ssh"), dir.path().join("Projects/keys")).unwrap();
        assert_eq!(resolve(dir.path(), "Projects/keys/id").unwrap_err(), PathError::Hidden);
    }

    #[test]
    fn symlink_out_is_blocked() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret.txt"), "x").unwrap();
        std::os::unix::fs::symlink(outside.path(), dir.path().join("link")).unwrap();
        assert_eq!(resolve(dir.path(), "link/secret.txt").unwrap_err(), PathError::Escapes);
        assert_eq!(resolve(dir.path(), "link/new.txt").unwrap_err(), PathError::Escapes);
    }
}
