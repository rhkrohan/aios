# 18. Agents, workspaces, proactive SIOS, Memory and the MCP store

Status: Approved (2026-10-15). Milestones A0 to A10 and C1 to C3 in `docs/phases/phase-2.md`. Decisions D58 to D84 (proposed) in `11-decisions.md`.

## Context
The engine works: planning, the broker, approvals, undo, search and the S1 security engine (Stop, approval sessions, broker-started windows). What's missing is what a developer or AI power user would come back to every day. Today:
- goals show only as text lines;
- memory has no screen;
- helpers can't be created from the desktop;
- nothing happens on its own;
- mail only writes an outbox file;
- installs, reminders and window control fail on the image;
- outside AIs (Claude Code) can be paired but their work isn't visible.

**Owner's direction (2026-10-15):**
- Ship working features in about 2 weeks, for developers and AI power users.
- Proactive helpers; visible memory with a native Memory app like the preview's; real mail and calendar; any AI, safely.
- Agents ("pets") linked to the AIs already connected.
- Each agent gets its own workspace. For example, Claude Code builds a project on its own desktop, works proactively and reports back.
- An MCP store. Mail and calendar should come through MCP connectors where possible, otherwise a standard way. Claude Code is the first CLI agent.

**Principles stay:**
- every action through capd;
- credentials never in model context;
- the OS writes headlines, and untrusted text is data;
- D57: only settings and look-ups run unasked.

## What changes in the design (found in the code)
1. **A no-password viewer tier.** Memory and audit reads are owner methods today, so every view would ask for the password. Windows that capd started (`security::is_window`) may read; every change stays an owner action (D59).
2. **brain-d's owner controls (helpers, watchers, goals.recent) are unreachable on the image** (`OWNER_BY_PROGRAM=false`). The agent registry moves into capd as owner methods; brain-d reads it as the service.
3. **`goal.events` is readable by anyone who knows an id.** Restrict it to viewers, the Ask bar and the goal's own principal.
4. **Stop has nothing to freeze yet.** Agent units land in `sios-agents.slice`, which Stop freezes.
5. **Tool specs are compiled in.** Connector tools need runtime specs.
6. **Helpers hard-wire OpenAI.** Built-in agents use the gateway's active provider.
7. **capd handles every request under one lock.** Slow work runs outside the lock with prepare, run and done steps, as `model.complete` does today. This covers flatpak, git worktrees, IMAP/SMTP, MCP calls and KWin scripts.

**Owner answers (2026-10-15):**
- the agent signs in to Claude on its own, inside its sandbox, never using `~/.claude`;
- work leases default to 2 hours;
- a non-git project gets an offer: "Make it a git project".

## Milestones (one at a time; each with tests, a security review, llm examples, ticks, Learned notes and a VM check)
**A0. Ship and check the current image** (S1, D57, search). VM checks:
- the S1 gate;
- dark mode with no prompt;
- PDF search;
- Ask bar end to end;
- paired Claude Code;
- clean up the test leftovers;
- confirm user units honour `ProtectHome=tmpfs`, `BindPaths` and `systemd-run --user --pipe/--pty` (A5 and C1 depend on them; the fallback is bwrap).

**A1. Viewer tier and new owner windows.**
- `security.rs` `WINDOWS` and `peer.rs` `OWNER_APPS` gain `sios-memory`, `sios-agents` and the store.
- Viewer methods `memory.view`, `audit.view {principal?, since?, n}`, `agents.view`, `reports.list`.
- A service method `windows.check {pid,start}` so brain-d can recognise SIOS windows.
- `goal.events` limited to viewers, the Ask bar and the goal's principal; `goals.recent` becomes viewer-level.

**A2. Memory app plus "memory that changes its mind".**
- New `apps/sios-memory` (Qt, skeleton and `broker.cpp` from sios-settings), tabs from `MemoryApp.tsx`: About you, People, Timeline, Waiting for your OK, Sharing per agent, Map.
- `capd/src/memory.rs` supersede (D25 minimal):
  - a newer same-subject fact replaces the older one, which stays in history, leaves recall and can be reverted with `memory.revert`;
  - delete becomes soft for 30 days;
  - at most 3 episodes per briefing.
- Inside an approval session, confirm, dismiss, edit and soft delete are one click (D71).
- **Gate:** memsim reaches at least 4 of 6 checks (today 1).

**A3. Tools the model already expects.**
- New `capd/src/kwin.rs` plus fixed KWin scripts in `/usr/share/sios/kwin/`, with results returned over a nonce-checked zbus endpoint `org.sios.Capd1`. Covers `apps.list`, `apps.focus`, `apps.close` (never SIOS's own windows) and `apps.arrange`.
- `system.remind`: a `systemd-run --user --on-active` timer that notifies; undo stops it.
- `settings.dnd`: plasmanotifyrc, falling back to a Notifications Inhibit cookie.
- `network.bluetooth_power`: BlueZ.
- `apps.install` and `apps.remove`: `flatpak --user`, id checked against the Flathub AppStream pool; always asks.

**A4. Agent registry and the Agents app.**
- New `capd/src/agents.rs` keeps `agents.json`:
  - `Agent{id agent:<slug>, name, color, brain: Builtin|Cli{ClaudeCode}, job: OnDemand|Watch|Every|Daily|Project, workspace, lease}`;
  - owner methods (password) `agents.add/update/remove/grant_lease/signin`; viewer `agents.view`; service `agents.list/run/report`;
  - helpers migrate with id aliases; IAM kind `agent`.
- `brain-d/src/agents.rs` replaces the helpers loop and runs built-in agents as their own principal.
- New `apps/sios-agents` with four tabs:
  - Agents: pet cards with state, brain, job, reports, New, Pause, Run now;
  - Inbox;
  - Activity: audit timeline plus live goals, replacing Monitor's empty Goals tab;
  - Permissions: roles, memory groups, pause, Stop, lease.

**A5. Agent runner: Claude Code confined, reporting back.**
- New `capd/src/runner.rs` starts a transient `systemd-run --user` unit `sios-agent-<id>.service` in `sios-agents.slice`. The sandbox is fixed in capd code:
  - `ProtectHome=tmpfs`, with `BindPaths` for the worktree and a private agent HOME under `~/.local/share/sios/agents/<id>/home`;
  - `PrivateTmp`, `NoNewPrivileges`, memory, CPU and task limits, `RuntimeMaxSec` = the lease;
  - `LoadCredential` carries the pairing.
- It runs `claude -p <task> --output-format stream-json --mcp-config <sios door> --strict-mcp-config --permission-mode acceptEdits` and resumes for follow-ups.
- `brain-d/src/mcp.rs` reads the pairing from `$CREDENTIALS_DIRECTORY` and gives agent sessions the tools `sios_report`, `sios_ask_owner` and `sios_done`.
- capd accepts an agent's `session.open` only from its own unit's cgroup (D64). Stop freezes the slice; pause freezes the unit.
- Work leases (D65): granted once with the password (project, hours, whether scheduled runs are allowed); the default is 2 hours. Tasks inside a lease start without new prompts.
- Projects work in a git worktree on branch `sios/<agent>`, so your working copy is never touched; you review and merge (D63). A folder that isn't a git project gets the offer "Make it a git project" (git init with your OK).
- Sign-in: `agents.signin` opens Konsole inside the same sandbox for a one-time Claude login in the agent's own HOME (D61).
- The network is labelled "open until S5" on cards and approvals.

**A6. Workspaces: a desktop per agent.**
- `kwin.rs`: `desktop_ensure` (VirtualDesktopManager `createDesktop`), placing the agent console (`sios-agents --console <id>`, a live transcript) and Files on the worktree onto the agent's desktop.
- Peek is a click; your view never switches on its own.
- The pet shows OS-written headlines ("Coder finished") from `capd status`, plus notifications.
- In the Ask bar, `@coder add tests` routes to `agents.run`.

**A7. Proactive engine, suggestion cards, look then plan.**
- `brain-d/src/proactive.rs`: inotify (notify crate) and a scheduler with catch-up replace the 3 s polling. Triggers: folder change, schedule, login (morning briefing), agent report, and later new mail, an event soon, and connector events.
- `suggest.rs` cards: an OS-written headline plus a fixed request. "Do it" starts a normal goal. Cards show in the Today widget, the pet bubble, the top of the Ask bar and notifications. Only D57 tools run unasked (D70).
- Rule-based generators first: Downloads filling up, big files, an agent asking, the morning briefing.
- Look then plan (D72): the plan gets a `look` list of read tools, run once (at most 10 calls), then one replan with the results as data. "Find my tax PDF and move it to Finance" then works.

**C1. MCP client and connector host in capd** (D79; amends doc 04, which put it in brain-d).
- **Catalog:** `/usr/share/sios/connectors/catalog.json` plus an ed25519 signature, with a signed update channel. Each entry carries publisher, verified, a pinned install (binary sha256 or container digest), credentials needed, destinations, and tools with SIOS-assigned level, egress, SIOS-written descriptions and schema hashes.
- **Host:** each server runs in `sios-connector-<id>.service` inside `sios-connectors.slice` and talks MCP JSON-RPC to capd over a pipe.
  - Node and Python servers run as rootless `podman run --rm -i --read-only --cap-drop=all` images pinned by digest.
  - Remote HTTPS MCP servers are called by capd directly.
  - Credentials never go in a file or unit property: secrets reach the container as podman secrets or a 0700 runtime env file deleted after start.
- **Tools:** `tools::spec()` also covers runtime connector specs. A server whose tool list changes from the catalog's hashes is disabled (rug-pull defence). Server descriptions never reach a model.
- **Sign-ins vault** `capd/src/vault.rs`: generalised from `gateway/keys.rs`, for tokens and app passwords now and OAuth refresh tokens next; owner-only, never returned.
- **Install, uninstall, identity:**
  - install and uninstall are password owner methods; you pick which AIs get the tools; uninstall revokes everything;
  - connector identities (kind `connector`) are for audit attribution.

**C2. Mail and calendar as connectors** (owner: through MCP where possible).
- First entries: a vetted Google Workspace MCP server (Gmail and Calendar), pinned.
  - It needs Google sign-in: capd runs a loopback PKCE OAuth flow (browser opened on 127.0.0.1), keeps the refresh token in the vault, and passes short-lived access tokens to the server.
  - For now this uses your own Google Cloud OAuth client. A SIOS-verified client needs Google's security review (CASA), which is a business task for later.
  - The exact way the server accepts tokens needs a spike.
- Tools are mapped onto SIOS names and levels: `mail.search`, `mail.read` (untrusted, taints the goal), `mail.draft` (reversible), `mail.send` (always asks, egress), `calendar.list`, `calendar.add` (invites always ask).
- **Fallback if no vetted server fits:** a native capd adapter with the same tool names over IMAP/SMTP (app password; lettre, imap, mail-parser) and an ICS link or CalDAV.
- Triggers: new mail and an event soon feed A7. Settings gets a "Sign-ins" page.

**C3. Connectors tab in the Store, and developer mode.**
- `apps/sios-store` lists the catalog: publisher, verified badge, each tool's risk chip, destinations. Installing uses the password flow.
- MVP set: Gmail, Calendar, GitHub (official server; "summarise my open PRs"), Linear, Notion.
- Developer mode (password): unknown servers, with every tool Irreversible plus egress and no server text shown until you classify it.

**A10. Integration, image, gate.** The full VM run:
- a memory edit and revert;
- a suggestion turned into a goal;
- Claude Code on its own desktop finishes, reports, and is stopped by Stop;
- mail read and send;
- calendar add;
- GitHub PRs;
- remind, DND, window arrange;
- the audit shows `agent:` and `connector:` callers.

Then docs: decisions D58 to D84, `16-tool-catalog.md`, `08-ux.md`, phase tasks.

## Proposed decisions (logged in S0-style docs first)
- **D58:** ship now; S2 to S9 continue after.
- **D59:** viewer tier.
- **D60:** agents are capd identities with a registry in capd.
- **D61:** brains are built-in or CLI; a CLI agent signs in inside its own private HOME until S5.
- **D62:** runner unit with the sandbox fixed in capd.
- **D63:** git worktree per agent.
- **D64:** an agent's pairing works only from its unit.
- **D65:** work leases.
- **D66:** agent MCP tools; agent text is untrusted.
- **D67:** a KWin desktop per agent; the view never switches without a click.
- **D68:** capd gets a minimal zbus endpoint for KWin results.
- **D69:** proactive engine with inotify and a scheduler.
- **D70:** suggestion cards.
- **D71:** one-click memory edits in a session.
- **D72:** look then plan.
- **D73:** minimal supersede.
- **D74:** Sign-ins vault.
- **D75:** mail and calendar as connectors first, native IMAP/CalDAV only as fallback.
- **D76:** capd is the only SIOS process with network for these.
- **D77:** new windows Memory and Agents; Monitor's Goals tab folds into Agents.
- **D79:** the MCP client lives in capd.
- **D80:** signed catalog; SIOS-written tool text and levels.
- **D81:** connector install needs the password; credentials by stdin; uninstall revokes.
- **D82:** developer mode for unknown servers.
- **D83:** connector identities for attribution.
- **D84:** pinned binaries and digests only.

## Honest limits
- **Agent network is open until S5.** Confinement protects the rest of your home, not the worktree's contents. Every card says so.
- **A CLI agent holds its own sign-in** until the S5 gateway proxy.
- **User-unit sandboxing depends on user namespaces.** This is checked in A0, with bwrap as the fallback.
- **The KWin scripting and virtual-desktop APIs aren't stable** across Plasma releases.
- **Gmail and Calendar MCP servers need Google OAuth.** That means an OAuth client and a consent screen; if this blocks, the IMAP/ICS fallback ships first.
- **Prompt injection** through mail, connector results or agent reports is bounded by taint and always-ask on egress, not removed.
- **Scope is tight (about 14 days).** If behind, cut in this order: CalDAV writes, `apps.arrange`, the Memory map, C3 developer mode.

## Verification
- Unit tests per module:
  - viewer refusals;
  - supersede and memsim at least 4 of 6;
  - KWin argument building;
  - a runner unit golden test (no input becomes a `-p`);
  - `session.open` from the wrong cgroup refused;
  - the suggestion request is immutable;
  - look limited to read tools;
  - the vault never returns or logs secrets;
  - catalog signature and schema-hash checks;
  - server descriptions never in the manifest;
  - uninstall leaves nothing.
- VM gates per milestone (above) on the arm64 VM, with screenshots via `ui/vm-shot.sh`. Images through GitHub Actions; quick loops via `apps/build-app.sh`, `apps/build-rust.sh` and `ui/sync-vm.sh`.
- The S1 drill rows are rerun after A5 (Stop freezes agents) and C1 (Stop kills connector units).
- llm: about 40 new examples across plans (look, memory, mail, agents), tool_use (agent reports, connectors) and decisions (injection in mail or connector results).

## Order and timing
A0 (day 0-1) → A1 (1) → A2 (2) → A3 (3) → A4 (4) → A5 (5-6) → A6 (7) → A7 (8) → C1 (9-10) → C2 (11) → C3 (12) → A10 (13-14). Each milestone starts with a short plan; plan changes go in `plan:` commits with a changelog line.
