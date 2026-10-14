# Plan changelog

Newest first. One line per change.

- 2026-10-14: D36 accepted (owner approved the M1 plan): tools renamed to files, apps, settings, network, system, with old names as aliases until M8. Added 16-tool-catalog.md, the list of system abstractions with risk, status and the image backend for each.
- 2026-10-14: AI OS layer plan (milestones M0 to M11 in phase-2): D33 to D35 accepted by the owner (broker holds API keys and makes model calls; Anthropic, OpenAI, OpenAI-compatible and Gemini; full typed tool catalog over local MCP). D31, D32, D36, D37, D38 proposed (user-service broker for v1, caller identity by SO_PEERCRED and program path, tool rename, native approval prompt, CLI adapters and a Rust image stage). D19's key handling superseded once the gateway lands.
- 2026-10-12: D30 withdrawn, D27 stands (owner: "the design was good"): Kvantum menus keep the SIOS design; rounded corners fixed.
- 2026-10-12: D30 accepted (owner rejected the Kvantum menus, "this is the wrong strategy"): apps use Breeze in the SIOS colours for real rounded menus; D27 replaced.
- 2026-10-12: D29 accepted (owner chose "Build SIOS Files"): our own apps are native Qt (C++ and QML, KIO for files), built in an image stage; SIOS Files first and default for folders.
- 2026-10-12: 08-ux.md: full list of what's left on Fedora (desktop look, Stage B AI surfaces, Stage C apps, preview-only parts), from an inventory of every preview screen.
- 2026-10-12: D27 (Kvantum app style with a SIOS theme; relaxes "stock KDE only" for app styling, not window effects) and D28 (SDDM login with a SIOS theme) accepted by the owner.
- 2026-10-12: Fedora desktop brought in line with the preview (owner: "looks nothing like the simulation"): desktop widgets, dock with orb, top-bar menus, dusk wallpaper, SIOS boot screen and name; 08-ux.md table updated.
- 2026-10-12: ideas.md: three ways to bring SIOS to Mac users (Mac app running the arm64 image, native install via Asahi or on Intel Macs, the SIOS brain on macOS).
- 2026-10-12: Stage A of the Fedora UI built (SIOS look and layout in system_files); 08-ux.md "On Fedora" section and a mapping row added.
- 2026-10-12: 15-build-blueprint.md added: engines, security and agent pipelines, file layout, goal processes, tested vs not tested, and the step-by-step path to a real device. capd IAM deny rules fixed to fire on any overlap.
- 2026-10-11: IAM in capd and brain-d (stable ids, pairing tokens, unpaired apps get no roles, brain.sock secret); live Security Center; mapping row and build order updated.
- 2026-10-11: Agent IAM built in the sim (Identities, Roles, What if in the Security Center); mapping row added; build order updated. Rule recorded: the strictest of role and Access map wins.
- 2026-10-11: Added 14-design-decisions.md (all decisions in one place, with system, request and broker diagrams; proposed D22 to D26 from the audit).
- 2026-10-11: ideas.md: Agent IAM (candidate D22), from a full audit of capd, brain-d, the sim engine and memory.
- 2026-10-09: Mapping doc: everyday demo and its new tools (reminders, away reply, document compare, web forms). ideas.md: everyday test pack for the live machine.
- 2026-10-09: Mapping doc: memory simulation row. ideas.md: "memory that changes its mind" (stale facts, episodes crowding out facts, learned habits going stale), found by the simulation.
- 2026-10-09: Mapping doc: memory map row (episodes keep links to the memories they recalled and who ran them).
- 2026-10-09: Mapping doc: helper pets row (each helper its own AI identity with a long-running job).
- 2026-10-09: D21 accepted (memory model). 09-memory.md rewritten (Linux concepts mapped to AI memory). Part of Phase 3 (memory, people, redaction) pulled forward into the digital version. Mapping doc rows added.
- 2026-10-09: 13-sim-to-fedora.md: rows for more system tools, app installs, system state, standing rules, watchers, conversation and the confusion test.
- 2026-10-09: 13-sim-to-fedora.md: owner file actions, Trash and test data rows added (live machine fully integrated with the shell).
- 2026-10-09: Added 13-sim-to-fedora.md (maps the digital version to the Fedora build). brain-d prototype in Rust (briefing, one-call plans, broker dry-run, routines, MCP door for outside AIs); capd gains requested passes the owner grants, dry runs, argument checks, coarse and system tools.
- 2026-10-09: D19 (OpenAI as the testing intelligence layer) and D20 (capability tokens, `capd` proof of concept in Rust) accepted. Ideas added: data lineage, delegation slices, coordination locks, goal budgets, plan approval, Threads file view.
- 2026-09-28: Phase 0: ISO built (disk workflow moved to ubuntu-24.04 runner). Added idea: migrate ISO tooling to image-builder.
- 2026-09-28: Plan v2 adopted in repo, merged with Phase 0 progress (cosign, Aurora base, first signed public build, collaborator). Added risk: Aurora amd64 only vs arm64 Mac. Added Phase 0 task and idea: enforce signature verification. Dropped: kinoite-main alternative, "Phase 4 before 3" option.
- 2026-09-28: Phase 0: first signed build on ghcr.io; base switched to Aurora; image renamed aios; ISO config path fixed.
- 2026-09-28: Phase 0: cosign key and SIGNING_SECRET set up.
- 2026-09-28: Plan v2. Added strategy (tunnel-first), brain, tunnel and tools, security, base OS, UX, memory, glossary docs. Roadmap revised (Phase 2 = Tunnel v1 + broker). Decisions D12 to D18 accepted.
- 2026-09-28: Repo created from ublue-os/image-template.
- 2026-09-28: Plan v1 created (vision, architecture, D1 to D11, roadmap, risks, ideas).
