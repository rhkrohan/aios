#!/usr/bin/env python3
"""Compare base models as SIOS's planner before any fine-tuning (doc 19, L4 bake-off).

  python3 llm/eval/bakeoff.py --url http://127.0.0.1:8080/v1 --model qwen3.5-4b
  python3 llm/eval/bakeoff.py --url ... --model ... --cases llm/eval/cases --out report.json

For each case (llm/eval/cases/*.jsonl) it sends the planner prompt, the case's briefing and
request to an OpenAI-compatible server (llama-server) with the plan's JSON schema as
response_format, streams the answer, and scores:
  valid    the answer is a plan that export.py's checks accept (schema, catalog tools, arguments)
  decision act / look / question / manual / undo / answer, as expected
  tools    the same tools in the same order
  args     each expected argument appears with the same value (extra arguments are allowed)
  ttft     seconds to the first token;  total  seconds to the whole answer
It talks only to --url. Nothing is downloaded and no other network is used.
"""
import argparse
import json
import pathlib
import sys
import time
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import export  # noqa: E402  (the same prompts, catalogs and checks as the training data)


def decision(plan):
    if plan.get("question"):
        return "question"
    if plan.get("undo_last"):
        return "undo"
    if plan.get("look"):
        return "look"
    if plan.get("steps"):
        return "act"
    if plan.get("manual"):
        return "manual"
    return "answer"


def items(plan, d):
    return plan.get("steps", []) if d == "act" else plan.get("look", []) if d == "look" else plan.get("manual", []) if d == "manual" else []


def args_of(item):
    try:
        v = json.loads(item.get("args_json") or "{}")
        return v if isinstance(v, dict) else {}
    except json.JSONDecodeError:
        return {}


def subset(want, got):
    return all(k in got and got[k] == v for k, v in want.items())


def ask(url, model, messages, schema, timeout):
    """Stream one completion; returns (text, seconds to first token, total seconds)."""
    body = {
        "model": model,
        "messages": messages,
        "temperature": 0,
        "stream": True,
        "response_format": {"type": "json_schema", "json_schema": {"name": "plan", "strict": True, "schema": schema}},
    }
    req = urllib.request.Request(url.rstrip("/") + "/chat/completions", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    start = time.monotonic()
    first, parts = None, []
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if "text/event-stream" not in resp.headers.get("Content-Type", ""):
            v = json.loads(resp.read())
            text = v["choices"][0]["message"]["content"] or ""
            t = time.monotonic() - start
            return text, t, t
        for raw in resp:
            line = raw.decode().strip()
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            delta = json.loads(data)["choices"][0].get("delta", {}).get("content") or ""
            if delta and first is None:
                first = time.monotonic() - start
            parts.append(delta)
    total = time.monotonic() - start
    return "".join(parts), first if first is not None else total, total


def run(case, url, model, timeout):
    errs = []
    cat = export.catalog(case["tools"]) or {}
    user = export.expand("{{briefing:%s}}\n\nREQUEST\n%s" % (case["briefing"], case["request"]), case.get("system_now", ""), errs, case["id"])
    messages = [{"role": "system", "content": export.prompt("planner-v1")}, {"role": "user", "content": user}]
    row = {"id": case["id"], "expect": case["expect"]["decision"]}
    try:
        text, ttft, total = ask(url, model, messages, export.plan_schema(cat), timeout)
    except Exception as e:  # a server error counts against the model, but the run goes on
        return dict(row, error=str(e)[:200], valid=False, decision=False, tools=False, args=False, ttft=None, total=None)
    row.update(ttft=round(ttft, 2), total=round(total, 2))
    problems = export.check_plan(case["id"], text, cat)
    row["valid"] = not problems
    if problems:
        row["problems"] = problems[:3]
    try:
        plan = json.loads(text)
    except json.JSONDecodeError:
        return dict(row, decision=False, tools=False, args=False, got="(not JSON)")
    d = decision(plan)
    got = items(plan, d)
    want = case["expect"]
    row["got"] = d + " " + ",".join(i.get("tool") or "compose" for i in got)
    row["decision"] = d == want["decision"]
    row["tools"] = row["decision"] and [i.get("tool") or "compose" for i in got] == want["tools"]
    row["args"] = row["tools"] and all(subset(w, args_of(g)) for w, g in zip(want.get("args", []), got))
    return row


def main():
    ap = argparse.ArgumentParser(description="SIOS planner bake-off")
    ap.add_argument("--url", required=True, help="OpenAI-compatible base URL, e.g. http://127.0.0.1:8080/v1")
    ap.add_argument("--model", required=True, help="model name to send and to label the report")
    ap.add_argument("--cases", default=str(HERE / "cases"), help="a folder of .jsonl cases, or one file")
    ap.add_argument("--out", help="write the JSON report here (default: bakeoff-<model>.json in the current folder)")
    ap.add_argument("--timeout", type=float, default=300)
    a = ap.parse_args()
    src = pathlib.Path(a.cases)
    files = sorted(src.glob("*.jsonl")) if src.is_dir() else [src]
    cases = [json.loads(l) for f in files for l in f.read_text().splitlines() if l.strip()]
    rows = []
    print(f"{'case':14} {'want':9} {'got':40} valid dec  tools args  ttft  total")
    for c in cases:
        r = run(c, a.url, a.model, a.timeout)
        rows.append(r)
        mark = lambda v: "yes" if v else "no"
        print(f"{r['id']:14} {r['expect']:9} {r.get('got', r.get('error', ''))[:40]:40} {mark(r['valid']):5} {mark(r['decision']):4} {mark(r['tools']):5} {mark(r['args']):5} {r['ttft'] if r['ttft'] is not None else '-':>5} {r['total'] if r['total'] is not None else '-':>6}")
    n = len(rows) or 1
    times = sorted(r["total"] for r in rows if r["total"] is not None)
    firsts = sorted(r["ttft"] for r in rows if r["ttft"] is not None)
    pct = lambda xs, p: xs[min(len(xs) - 1, int(p * len(xs)))] if xs else None
    summary = {
        "model": a.model, "cases": len(rows),
        "valid": sum(r["valid"] for r in rows) / n, "decision": sum(r["decision"] for r in rows) / n,
        "tools": sum(r["tools"] for r in rows) / n, "args": sum(r["args"] for r in rows) / n,
        "ttft_p50": pct(firsts, 0.5), "ttft_p95": pct(firsts, 0.95), "total_p50": pct(times, 0.5), "total_p95": pct(times, 0.95),
    }
    print("\n" + "  ".join(f"{k} {v:.0%}" if isinstance(v, float) and k in ("valid", "decision", "tools", "args") else f"{k} {v}" for k, v in summary.items()))
    out = pathlib.Path(a.out or f"bakeoff-{a.model.replace('/', '_')}.json")
    out.write_text(json.dumps({"summary": summary, "cases": rows}, indent=2) + "\n")
    print(f"report: {out}")


if __name__ == "__main__":
    main()
