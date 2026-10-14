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

## Open questions
- OS name (paused)
- Core license: Apache-2.0 vs GPL
- Exact local models for Premium and Lite
- Muse developer API, if any
- Team ownership: image, brain-d, broker, tunnel, shell
- What Vault captures automatically vs on request
