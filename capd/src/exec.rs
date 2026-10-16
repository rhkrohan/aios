//! Running a system program safely (D38): a fixed argument list (never a shell),
//! optional input on stdin, and a hard time limit after which it is killed.
//! Used for systemd-creds and pkcheck now, and by the system adapters later.

use std::io::{Read, Write};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub struct Out {
    /// None when it was killed for taking too long.
    pub code: Option<i32>,
    pub stdout: Vec<u8>,
    pub stderr: String,
}

pub fn run(prog: &str, args: &[&str], stdin: Option<&[u8]>, limit: Duration) -> Result<Out, String> {
    run_with(prog, args, &[], stdin, limit, usize::MAX)
}

/// `run` with extra environment variables and a cap on what it may print: past
/// `max_out` bytes of stdout it is stopped (code None) and the output cut there.
pub fn run_with(prog: &str, args: &[&str], env: &[(&str, &str)], stdin: Option<&[u8]>, limit: Duration, max_out: usize) -> Result<Out, String> {
    let mut child = Command::new(prog)
        .args(args)
        .envs(env.iter().copied())
        .stdin(if stdin.is_some() { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("can't run {prog}: {e}"))?;
    if let (Some(data), Some(mut w)) = (stdin, child.stdin.take()) {
        w.write_all(data).map_err(|e| format!("{prog}: {e}"))?;
    }
    // read both pipes on their own threads so a chatty program can't block on a full pipe
    let mut out_pipe = child.stdout.take().ok_or("no stdout")?;
    let mut err_pipe = child.stderr.take().ok_or("no stderr")?;
    let over = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let over_t = std::sync::Arc::clone(&over);
    let out_t = std::thread::spawn(move || {
        let mut b = Vec::new();
        let mut chunk = [0u8; 65536];
        loop {
            match out_pipe.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if b.len() + n > max_out {
                        b.extend_from_slice(&chunk[..max_out - b.len()]);
                        over_t.store(true, std::sync::atomic::Ordering::SeqCst);
                        break;
                    }
                    b.extend_from_slice(&chunk[..n]);
                }
            }
        }
        b
    });
    let err_t = std::thread::spawn(move || {
        let mut b = String::new();
        let _ = err_pipe.read_to_string(&mut b);
        b
    });
    let start = Instant::now();
    let code = loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => break status.code(),
            None if start.elapsed() >= limit || over.load(std::sync::atomic::Ordering::SeqCst) => {
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
            None => std::thread::sleep(Duration::from_millis(20)),
        }
    };
    Ok(Out { code, stdout: out_t.join().unwrap_or_default(), stderr: err_t.join().unwrap_or_default() })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runs_feeds_and_times_out() {
        let o = run("cat", &[], Some(b"hello"), Duration::from_secs(5)).unwrap();
        assert_eq!((o.code, o.stdout.as_slice()), (Some(0), &b"hello"[..]));
        let o = run("sleep", &["5"], None, Duration::from_millis(200)).unwrap();
        assert_eq!(o.code, None, "killed after the limit");
        assert!(run("/no/such/program", &[], None, Duration::from_secs(1)).is_err());
        // a flood is cut at its cap and the program stopped
        let o = run_with("yes", &[], &[], None, Duration::from_secs(10), 100_000).unwrap();
        assert_eq!((o.code, o.stdout.len()), (None, 100_000));
        let o = run_with("sh", &["-c", "echo $SIOS_T"], &[("SIOS_T", "x1")], None, Duration::from_secs(5), 1000).unwrap();
        assert_eq!(o.stdout, b"x1\n");
    }
}
