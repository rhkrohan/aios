#!/usr/bin/env python3
"""Check every training record and write the train / validation / test files.

  python3 llm/export.py                 check, then write llm/out/{train,val,test}.jsonl
  python3 llm/export.py --check         check only
  python3 llm/export.py --template qwen also render each record as Qwen chat text ("text")

What it checks (exits 1 on any error, listed per record id):
  every record   the fields below; its prompt and tool catalog exist; ids are unique
  plans          each assistant turn is a plan matching llm/schemas/plan-v1.json (plus the
                 record catalog's connector tools); every tool step uses a catalog tool and
                 its args_json parses and matches that tool's inputSchema; look only uses
                 files.find, files.list or a connector's read tools; manual only shows things
  tool_use       each {"tool", "args"} call is a catalog tool (wire names, files_list) or one
                 of SIOS's door tools, with arguments matching its inputSchema
  decisions      shape only: user and assistant turns, nothing empty

The split (D94 and doc 19): by scenario family, never by single record, so paraphrases of
one scenario stay together. A record's family is its "family" field, else its id. The test
set is frozen in llm/splits/test-ids.txt (written on the first run): those records, and every
record of their families, are always test; nothing else ever becomes test unless added there
by hand. The rest go to train or validation by a hash of the family (8 to 1).
"""
import argparse
import hashlib
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
DATA, PROMPTS, TOOLS, OUT, SPLITS = HERE / "data", HERE / "prompts", HERE / "tools", HERE / "out", HERE / "splits"
PLAN_SCHEMA = json.loads((HERE / "schemas" / "plan-v1.json").read_text())
REQUIRED = ["id", "set", "system", "messages", "tools", "tags", "source"]
SETS = {"plans", "tool_use", "decisions"}
ROLES = {"user", "assistant", "tool"}
# the tools SIOS's MCP door adds for outside AIs (brain-d/src/mcp.rs); not in the broker's catalog
DOOR_TOOLS = {"sios_do", "sios_goal_status", "sios_recall", "sios_briefing", "sios_approval_status", "sios_report", "sios_ask_owner", "sios_done"}


# ---- a small JSON Schema checker (the subset SIOS's schemas use)

def check(value, schema, where="$"):
    """Errors for `value` against `schema`: type, enum, properties, required,
    additionalProperties, items, min/max, minItems/maxItems, minLength/maxLength."""
    errs = []
    types = schema.get("type")
    if types is not None:
        ok = False
        for t in types if isinstance(types, list) else [types]:
            if (t == "object" and isinstance(value, dict)) or (t == "array" and isinstance(value, list)) \
                    or (t == "string" and isinstance(value, str)) or (t == "boolean" and isinstance(value, bool)) \
                    or (t == "null" and value is None) \
                    or (t == "integer" and isinstance(value, int) and not isinstance(value, bool)) \
                    or (t == "number" and isinstance(value, (int, float)) and not isinstance(value, bool)):
                ok = True
        if not ok:
            return [f"{where}: expected {types}, got {type(value).__name__}"]
    if "enum" in schema and value not in schema["enum"]:
        allowed = schema["enum"] if len(schema["enum"]) <= 8 else schema["enum"][:8] + ["..."]
        errs.append(f"{where}: {value!r} is not one of {allowed}")
    if isinstance(value, dict):
        props = schema.get("properties", {})
        for k in schema.get("required", []):
            if k not in value:
                errs.append(f"{where}: missing {k!r}")
        for k, v in value.items():
            if k in props:
                errs += check(v, props[k], f"{where}.{k}")
            elif schema.get("additionalProperties") is False:
                errs.append(f"{where}: unexpected field {k!r}")
    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            errs.append(f"{where}: fewer than {schema['minItems']} items")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errs.append(f"{where}: more than {schema['maxItems']} items")
        if "items" in schema:
            for i, v in enumerate(value):
                errs += check(v, schema["items"], f"{where}[{i}]")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errs.append(f"{where}: below {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errs.append(f"{where}: above {schema['maximum']}")
    if isinstance(value, str):
        if "minLength" in schema and len(value) < schema["minLength"]:
            errs.append(f"{where}: shorter than {schema['minLength']}")
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            errs.append(f"{where}: longer than {schema['maxLength']}")
    return errs


# ---- catalogs and prompts

_catalogs = {}


def catalog(name):
    """{wire name: tool} for llm/tools/<name>.json, plus which are connector read tools."""
    if name not in _catalogs:
        path = TOOLS / f"{name}.json"
        if not path.exists():
            return None
        tools = {t["name"]: t for t in json.loads(path.read_text())}
        _catalogs[name] = tools
    return _catalogs[name]


def wire(dotted):
    return dotted.replace(".", "_")


def base_tools():
    return [t for t in PLAN_SCHEMA["properties"]["steps"]["items"]["properties"]["tool"]["enum"] if t]


def connector_tools(cat):
    """Connector tools in a catalog: anything not one of the planner's built-in tools.
    Their dotted names are the wire name's first '_' turned into '.' (github_pr_files -> github.pr_files)."""
    base = {wire(t) for t in base_tools()}
    out = {}
    for name, t in cat.items():
        if name not in base:
            out[name.replace("_", ".", 1)] = t
    return out


def plan_schema(cat):
    """plan-v1 with this catalog's connector tools as valid step tools, and their read tools as lookups."""
    s = json.loads(json.dumps(PLAN_SCHEMA))
    conn = connector_tools(cat)
    s["properties"]["steps"]["items"]["properties"]["tool"]["enum"] = base_tools() + sorted(conn) + [""]
    reads = [n for n, t in conn.items() if t.get("annotations", {}).get("readOnlyHint")]
    s["properties"]["look"]["items"]["properties"]["tool"]["enum"] += sorted(reads)
    return s


def prompt(name):
    p = PROMPTS / f"{name}.txt"
    return p.read_text().rstrip("\n") if p.exists() else None


def expand(content, system_now, errs, rid):
    """{{briefing:NAME}} -> llm/prompts/NAME.txt, and {{SYSTEM}} inside it -> system_now."""
    def brief(m):
        text = prompt(m.group(1))
        if text is None:
            errs.append(f"{rid}: no prompt {m.group(1)}.txt")
            return m.group(0)
        if "{{SYSTEM}}" in text:
            if system_now is None:
                errs.append(f"{rid}: briefing {m.group(1)} needs system_now")
            else:
                text = text.replace("{{SYSTEM}}", system_now)
        return text
    return re.sub(r"\{\{briefing:([a-z0-9_-]+)\}\}", brief, content)


# ---- per-set checks

def tool_args(cat, wire_name, args, where):
    t = cat.get(wire_name)
    if t is None:
        return [f"{where}: {wire_name} isn't in the catalog"]
    return check(args, t.get("inputSchema", {}), where)


def parse_args(text, where):
    try:
        v = json.loads(text)
    except json.JSONDecodeError as e:
        return None, [f"{where}: args_json isn't JSON ({e.msg})"]
    if not isinstance(v, dict):
        return None, [f"{where}: args_json isn't an object"]
    return v, []


def check_plan(rid, content, cat):
    try:
        plan = json.loads(content)
    except json.JSONDecodeError as e:
        return [f"{rid}: the plan isn't JSON ({e.msg})"]
    errs = [f"{rid}: {e}" for e in check(plan, plan_schema(cat))]
    if errs:
        return errs
    for i, s in enumerate(plan["steps"], 1):
        w = f"{rid}: step {i}"
        if s["kind"] == "compose":
            if s["tool"] or s["args_json"]:
                errs.append(f"{w}: a compose step has no tool or args_json")
            if not s["instruction"]:
                errs.append(f"{w}: a compose step needs an instruction")
            continue
        if not s["tool"]:
            errs.append(f"{w}: a tool step needs a tool")
            continue
        args, e = parse_args(s["args_json"], w)
        errs += e
        if args is not None:
            errs += tool_args(cat, wire(s["tool"]), args, f"{w} {s['tool']}")
    for i, l in enumerate(plan["look"], 1):
        args, e = parse_args(l["args_json"], f"{rid}: look {i}")
        errs += e
        if args is not None:
            errs += tool_args(cat, wire(l["tool"]), args, f"{rid}: look {i} {l['tool']}")
    for i, m in enumerate(plan["manual"], 1):
        args, e = parse_args(m["args_json"], f"{rid}: manual {i}")
        errs += e
        if args is not None:
            errs += tool_args(cat, wire(m["tool"]), args, f"{rid}: manual {i} {m['tool']}")
    if len(plan["look"]) > 3 or len(plan["manual"]) > 3:
        errs.append(f"{rid}: at most 3 lookups and 3 manual actions")
    if plan["look"] and plan["steps"]:
        errs.append(f"{rid}: a plan that looks first has no steps yet")
    if plan["question"] and plan["steps"]:
        errs.append(f"{rid}: a plan that asks a question has no steps")
    return errs


def check_tool_use(rid, content, cat):
    try:
        call = json.loads(content)
    except json.JSONDecodeError:
        return []  # a plain-text answer to the owner
    if not isinstance(call, dict) or "tool" not in call:
        return []
    w = f"{rid}: call {call.get('tool')}"
    if set(call) - {"tool", "args"}:
        return [f"{w}: only tool and args"]
    if call["tool"] in DOOR_TOOLS:
        return [] if isinstance(call.get("args", {}), dict) else [f"{w}: args must be an object"]
    if "." in call["tool"]:
        return [f"{w}: MCP tool names use _ (files_list), not dots"]
    return tool_args(cat, call["tool"], call.get("args", {}), w)


# ---- records

def load():
    records, errs, seen = [], [], set()
    for path in sorted(DATA.glob("*.jsonl")):
        for n, line in enumerate(path.read_text().splitlines(), 1):
            if not line.strip():
                continue
            try:
                r = json.loads(line)
            except json.JSONDecodeError as e:
                errs.append(f"{path.name}:{n}: not JSON ({e.msg})")
                continue
            rid = r.get("id", f"{path.name}:{n}")
            missing = [k for k in REQUIRED if k not in r]
            if missing:
                errs.append(f"{rid}: missing {missing}")
                continue
            if rid in seen:
                errs.append(f"{rid}: id used twice")
            seen.add(rid)
            if r["set"] not in SETS or path.stem != r["set"]:
                errs.append(f"{rid}: set {r['set']!r} doesn't match its file {path.name}")
            if not (r["source"] in ("handwritten", "from-test") or r["source"].startswith("from-run:")):
                errs.append(f"{rid}: source must be handwritten, from-test or from-run:<file>")
            records.append(r)
    return records, errs


def build(r, errs):
    """The record as plain chat messages: the system prompt first, prompts expanded, extra fields dropped."""
    rid = r["id"]
    system = prompt(r["system"])
    if system is None:
        errs.append(f"{rid}: no prompt {r['system']}.txt")
        system = ""
    cat = catalog(r["tools"])
    if cat is None:
        errs.append(f"{rid}: no tool catalog {r['tools']}.json")
        cat = {}
    msgs = [{"role": "system", "content": system}]
    roles = [m.get("role") for m in r["messages"]]
    if not roles or roles[0] != "user" or roles[-1] != "assistant" or set(roles) - ROLES:
        errs.append(f"{rid}: messages must start with user, end with assistant, and use user/assistant/tool")
    for m in r["messages"]:
        content = m.get("content", "")
        if not isinstance(content, str) or not content.strip():
            errs.append(f"{rid}: an empty {m.get('role')} turn")
            continue
        if m.get("role") == "user":
            content = expand(content, m.get("system_now"), errs, rid)
        elif m.get("role") == "assistant":
            if r["set"] == "plans":
                errs += check_plan(rid, content, cat)
            elif r["set"] == "tool_use":
                errs += check_tool_use(rid, content, cat)
        msgs.append({"role": m["role"], "content": content})
    if r["set"] == "tool_use" and "tool" in roles and roles.index("tool") < roles.index("assistant"):
        errs.append(f"{rid}: a tool result comes after the call")
    return msgs


# ---- Qwen chat text (thinking off), for trainers that take plain text

def qwen_text(msgs, set_name):
    out = []
    for m in msgs:
        role, content = m["role"], m["content"]
        if role == "assistant":
            call = None
            if set_name == "tool_use":
                try:
                    v = json.loads(content)
                    if isinstance(v, dict) and "tool" in v:
                        call = v
                except json.JSONDecodeError:
                    pass
            body = f'<tool_call>\n{json.dumps({"name": call["tool"], "arguments": call.get("args", {})})}\n</tool_call>' if call else content
            out.append(f"<|im_start|>assistant\n<think>\n\n</think>\n\n{body}<|im_end|>")
        elif role == "tool":
            out.append(f"<|im_start|>user\n<tool_response>\n{content}\n</tool_response><|im_end|>")
        else:
            out.append(f"<|im_start|>{role}\n{content}<|im_end|>")
    return "\n".join(out) + "\n"


# ---- the split

def bucket(family):
    return int(hashlib.sha256(family.encode()).hexdigest(), 16) % 10


def split(records):
    fam = {r["id"]: r.get("family") or r["id"] for r in records}
    frozen_file = SPLITS / "test-ids.txt"
    if frozen_file.exists():
        frozen = {l.strip() for l in frozen_file.read_text().splitlines() if l.strip() and not l.startswith("#")}
        test_fams = {fam[i] for i in frozen if i in fam}
        first = False
    else:
        test_fams = {f for f in set(fam.values()) if bucket(f) == 9}
        first = True
    out = {"train": [], "val": [], "test": []}
    for r in records:
        f = fam[r["id"]]
        out["test" if f in test_fams else ("val" if bucket(f) == 8 else "train")].append(r)
    if first:
        SPLITS.mkdir(exist_ok=True)
        ids = sorted(r["id"] for r in out["test"])
        frozen_file.write_text("# The frozen test set (llm/export.py): never trained on. Add ids by hand; never remove.\n" + "\n".join(ids) + "\n")
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true", help="check only, write nothing")
    ap.add_argument("--template", choices=["qwen"], help="also render each record as chat text")
    a = ap.parse_args()
    records, errs = load()
    built = {r["id"]: build(r, errs) for r in records}
    if errs:
        print(f"{len(errs)} problem(s):", file=sys.stderr)
        for e in errs:
            print("  " + e, file=sys.stderr)
        sys.exit(1)
    counts = {}
    for r in records:
        counts[r["set"]] = counts.get(r["set"], 0) + 1
    print(f"{len(records)} records OK: " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    if a.check:
        return
    parts = split(records)
    OUT.mkdir(exist_ok=True)
    for name, rs in parts.items():
        with open(OUT / f"{name}.jsonl", "w") as f:
            for r in rs:
                row = {"id": r["id"], "set": r["set"], "messages": built[r["id"]]}
                if a.template == "qwen":
                    row["text"] = qwen_text(built[r["id"]], r["set"])
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print("wrote " + ", ".join(f"{k} {len(v)}" for k, v in parts.items()) + f" to {OUT.relative_to(HERE.parent)}/")


if __name__ == "__main__":
    main()
