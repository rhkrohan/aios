"use client";

// Memory over time: months of made-up life run through the real memory store
// (capd memsim) with a fake clock. Each row is a check, each column a week:
// you can see the day a memory went wrong, and what the owner had just said.

import clsx from "clsx";
import { Loader2, Play, Waypoints } from "lucide-react";
import { useEffect, useState } from "react";
import { liveFetch } from "@/lib/livemachine";
import { useOS } from "@/lib/store";
import { Button } from "../ui";

interface Result {
  id: string;
  status: "pass" | "warn" | "fail";
  why: string;
  top: string[];
  ai?: { answer: string; right: boolean };
}
interface Week {
  day: number;
  t: number;
  pass: number;
  warn: number;
  fail: number;
  memories: number;
  episodes: number;
  results: Result[];
}
export interface SimReport {
  days: number;
  seed: number;
  ai: boolean;
  ai_calls: number;
  start: number;
  life: { day: number; text: string }[];
  checks: { id: string; title: string }[];
  weeks: Week[];
  findings: { id: string; title: string; day: number; why: string }[];
  confirmed: { day: number; text: string }[];
  memories: unknown[];
  shares: Record<string, string[]>;
}
interface Job {
  running: boolean;
  progress: number;
  of: number;
  error: string | null;
  report: SimReport | null;
}

const LENGTHS = [
  { days: 30, label: "1 month" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
];
const TONE = { pass: "bg-ok", warn: "bg-warn", fail: "bg-danger" };

const date = (start: number, day: number) => new Date((start + day * 86400) * 1000).toLocaleDateString([], { month: "short", day: "numeric" });

export function MemorySim() {
  const openApp = useOS((s) => s.openApp);
  const [job, setJob] = useState<Job | null>(null);
  const [days, setDays] = useState(180);
  const [ai, setAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cell, setCell] = useState<{ check: string; day: number } | null>(null);

  const load = () =>
    liveFetch("/api/live/memsim")
      .then((r) => r.json())
      .then(setJob)
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!job?.running) return;
    const t = setInterval(load, 700);
    return () => clearInterval(t);
  }, [job?.running]);

  const start = async () => {
    setError(null);
    setCell(null);
    const r = await liveFetch("/api/live/memsim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ days, ai, seed: 7 }) });
    const j = await r.json();
    if (j.error) setError(j.error);
    load();
  };

  const rep = job?.report;
  const weeks = rep?.weeks ?? [];
  const failedChecks = new Set(rep?.findings.map((f) => f.id));
  const privacy = rep?.findings.filter((f) => f.id === "sensitive" || f.id === "claude-view") ?? [];
  const picked = cell && weeks.find((w) => w.day === cell.day)?.results.find((r) => r.id === cell.check);
  const aiWeeks = weeks.filter((w) => w.results.some((r) => r.ai));
  const aiRight = aiWeeks.flatMap((w) => w.results.filter((r) => r.ai)).filter((r) => r.ai!.right).length;
  const aiAll = aiWeeks.flatMap((w) => w.results.filter((r) => r.ai)).length;

  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-semibold">Memory over time</h3>
          <p className="mt-0.5 text-[12.5px] text-fg-2 leading-snug">
            Months of made-up life through the real memory code, on its own store (your memory isn&apos;t touched). You change your mind, meet people, forget things; SIOS, a helper and Claude Desktop do daily tasks. Every week it checks that memory still gives the right answer.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border border-line p-0.5" role="radiogroup" aria-label="How long">
          {LENGTHS.map((l) => (
            <button key={l.days} role="radio" aria-checked={days === l.days} onClick={() => setDays(l.days)} className={clsx("h-7 px-3 rounded-full text-[12px]", days === l.days ? "bg-ai text-white" : "text-fg-2 hover:bg-surface-3")}>
              {l.label}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 text-[12.5px] text-fg-2 cursor-pointer">
          <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} className="accent-[var(--ai)]" />
          Use GPT for patterns and answers (about {Math.round((days / 7) * 0.5 + (days / 28 + 1) * 6)} calls)
        </label>
        <Button size="sm" className="ml-auto" disabled={job?.running} onClick={() => void start()}>
          {job?.running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} {job?.running ? "Living it…" : "Run"}
        </Button>
      </div>
      {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
      {job?.error && !job.running && <p className="mt-2 text-[12.5px] text-danger">{job.error}</p>}
      {job?.running && (
        <div className="mt-3">
          <div className="h-1.5 rounded-full bg-fg/[.07] overflow-hidden">
            <div className="h-full bg-ai transition-[width]" style={{ width: `${(100 * job.progress) / Math.max(1, job.of)}%` }} />
          </div>
          <p className="mt-1 text-[11.5px] text-fg-3">
            Day {job.progress} of {job.of}
          </p>
        </div>
      )}

      {rep && !job?.running && (
        <div className="mt-4">
          <p className="text-[13px]">
            <span className="font-semibold">
              {rep.days} days, {weeks.length} weekly checkups.
            </span>{" "}
            {failedChecks.size === 0 ? "Memory gave the right answer every week." : `${rep.findings.length - privacy.length} of ${rep.checks.length - 2} memory checks went wrong at some point.`}{" "}
            {privacy.length === 0 ? "Privacy held the whole time." : "Privacy broke: see below."}
            {rep.ai && aiAll > 0 && ` GPT answered ${aiRight} of ${aiAll} questions right from what memory gave it.`}
          </p>

          {/* rows: checks; columns: weeks */}
          <div className="mt-3 overflow-x-auto scroll-thin">
            <table className="border-separate border-spacing-[2px] text-[12px]">
              <thead>
                <tr>
                  <th />
                  {weeks.map((w) => {
                    const said = rep.life.filter((l) => l.day <= w.day && l.day > w.day - 7);
                    return (
                      <th key={w.day} className="p-0 align-bottom" title={said.map((l) => `${date(rep.start, l.day)}: ${l.text}`).join("\n")}>
                        <span className={clsx("block mx-auto size-1.5 rounded-full", said.length ? "bg-ai" : "bg-transparent")} />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rep.checks.map((c) => (
                  <tr key={c.id}>
                    <td className="pr-2 whitespace-nowrap text-fg-2">{c.title}</td>
                    {weeks.map((w) => {
                      const r = w.results.find((x) => x.id === c.id);
                      const on = cell?.check === c.id && cell.day === w.day;
                      return (
                        <td key={w.day} className="p-0">
                          {r ? (
                            <button
                              onClick={() => setCell(on ? null : { check: c.id, day: w.day })}
                              aria-label={`${c.title}, ${date(rep.start, w.day)}: ${r.status}`}
                              title={`${date(rep.start, w.day)}: ${r.why || "right"}`}
                              className={clsx("block w-2.5 h-5 rounded-[3px]", TONE[r.status], r.ai && !r.ai.right && "ring-2 ring-fg/60", on && "outline outline-2 outline-offset-1 outline-fg")}
                            />
                          ) : (
                            <span className="block w-2.5 h-5 rounded-[3px] bg-fg/[.05]" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-fg-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-ai" /> you said something new that week
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-3 rounded-[2px] bg-ok" /> right
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-3 rounded-[2px] bg-warn" /> right, but the old answer is still there
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-3 rounded-[2px] bg-danger" /> wrong
            </span>
            {rep.ai && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-3 rounded-[2px] bg-fg/20 ring-2 ring-fg/60" /> GPT answered wrong
              </span>
            )}
          </div>

          {picked && cell && (
            <div className="mt-3 rounded-xl bg-fg/[.04] p-3 text-[12.5px]">
              <div className="font-semibold">
                {rep.checks.find((c) => c.id === cell.check)?.title}, {date(rep.start, cell.day)}
              </div>
              <div className="mt-0.5 text-fg-2">{picked.why || "Right answer first."}</div>
              {picked.top.length > 0 && (
                <>
                  <div className="mt-2 text-[11.5px] font-semibold text-fg-3">What memory handed over first</div>
                  <ol className="mt-1 list-decimal pl-4 space-y-0.5">
                    {picked.top.map((t, i) => (
                      <li key={i}>{t.replace(/^day \d+:\s*/, "")}</li>
                    ))}
                  </ol>
                </>
              )}
              {picked.ai && (
                <div className="mt-2">
                  <span className="text-fg-3">GPT said: </span>
                  {picked.ai.answer} <span className={picked.ai.right ? "text-ok" : "text-danger"}>({picked.ai.right ? "right" : "wrong"})</span>
                </div>
              )}
            </div>
          )}

          {rep.findings.length > 0 && (
            <>
              <h4 className="mt-4 text-[12px] font-semibold text-fg-3">When each one first went wrong</h4>
              <ul className="mt-1.5 space-y-1.5">
                {rep.findings.map((f) => {
                  const said = rep.life.filter((l) => l.day <= f.day).at(-1);
                  return (
                    <li key={f.id} className="text-[12.5px] leading-snug">
                      <span className="font-medium">{f.title}</span>
                      <span className="text-fg-3">, {date(rep.start, f.day)}: </span>
                      {f.why}
                      {said && <span className="text-fg-3"> (after {said.text})</span>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {rep.confirmed.length > 0 && (
            <p className="mt-3 text-[12px] text-fg-3">
              SIOS noticed {rep.confirmed.length} {rep.confirmed.length === 1 ? "habit" : "habits"} and the simulated you confirmed them, e.g. &ldquo;{rep.confirmed[0].text}&rdquo;.
            </p>
          )}

          <div className="mt-3">
            <Button size="sm" variant="secondary" onClick={() => openApp("memory", { source: "sim" })}>
              <Waypoints size={13} /> Watch it on the memory map
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
