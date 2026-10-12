# Ideas backlog

New ideas land here first. Status: Exploring, Accepted, Parked. When accepted, log in 11-decisions.md and move into a phase.

| Idea | What it is | Where it fits | Status |
| --- | --- | --- | --- |
| Jev (TypeSafe AI) | Hosted "System One" decision model | Inspired Reflex (D11); Jev itself as optional plugin later | Accepted as inspiration |
| Agent IAM | One identity and permission model for every AI: a principal registry (stable ids, kind, who created it, how it proved itself), roles made of allow and deny statements (tools, folders, memory groups, conditions, auto or ask), the per-goal pass as a slice inside the role, explicit deny always wins. Outside AIs prove identity with a pairing token the owner issues. Sim and capd read the same format. Found by the 2026-10-11 audit: today a principal is any string, so agents can rename themselves and borrow another AI's memory shares | capd (new iam module), brain-d identities, Security app (Identities, Roles, what-if simulator) | Exploring (candidate D22) |
| JevOS-style policy file | Plain JSON rules turn scores into allow / ask / block, with replayable traces | Broker policy | Exploring |
| Home brain | User's desktop GPU serves a big model to their laptop | Router provider | Exploring |
| Recipe sharing | Users share workflows, like an app store for recipes | Phase 4+ | Exploring |
| Curated tool catalog | Wrapped, typed, well-described MCP servers | Business line | Exploring |
| Voice-first mode | Wake word + voice commands through Reflex | Phase 1+ | Exploring |
| Signature enforcement | Ship `cosign.pub` + containers policy in the image so bootc only accepts our signed images | Phase 0 or 1, base OS | Exploring |
| Move ISO tooling to image-builder | bootc-image-builder is archived; migrate `build-disk.yml` to `osbuild/image-builder` (or bootc install / titanboa) | Base OS, after Phase 0 | Exploring |
| Muse integration | Hand tasks to Muse when an entry point exists | Connections | Parked |
| Agent trust levels | Each AI agent has a trust level (Unknown, Limited, Standard, Trusted, Owner) earned by verified tasks and lost on violations; the broker reads it before every action | Broker, differentiator vs agents driving Windows/macOS | Exploring (in concept sim) |
| Capability leases | Every permission is a lease: one tool, one requester, with expiry and use count ("for 1 hour", "this session") | Broker | Exploring (in concept sim) |
| Tamper-evident audit log | Each decision is hash-chained to the previous one; verify detects edits | Broker audit | Exploring (in concept sim) |
| Files as objects | Files carry origin, trust (untrusted if from web/email), labels, goal history and per-agent access; smart views like "Changed by AI" | Files, Vault | Exploring (in concept sim) |
| Goals monitor | Activity-Monitor-style view of GoalProcesses: state machine, envelope, authority, verification | Shell | Exploring (in concept sim) |
| Digital twin | Browser simulation of the whole machine plus modeled efficiency vs screen-driving agents, used to validate design before the image | Planning tool | Exploring (build_concept_html) |
| Data lineage and flow control | Files a goal reads pass their labels to what it writes; egress is checked against all sources, not just the attachment | Broker (new Data check), Vault | Exploring (in concept sim) |
| Delegation slices | A goal hands a sub-goal to another AI with attenuated authority: paths, tools, no egress, use-limited lease | Broker (new Slice check), brain-d | Exploring (in concept sim) |
| Agent coordination locks | Files in use by you or another agent are locked; agents wait their turn instead of colliding | brain-d, adapters | Exploring (in concept sim) |
| Goal budgets | Each goal has an action and cost limit; sub-goals count against the parent; going over asks | Broker (new Spend check), router | Exploring (in concept sim) |
| Plan approval | Approve a multi-step plan once (reversible steps covered); irreversible steps still ask | Broker, UX, reduces prompt fatigue | Exploring (in concept sim) |
| Threads file view | Files drawn as where they came from and what was made from them; click to light a whole thread, drag onto the orb to ask | Files, UX | Exploring (in concept sim) |
| Memory that changes its mind | Found by the memory simulation: a newer fact about the same thing (new accountant, moved city, new folder) should replace the old one (kept as history, out of recall); episodes shouldn't crowd facts out of the briefing; learned habits get re-checked when a fact they rest on changes | capd memory, brain-d recall | Proposed (memsim shows 5 of 6 checks failing over 6 months) |
| Everyday test pack | The demo's four chores (trip, lease, job, taxes) as a capd test pack with the same files and inbox, so real models can be tried on them on the live machine | capd packs, Test lab | Proposed |
| SIOS for Mac (app) | A one-click Mac app that runs the arm64 SIOS image in a lightweight VM using Apple's Virtualization framework (like OrbStack or Tart). Full SIOS desktop in a window or full screen, files shared with the Mac. Reuses the arm64 build that exists today (`aios:arm64-test`, built FROM Kinoite) | New Mac app; arm64 image edition; disk workflow for arm64 raw/qcow2 | Proposed (recommended first) |
| SIOS on Mac hardware | Install SIOS natively on Macs: Apple Silicon through Asahi Linux (mainly M1/M2, some hardware unsupported, atomic edition experimental), Intel Macs with the x86 image (T2 Macs need extra work) | arm64 edition on an Asahi base; hardware testing | Exploring (enthusiasts, later) |
| SIOS brain on macOS | Run brain-d and capd natively on macOS and drive the Mac's own apps through Accessibility, AppleScript and Shortcuts, no Linux. Reaches the most users, but the broker can't be an OS-owned service the AI can't bypass, so weaker guarantees than SIOS | Separate edition; macOS adapters; strategy question for the planning chat | Exploring (needs a decision) |

## Name candidates (decision paused)
Premium: Sovereign, Halcyon, Atrium, Vesper, Aurum, Sable, Meridian
Soft: Serein, Oriel, Calla, Selene, Elowen
Other: Cairn, Zehn, Keel, Orrery, Hearth
