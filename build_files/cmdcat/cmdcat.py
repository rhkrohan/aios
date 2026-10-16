#!/usr/bin/env python3
"""The SIOS command catalog (D89): every program on the image, typed, with a risk
class the broker enforces. Runs at image build time, inside the image, so it
describes exactly what ships.

    python3 build_files/cmdcat/cmdcat.py --rules build_files/cmdcat/rules.toml \
        --out /usr/share/sios/commands/catalog.json [--tldr DIR] [--only ls,git]

For each program in /usr/bin:
  - package (rpm -qf) and a one-line summary (the man page's NAME line)
  - options with a short summary, and subcommands where the man page lists
    them; programs without a man page are asked for --help inside a sandbox
    (bwrap: no network, read-only, 2 seconds)
  - examples from tldr-pages when a copy is given (CC BY 4.0)
  - its risk class from rules.toml: R reads, C changes, X can't be undone,
    S sends out, block never for an AI; a program, subcommand or flag with no
    rule is "ask", never read-only by default.
Nothing here runs a program for real except `man`, `rpm` and the sandboxed --help.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tomllib

ORDER = {"R": 0, "C": 1, "ask": 2, "S": 3, "X": 4, "block": 5}
MAX_FLAGS = 60
MAX_SUBS = 80


def sh(args, timeout=10, env=None):
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=timeout, env=env, errors="replace")
        return p.returncode, p.stdout
    except (subprocess.TimeoutExpired, OSError):
        return -1, ""


def programs(bindir):
    out = []
    for name in sorted(os.listdir(bindir)):
        p = os.path.join(bindir, name)
        if os.path.isfile(p) and os.access(p, os.X_OK) and re.fullmatch(r"[A-Za-z0-9._+-]+", name):
            out.append(name)
    return out


def packages(bindir, names):
    """rpm -qf for every program at once (one rpm call per 200 names)."""
    pkg = {}
    for i in range(0, len(names), 200):
        chunk = names[i:i + 200]
        _, text = sh(["rpm", "-qf", "--qf", "%{NAME}\n"] + [os.path.join(bindir, n) for n in chunk], timeout=120)
        lines = text.splitlines()
        if len(lines) == len(chunk):
            for n, l in zip(chunk, lines):
                pkg[n] = "" if "not owned" in l else l.strip()
    return pkg


def man_text(name):
    env = dict(os.environ, MANWIDTH="100", MAN_KEEP_FORMATTING="0", GROFF_NO_SGR="1", LC_ALL="C.UTF-8")
    code, text = sh(["man", "-P", "cat", "1", name], timeout=10, env=env)
    if code != 0 or not text.strip():
        code, text = sh(["man", "-P", "cat", "8", name], timeout=10, env=env)
    if code != 0:
        return ""
    # plain text: no colour codes (groff's SGR) and no backspace overstrike
    return re.sub(r".\x08", "", re.sub(r"\x1b\[[0-9;]*m", "", text))


def sections(text):
    """{SECTION NAME: [lines]} from man output (headings start at column 0)."""
    out, cur = {}, None
    for line in text.splitlines():
        if re.match(r"^[A-Z][A-Z0-9 ,/()&'-]+$", line.strip()) and not line.startswith(" "):
            cur = line.strip()
            out[cur] = []
        elif cur:
            out[cur].append(line)
    return out


OPT = re.compile(r"^\s{2,12}((?:-{1,2}[A-Za-z0-9][\w-]*(?:[ =]?\[?[<A-Z][\w<>|=-]*\]?)?(?:,\s*)?)+)\s*(.*)$")


def options(secs):
    """Flags and a one-line summary each, from OPTIONS or DESCRIPTION."""
    flags = []
    seen = set()
    for key in [k for k in secs if "OPTION" in k] + ["DESCRIPTION"]:
        lines = secs.get(key, [])
        for i, line in enumerate(lines):
            m = OPT.match(line)
            if not m:
                continue
            spec, rest = m.group(1).strip().rstrip(","), m.group(2).strip()
            if not rest and i + 1 < len(lines):
                rest = lines[i + 1].strip()
            names = re.findall(r"-{1,2}[A-Za-z0-9][\w-]*", spec)
            if not names or names[0] in seen:
                continue
            seen.update(names)
            arg = bool(re.search(r"[ =]\[?[<A-Z]", spec))
            flags.append({"names": names, "arg": arg, "about": re.sub(r"\s+", " ", rest)[:120]})
            if len(flags) >= MAX_FLAGS:
                return flags
    return flags


def subcommands(name, secs):
    """Subcommands from sections named like COMMANDS (git, systemctl, nmcli...)."""
    subs = {}
    for key, lines in secs.items():
        if "COMMAND" not in key or "SEE ALSO" in key:
            continue
        for i, line in enumerate(lines):
            m = re.match(r"^\s{3,10}(?:" + re.escape(name) + r"-)?([a-z][a-z0-9-]{1,30})(?:\(1\))?(?:\s{2,}(.*)|\s*$)", line)
            if not m:
                continue
            about = (m.group(2) or (lines[i + 1].strip() if i + 1 < len(lines) else "")).strip()
            if m.group(1) not in subs and about and not about.startswith("-"):
                subs[m.group(1)] = re.sub(r"\s+", " ", about)[:120]
            if len(subs) >= MAX_SUBS:
                return subs
    return subs


def help_text(path):
    """--help for programs with no man page, sandboxed: no network, read-only, 2 s."""
    # (/home and /root are links to /var/home and /var/roothome on Fedora Atomic: hide the real ones)
    args = ["bwrap", "--unshare-all", "--die-with-parent", "--ro-bind", "/", "/", "--tmpfs", "/tmp", "--tmpfs", "/var/home",
            "--tmpfs", "/var/roothome", "--dev", "/dev", "--proc", "/proc", "timeout", "2", path, "--help"]
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=5, errors="replace")
        text = p.stdout if p.stdout.strip() else p.stderr
    except (subprocess.TimeoutExpired, OSError):
        return ""
    # bwrap's own complaints aren't help
    return "" if not text.strip() or text.startswith("bwrap:") else text


def tldr_examples(tldr_dir, name):
    if not tldr_dir:
        return []
    for sub in ("linux", "common"):
        p = os.path.join(tldr_dir, sub, name + ".md")
        if os.path.isfile(p):
            ex, desc = [], None
            for line in open(p, encoding="utf-8", errors="replace"):
                if line.startswith("- "):
                    desc = line[2:].strip().rstrip(":")
                elif line.startswith("`") and desc:
                    ex.append({"about": desc[:120], "cmd": line.strip().strip("`")[:200]})
                    desc = None
            return ex[:8]
    return []


def classify(name, entry, rules):
    """Apply rules.toml to one program: its default, its subcommands, its flags."""
    if name in rules.get("block", {}).get("names", []):
        entry["class"] = "block"
        entry["why"] = rules["block"].get("why", "never for an AI")
        return
    r = rules.get("commands", {}).get(name)
    if r is None:
        entry["class"] = "ask"
        entry["why"] = "no rule yet"
        return
    entry["class"] = r.get("class", "ask")
    if "why" in r:
        entry["why"] = r["why"]
    for sub, cls in r.get("sub", {}).items():
        entry.setdefault("subcommands", {}).setdefault(sub, "")
        entry.setdefault("sub_class", {})[sub] = cls
    if "sub_default" in r:
        entry["sub_default"] = r["sub_default"]
    if r.get("flags"):
        entry["flag_class"] = dict(r["flags"])
    if r.get("needs_sub"):
        entry["needs_sub"] = True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rules", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--bindir", default="/usr/bin")
    ap.add_argument("--tldr", default="")
    ap.add_argument("--only", default="")
    ap.add_argument("--no-help", action="store_true", help="skip the sandboxed --help fallback")
    a = ap.parse_args()
    rules = tomllib.load(open(a.rules, "rb"))
    names = programs(a.bindir)
    if a.only:
        names = [n for n in names if n in a.only.split(",")]
    pkg = packages(a.bindir, names)
    cat = {}
    for n in names:
        e = {"package": pkg.get(n, "")}
        text = man_text(n)
        source = "man" if text else "none"
        if not text and not a.no_help and n not in rules.get("block", {}).get("names", []) and n not in rules.get("no_help", {}).get("names", []):
            text = help_text(os.path.join(a.bindir, n))
            source = "help" if text else "none"
        secs = sections(text) if source == "man" else {"OPTIONS": text.splitlines()}
        name_line = " ".join(l.strip() for l in secs.get("NAME", [])[:2])
        m = re.search(r"\s[-–]\s(.+)$", name_line)
        about = m.group(1) if m else ""
        if not about and source == "help":
            # the first plain line of --help that isn't its usage line or an option
            about = next((l.strip() for l in text.splitlines() if l.strip() and not re.match(r"(?i)^\s*(usage|options|-)", l)), "")
        e["about"] = about[:160]
        flags = options(secs)
        if flags:
            e["flags"] = flags
        subs = subcommands(n, secs) if source == "man" else {}
        if subs:
            e["subcommands"] = subs
        ex = tldr_examples(a.tldr, n)
        if ex:
            e["examples"] = ex
        e["source"] = source
        classify(n, e, rules)
        cat[n] = e
    counts = {}
    for e in cat.values():
        counts[e["class"]] = counts.get(e["class"], 0) + 1
    out = {
        "version": 1,
        "classes": {"R": "reads only", "C": "changes something (asks once per plan)", "X": "can't be undone (always asks)",
                    "S": "sends something out of the computer (always asks; network only then)", "ask": "no rule yet: asks",
                    "block": "never run for an AI"},
        "counts": counts,
        "commands": cat,
    }
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w") as f:
        json.dump(out, f, separators=(",", ":"), sort_keys=True)
    print(f"cmdcat: {len(cat)} programs, {counts}", file=sys.stderr)


if __name__ == "__main__":
    main()
