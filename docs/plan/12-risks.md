# 12. Risks and open questions

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Scope creep | Never ship | Gated phases; compositor, VM tier and fine-tuning deferred |
| Local model too weak | Premium feels worse than cloud | OS-enforced scaffolding (D14); cloud escalation; swap in better models |
| Prompt injection | Harmful actions | Broker, taint tracking, predefined options only, approvals |
| Third-party MCP quality varies | Unreliable tasks | Wrapper adapters with better descriptions and type mappings |
| KDE or Fedora updates break our changes | Broken builds | Stay at customization levels 1 to 4; pin versions; nightly CI |
| Wine apps expose little to AI | Blind on some Windows apps | Hidden desktop + screenshot fallback; VM UI Automation later |
| Windows licensing | Friction | User brings license; VM tier optional |
| Big labs ship OS-level agents | Competition | Neutrality across models, open source trust, shared types |
| Small team, many parts | Stalls | Reuse over rebuild; Vault exists; strict phases |
| Aurora is amd64 only; main dev machine is an arm64 Mac | Slow or no local VM testing | Build on GitHub Actions; test on x86_64 hardware; UTM emulation as fallback |
| An AI with a shell drives SIOS's own owner windows through the accessibility bus (AT-SPI can press buttons in any app of the same user) | It could approve its own requests in `sios-approve` or change Settings | M5: the approval window ignores accessibility actions and only takes real pointer or keyboard input; check before M5 ships. Found 2026-10-14 while building M3 |
| A same-user process opens the broker socket, keeps a copy of the connection, then turns a child into a trusted program (exec, or moves it into `sios-brain.service` first); the kernel names the trusted program while the copy writes requests | As the owner: grant and approve anything. As the service: request passes (still need the owner) and read the planner's memory view | Owner by program is off (`OWNER_BY_PROGRAM`) until M5 gives the owner an anchor an AI can't fake (polkit password, or the broker under its own account). The service check is repeated on every request; the remaining gap closes with the account split (D31 v2). Found by security review 2026-10-14 |
| An AI copies a connection and poses as the Ask bar (program identity, 12-risks above) | It starts goals in the owner's name and reads their replies, which can include what SIOS remembers | Each pass still needs the owner's password in the approval window unless a standing rule covers it, and rules never cover anything irreversible or sending out. Closes with the account split (D31 v2). Accepted for M7, 2026-10-14 |
| An AI smarter than its box finds a path that is only configured closed (2026 OpenAI / Hugging Face incident) | Escape, credential reuse, agents coordinating at machine speed | Security engine D40 to D55: enforced controls, bound leases, sentinel freeze, egress proxy, confined units, Stop (`17-security-engine.md`) |
| Malware already running as the owner edits SIOS's state | Policy, keys and audit can be changed or read | Signing detects edits (D44) and fails closed; non-dumpable services and `ptrace_scope=1` (D55); fixed only by the v2 broker under its own account |
| Outside AI apps started without the runner keep full network and files | SIOS only sees what they send through the tunnel | Agent runner (D50); Settings labels unconfined apps; freeze kills the door |
| A patient AI stays under the sentinel's thresholds | Misuse inside granted rights isn't caught | Leases, daily caps, roles and asks still bound it; owner-tunable thresholds (D46) |
| Any process can press Stop | A nuisance stop of all AI work | Accepted: stopping is always safe; resume needs the password (D41) |
| An AI starts `sios-approve` or `sios-settings` itself, as its child, and attaches to it (the kernel lets a parent do that even with `ptrace_scope=1`, and hiding memory doesn't remove a tracer that attached first). The window is then SIOS's by program but runs the AI's code | It could show the owner request A and send the password-confirmed approval for request B; or read a key typed into that window | S1: the broker starts SIOS's own windows itself (its parent is systemd, never an AI) and accepts owner calls only from the process IDs it started, with a clean environment. Until then: open Settings and approvals only from the desktop. Found by security review 2026-10-14 |
| A same-user program fakes a click on Allow during an approval session (accessibility, or KWin's fake input, which a desktop file in the home can unlock) | It approves SIOS's own pending undoable actions | D56: a click alone covers only SIOS's assistant and only undoable actions; irreversible, sending out, keys and roles, and outside AIs always need the password; the session ends on lock, sleep or Stop and shows in the top bar. Accepted 2026-10-14 |

## Open questions
- OS name (paused)
- Core license: Apache-2.0 vs GPL
- Exact local models for Premium and Lite
- Muse developer API, if any
- Team ownership: image, brain-d, broker, tunnel, shell
- What Vault captures automatically vs on request
