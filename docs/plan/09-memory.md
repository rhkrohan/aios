# 09. Memory (Vault)

Status: Built in the digital version (capd memory module, brain-d recall). Becomes Vault on SIOS. Decision D21.

Memory is what SIOS knows about the owner across conversations: facts, preferences, people, and what happened. It's designed by taking how Linux already manages memory and files, and rebuilding the same ideas for an AI. Vault is our existing local memory layer; this is the shape it takes inside the OS.

## Jobs (unchanged from plan v2)
- Capture: only what the user allows (never all keystrokes).
- Organize: people, projects, preferences, finances, personal life.
- Retrieve: token-optimized, only what a task needs, injected automatically by brain-d.
- Redact: strip personal details before any cloud call, following the privacy slider.
- Resolve: back `people.resolve`, so "my accountant" becomes a real person.

## Linux ideas, rebuilt for AI memory

| Linux has | What it does there | SIOS memory |
| --- | --- | --- |
| RAM vs disk | Small and fast vs big and slow | **Working memory** (this goal's briefing and conversation) vs **long-term memory** (records kept until forgotten) |
| Page cache, readahead | Loads likely-needed data before it's asked for | **Recall before planning:** brain-d puts the few matching memories in the briefing |
| Page fault | Loads data on demand | **`memory.search` tool:** the model asks for more when something is unknown |
| cgroups, OOM | Memory limits | **A budget:** at most 12 memories per briefing; the least relevant are left out |
| Swap, page reclaim | Old pages compressed or dropped | **Consolidation:** episodes are reviewed for patterns, and the oldest are dropped first (200 kept) |
| inode, extended attributes | Every file has an owner, times, labels | **Every memory is a record:** text, kind, group, labels, source, created, last used, use count |
| Permissions, ACLs | Who may read what | **Groups and sharing:** outside AIs read only the groups the owner shares with them |
| Mount namespaces | Each process sees its own view | **Per-AI views:** each requester gets only what it may see |
| journald | Append-only log | **Episodes:** after each goal, the OS (not the model) writes what happened |
| `/proc` | A live window into the kernel | **The Memory app:** everything remembered, waiting suggestions, and who can see what |
| Kernel keyring | Secrets kept apart | **Secrets never enter memory:** passwords, keys, tokens and card numbers are refused; sign-ins live in the vault |

## Kinds of memory
- **Facts:** "My accountant is Priya Shah, priya@ledger.example."
- **Preferences:** "I keep invoices in Documents/Finance."
- **People:** contacts with name, email and role.
- **Episodes:** what SIOS did, one line per goal.
- **Routines:** plans that worked. These are kept separately by brain-d.

Groups: People, Habits, Work, Personal, Finance, History. Any memory can also be marked **Sensitive**.

## Rules (enforced by code, not the model)
1. **The broker owns memory.** Every read and write goes through capd, is checked against a pass and logged. Saving and forgetting can be undone with the goal.
2. **Sensitive memories never go to an online model.** The model only sees "1 sensitive memory held back".
3. **No secrets, ever.** The writer refuses anything that looks like a password, key, token or card number.
4. **Suggest, then confirm.**
   - SIOS saves what the owner tells it to.
   - It writes episodes itself.
   - When it notices a pattern, the pattern waits in "Waiting for your OK" until the owner confirms it.
5. **Outside AIs see nothing by default.** The owner shares whole groups with each AI, for example Work but not Personal.
6. **The privacy setting decides what online models get:**
   - 0, nothing personal: no memories, no people.
   - 1, only what the task needs (the default): names and emails become placeholders like [PERSON_1], and brain-d swaps the real ones back before anything runs on the computer.
   - 2, full context: everything relevant, still never Sensitive.

## Flow of one goal
1. brain-d asks capd for what this requester may remember about the request (readahead).
2. Those memories, and the people it may see, go into the briefing, with names hidden as placeholders at the default privacy level.
3. The model plans. It can call `memory.search`, `memory.save`, `memory.forget` and `people.resolve` like any tool.
4. brain-d restores the real names, then runs the plan through capd.
5. Afterwards, brain-d writes an episode. Every third episode, it asks the model whether a stable preference shows up, and anything found becomes a suggestion.

## Where it lives
- **Digital version:** a module in capd, stored in `~/.sios/memory.json`; the Memory app in the shell.
- **SIOS:** Vault, encrypted under `~/.local/share/sios/vault`, enforced by the broker, exportable and deletable by the owner. Owner editing goes through the trusted shell.

## Open items
- Search by meaning (local embeddings) instead of word matching.
- Encrypting the store at rest.
- Redacting file contents, not just names and emails, for online models.
- Memory for a local model, which could see Sensitive memories since nothing leaves the computer.
- Merge memory kinds with the shared types (Person, Event, File) from `04-tunnel-and-tools.md`.
