# 21. Agent pets and workflow, more coding agents, the agent Workspace, system tools and the MCP store

Status: Approved (2026-10-16, owner). Decisions D100 to D108 (proposed) in `11-decisions.md`. Tasks A9, A10b, W1 to W4 and C3 to C5 in `docs/phases/phase-2.md`.

## Why
The owner asked, in this order: agent pets and a real agent workflow; coding agents beyond Claude Code that are possible and viewable; as many missing system tools as make daily life easier; then the start of an MCP store. The owner picked OpenAI Codex CLI, Cursor CLI and Gemini CLI as extra agent brains, and asked for a new kind of workspace instead of another desktop: a layout built from what the agent is doing (its output, files in use, memory and context, ideas and goals), plus a way to map chosen folders on their drive into an agent's workspace.

## What exists (code survey, 2026-10-16)
- Claude Code is hard-wired in five places: the brain list (`agents.rs`), the sandboxed command line (`runner.rs`), its MCP config format (`state.rs`), the stream parser (`runner.rs`) and sign-in (`state.rs`).
- The "desk" is a read-only log window on a virtual desktop.
- Half-built: instructions are stored but not sent; no review or merge of the agent's branch; `sios_ask_owner` has no reply path; Pause doesn't freeze a running agent; Remove doesn't stop it; coding agents can't run on a schedule; the pet face doesn't move; the desktop buddy ignores agents.
- 42 AI tools. The native Settings backends already hold working commands for battery, power profiles, display, audio devices, Bluetooth devices, keyboard layouts, printers and update checks.
- Connectors: a signed catalog, an HTTPS MCP client, a vault and tool pinning, with one entry (GitHub). No Store page, no OAuth, no local servers, no "who can use it" screen; paired AIs never see connector tools as typed tools.

## Track A: pets and workflow
**A9a Workflow.** Instructions go with every task. Pause freezes the running unit and Resume thaws it. Remove stops the unit and its lease timer and asks whether to keep the agent's folder. Review and merge through the broker (D102): `agents.changes` (read), `agents.merge` (owner password; fetches the agent's branch into the owner's project and fast-forwards or merges; on a conflict it changes nothing and says so), `agents.discard`. All git runs with hooks off and fixed argv. A question from the agent gets a reply box; the answer resumes the same session. Coding agents may run on a schedule only while a lease allows it, driven by capd. Optional hand-off: "when done, hand to @agent", each run still its own broker-checked run.

**A9b Pets (D103).** The pet has moods from its run state: idle (blinks), working (eyes move, a small bob), thinking (looks up), asking (raised brow and a "?"), done (happy squint), failed (worried), paused or asleep (sleepy). No blush. `capd status` adds a short agents list (name, colour, mood, unread) and the desktop buddy shows one small pet per active agent beside the SIOS orb; clicking one opens that agent.

## Track B: Codex, Cursor and Gemini (D100)
A brain adapter per CLI (`capd/src/brains/`) supplies: the binary (a user install, accepted only if it resolves into its vendor's folder), read-only binds and PATH, the headless command line, the MCP config, a stream parser to SIOS's common progress events, resume, and the sign-in command.
- Claude Code: today's flags.
- Codex: `codex exec --json`, workspace-write, never asks (the outer sandbox is the boundary), `resume`.
- Cursor: `cursor-agent -p --output-format stream-json --force`, `--resume`.
- Gemini: `gemini -p --output-format stream-json --approval-mode auto_edit`, `--allowed-mcp-server-names sios`.
- The MCP config is written only in the agent's private home, so the SIOS door is the only server; project-level `.cursor/` and `.gemini/` MCP files are hidden with an empty read-only bind.
- When a CLI doesn't report tokens, the limits fall back to time and run counts and the app says so.
- Node.js is added to the image for Codex and Gemini. `agents.install_brain` (owner password) runs the vendor's documented install into `~/.local` in a unit with network only for that install.
- A short spike on the VM first: the event formats, whether Cursor honours a home-only MCP config, and resume. A CLI that fails its spike ships later.

## Track C: the agent Workspace (D101) and Places (D106)
Not another desktop: one Workspace window per agent, laid out from what the agent is doing. Panes:
1. Goal and plan: the task, the agent's own plan or todo list, ideas, open questions, the hand-off chain.
2. Live output as cards: thinking, commands with output, tool calls, questions with a reply box.
3. Files in play: a tree of what it can see; files it reads or changes light up; click for a diff or a read-only view.
4. Memory and context: instructions, the memories the SIOS door gave it, connectors it may use, tokens and context, lease time left.
5. Changes: the branch diff with Merge and Discard.
6. Take the wheel: the agent's own interactive CLI in an embedded terminal, in the same sandbox, when no headless run is going.

Panes resize and hide; the layout is remembered per agent. A Daylight mockup goes to the owner first. "Show on its own desktop" stays as an option.

**Review and Desktop tabs (D107, owner's note 2026-10-16).** The middle of the Workspace has three tabs:
- Live: the cards above.
- Review: like a pull request on the owner's own computer. Files with a check for each one read, the diff with line numbers, comments on any line (sent back to the agent as its next task with one click), "Open folder" (its copy in Files; not in an editor, since a project file the agent wrote can make an editor start a program as the owner: security review 2026-10-16), "Run its tests" (in its sandbox), a before-you-merge checklist, then Approve and merge (password) or Throw away.
- Desktop: the agent's own desktop, inside its sandbox, shown live in the panel. Each agent gets a separate headless Plasma/KWin session in its own unit (its own Wayland socket and accessibility bus, no access to the owner's session). It works that desktop through accessibility and its own screen only (core rule 7 protects the owner's screen; this one is the agent's). The owner can take control (the agent's input pauses) and give it back with a note. Spike first: headless KWin per agent, its frames into the Workspace (a private Unix socket, never the network), input forwarded only from the Workspace window.

**Places.** Each agent has an access list: a folder on the owner's drive, where it appears inside the agent's workspace, read-only or read-write, and an optional expiry that follows the lease. capd turns the list into systemd binds on the agent's unit (the rest of home stays hidden). Sensitive and off-limits folders can't be picked. Adding a place needs the owner's password and is audited. Read-write places that aren't git projects get an undo snapshot before each run, up to a size cap; bigger folders can only be read-only. The project clone stays the default place.

## Track D: system tools (D104)
Each tool: a ToolSpec, a mock, a schema, an adapter with bad-argument tests and undo where possible, a briefing line, Reflex phrases where obvious, a catalog row, llm examples. Commands reuse the Settings backends.
- Wave 1, devices and settings: `system.battery`, `power.profile`, `settings.night_light`, `settings.display_scale`, `audio.outputs`, `audio.set_output`, `audio.mic_mute`, `bluetooth.devices`, `bluetooth.connect`/`disconnect`, `keyboard.layout`, `printers.list`, `system.update_check`.
- Wave 2, everyday: `media.now_playing`, `media.control`, `clipboard.read` (Sensitive: taints the goal, always asks), `clipboard.write`, `screen.capture` (saved to a file; the model never sees pixels), `web.open` (https; the URL must come from the owner's words), `files.open` (asks; executables, launchers and scripts refused), `apps.search` and `apps.open` for any installed app, `reminders.list`/`cancel`, `trash.list`/`empty`, `disk.usage`.
- Wave 3, developer: `git.status`/`log`/`diff`, `git.commit`/`branch`, `git.push` (sends, asks), `processes.list`, `processes.stop` (the owner's own apps only), `containers.list`.
- Wave 4, power: `system.sleep`, `system.restart`, `system.shutdown` (ask; open apps named first).
- Later: `notifications.list` (no history backend yet).

## Track E: the MCP store (D105)
- C3 Store > Connectors page: Daylight mockup first; browse, search, categories, publisher and Verified, destinations, a risk chip per tool; install, sign-in and remove move here from Settings; "Who can use it" (SIOS, paired AIs, agents); a switched-off connector shows what changed and can be re-approved.
- Reach: paired AIs get connector tools they're allowed as typed tools; agents get them through the SIOS door, so their configs stay strict.
- C4 OAuth: the MCP authorization flow (discovery, dynamic client registration, PKCE on a loopback port) run by capd; refresh tokens in the vault; the model never sees a token. Unlocks hosted servers (Linear, Notion, Atlassian, Asana, Sentry), read-only tools first.
- C5 Local servers: catalog entries with a pinned container image; each runs as a read-only, no-capabilities podman unit in its own slice over stdio; secrets through stdin or podman secrets; Stop kills the slice; a server with internet access counts as sending out. Developer mode (D82) after.

## Order
Plan commit; A9a; A9b; B spike then B; C mockup, then Places, then the Workspace window; D waves 1 and 2; C3, reach, C4; D waves 3 and 4; C5. Each step: tests, a security review, llm examples, ticks, Learned notes, a VM check. A running image build is never cancelled; work queues for the next build.

## Addendum (2026-10-16): the MCP Registry shelf (D108)
The owner approved the Store design and asked for the right logos and every available server from the standard MCP Registry. The official registry lists over 6,000 servers (5,524 of the first 6,000 reachable online; about 740 packages: npm, PyPI, OCI and others; 1,231 with their own icon). The Connectors page gets two shelves: Verified by SIOS (the signed catalog) and All MCP servers (the registry, cached by the broker, refreshed daily, shown as plain text and "Not reviewed by SIOS"). Remote registry servers install under developer-mode rules (D82): tools pinned at install, every tool always asks until the owner classifies it, only its own address. Package servers are listed and wait for the local runner (C5). Logos come from Simple Icons for verified entries, the registry's own icon (https PNG or WebP, at most 256 KB, cached by the broker, never SVG) or a monogram.

Order: Workspace window (Live, Review), then the registry fetcher, the Connectors page, remote installs, browser sign-in (C4), the local runner (C5), then the Desktop tab after its VM spike.

