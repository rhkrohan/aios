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
- [ ] M1 Rename tools to files / apps / settings / network / system, old names as aliases (D36)
- [ ] M2 capd and brain-d built into the image, `cargo test` gates the build (D38)
- [ ] M3 `sios-broker` and `sios-brain` user services; caller identity by SO_PEERCRED and program path; dot-folders blocked (D31, D32)
- [ ] M4 Model gateway in the broker (Anthropic, OpenAI, OpenAI-compatible, Gemini); encrypted keys; Settings > Brain (D33, D34)
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
