# Decisions log

Never delete entries. To change a decision, mark the old entry **Superseded** and link the new one.

Statuses: Accepted, Exploring, Superseded.

| ID | Decision | Status |
|---|---|---|
| D1 | Fedora Atomic + bootc on a Universal Blue KDE image (Aurora first, kinoite-main as alternative) | Accepted |
| D2 | Customized KDE Plasma as the shell | Accepted |
| D3 | Rust for brain-d | Accepted |
| D4 | One daemon (brain-d) plus a separate permission broker | Accepted |
| D5 | llama.cpp server as a systemd service | Accepted |
| D6 | MCP in both directions (brain-d is MCP server and client) | Accepted |
| D7 | Accessibility tree first, screenshots only as fallback | Accepted |
| D8 | Vault as memory / context engine | Accepted |
| D9 | Flatpak for user apps | Accepted |
| D10 | Open source core | Accepted |
| D11 | Build Reflex in house (not Jev) | Accepted |
| D12 | brain-d as a per-user service, broker stays system-level | Exploring |

## Notes
- D10: the repo currently carries Apache-2.0 from the image template. Apache-2.0 vs GPL is still an open question (see `05-roadmap.md`).
