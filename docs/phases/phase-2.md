# Phase 2: Tunnel v1 + broker
Status: Active (2026-10-14, AI OS layer on the arm64 test image; Phase 0's gate is still open)

## Goal
The AI can safely act on the system through typed tools, with approvals, undo and a visible activity log.

## Tasks
Tunnel
- [ ] Tool spec v0 format and tool registry in brain-d
- [ ] Shared types v0: File, Window, App, Network, Person (stub)
- [ ] Adapters: system.state, files.* (incl. files.organize, trash-first delete), settings.* (display, sound, theme), network.* (NetworkManager D-Bus), apps.* (AT-SPI + D-Bus)
- [ ] Every changing tool returns new state
- [ ] Per-request tool filtering using Reflex area
- [ ] Loop guard: same failure twice escalates
Broker
- [ ] Broker as a Rust system service with Unix socket protocol
- [ ] Permission levels, first-use approvals, standing rules
- [ ] Automatic Btrfs snapshot before irreversible file changes
- [ ] Credential store (encrypted), surrogate handles
- [ ] Activity timeline storage + simple viewer with undo
UX
- [ ] Approval prompt design and implementation

AI OS layer (2026-10-14 plan, D31 to D38; one milestone at a time, each checked on the arm64 VM)
- [x] M0 Plan: decisions, changelog, tasks
- [x] M1 Rename tools to files / apps / settings / network / system, old names as aliases (D36)
- [x] M2 capd and brain-d built into the image, `cargo test` gates the build (D38)
- [x] M3 `sios-broker` and `sios-brain` user services; caller identity by SO_PEERCRED and program path; dot-folders blocked (D31, D32)
- [ ] M4 Model gateway in the broker (Anthropic, OpenAI, OpenAI-compatible, Gemini); encrypted keys; Settings > Brain; owner actions confirmed with your password through polkit (D33, D34, D39)
- [ ] M5 Trusted approval prompt `sios-approve` (D37)
- [ ] M6 Real adapters batch 1: volume, brightness, theme, wallpaper, notify, lock, system.state, network.list, Wi-Fi, apps.open, files.show and preview; undo by replaying the old value
- [ ] M7 Ask bar talks to brain-d: steps, approval, result, undo
- [ ] M8 MCP door with the full typed catalog for paired apps; Settings > Connected AI apps (D35)
- [ ] M9 Adapters batch 2 (windows, Do Not Disturb, Bluetooth, reminders, Flatpak), freedesktop Trash, root becomes the real home
- [ ] M10 Broker state survives a restart (passes, approvals, undo journal)
- [ ] M11 Settings > Permissions and live Monitor Goals

## Gate
- [ ] Voice or command bar: "connect to Wi-Fi", "dim the screen", "organize my Downloads" all succeed
- [ ] Approval shown at the right times; blocked actions stay blocked
- [ ] Undo restores an organized folder from the timeline

## Learned
- 2026-10-14 (M2): The image build sent the whole repo to podman (1.7 GB of `target/` and `node_modules`, and `cosign.key`). A `.dockerignore` brings that to 428 KB. The `rust` stage on Fedora 44 compiles and tests both crates in about 25 seconds. `apps/build-rust.sh` is the fast loop: it builds for arm64 in Docker, runs the tests, and copies to the VM's `~/.local/bin`.
- 2026-10-14 (VM): The test VM is VMware Fusion, not UTM: `rohan@192.168.99.134`. Its network must be "Share with my Mac"; bridged to the Mac's Wi-Fi it never got an address. `sudo` there needs the owner's password, so image upgrades are the owner's step.
- 2026-10-14 (M3): Both services run on the VM from `~/.local/bin`. The state folder is 0700 and the files 0600; the sockets are in `/run/user/1000/sios` (0700/0600). With `SIOS_IDENTITY=peer`, a terminal that can read `owner.secret` gets "only the owner" for approve, pending and mint, and a hand-made `request_pass` carrying `service.secret` is refused. The new tests found one place (`request_pass`) that still checked the secret file directly; fixed. Identity is a runtime setting in the unit, not a build feature as D32 first said, so the image runs the tested binary. A user service gets the active session's NetworkManager rights (Wi-Fi power, network control: yes, no prompt) and the session's Wayland and D-Bus settings, so M6 adapters can run inside the broker. Hidden folders are now refused for every AI (except `.Trash`); a state folder in a hidden folder of the root is allowed. Not yet seen: the positive side (brain-d in `/usr/bin` recognised as the service, services starting after a reboot), which needs an image with M3. New risk: AT-SPI can press buttons in owner windows (12-risks, for M5).
- 2026-10-14 (M3, security review): Knowing callers by their program can be faked by a process of the same user: open the socket, keep a copy of the connection (fork or dup), then exec a trusted program in the child (after moving it into `sios-brain.service` for the service). The kernel then names the trusted program. So the owner is never proven by program now (`OWNER_BY_PROGRAM = false` in both crates). The service is re-checked before every request, and the loader-variable check covers whole families (`LD_*`, `QT_*`, `QML*`, `GCONV_PATH`...). M4's key saving and M5's approvals need a real owner anchor first: a decision for the owner.
- 2026-10-14 (D39): Owner chose a password prompt. Checked on the VM: a process in a user service asking polkit with interaction allowed (`pkcheck ... --allow-user-interaction`, action `org.kde.kcontrol.kcmkwallet5.save`, which needs your own password) makes KDE's "Authentication Required" dialog appear on the desktop; Cancel gives "Not authorized". polkit only reads actions from `/usr/share/polkit-1/actions`, so our own `org.sios.owner` action ships in the image and can only be tried after an image build.
- 2026-10-14 (M1): Tools renamed in capd, brain-d, the harness and the preview (one scripted swap of exact names, then prefix patterns like `fs.*` by hand). Old names stay accepted through `tools::ALIASES`: `manifest::canonical()` maps them on calls, and passes, standing rules (`rules.json`) and saved roles (`iam.json`) are rewritten on load, so the owner's existing files keep working. An old area pattern becomes exactly the new names its tools moved to (`sys.*` never grows to cover installs). Area names must never contain `_`, because wire names split at the first `_`; a test enforces it. `apps.close` is now a change, not a read (unsaved work). capd 75 tests and brain-d 8 tests pass; the live run with GPT passed summarize, tidy and email (approved) with the audit chain intact. The harness goals pointed at files the seed no longer has (`Q3 board notes.txt`, `Projects/README.md`); fixed to the seed's names. The preview's browser confusion test was not rerun; it type-checks and lints clean. Catalog written up in `docs/plan/16-tool-catalog.md`.
