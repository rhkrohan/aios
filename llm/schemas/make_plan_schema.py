"""Write llm/schemas/plan-v1.json: the planner's JSON schema as brain-d builds it
(plan::schema_with in brain-d/src/plan.rs), without connector tools. export.py and
eval/bakeoff.py add a record's connector tools on top.

Run again whenever plan.rs or briefing.rs changes:  python3 llm/schemas/make_plan_schema.py
It reads the tool names from the Rust source (briefing::TOOLS, plan::LOOK_TOOLS,
plan::MANUAL_TOOLS); the shape below mirrors schema_with by hand, so a change to
the shape in plan.rs must be copied here too.
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
briefing = (ROOT / "brain-d/src/briefing.rs").read_text()
plan = (ROOT / "brain-d/src/plan.rs").read_text()

block = briefing[briefing.index("pub const TOOLS: &[(&str, &str)] = &["):]
block = block[: block.index("];")]
tools = re.findall(r'\("([a-z_.]+)", "', block)
look = re.findall(r'"([a-z_.]+)"', re.search(r"pub const LOOK_TOOLS: \[&str; \d+\] = \[([^\]]*)\]", plan).group(1))
manual = re.findall(r'"([a-z_.]+)"', re.search(r"pub const MANUAL_TOOLS: \[&str; \d+\] = \[([^\]]*)\]", plan).group(1))

schema = {
    "type": "object",
    "additionalProperties": False,
    "required": ["understanding", "steps", "reply", "question", "undo_last", "manual", "look"],
    "properties": {
        "understanding": {"type": "string", "description": "One sentence: what the owner wants."},
        "steps": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["kind", "tool", "args_json", "sources", "instruction", "why"],
                "properties": {
                    "kind": {"type": "string", "enum": ["tool", "compose"]},
                    "tool": {"type": "string", "enum": tools + [""], "description": "For tool steps. Empty for compose."},
                    "args_json": {"type": "string", "description": "For tool steps: the arguments as a JSON object. Use {{N}} for the text of compose step N. Empty for compose."},
                    "sources": {"type": "array", "items": {"type": "string"}, "description": "For compose: files to read (exact paths). Empty for tool steps."},
                    "instruction": {"type": "string", "description": "For compose: what text to write. Empty for tool steps."},
                    "why": {"type": "string", "description": "A few plain words for the owner."},
                },
            },
        },
        "reply": {"type": "string", "description": "What to tell the owner when it's done. May use {{N}}."},
        "question": {"type": "string", "description": "Only if the request is genuinely unclear (two people match, no file matches, it contradicts itself): one short question, and no steps. Otherwise empty."},
        "undo_last": {"type": "boolean", "description": "True only if the owner asks to undo or reverse what was just done. Then no steps."},
        "look": {
            "type": "array",
            "description": "Only when you must find things before you can act on them (\"move my invoices to Finance\", \"trash the old screenshots\"): up to 3 lookups; leave steps empty, and you'll be asked again with what they found. Otherwise empty.",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["tool", "args_json"],
                "properties": {
                    "tool": {"type": "string", "enum": look},
                    "args_json": {"type": "string", "description": "The arguments as a JSON object, e.g. {\"path\": \"\", \"query\": \"invoices\"}."},
                },
            },
        },
        "manual": {
            "type": "array",
            "description": "Only when you can't or shouldn't do something (off limits, no tool, unsafe): up to 3 one-click actions that SHOW the owner where to do it themselves (open a folder or app, preview a file). Never anything that changes things. Otherwise empty.",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["label", "tool", "args_json"],
                "properties": {
                    "label": {"type": "string", "description": "Button text, e.g. \"Open Taxes 2025\"."},
                    "tool": {"type": "string", "enum": manual},
                    "args_json": {"type": "string"},
                },
            },
        },
    },
}

if __name__ == "__main__":
    out = pathlib.Path(__file__).with_name("plan-v1.json")
    out.write_text(json.dumps(schema, indent=2) + "\n")
    print(f"wrote {out.relative_to(ROOT)}: {len(tools)} tools, look {look}, manual {manual}")
