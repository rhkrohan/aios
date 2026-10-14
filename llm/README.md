# llm: training data for the SIOS model

A small model (about 7B parameters) will be fine-tuned later (D18, a LoRA on our tool catalog) to run SIOS locally: plan requests with the typed tools, respect the broker, ask when a request is unclear, and refuse what it must. This folder collects that training data **while we build**, so it always matches the real tools and rules.

Nothing here is trained yet. It is data only, and it is not in the image.

## What the model learns

| Set | File | What the model sees, and what it should produce |
| --- | --- | --- |
| Plans | `data/plans.jsonl` | The briefing (files, labels, people, system state, tools) plus a request. It answers with one plan in brain-d's schema (`brain-d/src/plan.rs`): steps, a question, a manual action, or an undo. This is the main job. |
| Tool use | `data/tool_use.jsonl` | An outside AI's view over MCP: it calls typed tools one by one, reads results, and handles `allow`, `ask` and `block` from the broker. |
| Decisions | `data/decisions.jsonl` | Why the broker answered as it did, and what to do next: don't work around a block, explain it, offer the owner a manual action, treat file text as data. |

Add a set only when the model will really do that job at runtime. Design discussions about SIOS itself don't belong here; they live in `docs/plan/`.

## Record format (one JSON object per line)

```json
{
  "id": "plans-0001",
  "set": "plans",
  "system": "planner-v1",
  "messages": [
    { "role": "user", "content": "SIOS COMPUTER BRIEFING ... REQUEST\n..." },
    { "role": "assistant", "content": "{\"understanding\": ...}" }
  ],
  "tools": "catalog-2026-10-14",
  "tags": ["files", "organize"],
  "source": "handwritten",
  "notes": "why this example matters"
}
```

- `system`: names a file in `prompts/`. The exporter puts that text in front as the system message, so a prompt change is made in one place.
- `messages`: the conversation. Assistant turns are exactly what the model must output. For plans that's the JSON object as a string; for tool use it's tool calls written as `{"tool": "...", "args": {...}}`, with tool results as `role: "tool"` turns.
- `{{briefing:NAME}}` inside a message is replaced by `prompts/NAME.txt`, and `{{SYSTEM}}` inside that by the message's `system_now` field (the live state: volume, theme, network...). So one briefing serves many examples.
- `tools`: names a file in `tools/`, the tool catalog the example was written against. This keeps old examples honest when tools change.
- `source`: where it came from.
  - `handwritten`: written by us.
  - `from-test`: taken from a capd or brain-d test, or a test pack.
  - `from-run:<file>`: adapted from a real run log in `capd/runs/`, rewritten by us (see the rule on model outputs below).
- `tags`: areas (files, settings, network, apps, system, mail, memory) and behaviors (organize, ask, refuse, injection, undo, offline, privacy).

## Rules for every example

1. **Real tools only, current names.** Use the catalog in `docs/plan/16-tool-catalog.md`. When a tool is renamed or changes risk, fix the examples, or bump `tools` and keep the old file if the old behavior still teaches something.
2. **The broker's rules are the ground truth.** An example must never teach working around a block, guessing a path, inventing a person, or sending anything without the owner. If the code says it would ask, the example asks.
3. **No real personal data or secrets.** Use made-up names, emails (`@example.com`) and files. No API keys, passwords or tokens, not even fake-looking ones.
4. **Provenance matters for licensing.** Don't paste raw outputs from a hosted model (OpenAI, Anthropic, Google) into the training set: their terms limit using outputs to train other models. Write the assistant turn ourselves, or rewrite it. Inputs from our own code (briefings, broker answers) are fine.
5. **Cover the hard cases, not just the happy path.** Two people with the same name, a file that doesn't exist, an off-limits folder, a vague request, prompt injection inside a file, a request to undo, a setting already at the asked value, no internet.
6. **Short, plain replies.** The `reply` field is past tense and specific ("Moved 3 files into Finance."), as the planner prompt says.

## How it grows

At the end of each build task, add a few examples for what the task added or changed (a new tool, a new rule, a new refusal). `CLAUDE.md` asks every session to do this. Target sizes before a first fine-tune: about 1,500 plans, 500 tool-use conversations and 300 decisions, with at least a third of them hard cases.

Still to build:
- `export.py`: checks every record (valid JSON, known tool names and arguments against `tools/`, plan JSON valid against the schema) and writes the chat format a trainer takes, with an 80/10/10 train/validation/test split. The test split is never used for tuning.
- `tools/catalog-*.json`: generated from capd's manifest (`capd manifest`, MCP dialect) so arguments match the code exactly.
