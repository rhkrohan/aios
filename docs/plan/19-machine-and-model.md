# 19. The machine and the model: every abstraction, every terminal command, fast workflows, and SIOS's own model

Status: Approved (2026-10-16). Decisions D88 to D94 (proposed) in `11-decisions.md`. Tracks L0 to L4 in `docs/phases/phase-2.md`.

## Context
The owner will start building and training SIOS's own model soon. Before that, SIOS needs:
- a complete, typed map of everything the AI can do on the machine, including **every terminal command on the image** (~2,350 programs, 2,280 man pages);
- a way to run complex multi-step work quickly and safely;
- training data and a pipeline that match all of this.

### Owner's answers (2026-10-16)
- **Terminal:** a typed catalog for every command, checked by the broker. Read-only commands run without asking, inside a sandbox; anything that changes something or sends data out asks. One confined `terminal.run` covers pipelines and commands the catalog can't type yet.
- **Training:** on a rented cloud GPU.
- **Model:** ship **one ~3-4B local model**.

### Research findings (3 streams, sources in the agents' reports; summarised in doc 19)

**Today's code** (inventory):
- 38 tools exist, but the planner sees only 32. Missing from it: `files.mkdir/restore/delete`, `apps.list`, `network.list`, `system.state`.
- Plans are a straight list of steps. There are no loops, conditions or parallel steps.
- `{{N}}` is plain text substitution, and only three result kinds can be passed on.
- Read results such as `files.list`, `memory.search` and `system.state` are thrown away.
- Each replan needs a new pass and a new grant.
- After a look, sending is stripped, so "find X and email it to Y" takes two goals.
- There is no router.
- The undo journal lives only in memory.
- There are no shared types; results are loose JSON.
- Step arguments are a JSON *string* (`args_json`), so a grammar can't check them.
- `llm/` has 49 records and no `export.py`.
- Some prompts (compose, pattern, MCP instructions) aren't in `llm/prompts/`.

**Platforms and workflow engines:**
- Apple App Intents, Android AppFunctions and Windows' MCP proxy all use typed nouns plus verbs, a `find` query for each entity, and risk set by the OS rather than by the tool.
- The fastest agent planners plan once, then run with code doing loops and filters, and run independent steps in parallel:
  - LLMCompiler: up to 3.7x lower latency;
  - ReWOO: 5x fewer tokens, and the planning model can be small;
  - plan caching / recipes: −50% cost, −27% latency.
- Safety: untrusted data must never choose tools, branches toward sending, or recipients (CaMeL, FIDES, Progent).
- One approval per whole plan works when backed by a dry run, scoped leases, caps and an undo journal.

**The small model:**
- **Primary: Qwen3.5-4B.** Apache-2.0, published BFCL-V4 50.3 / TAU2 79.9, 262K context, about 3-4 GB at Q8/Q5.
- **Fallback: Qwen3-4B** (dense). It avoids llama.cpp's prompt-cache problem with hybrid models on CPU.
- Bake-off candidates: Gemma 4 E4B and Phi-4-mini.
- Training method: bf16 LoRA with Unsloth or TRL on one rented GPU, roughly $5-15 per supervised run at this size. Then DPO on the model's own mistakes, with GRPO against the broker simulator as an option.
- Serving: llama-server on a Unix socket, with a typed JSON-schema grammar, a compact catalog in the prompt, a cached prompt prefix and MTP speculation.
- Ship Q8_0 or Q5_K_M. Q4 shows "permission drift", so it is only allowed if the safety eval passes on it.
- Licences: hosted-model outputs (OpenAI, Anthropic, Google) can't be used for training. Open-weight Apache/MIT models can.

## The machine, as typed abstractions
Risk: **R** reads, **C** a change that can be undone, **X** can't be undone, **S** sends something out of the computer. The catalog sets the risk; a tool or MCP server never does (MCP's own hints are hints only).

| Domain | Entities (shared types) | R | C | X | S | Backend on SIOS |
|---|---|---|---|---|---|---|
| files | File, Folder, Volume | find, list, read, preview | copy, move, rename, mkdir, tag, trash, restore, write, organize | delete | | GIO/KIO, the SIOS index (Baloo later), btrfs snapshots, UDisks2 |
| documents | Document, Page, Table | read, extract, summarize | create, edit, convert | | | poppler, pandoc, LibreOffice |
| apps and windows | App, Window, Workspace | list, read | open, focus, arrange, close, act (AT-SPI, last resort) | | | .desktop, KWin scripts, AT-SPI |
| settings and devices | Setting, Display, AudioDevice, Printer, BTDevice, InputDevice | get | set, pair | forget | | the Settings areas: kscreen-doctor, PipeWire, BlueZ, PowerDevil, CUPS, KWin input |
| network | Network, Connection, VPN | list, status | connect, disconnect, power | forget | hotspot | NetworkManager |
| power and system | Battery, Session, Service | state, battery | lock, sleep, profile, notify, remind | reboot, shutdown | | logind, UPower, power-profiles, systemd |
| people | Contact, Group | find, resolve | create, edit | delete | | the Vault, later CardDAV |
| mail and chat | Email, Message, Thread | search, read | draft, label, archive | delete | send, reply | connectors (C2), IMAP/SMTP fallback |
| calendar and tasks | Event, Task, Reminder | find | create, edit | delete | invite | connectors (C2), CalDAV |
| media | Track, Playlist, Photo | find, now playing | play, pause, volume | | | MPRIS, PipeWire |
| web | Tab, Page, Download | read | open | | submit | later: a browser bridge |
| clipboard and screen | ClipItem, Screenshot | read (sensitive), capture | write | | | Klipper, the Screenshot portal |
| notifications | Notification | list | post, dismiss, do not disturb | | | org.freedesktop.Notifications |
| packages and updates | Package, Update, Deployment | list, search | install, remove, update, roll back | | | Flatpak, bootc |
| credentials | Secret (handle only) | list handles | grant, revoke | | use (only by the broker) | the broker's vaults |
| developer | Repo, Commit, Process, Container | status, log, diff, ps | commit, branch, stop | kill | push | git, procfs, systemd, podman |
| terminal | Command, Pipeline, CommandResult | the commands the catalog marks R | C commands | X commands | S commands | `terminal.run` over the command catalog |
| memory, recipes, agents | Memory, Recipe, Agent, Run | search, list | save, forget, run | | | brain-d, capd |

Every result is a typed object with `id`, `kind`, `title`, `source` and `taint` (user, system, untrusted). Every changing tool names its `inverse`, so undo is generated, not written by hand.

## Sources
- Apple App Intents and schema domains: developer.apple.com/documentation/appintents/app-schema-domains
- Android AppFunctions: developer.android.com/ai/appfunctions
- MCP on Windows, agent workspace: learn.microsoft.com/en-us/windows/ai/mcp/overview
- ReWOO (arXiv 2305.18323), LLMCompiler (arXiv 2312.04511), CodeAct (arXiv 2402.01030), Agent Workflow Memory (arXiv 2409.07429), Agentic Plan Caching (arXiv 2506.14852)
- CaMeL (Google DeepMind 2025), FIDES (arXiv 2505.23643), Progent (arXiv 2504.11703), GoEx (arXiv 2404.06921)
- Qwen3.5 model cards (huggingface.co/Qwen), Unsloth Qwen3.5 fine-tuning guide, llama.cpp server README and MTP (PR #22673), When2Call (NAACL 2025), ToolRL (arXiv 2504.13958), APIGen and ToolACE dataset cards, BFCL v4 and tau2-bench
- Terms on training with model outputs: OpenAI terms of use, Anthropic Commercial Terms D.4(a), Gemini API terms (all forbid it); Apache-2.0 and MIT open-weight models allow it

## The approach: four tracks, built in this order
Each track: a short plan, tests, a security review, llm examples, ticks, Learned notes and a VM check.

### L0. Groundwork fixes (½ day)
- Planner: show the 6 hidden tools to the planner (`briefing.rs:43-76`).
- `capd/src/tools.rs`:
  - fix `apps.close` and `system.lock` levels (no undo, so not Reversible);
  - allow the `tunnel` wallpaper;
  - mark `network.list` and `system.state` as real in `16-tool-catalog.md`.
- Persist the undo journal and pending approvals to disk (`capd/src/state.rs:119`), since M10 needs it anyway.
- Move every runtime prompt into `llm/prompts/` (compose, pattern, answer_from, MCP instructions) and fix the drift in `briefing-seed-v1`.

### L1. Every machine abstraction: one typed catalog
- **New doc `docs/plan/19-machine-and-model.md`.** It holds the full taxonomy (domain → entity → verbs → risk R/C/X/S → backend), the research summary and the decisions. The domains:
  - files, documents, apps and windows, settings and devices, network;
  - power and system, people, mail and chat, calendar and tasks, media;
  - web, clipboard and screen, notifications, packages and updates;
  - credentials (handles only), developer (git, processes, containers), terminal, memory, recipes and agents.
- **Shared types, new `capd/src/types.rs`.** Every result becomes a typed object with `id`, `kind`, `title`, `source` and `taint` (user, system or untrusted). Types:
  - File, Folder, App, Window, Device, AudioDevice, Display, Network;
  - Person, Event, Task, Message, Setting, Process, Package, Repo, CommandResult.
- **Every tool declares an `inverse`,** so the undo journal is generated from it, not hand-written per adapter.
- **One naming scheme:** `files.`, `apps.`, `settings.`, `network.`, `system.` and so on. Old names stay only as aliases (`tools.rs:74-105`).
- **New tools, in waves,** each with typed arguments in `manifest.rs`, an adapter, and its risk set by the catalog:
  1. **Settings:** `settings.get` / `settings.set` over the areas built natively in Settings today (display, sound, Bluetooth, power, notifications, keyboard, mouse, clock, accessibility). They use the same commands the Settings backends use.
  2. **Media and system reads:**
     - `media.*`: MPRIS play, pause, now playing;
     - `clipboard.read` (sensitive) and `clipboard.write`;
     - `notifications.list`;
     - `system.battery`;
     - `processes.list`.
  3. **Developer:** `git.status/log/diff/commit/branch` (R/C), `git.push` (S), `processes.stop`.
  4. **Packages:** `packages.list/search`, plus updates through bootc (C, asks).
  5. **Mail and calendar:** through C2 connectors (already planned).
  6. **Later:** browser, and `apps.act` via AT-SPI as a last resort.

### L2. Every terminal command: a generated, typed command catalog
- **Generator `build_files/cmdcat/`** (Python). It runs at image build time in `build_files/build.sh`, inside the image itself, so it describes exactly what ships. For each program in `/usr/bin` and `/usr/libexec` that people can run:
  - package and summary (`rpm -qf`, `whatis`);
  - subcommands and flags with value types, from three sources in priority order:
    1. fish-style declarative completions (fish installed only in the build stage);
    2. man page OPTIONS sections (parsed with `mandoc`/`man -P cat`);
    3. `--help`, run under `bwrap` with no network, a read-only filesystem and a 2 s limit;
  - examples from tldr-pages (CC-BY 4.0: attribution in `/usr/share/licenses/sios/THIRD-PARTY.txt`).
- **Output:** `/usr/share/sios/commands/catalog.json`, versioned with the image (read-only under `/usr`).
- **Risk rules,** in a hand-written `build_files/cmdcat/rules.toml` with per-subcommand and per-flag patterns. Examples:
  - `git status` = R, `git commit` = C, `git push` = S;
  - `rm` = X (the broker offers `files.trash` instead);
  - `curl` / `wget` = S;
  - `systemctl --user status` = R, `systemctl --user stop` = C.
  - `sudo`, `pkexec`, `su` and `run0` are always blocked for AIs.
  - Writes to `/usr` are always blocked.
  - Any command or flag with no rule is **"unknown → asks"**, never read-only by default.
  - Curated rules for the ~300 most used commands. The rest are classified by heuristics (package group, man section, verbs in the summary) and stay "asks" until reviewed.
- **Tool `terminal.run`** in capd (new `capd/src/terminal.rs`):
  - Arguments: `{argv: [...]}`, or `{pipeline: [[...],[...]]}`, plus `cwd` (home-relative, through fsguard), optional `stdin` text, and a timeout of at most 120 s.
  - **There is never a shell string.** The broker parses each argv, looks up argv[0] in the catalog, classifies each stage, and takes the highest risk class.
  - It runs in a transient `systemd-run --user` unit (the same pattern as `runner.rs`):
    - `ProtectHome` read-only, except granted paths;
    - `PrivateTmp`, `NoNewPrivileges`, memory, CPU and task caps;
    - **no network unless the class is S and the owner allowed it**;
    - output capped at 64 KB and labelled untrusted (the goal is tainted).
  - It runs under passes and leases like every other tool. Read-only commands ask once per plan, like reading files (their output goes to the AI); everything else asks every time (commands have no undo, and options can make a program do more than its rule says). The class only decides "reads" vs "asks" and whether there is network (S): a wrong guess costs an extra question, never damage.
- **What the model sees: no 2,350 entries in the prompt.** The briefing adds only the top-k relevant command entries (search over names, summaries and tldr text), as compact signatures. The grammar then limits argv[0] to the catalog.
- The owner's own Terminal is untouched. This is only how an AI uses commands.

### L3. Fast, complex workflows: plan v2 and a parallel executor
- **Plan schema v2** in `brain-d/src/plan.rs`, kept beside v1 until migration is done. It is a typed graph:
  - steps with `id`, a tool, and a **typed `args` object** (generated per tool from the capd manifest, replacing `args_json`);
  - `after: [...]`;
  - references like `$s1.items[*].path`, with field selection and types checked against the result types;
  - `for_each` (with `as`, `max`, `parallel`);
  - `if` (exists / eq / lt / gt / contains on typed values);
  - `parallel` blocks;
  - `verify` checks;
  - `reply` with typed references;
  - **no general code.**
- **Executor, new `brain-d/src/flow.rs`:**
  - runs as a DAG: steps whose inputs are ready run in parallel;
  - steps on the same file path, device or setting run one at a time;
  - loops, filters, counts and dates run in code;
  - the model is called again only when a step or a verify check fails (bounded to 1-2).
- **One approval per plan** (amends today's pass):
  1. The broker validates the whole graph: tools, types, references, the highest risk class, every destination.
  2. It dry-runs the find steps and shows the real counts ("move 37, trash 4") with a preview.
  3. It grants a **lease** limited to exactly those tools, paths and operation caps.
  4. If the real run would touch more items than the preview showed, it confirms again.
  5. Every step writes its inverse to the persisted undo journal.
- **Taint rules** (CaMeL-style, enforced in capd's policy, not by the model):
  - Values from files, web, mail, connectors or command output are untrusted. They may fill typed data slots, such as a path or an attachment.
  - They can never pick a tool, decide a branch that leads to a sending step, or become a recipient, URL or command name.
  - Recipients and destinations must come from the owner's words or memory.
  - This replaces today's blunt `no_send`, so "find my tax PDF and email it to my accountant" works in one goal. Sending still asks.
- **Recipes** replace exact-text routines (`brain-d/src/routines.rs`):
  - a successful plan is saved with its concrete values turned into typed slots, plus match keywords and the scope it was approved for;
  - when a request matches, the model only fills slots (one short call, or none if the slots come from the words);
  - the plan is re-validated and dry-run every time;
  - approval is skipped only if the stored scope covers what this run will do.
- **Router, the fast paths:**
  1. **Reflex**, no model: exact one-step requests such as "dark mode", "volume 30" or "open terminal", matched in code.
  2. A recipe hit, which only fills slots.
  3. The local model, for new plans.
  4. A cloud model only if the owner allowed it and the local plan failed validation twice.

### L4. The SIOS model: data, training, evaluation, serving
- **Bake-off first:**
  - candidates: Qwen3.5-4B, Qwen3-4B, Gemma 4 E4B and Phi-4-mini, not fine-tuned;
  - served by llama-server with the v2 grammar and a compact catalog, on 100 internal cases;
  - also measure time to first token with a cached prefix on an x86 CPU-only VM and on the Mac;
  - pick the winner (expected: Qwen3.5-4B, or Qwen3-4B if prompt caching fails).
- **`llm/export.py`:**
  - checks every record against the capd manifest (`capd manifest --dialect mcp`), the v2 JSON schema, the command catalog and the taint rules;
  - substitutes `{{briefing:…}}` / `{{SYSTEM}}`;
  - splits by **scenario family** (paraphrases never cross splits), with a frozen, versioned test set;
  - renders each record in the chosen model's chat template, with thinking off.
- **`llm/gen/` scenario generator:**
  - scenario templates (domain × behaviour) produce a briefing and request, plus the **correct plan by construction**, executed in a capd simulator (the existing test rig and memsim packs);
  - only verified records are kept;
  - user requests are varied for paraphrase, typos and vagueness by an **open-weight Apache model**. Assistant turns stay ours, as the rule requires.
- **Data sets and targets** (10-15k records; at least ⅓ hard cases; 10-20% general chat mixed in):
  1. plans v2: single step, multi-step, for_each, if, parallel;
  2. look then plan;
  3. recovery from block, ask and failure;
  4. terminal: from the catalog and tldr examples; safe vs asks vs blocked; pipelines; refusals for sudo and for writes to `/usr`;
  5. recipe slot-filling;
  6. routing (Reflex vs plan) and clarifying questions;
  7. injection and taint: untrusted text that asks to send, delete, or run something;
  8. connectors;
  9. MCP tool use;
  10. decisions and explanations.
  - The 49 existing records are migrated to v2 and keep their `seed-` ids.
- **Training:**
  - SFT: Unsloth or TRL, bf16 LoRA r16 / alpha 16, 2-3 epochs, one rented GPU (an RTX 4090 or A100 is enough for 4B);
  - then DPO on pairs of the SFT model's own mistakes vs the correct plan, ask or refuse;
  - optional GRPO, rewarded by the simulator: valid, runs, right end state, and a large penalty for any broker violation;
  - pinned versions; adapters and merged GGUFs versioned under `/var` with rollback.
- **Evaluation (`llm/eval/`):**
  - 500 frozen internal cases;
  - metrics: schema-valid (100%), tool names, argument match, runs to the right end state in the simulator, act/ask/refuse/answer decisions, unnecessary asks, and p50/p95 latency on the Mac and the x86 VM;
  - **hard gates:** zero broker violations and zero injection-driven actions;
  - run at bf16, Q8 and Q5 (Q4 only if the gates pass), with paired McNemar tests;
  - public benchmarks: BFCL v4, τ²-bench and When2Call (decontaminated).
- **Serving on SIOS (D5, D18):**
  - a `sios-llm.service` user unit running llama-server on a Unix socket in `$XDG_RUNTIME_DIR/sios`;
  - a JSON-schema grammar per request, a cached prefix (system, then catalog, then briefing, then request), and MTP if supported;
  - the model in `/var/lib/sios/models` (never `/usr` at runtime);
  - capd's gateway gains a `local-sios` provider, and brain-d's router uses it by default.

## Decisions to log (Proposed, `plan:` commit and changelog line)
- **D88:** a typed machine catalog with shared types; risk is set by the catalog, never by the tool.
- **D89:** the generated terminal command catalog plus `terminal.run`: argv only, no shell; unknown means asks; sudo-type commands are blocked; sandboxed; network only for S with approval.
- **D90:** plan v2 as a typed graph with a parallel executor, one approval per plan with dry run and leases, and inverses for undo.
- **D91:** taint rules enforced in capd replace `no_send`.
- **D92:** parameterised recipes and Reflex fast paths.
- **D93:** one ~3-4B local model (Qwen3.5-4B primary, Qwen3-4B fallback), served by llama-server with a typed grammar.
- **D94:** the data rule is amended so that only the *user side* may be paraphrased by open-weight Apache/MIT models; assistant turns stay ours and are verified.

## Critical files
- **capd:** `capd/src/tools.rs`, `manifest.rs`, `policy.rs`, `state.rs`; new `types.rs` and `terminal.rs`; `gateway/mod.rs`.
- **brain-d:** `plan.rs`, `goal.rs`, `briefing.rs`, `routines.rs`; new `flow.rs` and `router.rs`.
- **New:** `build_files/cmdcat/` (generator, `rules.toml`).
- **Image:** `build_files/build.sh`; `system_files/usr/share/sios/commands/`; the `sios-llm.service` unit.
- **llm:** `llm/export.py`, `llm/gen/`, `llm/eval/`, `llm/prompts/`, `llm/tools/`, `llm/README.md`.
- **Docs:** `docs/plan/19-machine-and-model.md`, `11-decisions.md`, `16-tool-catalog.md`, `changelog.md`; `docs/phases/phase-2.md`; `TASKS.md`.

## Order
1. **L0** groundwork.
2. **Doc 19 and decisions** (plan commit).
3. **L1 waves 1-2.**
4. **L2:** the command catalog generator, then `terminal.run`.
5. **L3:** plan v2 and the executor, then taint rules, then recipes and Reflex.
6. **L4 in parallel from step 2:**
   - the bake-off and `export.py` first (they don't need v2);
   - the generator and data once v2 lands;
   - the first SFT run when ≥5k verified records exist.

## Verification
- **capd/brain-d unit tests:**
  - catalog risk classification, including unknown commands, sudo, pipelines and the highest class winning;
  - `terminal.run` sandbox properties (a golden test like `runner.rs`);
  - plan v2 validation, references and types;
  - DAG parallelism and per-resource ordering;
  - for_each caps;
  - taint (an untrusted value can't become a recipient or a branch toward sending);
  - leases matching dry-run counts, and re-confirmation when the count grows;
  - recipe slot re-validation;
  - undo surviving a restart.
- **`capd drill`-style end-to-end runs in the simulator:**
  - "archive PDFs older than 30 days and trash duplicates";
  - "find my tax PDF and email it to my accountant" (one goal; sending asks);
  - "show git status of my projects";
  - "what's using the most disk", via `du` under `terminal.run`.
- **The command catalog:** every program in `/usr/bin` gets an entry; check the risk class of a sample of 100 by hand.
- **On the VM:** run the same flows; time them (target: a recipe hit under 2 s, a new 5-step plan under 10 s on the Mac-class VM); confirm Stop freezes `terminal.run` units.
- **llm:** `export.py` passes on every record; eval gates pass; latency within target on the x86 VM and the Mac.
