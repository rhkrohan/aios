"use client";

// The confusion test: messy requests against the real model, brain-d and capd,
// graded automatically. Runs on the server so it can play the owner.

import clsx from "clsx";
import { Check, ChevronDown, Loader2, Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import { liveFetch } from "@/lib/livemachine";
import { refreshLive } from "@/lib/livemirror";
import { Button } from "../ui";

interface CaseInfo {
  id: string;
  title: string;
  expect: string;
  turns: string[];
}
interface Outcome {
  id: string;
  pass: boolean;
  why: string;
  said: string;
  steps: string[];
  model_calls: number;
  seconds: number;
}
interface State {
  cases: CaseInfo[];
  running: boolean;
  done: Outcome[];
  current: string | null;
  error: string | null;
}

export function ConfusionTest() {
  const [st, setSt] = useState<State | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      liveFetch("/api/live/stress")
        .then((r) => r.json())
        .then((j) => {
          if (!alive) return;
          setSt(j);
          if (j.running) refreshLive();
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const start = (only?: string[]) => liveFetch("/api/live/stress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ only }) });
  const results = new Map((st?.done ?? []).map((o) => [o.id, o]));
  const passed = (st?.done ?? []).filter((o) => o.pass).length;
  const calls = (st?.done ?? []).reduce((n, o) => n + o.model_calls, 0);

  return (
    <div className="rounded-2xl border border-line p-3.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold">Confusion test</div>
          <p className="text-[12.5px] text-fg-2 leading-snug">
            {st?.cases.length ?? 15} messy requests against the real model. The test plays you: it grants passes, approves email only to your team, says no to installs. Resets the sandbox before each case.
          </p>
        </div>
        <Button size="sm" disabled={!st || st.running} onClick={() => start()}>
          {st?.running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} {st?.running ? "Running" : "Run all"}
        </Button>
      </div>
      {st && st.done.length > 0 && (
        <div className="mt-3 flex items-center gap-3 text-[12.5px]">
          <span className={clsx("h-6 px-2.5 rounded-full inline-flex items-center font-semibold", passed === st.done.length ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
            {passed} of {st.done.length} passed
          </span>
          <span className="text-fg-3">{calls} model calls in total</span>
          {st.running && st.current && <span className="text-ai-ink truncate">Now: {st.current}</span>}
        </div>
      )}
      {st?.error && <p className="mt-2 text-[12.5px] text-danger">{st.error}</p>}
      <ul className="mt-3 divide-y divide-line">
        {(st?.cases ?? []).map((c) => {
          const o = results.get(c.id);
          const now = st?.running && st.current === c.title;
          return (
            <li key={c.id}>
              <button onClick={() => setOpen(open === c.id ? null : c.id)} className="w-full flex items-center gap-2.5 py-2 text-left">
                <span
                  className={clsx(
                    "size-5 rounded-full grid place-items-center shrink-0",
                    o ? (o.pass ? "bg-ok text-white" : "bg-danger text-white") : now ? "bg-ai-soft text-ai-ink" : "bg-fg/[.06] text-fg-3",
                  )}
                >
                  {o ? o.pass ? <Check size={12} /> : <X size={12} /> : now ? <Loader2 size={11} className="animate-spin" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium truncate">{c.title}</span>
                  <span className="block text-[11.5px] text-fg-3 truncate">{c.turns.map((t) => `“${t}”`).join(" then ")}</span>
                </span>
                {o && <span className="text-[11px] text-fg-3 shrink-0">{o.model_calls} calls, {o.seconds}s</span>}
                <ChevronDown size={14} className={clsx("text-fg-3 transition-transform", open === c.id && "rotate-180")} />
              </button>
              {open === c.id && (
                <div className="pb-3 pl-7 text-[12px] space-y-1">
                  <div>
                    <span className="text-fg-3">Expected: </span>
                    {c.expect}
                  </div>
                  {o && (
                    <>
                      {!o.pass && <div className="text-danger">Failed: {o.why}</div>}
                      <div>
                        <span className="text-fg-3">It said: </span>
                        {o.said || "(nothing)"}
                      </div>
                      {o.steps.length > 0 && <div className="font-mono text-[11px] text-fg-2">{o.steps.join(" · ")}</div>}
                    </>
                  )}
                  {!st?.running && (
                    <button onClick={() => start([c.id])} className="text-ai-ink font-medium">
                      Run just this one
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
