# 13. From the digital version to Fedora

Status: Living document. Updated whenever a piece of the digital version changes.

The digital version (the preview in `build_concept_html`, plus `capd` and `brain-d`) is meant to be the same system as SIOS, running on a Mac for now. This file maps every piece to what it becomes on the Fedora image, so that nothing built here is a dead end.

## Pieces

| Piece | Digital version (now) | On SIOS (Fedora atomic, bootc) | Decision |
| --- | --- | --- | --- |
| Shell: desktop, Files, approval sheet, launcher | Next.js page | KDE Plasma plus SIOS shell components (QML) | D2 |
| Trusted approval prompt | Approval sheet; only the page's server may answer capd as owner | A polkit-style agent in the shell, the only process allowed to grant passes and answer approvals | D4 |
| brain-d: briefing, planner, plan check, routines, MCP door | Rust process, socket `~/.sios/brain.sock` | Rust systemd user service, D-Bus `org.sios.Brain1`, socket in `$XDG_RUNTIME_DIR/sios` | D3, D12 |
| Broker: capabilities, checks, audit, undo | `capd`, Rust process, socket `~/.sios/capd.sock`, owner proven by `owner.secret` | `sios-broker`, Rust systemd system service, socket in `/run/sios`, caller identity from `SO_PEERCRED` instead of a secret file | D4, D20 |
| Model | OpenAI Responses API, called only by brain-d | Router picks: llama.cpp locally for everyday work, cloud for hard tasks | D15, D19, D5 |
| File tools | Real files in `~/SIOS-sandbox` | The user's home folder | D7 |
| System tools (theme, open app, show folder, notify, Wi-Fi) | capd allows; the page carries out the action | Broker-owned adapters: D-Bus to KWin, NetworkManager, xdg-desktop-portal | D7 |
| Email | Outbox folder in `~/.sios/outbox` | MCP Gmail (or other) adapter owned by the broker; credentials never leave it | D6 |
| Labels, trust, lineage | `~/.sios/meta.json` | Extended attributes plus an index in Vault | D8 |
| Audit log | Hash-chained JSON lines, `~/.sios/audit.jsonl` | Same chain, signed, under `/var/lib/sios` | D4 |
| Undo | Snapshots and move-backs kept in memory by capd | Btrfs snapshots managed by the broker, kept across restarts | |
| Routines | `~/.sios/routines.json` | Vault | D8 |
| Outside AIs | `brain-d mcp` (stdio MCP server) | Same server, launched per client; connections approved in the shell | D6 |
| Owner's own file actions (Files, Terminal) | Real changes through capd as "you": logged, undoable, no approval | The shell acts as the user directly; the broker still records and snapshots them | D4 |
| Trash | Hidden `.Trash` folder in the home, put back through capd | The freedesktop Trash in the home, snapshotted | |
| Test data | Test packs built into capd, Test lab in Settings, reset only for a marked sandbox | A developer and QA image feature, not in user builds | |
| More system tools: volume, brightness, Do Not Disturb, Wi-Fi and Bluetooth power, wallpaper, close, focus and arrange apps, lock, reminders | capd allows; the page carries them out | PipeWire, PowerDevil, the notification service, NetworkManager, BlueZ, Plasma, KWin, logind, systemd user timers, all over D-Bus | D7 |
| Installing or removing apps | Always asks; the page's Store records it | Flatpak plus MCP registry; always asks | D9 |
| System state in the briefing | The page reports it to brain-d every few seconds | brain-d reads it from D-Bus | D14 |
| Standing rules | Kept by capd in `rules.json`; a pass fully inside a rule is granted without asking, never for anything irreversible | Same, under `/var/lib/sios`, edited only through the trusted prompt | D4, D20 |
| Watchers | brain-d polls a folder every 3 seconds | inotify (fanotify for system folders) in brain-d | |
| Conversation | brain-d keeps the last turns per thread in memory | Same, plus Vault for longer memory | D8 |
| Confusion test | Test lab runs graded messy requests against the real model | Part of the CI evaluation suite | |
| Memory (facts, preferences, people, episodes) | capd memory module, `~/.sios/memory.json`; Memory app in the shell | Vault: encrypted under `~/.local/share/sios/vault`, enforced by the broker | D8, D21 |
| Memory recall and redaction | brain-d asks capd before each plan; names become placeholders at the default privacy level | Same, with local embeddings for search | D14, D21 |
| Starting and stopping | The page starts both services (stands in for systemd) | systemd units: broker at boot, brain-d per session | |

## Flows that must stay identical

1. **A request**
   1. The shell sends the text to brain-d.
   2. brain-d builds the briefing from names and labels only, never contents. Plans come from a saved routine, or from one model call for the whole plan.
   3. brain-d asks the broker for the least pass that plan needs; the pass waits for the owner.
   4. Every step is dry-run.
   5. The owner grants the pass in the trusted prompt.
   6. brain-d runs the steps through the broker. Text steps are the only further model calls.
   7. Anything irreversible asks the owner again.
   8. A plan that worked becomes a routine.
2. **An outside AI**
   1. It connects over MCP and reads the briefing.
   2. It calls `sios_do` with a whole goal. The goal runs through flow 1 with that app as the requester, so its trust level and pauses apply.
3. **The owner's decisions** go from the trusted prompt straight to the broker. brain-d can request but never grant.

## Known gaps (to close on Linux)

- **Process isolation:** on the Mac, any program running as the user can touch the sandbox directly. On SIOS, AI-driven work runs where only the broker can reach the files.
- **Identity:** the owner is proven by a secret file. SIOS uses kernel peer credentials and the shell's trusted prompt.
- **Persistence:** capd forgets passes and undo history when it restarts. SIOS keeps them under `/var/lib/sios`.
- **Planner scale:** the briefing lists up to 250 entries. A real home folder needs Vault's index and search by meaning.
