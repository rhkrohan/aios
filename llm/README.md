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
4. **Provenance matters for licensing (D94).** Assistant turns are always ours: written by us, or built by our own code and checked by the simulator. Never paste outputs from a hosted model (OpenAI, Anthropic, Google): their terms forbid using them to train another model. Only the *user* side (requests) may be varied (paraphrases, typos, vague wording) by an open-weight model under Apache-2.0 or MIT (for example Qwen, Gemma 4, Mistral open weights). Inputs from our own code (briefings, broker answers) are fine.
5. **Cover the hard cases, not just the happy path.** Two people with the same name, a file that doesn't exist, an off-limits folder, a vague request, prompt injection inside a file, a request to undo, a setting already at the asked value, no internet.
6. **Short, plain replies.** The `reply` field is past tense and specific ("Moved 3 files into Finance."), as the planner prompt says.

## How it grows

At the end of each build task, add a few examples for what the task added or changed (a new tool, a new rule, a new refusal). `CLAUDE.md` asks every session to do this. Target sizes before a first fine-tune: about 1,500 plans, 500 tool-use conversations and 300 decisions, with at least a third of them hard cases.

Still to build:
- `tools/catalog-*.json`: generated from capd's manifest (`capd manifest`, MCP dialect) so arguments match the code exactly (today's catalogs don't carry value ranges, so "volume 300" isn't caught by the checker).

## Checking and exporting: `export.py`

```
python3 llm/export.py --check           # check every record, write nothing
python3 llm/export.py                   # check, then write llm/out/{train,val,test}.jsonl
python3 llm/export.py --template qwen   # also add each record as Qwen chat text ("text"), thinking off
```

It stops with a list of problems (by record id) if anything is wrong:
- every record has its fields, an existing prompt (`prompts/<system>.txt`) and catalog (`tools/<tools>.json`), and a unique id;
- **plans**: each answer is a plan matching `schemas/plan-v1.json` (plus the catalog's connector tools); every tool step uses a catalog tool, and its `args_json` is JSON matching that tool's `inputSchema`; lookups use only `files.find`, `files.list` or a connector's read tools; manual buttons only show things; a plan that asks a question or looks first has no steps;
- **tool_use**: each `{"tool", "args"}` call uses an MCP name (`files_list`, not `files.list`) from the catalog, or one of SIOS's door tools (`sios_do`, `sios_approval_status`...), with matching arguments;
- **decisions**: turns are present and not empty.

The output is plain chat (`{"id", "set", "messages": [{role, content}]}`) with the system prompt first and `{{briefing:...}}` / `{{SYSTEM}}` filled in. `llm/out/` isn't committed.

`schemas/plan-v1.json` mirrors brain-d's `plan::schema_with`. Make it again whenever `brain-d/src/plan.rs` or `briefing.rs` changes: `python3 llm/schemas/make_plan_schema.py` (it reads the tool names from the Rust source; a change to the plan's shape must be copied into that script by hand).

**The split.** Records are split by *scenario family*, never one by one, so paraphrases of one scenario always land together. A record's family is its `family` field, or its id when it has none (give paraphrases a shared `family`). The **test set is frozen** in `splits/test-ids.txt`, written on the first run: those records and their whole families are always test and are never trained on. Nothing else becomes test unless you add its id there by hand (never remove one). The rest goes to train or validation by a hash of the family, about 8 to 1.

## Comparing base models: `eval/bakeoff.py`

Before fine-tuning, compare candidate models (Qwen3.5-4B, Qwen3-4B, Gemma 4 E4B, Phi-4-mini; D93) as the planner. Run a model with llama-server, then point the script at it:

```
# one model at a time; the GGUF file is downloaded by you beforehand
llama-server -m ~/models/Qwen3.5-4B-Q8_0.gguf --jinja -c 32768 --host 127.0.0.1 --port 8080
python3 llm/eval/bakeoff.py --url http://127.0.0.1:8080/v1 --model qwen3.5-4b-q8
```

For each case in `eval/cases/*.jsonl` it sends the planner prompt, the briefing and the request with the plan's JSON schema as `response_format` (so the server constrains the output), and scores: valid (passes `export.py`'s plan checks), decision (act, look, question, manual, undo or answer), tools (same tools, same order), args (every expected argument with the same value), and seconds to the first token and to the whole answer (p50 and p95). It prints a table and writes `bakeoff-<model>.json`. It talks only to `--url`.

`eval/cases/seed-v1.jsonl` has 23 cases made from today's plan examples (`from` names the record): enough to compare untuned models. They overlap the training data, so they're not a test of a fine-tuned model; that uses the frozen test split and the 500-case set planned in doc 19.
