//! Reviewing and merging a coding agent's work (D102), outside the broker's lock.
//!
//! The agent owns its clone completely (config, hooks, attributes, refs), so git
//! never runs inside it. Its branch is fetched into a bare copy in the broker's
//! state folder (which the sandbox can't reach); diffs are read there. Before a
//! fetch, the clone's .git is walked: a link or an alternates file anywhere in it
//! could point the fetch at another of the owner's repositories, so it's refused.
//! The merge runs in the owner's project with the owner's own attributes from
//! before the merge (never the agent's .gitattributes), no submodules, no LFS
//! downloads and no hooks. Every git call has a time limit and an output cap.

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// What one review or merge needs, taken from the broker's state under its lock.
pub struct Job {
    pub merge: bool,
    pub agent: String,
    pub name: String,
    pub slug: String,
    pub folder: String,
    pub project: PathBuf,
    pub worktree: PathBuf,
    pub review: PathBuf,
}

const MAX_OUT: usize = 2_000_000;
const MAX_DIFF: usize = 300_000;
/// A clone's .git bigger than this isn't fetched (a flood shouldn't fill the disk).
const MAX_GIT_BYTES: u64 = 2_000_000_000;
const MAX_GIT_FILES: u64 = 200_000;

/// git as the broker, in repositories whose config is the owner's or the broker's:
/// no hooks, no fsmonitor, no pager, a time limit and an output cap.
pub fn git_out(args: &[&str]) -> Result<String, String> {
    git_env(args, &[])
}

fn git_env(args: &[&str], env: &[(&str, &str)]) -> Result<String, String> {
    let mut all = vec!["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "--no-pager"];
    all.extend_from_slice(args);
    let o = crate::exec::run_with("/usr/bin/git", &all, env, None, Duration::from_secs(45), MAX_OUT)?;
    match o.code {
        Some(0) => Ok(String::from_utf8_lossy(&o.stdout).into_owned()),
        None => Err("git took too long or printed too much".into()),
        Some(_) => Err(o.stderr.trim().chars().take(200).collect()),
    }
}

/// Text an agent wrote, for a window: no control characters except new lines and tabs.
pub fn clean_text(t: &str, n: usize) -> String {
    t.chars().filter(|c| !c.is_control() || *c == '\n' || *c == '\t').take(n).collect()
}

/// The clone's .git may hold only plain files and folders, no alternates, and not
/// too much: anything else could make the broker's fetch read elsewhere.
fn plain_git_dir(dotgit: &Path) -> Result<(), String> {
    let bad = || Err::<(), String>("its workspace's git folder has links or points at other repositories, so SIOS won't read it. Throw its work away to start it fresh.".into());
    let meta = dotgit.symlink_metadata().map_err(|_| "it hasn't made a workspace yet".to_string())?;
    if !meta.is_dir() {
        return bad();
    }
    for alt in ["objects/info/alternates", "objects/info/http-alternates", "commondir"] {
        if dotgit.join(alt).symlink_metadata().is_ok() {
            return bad();
        }
    }
    let (mut bytes, mut files) = (0u64, 0u64);
    let mut stack = vec![dotgit.to_path_buf()];
    while let Some(d) = stack.pop() {
        for e in std::fs::read_dir(&d).map_err(|e| e.to_string())?.flatten() {
            let m = e.path().symlink_metadata().map_err(|e| e.to_string())?;
            if m.file_type().is_symlink() {
                return bad();
            }
            files += 1;
            if m.is_dir() {
                stack.push(e.path());
            } else {
                bytes += m.len();
            }
            if bytes > MAX_GIT_BYTES || files > MAX_GIT_FILES {
                return Err("its workspace has grown too big to review here".into());
            }
        }
    }
    Ok(())
}

/// Fetch its branch and the project's HEAD into the broker's own bare copy.
fn fetch(j: &Job) -> Result<String, String> {
    let dotgit = j.worktree.join(".git");
    if j.worktree.canonicalize().ok().as_ref() != Some(&j.worktree) {
        return Err("its workspace folder leads somewhere else (a link on the way)".into());
    }
    plain_git_dir(&dotgit)?;
    let r = j.review.to_string_lossy().to_string();
    if !j.review.exists() {
        git_out(&["init", "-q", "--bare", &r])?;
    }
    let branch = format!("+refs/heads/sios/{}:refs/heads/agent", j.slug);
    let fetch = |src: &str, spec: &str| git_out(&["--git-dir", &r, "-c", "protocol.file.allow=always", "-c", "transfer.fsckObjects=true", "fetch", "-q", "--no-tags", "--no-recurse-submodules", "--upload-pack=/usr/bin/git-upload-pack", src, spec]);
    fetch(&dotgit.to_string_lossy(), &branch).map_err(|e| if e.contains("couldn't find remote ref") { format!("{} hasn't committed anything on its branch yet", j.name) } else { e })?;
    fetch(&j.project.to_string_lossy(), "+HEAD:refs/heads/base")?;
    Ok(r)
}

/// Do the job: read the changes, or merge them. Runs without the broker's lock.
pub fn run(j: &Job) -> Result<Value, String> {
    let r = fetch(j)?;
    if j.merge { merge(j, &r) } else { changes(j, &r) }
}

fn changes(j: &Job, r: &str) -> Result<Value, String> {
    let g = |args: &[&str]| -> Result<String, String> {
        let mut all = vec!["--git-dir", r];
        all.extend_from_slice(args);
        git_out(&all)
    };
    let base = g(&["merge-base", "base", "agent"]).map(|s| s.trim().to_string()).unwrap_or_default();
    if base.is_empty() {
        return Err("its branch and your project have nothing in common".into());
    }
    let range = format!("{base}..agent");
    let commits: Vec<Value> = g(&["log", "--no-color", "--format=%h%x09%at%x09%s", "-n", "100", &range])?.lines().filter_map(|l| {
        let mut it = l.splitn(3, '\t');
        Some(json!({ "id": it.next()?, "at": it.next()?.parse::<u64>().unwrap_or(0), "title": clean_text(it.next().unwrap_or(""), 200) }))
    }).collect();
    let files: Vec<Value> = g(&["diff", "--no-ext-diff", "--no-textconv", "--numstat", &base, "agent"])?.lines().take(500).filter_map(|l| {
        let mut it = l.splitn(3, '\t');
        let (add, del, path) = (it.next()?, it.next()?, it.next()?);
        Some(json!({ "path": clean_text(path, 300), "added": add.parse::<u64>().ok(), "removed": del.parse::<u64>().ok() }))
    }).collect();
    // links it adds or changes: shown, so a link out of the project is never a surprise
    let links: Vec<String> = g(&["diff", "--raw", "--no-renames", &base, "agent"])?.lines().filter_map(|l| {
        let (meta, path) = l.split_once('\t')?;
        meta.split(' ').nth(1).filter(|m| *m == "120000").map(|_| clean_text(path, 300))
    }).take(50).collect();
    let diff = g(&["diff", "--no-color", "--no-ext-diff", "--no-textconv", &base, "agent"]).unwrap_or_else(|e| format!("(the diff couldn't be shown: {e})"));
    let cut = diff.len() > MAX_DIFF;
    let mut end = diff.len().min(MAX_DIFF);
    while !diff.is_char_boundary(end) {
        end -= 1;
    }
    let ahead = g(&["rev-list", "--count", "agent..base"]).ok().and_then(|s| s.trim().parse::<u64>().ok()).unwrap_or(0);
    Ok(json!({ "agent": j.agent, "branch": format!("sios/{}", j.slug), "commits": commits, "files": files, "links": links, "diff": clean_text(&diff[..end], MAX_DIFF), "cut": cut, "project_moved_on": ahead }))
}

fn merge(j: &Job, r: &str) -> Result<Value, String> {
    let p = j.project.to_string_lossy().to_string();
    // no LFS downloads from addresses the agent's files could name
    let env = [("GIT_LFS_SKIP_SMUDGE", "1")];
    let pg = |args: &[&str]| -> Result<String, String> {
        let mut all = vec!["-C", p.as_str(), "-c", "submodule.recurse=false"];
        all.extend_from_slice(args);
        git_env(&all, &env)
    };
    if !pg(&["status", "--porcelain", "--untracked-files=no"])?.trim().is_empty() {
        return Err("your project has changes that aren't committed: commit or put them aside first".into());
    }
    let before = pg(&["rev-parse", "HEAD"])?.trim().to_string();
    let local = format!("refs/sios/{}", j.slug);
    pg(&["-c", "protocol.file.allow=always", "-c", "transfer.fsckObjects=true", "fetch", "-q", "--no-tags", "--no-recurse-submodules", r, &format!("+refs/heads/agent:{local}")])?;
    if pg(&["merge-base", "--is-ancestor", &local, "HEAD"]).is_ok() {
        return Ok(json!({ "merged": false, "why": "nothing new: your project already has all of its work" }));
    }
    // the owner's attributes from before the merge: the agent's .gitattributes can't
    // pick a filter or merge program from the owner's settings for this step
    let attrs = format!("--attr-source={before}");
    let who: Vec<&str> = if pg(&["config", "user.email"]).is_ok_and(|e| !e.trim().is_empty()) { vec![] } else { vec!["-c", "user.name=SIOS", "-c", "user.email=sios@localhost"] };
    let msg = format!("Merge the work of agent {} (sios/{})", j.name, j.slug);
    let mut m: Vec<&str> = vec![attrs.as_str()];
    m.extend_from_slice(&who);
    m.extend_from_slice(&["merge", "--no-edit", "--no-verify", "-m", &msg, &local]);
    if let Err(e) = pg(&m) {
        let conflicts = pg(&["diff", "--name-only", "--diff-filter=U"]).unwrap_or_default();
        let _ = pg(&[attrs.as_str(), "merge", "--abort"]);
        let list: Vec<String> = conflicts.lines().take(10).map(|l| clean_text(l, 200)).collect();
        return Err(if list.is_empty() { format!("the merge didn't go through, nothing changed: {e}") } else { format!("its work clashes with yours in {}; nothing changed. Ask it to build on your latest work, or merge by hand.", list.join(", ")) });
    }
    let after = pg(&["rev-parse", "HEAD"])?.trim().to_string();
    Ok(json!({ "merged": true, "before": before, "after": after }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_git_folder_with_links_or_alternates_is_refused() {
        let d = tempfile::tempdir().unwrap();
        let g = d.path().join(".git");
        std::fs::create_dir_all(g.join("refs/heads")).unwrap();
        assert!(plain_git_dir(&g).is_ok());
        std::os::unix::fs::symlink("/etc", g.join("refs/heads/x")).unwrap();
        assert!(plain_git_dir(&g).is_err(), "a link inside");
        std::fs::remove_file(g.join("refs/heads/x")).unwrap();
        std::fs::create_dir_all(g.join("objects/info")).unwrap();
        std::fs::write(g.join("objects/info/alternates"), "/home/r/secret/.git/objects").unwrap();
        assert!(plain_git_dir(&g).is_err(), "alternates");
        let h = d.path().join("h");
        std::os::unix::fs::symlink(d.path(), &h).unwrap();
        assert!(plain_git_dir(&h).is_err(), ".git itself a link");
    }
}
