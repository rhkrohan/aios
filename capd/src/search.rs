//! Finding files by what they are, not only by their names (files.find).
//!
//! "Find my invoices" should find `meeting-notes-acme.pdf` when it is an
//! invoice. So each file is matched on its name, its labels, and the words inside
//! it (plain text, and PDFs through `pdftotext`), with related words ("invoice"
//! also means bill, receipt, "amount due"). The extracted text is kept in a local
//! index in capd's private state folder, keyed by each file's size and change
//! time, so a second search is instant. Nothing leaves the computer.
//!
//! What comes back is only which files match and which search word matched, never
//! a line from inside (security review 2026-10-15: that would be reading contents
//! without the owner, D57). Files labelled Sensitive or Finance are matched by name
//! and label only, so a search can't probe what they say.
//!
//! A PDF can be booby-trapped, so the broker opens the file itself (no links,
//! checked again after opening) and hands only that open file to `pdftotext`,
//! which runs in a sandbox: its own user, network and mount namespaces with
//! empty /run, /tmp, /var and /home (no socket reachable: not the session bus,
//! not capd), read-only /usr and /etc (Landlock), no file writes, 512 MB and 5
//! seconds of CPU, at most 256 KB of output. Any part missing: nothing is read.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::time::{Duration, Instant};

/// How much text is kept per file (lower case): enough for the words that say what it is.
const KEEP: usize = 12 * 1024;
/// Files bigger than this are matched by name only.
const MAX_FILE: u64 = 25 * 1024 * 1024;
/// One search spends at most this long reading new files; the rest wait for the next one.
pub const BUDGET: Duration = Duration::from_secs(6);

#[derive(Serialize, Deserialize, Default)]
pub struct Index {
    /// path -> what was read from it
    files: HashMap<String, Entry>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Entry {
    size: u64,
    mtime: u64,
    text: String,
}

impl Index {
    pub fn load(state: &Path) -> Index {
        std::fs::read(state.join("index.json")).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
    }

    pub fn save(&self, state: &Path) {
        use std::os::unix::fs::OpenOptionsExt;
        let path = state.join("index.json");
        let tmp = state.join("index.json.tmp");
        let ok = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&tmp)
            .and_then(|mut f| std::io::Write::write_all(&mut f, &serde_json::to_vec(self).unwrap_or_default()));
        if ok.is_ok() {
            let _ = std::fs::rename(&tmp, &path);
        }
    }

    /// The text inside an already opened (and checked) file, from the index if it
    /// hasn't changed. None: not read (too big, a kind we don't read, or out of time).
    pub fn text(&mut self, rel: &str, file: std::fs::File, deadline: Instant) -> Option<String> {
        let md = file.metadata().ok()?;
        let mtime = md.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_secs();
        if let Some(e) = self.files.get(rel) {
            if e.size == md.len() && e.mtime == mtime {
                return Some(e.text.clone());
            }
        }
        if !md.is_file() || md.len() > MAX_FILE || Instant::now() > deadline {
            return None;
        }
        let text = extract(file, &ext(rel))?;
        let text: String = text.to_lowercase().chars().filter(|c| !c.is_control() || *c == '\n').take(KEEP).collect();
        self.files.insert(rel.to_string(), Entry { size: md.len(), mtime, text: text.clone() });
        Some(text)
    }

    /// Forget files that are gone, so the index doesn't grow forever.
    pub fn keep_only(&mut self, seen: &std::collections::HashSet<String>, under: &str) {
        self.files.retain(|p, _| seen.contains(p) || !crate::token::within(p, under));
    }
}

/// Open a file met while walking the home, never through a link, then ask the
/// kernel where the opened file really is: it must still be inside the root, in
/// no hidden folder, and `allowed` (not blocked). A file swapped for a link
/// between the walk and the open is refused (security review 2026-10-15).
pub fn open_checked(root_real: &Path, real: &Path, allowed: impl Fn(&str) -> bool) -> Option<std::fs::File> {
    #[cfg(target_os = "linux")]
    let file = {
        use std::os::unix::ffi::OsStrExt;
        use std::os::unix::io::FromRawFd;
        let c = std::ffi::CString::new(real.as_os_str().as_bytes()).ok()?;
        // SAFETY: a NUL-terminated path; we own the returned fd.
        let fd = unsafe { libc::open(c.as_ptr(), libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_NONBLOCK) };
        if fd < 0 {
            return None;
        }
        // SAFETY: fd was just opened and is ours alone.
        let f = unsafe { std::fs::File::from_raw_fd(fd) };
        let at = std::fs::read_link(format!("/proc/self/fd/{fd}")).ok()?;
        (f, at)
    };
    #[cfg(not(target_os = "linux"))]
    let file = (std::fs::File::open(real).ok()?, real.canonicalize().ok()?);
    let (f, at) = file;
    let rel = at.strip_prefix(root_real).ok()?.to_string_lossy().into_owned();
    if rel.split('/').any(|p| p.starts_with('.')) || !allowed(&rel) || !f.metadata().ok()?.is_file() {
        return None;
    }
    Some(f)
}

pub fn ext(rel: &str) -> String {
    Path::new(rel).extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}

/// The words inside a file we know how to read.
pub fn extract(file: std::fs::File, ext: &str) -> Option<String> {
    match ext {
        "txt" | "md" | "csv" | "tsv" | "json" | "log" | "html" | "htm" | "xml" | "yaml" | "yml" | "ini" | "rtf" | "eml" | "ics" | "vcf" => {
            let mut b = Vec::new();
            file.take(64 * 1024).read_to_end(&mut b).ok()?;
            Some(strip_tags(&String::from_utf8_lossy(&b)))
        }
        // the first pages are enough to know what a document is
        "pdf" => sandboxed("/usr/bin/pdftotext", &["-l", "3", "-q", "-enc", "UTF-8", "-", "-"], file),
        // Word and LibreOffice files: by name for now (no stdin reader in the image)
        _ => None,
    }
}

/// Run a document reader on one open file (its stdin), in a sandbox, keeping at
/// most 256 KB of what it prints and stopping it after 4 seconds. No sandbox, no
/// reading: fail closed.
#[cfg(target_os = "linux")]
fn sandboxed(prog: &str, args: &[&str], input: std::fs::File) -> Option<String> {
    use std::os::unix::process::CommandExt;
    let ruleset = landlock::read_only_system()?;
    let mut cmd = std::process::Command::new(prog);
    cmd.args(args).env_clear().env("LANG", "C.UTF-8").stdin(input).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::null());
    // SAFETY: between fork and exec only async-signal-safe syscalls run (unshare,
    // mount, setrlimit, prctl, landlock_restrict_self); nothing allocates.
    unsafe {
        cmd.pre_exec(move || {
            // its own user, network and file system view: no network at all, and
            // /run, /tmp, /var and /home are empty, so no socket (the session bus,
            // capd, brain-d) can be reached. All of it or nothing: fail closed.
            if libc::unshare(libc::CLONE_NEWUSER | libc::CLONE_NEWNET | libc::CLONE_NEWNS) != 0 {
                return Err(std::io::Error::last_os_error());
            }
            let root = b"/\0";
            if libc::mount(std::ptr::null(), root.as_ptr() as *const libc::c_char, std::ptr::null(), libc::MS_REC | libc::MS_PRIVATE, std::ptr::null()) != 0 {
                return Err(std::io::Error::last_os_error());
            }
            let tmpfs = b"tmpfs\0";
            for dir in [&b"/home\0"[..], &b"/run\0"[..], &b"/tmp\0"[..], &b"/var\0"[..], &b"/dev/shm\0"[..]] {
                let t = tmpfs.as_ptr() as *const libc::c_char;
                if libc::mount(t, dir.as_ptr() as *const libc::c_char, t, libc::MS_NOSUID | libc::MS_NODEV | libc::MS_NOEXEC, std::ptr::null()) != 0 {
                    return Err(std::io::Error::last_os_error());
                }
            }
            let lim = |r, v: u64| libc::setrlimit(r, &libc::rlimit { rlim_cur: v, rlim_max: v });
            lim(libc::RLIMIT_AS, 512 << 20);
            lim(libc::RLIMIT_CPU, 5);
            lim(libc::RLIMIT_FSIZE, 0);
            lim(libc::RLIMIT_CORE, 0);
            if libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0 || landlock::restrict_self(ruleset) != 0 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    let mut child = cmd.spawn().ok()?;
    landlock::close(ruleset);
    let mut out = child.stdout.take()?;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut b = Vec::new();
        let _ = (&mut out).take(256 * 1024).read_to_end(&mut b);
        let _ = tx.send(b);
    });
    let b = rx.recv_timeout(Duration::from_secs(4)).ok();
    let _ = child.kill();
    let _ = child.wait();
    b.map(|b| String::from_utf8_lossy(&b).into_owned())
}

#[cfg(not(target_os = "linux"))]
fn sandboxed(_prog: &str, _args: &[&str], _input: std::fs::File) -> Option<String> {
    None // no Landlock here (the Mac preview): never parse a document unsandboxed
}

/// Landlock (the kernel's sandbox for files), through its three system calls:
/// a ruleset that allows reading /usr and /etc and running programs from /usr,
/// and nothing else: no home folder, no writes.
#[cfg(target_os = "linux")]
mod landlock {
    const EXECUTE: u64 = 1 << 0;
    const READ_FILE: u64 = 1 << 2;
    const READ_DIR: u64 = 1 << 3;
    /// Every file right of Landlock's first version: what isn't allowed below is denied.
    const ALL_V1: u64 = (1 << 13) - 1;
    const RULE_PATH_BENEATH: libc::c_long = 1;

    #[repr(C)]
    struct RulesetAttr {
        handled_access_fs: u64,
    }
    #[repr(C, packed)]
    struct PathBeneath {
        allowed_access: u64,
        parent_fd: i32,
    }

    pub fn read_only_system() -> Option<i32> {
        let attr = RulesetAttr { handled_access_fs: ALL_V1 };
        // SAFETY: the kernel reads `attr` of the size we pass and returns a new fd or -1.
        let fd = unsafe { libc::syscall(libc::SYS_landlock_create_ruleset, &attr as *const RulesetAttr, std::mem::size_of::<RulesetAttr>(), 0) } as i32;
        if fd < 0 {
            return None;
        }
        for (path, access) in [("/usr\0", EXECUTE | READ_FILE | READ_DIR), ("/etc\0", READ_FILE | READ_DIR)] {
            // SAFETY: a NUL-terminated path; O_PATH only names the folder for the rule.
            let dir = unsafe { libc::open(path.as_ptr() as *const libc::c_char, libc::O_PATH | libc::O_CLOEXEC) };
            if dir < 0 {
                close(fd);
                return None;
            }
            let rule = PathBeneath { allowed_access: access, parent_fd: dir };
            // SAFETY: the kernel reads `rule` for this ruleset fd.
            let rc = unsafe { libc::syscall(libc::SYS_landlock_add_rule, fd, RULE_PATH_BENEATH, &rule as *const PathBeneath, 0) };
            close(dir);
            if rc != 0 {
                close(fd);
                return None;
            }
        }
        Some(fd)
    }

    /// In the child, after fork: from now on only the ruleset's paths.
    pub fn restrict_self(fd: i32) -> i32 {
        // SAFETY: a plain system call on a ruleset fd.
        unsafe { libc::syscall(libc::SYS_landlock_restrict_self, fd, 0) as i32 }
    }

    pub fn close(fd: i32) {
        // SAFETY: closing an fd we own.
        unsafe {
            libc::close(fd);
        }
    }
}

/// XML and HTML to plain words.
fn strip_tags(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut inside = false;
    for c in s.chars() {
        match c {
            '<' => inside = true,
            '>' => {
                inside = false;
                out.push(' ');
            }
            _ if !inside => out.push(c),
            _ => {}
        }
    }
    out
}

/// Words that mean the same kind of thing. A query word pulls in its group.
const RELATED: &[&[&str]] = &[
    &["invoice", "invoices", "bill", "bills", "receipt", "receipts", "amount due", "invoice no", "invoice number", "payment due", "total due", "balance due"],
    &["contract", "contracts", "agreement", "agreements", "terms and conditions", "signed by", "hereinafter"],
    &["ticket", "tickets", "boarding pass", "booking", "reservation", "itinerary", "flight", "confirmation number"],
    &["tax", "taxes", "irs", "w-2", "1099", "tax return", "hmrc", "vat"],
    &["payslip", "payslips", "pay stub", "salary", "earnings statement", "net pay"],
    &["resume", "resumes", "cv", "curriculum vitae", "work experience"],
    &["statement", "statements", "bank statement", "account summary", "opening balance"],
    &["insurance", "policy number", "premium", "coverage"],
    &["meeting", "meetings", "minutes", "agenda", "action items", "attendees"],
    &["recipe", "recipes", "ingredients", "tablespoon", "preheat"],
];

/// The words to look for: each query word, plus its related words.
pub fn terms(query: &str) -> Vec<(String, bool)> {
    let q = query.to_lowercase();
    let mut out: Vec<(String, bool)> = Vec::new();
    for w in q.split(|c: char| !c.is_alphanumeric() && c != '-').filter(|w| w.len() > 1) {
        if ["my", "the", "all", "find", "show", "files", "file", "me", "of", "in", "and", "for", "from", "where", "are", "is"].contains(&w) {
            continue;
        }
        if !out.iter().any(|(x, _)| x == w) {
            out.push((w.to_string(), true));
        }
        for group in RELATED {
            if group.contains(&w) {
                for r in group.iter() {
                    if !out.iter().any(|(x, _)| x == r) {
                        out.push((r.to_string(), false));
                    }
                }
            }
        }
    }
    out
}

/// How well one file fits, and why, in plain words. 0: not at all.
pub fn score(name: &str, text: Option<&str>, terms: &[(String, bool)]) -> (u32, String) {
    let name = name.to_lowercase();
    let mut s = 0;
    let mut why: Vec<String> = Vec::new();
    for (t, asked) in terms {
        if name.contains(t.as_str()) {
            s += if *asked { 6 } else { 4 };
            if why.len() < 2 {
                why.push(format!("name has \"{t}\""));
            }
        }
    }
    if let Some(text) = text {
        for (t, asked) in terms {
            if text.contains(t.as_str()) {
                s += if *asked { 3 } else { 2 };
                if why.len() < 2 {
                    why.push(format!("mentions \"{t}\""));
                }
            }
        }
    }
    (s, why.join(", "))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn related_words_come_along() {
        let t = terms("find my invoices");
        assert!(t.iter().any(|(w, asked)| w == "invoices" && *asked));
        assert!(t.iter().any(|(w, _)| w == "amount due"));
        assert!(!t.iter().any(|(w, _)| w == "my" || w == "find"));
    }

    #[test]
    fn an_invoice_named_otherwise_is_found_by_what_it_says() {
        let t = terms("invoices");
        let (s, why) = score("meeting-notes-acme.pdf", Some("acme ltd\ninvoice no. 4471\namount due: $1,240"), &t);
        assert!(s > 0, "found by its text");
        assert!(why.contains("mentions"));
        let (by_name, _) = score("invoice-march.pdf", None, &t);
        assert!(by_name > 0);
        assert_eq!(score("holiday.jpg", None, &t).0, 0);
    }

    #[test]
    fn index_reads_text_files_and_remembers_them() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("notes.txt");
        std::fs::write(&f, "Invoice No. 12\nAmount due: 40").unwrap();
        let mut ix = Index::default();
        let t = ix.text("notes.txt", std::fs::File::open(&f).unwrap(), Instant::now() + BUDGET).unwrap();
        assert!(t.contains("amount due"));
        ix.save(dir.path());
        let mut again = Index::load(dir.path());
        // from the index, even past the deadline
        assert!(again.text("notes.txt", std::fs::File::open(&f).unwrap(), Instant::now() - Duration::from_secs(1)).unwrap().contains("invoice"));
        assert_eq!(strip_tags("<w:t>Total</w:t><w:t>due</w:t>").split_whitespace().collect::<Vec<_>>(), vec!["Total", "due"]);
    }

    #[test]
    fn never_through_a_link_or_into_hidden_places() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        std::fs::create_dir_all(root.join(".ssh")).unwrap();
        std::fs::write(root.join(".ssh/id"), "secret key").unwrap();
        std::fs::write(root.join("bill.txt"), "amount due").unwrap();
        std::os::unix::fs::symlink(root.join(".ssh/id"), root.join("invoice.txt")).unwrap();
        assert!(open_checked(&root, &root.join("bill.txt"), |_| true).is_some());
        assert!(open_checked(&root, &root.join("invoice.txt"), |_| true).is_none(), "a link is never followed");
        assert!(open_checked(&root, &root.join(".ssh/id"), |_| true).is_none(), "hidden places stay hidden");
        assert!(open_checked(&root, &root.join("bill.txt"), |rel| rel != "bill.txt").is_none(), "blocked places stay blocked");
    }
}
