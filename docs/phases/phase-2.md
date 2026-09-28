# Phase 2: Tunnel v1 + broker
Status: Not started

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

## Gate
- [ ] Voice or command bar: "connect to Wi-Fi", "dim the screen", "organize my Downloads" all succeed
- [ ] Approval shown at the right times; blocked actions stay blocked
- [ ] Undo restores an organized folder from the timeline

## Learned
