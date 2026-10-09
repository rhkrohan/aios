"use client";

// Goals: an activity monitor for goal processes. Every request becomes a
// GoalProcess (v3 doc: "goals sit above processes"): it has an owner, an
// envelope of authority and budget, a state machine, and a verification target.
// Everything here is derived from the live runs and the broker's audit log.

import clsx from "clsx";
import {
  Activity as ActivityIcon,
  Ban,
  Check,
  ChevronRight,
  CircleCheck,
  Clock,
  Cloud,
  Cpu,
  Hourglass,
  Play,
  ShieldCheck,
  Square,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { runRequest, undoRun } from "@/lib/engine";
import { principalName, targetOf } from "@/lib/policy";
import { useOS } from "@/lib/store";
import { TRUST_LEVELS, trustLevelOf } from "@/lib/trust";
import type { AuditEntry, Run, Step, Win } from "@/lib/types";
import { CheckTrace } from "../command/StepRow";
import { Button, Chip, type Tone } from "../ui";

// ------------------------------------------------------------------ model

type Phase = "plan" | "authorize" | "act" | "verify" | "done" | "stopped" | "failed";
const NODES = ["plan", "authorize", "act", "verify", "done"] as const;
type Node = (typeof NODES)[number];

const NODE_LABEL: Record<Node, string> = { plan: "Plan", authorize: "Authorize", act: "Act", verify: "Verify", done: "Done" };

const PHASE_UI: Record<Phase, { label: string; tone: Tone; live: boolean }> = {
  plan: { label: "Planning", tone: "ai", live: true },
  authorize: { label: "Waiting for you", tone: "warn", live: true },
  act: { label: "Acting", tone: "ai", live: true },
  verify: { label: "Verifying", tone: "ai", live: true },
  done: { label: "Done", tone: "ok", live: false },
  stopped: { label: "Stopped", tone: "neutral", live: false },
  failed: { label: "Failed", tone: "danger", live: false },
};

function nodeOfStep(st: Step): Node {
  if (st.kind === "tool") return st.broker === "denied" || st.broker === "blocked" ? "authorize" : "act";
  if (st.kind === "verify") return "verify";
  return "plan";
}

function phaseOf(run: Run): Phase {
  if (run.status === "done") return "done";
  if (run.status === "stopped") return "stopped";
  if (run.status === "failed") return "failed";
  if (run.status === "waiting") return "authorize";
  const active = run.steps.find((s) => s.status === "active");
  if (!active) return "plan";
  if (active.kind === "tool") return "act";
  if (active.kind === "verify") return "verify";
  return "plan";
}

/** Where the state machine is (or where it ended, for stopped/failed goals). */
function nodeOf(run: Run, phase: Phase): Node {
  if (phase === "done") return "done";
  if (phase === "stopped" || phase === "failed") {
    const blocked = [...run.steps].reverse().find((s) => s.status === "blocked");
    if (blocked) return nodeOfStep(blocked);
    const last = [...run.steps].reverse().find((s) => s.status !== "pending");
    return last ? nodeOfStep(last) : "plan";
  }
  return phase as Node;
}

const subscribeSecond = (cb: () => void) => {
  const t = setInterval(cb, 1000);
  return () => clearInterval(t);
};

function fmt(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

interface Goal {
  id: string; // GP-0001
  run: Run;
  phase: Phase;
  node: Node;
  shown: number;
  approvals: number;
}

// ------------------------------------------------------------------ app

export function GoalsApp({ win }: { win: Win }) {
  const runs = useOS((s) => s.runs);
  const audit = useOS((s) => s.audit);
  const openApp = useOS((s) => s.openApp);
  const now = useSyncExternalStore(subscribeSecond, () => Math.floor(Date.now() / 1000) * 1000, () => 0);
  const [selected, setSelected] = useState<string | null>(null);

  const goals: Goal[] = useMemo(() => {
    const ordered = [...runs].sort((a, b) => a.startedAt - b.startedAt);
    return ordered
      .map((run, i) => {
        const phase = phaseOf(run);
        return {
          id: `GP-${String(i + 1).padStart(4, "0")}`,
          run,
          phase,
          node: nodeOf(run, phase),
          shown: run.steps.filter((s) => s.status !== "pending").length,
          approvals: run.steps.filter((s) => s.broker?.startsWith("asked")).length,
        };
      })
      .reverse();
  }, [runs]);

  const running = goals.filter((g) => g.run.status === "running").length;
  const waiting = goals.filter((g) => g.run.status === "waiting").length;
  const done = goals.filter((g) => g.run.status === "done");
  const avg = done.length ? done.reduce((n, g) => n + ((g.run.endedAt ?? g.run.startedAt) - g.run.startedAt), 0) / done.length : 0;
  const blocked = audit.filter((e) => e.outcome === "blocked").length;

  const current = goals.find((g) => g.run.id === selected) ?? goals.find((g) => PHASE_UI[g.phase].live) ?? goals[0];

  return (
    <div className="h-full flex flex-col bg-surface" data-win={win.id}>
      {/* summary */}
      <div className="shrink-0 grid grid-cols-5 gap-2.5 p-4 border-b border-line">
        <Tile icon={ActivityIcon} label="Running" value={String(running)} tone={running ? "ai" : undefined} />
        <Tile icon={Hourglass} label="Waiting for you" value={String(waiting)} tone={waiting ? "warn" : undefined} />
        <Tile icon={CircleCheck} label="Done today" value={String(done.length)} tone={done.length ? "ok" : undefined} />
        <Tile icon={Clock} label="Average time" value={avg ? fmt(Math.round(avg)) : "--"} />
        <Tile icon={Ban} label="Actions blocked" value={String(blocked)} tone={blocked ? "danger" : undefined} />
      </div>

      {!goals.length ? (
        <Empty />
      ) : (
        <div className="flex-1 min-h-0 flex">
          {/* table */}
          <div className="flex-1 min-w-0 overflow-auto scroll-thin">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-[1] bg-surface/95 backdrop-blur">
                <tr className="text-left text-[12px] text-fg-3 border-b border-line">
                  <th className="font-medium pl-4 py-2.5">Goal</th>
                  <th className="font-medium px-3">Requester</th>
                  <th className="font-medium px-3">State</th>
                  <th className="font-medium w-28 px-3">Progress</th>
                  <th className="font-medium text-right px-3" title="Times it asked you">Asked</th>
                  <th className="font-medium text-right px-3">Time</th>
                  <th className="font-medium pr-4 pl-3">Route</th>
                </tr>
              </thead>
              <tbody>
                {goals.map((g) => {
                  const ui = PHASE_UI[g.phase];
                  const sel = current?.run.id === g.run.id;
                  const elapsed = (g.run.endedAt ?? (now || g.run.startedAt)) - g.run.startedAt;
                  return (
                    <tr
                      key={g.run.id}
                      onClick={() => setSelected(g.run.id)}
                      className={clsx("cursor-default border-b border-line/60", sel ? "bg-ai-soft/70" : "hover:bg-surface-2")}
                    >
                      <td className="pl-4 py-2.5 max-w-[260px]">
                        <div className="font-medium truncate">{g.run.request}</div>
                        <div className="text-[11.5px] text-fg-3 font-mono">{g.id}</div>
                      </td>
                      <td className="text-fg-2 whitespace-nowrap px-3">{g.run.principal === "owner" ? "You" : principalName(g.run.principal)}</td>
                      <td className="px-3">
                        <Chip tone={ui.tone}>
                          {ui.live && <span className="size-1.5 rounded-full bg-current animate-pulse" />}
                          {ui.label}
                        </Chip>
                      </td>
                      <td className="px-3">
                        <div className="h-1.5 w-24 rounded-full bg-surface-3 overflow-hidden">
                          <div
                            className={clsx(
                              "h-full rounded-full transition-[width] duration-500",
                              g.phase === "done" ? "bg-ok" : g.phase === "stopped" || g.phase === "failed" ? "bg-fg-3" : "bg-ai",
                            )}
                            style={{ width: `${Math.round((g.shown / Math.max(1, g.run.steps.length)) * 100)}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-fg-3 mt-0.5 tabular-nums">
                          {g.shown} of {g.run.steps.length} steps
                        </div>
                      </td>
                      <td className="text-right tabular-nums text-fg-2 px-3">{g.approvals}</td>
                      <td className="text-right tabular-nums text-fg-2 whitespace-nowrap px-3">{fmt(Math.max(0, elapsed))}</td>
                      <td className="pr-4 pl-3 text-fg-2 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          {g.run.route === "cloud" ? <Cloud size={12} /> : <Cpu size={12} />}
                          {g.run.route === "cloud" ? "Online AI" : "This computer"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <DemoBar compact />
          </div>

          {/* inspector */}
          {current && (
            <aside className="w-[430px] shrink-0 border-l border-line overflow-auto scroll-thin bg-surface-2/40">
              <Inspector goal={current} now={now} audit={audit} onActivity={() => openApp("activity")} />
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

function Tile({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone?: Tone }) {
  return (
    <div className="rounded-2xl border border-line p-3">
      <div className="flex items-center gap-1.5 text-[12px] text-fg-2">
        <Icon size={13} /> {label}
      </div>
      <div
        className={clsx(
          "mt-1 text-[22px] font-semibold tabular-nums leading-tight",
          tone === "ai" && "text-ai-ink",
          tone === "warn" && "text-warn",
          tone === "ok" && "text-ok",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ demo starters

function start(text: string, principal?: string) {
  void runRequest(text, principal ? { principal } : {});
}

function DemoBar({ compact }: { compact?: boolean }) {
  const theme = useOS((s) => s.theme);
  const toggle = theme === "dark" ? "Turn on light mode" : "Turn on dark mode";
  return (
    <div className={clsx("flex flex-wrap items-center gap-2", compact ? "px-4 py-3 border-t border-line" : "justify-center")}>
      {compact && <span className="text-[12px] text-fg-3 mr-1">Start a goal</span>}
      <Button size="sm" onClick={() => start("Clean up my Downloads")}>
        <Play size={12} fill="currentColor" /> Clean up Downloads
      </Button>
      <Button size="sm" onClick={() => start("Summarize this article and send it to Sara")}>
        <Play size={12} fill="currentColor" /> Article to Sara
      </Button>
      <Button size="sm" onClick={() => start(toggle, "claude-desktop")}>
        <Play size={12} fill="currentColor" /> Run as Claude Desktop
      </Button>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex-1 grid place-items-center p-8">
      <div className="text-center max-w-md">
        <span className="inline-grid place-items-center size-12 rounded-2xl bg-ai-soft text-ai-ink">
          <ActivityIcon size={22} />
        </span>
        <div className="mt-3 text-[16px] font-semibold">No goals yet</div>
        <p className="mt-1 text-[13px] text-fg-2 leading-5">
          Every request becomes a goal process: who asked, what it may touch, a budget, and how success is checked. Start one and watch it move through
          plan, authorize, act and verify.
        </p>
        <div className="mt-5">
          <DemoBar />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ inspector

function Inspector({ goal, now, audit, onActivity }: { goal: Goal; now: number; audit: AuditEntry[]; onActivity: () => void }) {
  const { run, phase, node } = goal;
  const trust = useOS((s) => s.trust);
  const leases = useOS((s) => s.leases);
  const settings = useOS((s) => s.settings);
  const cancelRun = useOS((s) => s.cancelRun);
  const [openAudit, setOpenAudit] = useState<string | null>(null);

  const level = trustLevelOf(trust, run.principal);
  const decisions = audit.filter((e) => e.goal === run.request && e.at >= run.startedAt - 1000 && e.at <= (run.endedAt ?? Infinity) + 1000);
  const targets = Array.from(new Set(run.steps.filter((s) => s.tool).map((s) => targetOf(s.tool!.input)).filter(Boolean)));
  const goalLeases = leases.filter((l) => l.goal === run.request);
  const verify = run.steps.find((s) => s.kind === "verify");
  const expected = verify?.doneLabel ?? verify?.label ?? run.summary ?? "Task completes";
  const live = PHASE_UI[phase].live;
  const visible = run.steps.filter((s) => s.status !== "pending");

  const envelope = {
    goal_id: goal.id,
    intent: run.request,
    principal: run.principal,
    trust_level: `${level} (${TRUST_LEVELS[level].name})`,
    authority: {
      scope: targets.length ? targets : ["none yet"],
      leases: goalLeases.length ? goalLeases.map((l) => `${l.tool} (${l.kind})`) : [],
    },
    budget: {
      max_steps: run.steps.length,
      cloud_allowed: run.route === "cloud" ? "yes, approved" : settings.askBeforeCloud ? "only with your OK" : "yes",
      deadline: "60s",
    },
    expected_outcome: expected,
    state: phase,
  };

  return (
    <div className="p-4 grid gap-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[11.5px] font-mono text-fg-3">{goal.id}</div>
          <div className="text-[15px] font-semibold leading-snug">{run.request}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Chip tone={PHASE_UI[phase].tone}>{PHASE_UI[phase].label}</Chip>
            <Chip tone={level >= 3 ? "ok" : level >= 2 ? "accent" : "warn"} icon={ShieldCheck}>
              {run.principal === "owner" ? "You" : principalName(run.principal)}, {TRUST_LEVELS[level].name}
            </Chip>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {live && (
          <Button size="sm" variant="danger" onClick={() => cancelRun(run.id)}>
            <Square size={11} fill="currentColor" /> Stop goal
          </Button>
        )}
        {run.undoable && (
          <Button size="sm" onClick={() => undoRun(run.id)}>
            <Undo2 size={13} /> Undo
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onActivity}>
          Open in Activity
        </Button>
      </div>

      {/* 1. state machine */}
      <Section title="State">
        <StateMachine node={node} phase={phase} />
      </Section>

      {/* 2. envelope */}
      <Section title="Goal envelope">
        <pre className="rounded-xl border border-line bg-surface p-3 text-[11.5px] leading-[1.6] font-mono overflow-auto scroll-thin whitespace-pre-wrap break-words">
          <Json value={envelope} />
        </pre>
      </Section>

      {/* 3. timeline */}
      <Section title="Steps">
        <ol className="rounded-xl border border-line bg-surface divide-y divide-line">
          {visible.map((s) => (
            <li key={s.id} className="flex items-center gap-2.5 px-3 py-2 text-[12.5px]">
              <span
                className={clsx(
                  "size-1.5 rounded-full shrink-0",
                  s.status === "done" ? "bg-ok" : s.status === "blocked" ? "bg-danger" : "bg-ai animate-pulse",
                )}
              />
              <span className="w-[62px] shrink-0 text-[11px] text-fg-3">{NODE_LABEL[nodeOfStep(s)]}</span>
              <span className={clsx("flex-1 min-w-0 truncate", s.status === "blocked" && "text-danger")}>
                {s.status === "active" ? s.label : (s.doneLabel ?? s.label)}
              </span>
              {s.tool && <span className="font-mono text-[10.5px] text-fg-3 truncate max-w-[110px]">{s.tool.name}</span>}
              <span className="w-12 text-right tabular-nums text-[11px] text-fg-3">{s.ms !== undefined ? fmt(s.ms) : ""}</span>
            </li>
          ))}
          {!visible.length && <li className="px-3 py-3 text-[12.5px] text-fg-3">Starting...</li>}
        </ol>
        <div className="mt-1.5 text-[11.5px] text-fg-3 text-right tabular-nums">
          {fmt(Math.max(0, (run.endedAt ?? (now || run.startedAt)) - run.startedAt))} total
        </div>
      </Section>

      {/* 4. authority */}
      <Section title={`Authority decisions (${decisions.length})`}>
        <ul className="rounded-xl border border-line bg-surface divide-y divide-line">
          {decisions
            .slice()
            .sort((a, b) => a.seq - b.seq)
            .map((e) => {
              const tone: Tone = e.outcome === "blocked" || e.outcome === "asked-no" ? "danger" : e.outcome === "asked-yes" ? "accent" : "ok";
              const label = e.outcome === "blocked" ? "Blocked" : e.outcome === "asked-no" ? "You said no" : e.outcome === "asked-yes" ? "You approved" : "Allowed";
              return (
                <li key={e.id}>
                  <button onClick={() => setOpenAudit(openAudit === e.id ? null : e.id)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-2/70">
                    <Chip tone={tone} className="w-[92px] justify-center">
                      {label}
                    </Chip>
                    <span className="flex-1 min-w-0 truncate font-mono text-[11.5px]">{e.tool}</span>
                    <span className="text-[10.5px] font-mono text-fg-3">#{e.seq}</span>
                    <ChevronRight size={13} className={clsx("text-fg-3 transition-transform", openAudit === e.id && "rotate-90")} />
                  </button>
                  <AnimatePresence initial={false}>
                    {openAudit === e.id && (
                      <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                        <div className="mx-3 mb-2.5 rounded-lg border border-line bg-surface-2">
                          <div className="px-2.5 pt-2 text-[12px] text-fg-2">{e.reason}</div>
                          <CheckTrace checks={e.checks} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          {!decisions.length && <li className="px-3 py-3 text-[12.5px] text-fg-3">No tool has asked the broker yet.</li>}
        </ul>
      </Section>

      {/* 5. verification */}
      <Section title="Verification">
        <Verification run={run} phase={phase} verify={verify} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 text-[12.5px] font-semibold text-fg-2">{title}</div>
      {children}
    </section>
  );
}

function StateMachine({ node, phase }: { node: Node; phase: Phase }) {
  const at = NODES.indexOf(node);
  const ended = phase === "stopped" || phase === "failed";
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-4">
      <div className="flex items-center">
        {NODES.map((n, i) => {
          const past = i < at || (phase === "done" && i <= at);
          const current = i === at && phase !== "done";
          const failedHere = ended && i === at;
          return (
            <div key={n} className={clsx("flex items-center", i < NODES.length - 1 && "flex-1")}>
              <div className="grid justify-items-center gap-1.5">
                <span
                  className={clsx(
                    "relative size-8 rounded-full grid place-items-center border-2 transition-colors",
                    failedHere && "border-danger bg-danger-soft text-danger",
                    !failedHere && past && "border-ok bg-ok text-white",
                    !failedHere && current && "border-ai bg-ai-soft text-ai-ink",
                    !failedHere && !past && !current && "border-line-strong text-fg-3",
                  )}
                >
                  {current && !failedHere && <span className="absolute -inset-1.5 rounded-full bg-ai/25 animate-ping" />}
                  {failedHere ? <X size={14} strokeWidth={2.6} /> : past ? <Check size={14} strokeWidth={2.8} /> : <span className="text-[11px] font-semibold">{i + 1}</span>}
                </span>
                <span className={clsx("text-[11px]", current || failedHere ? "font-semibold text-fg" : "text-fg-2")}>{NODE_LABEL[n]}</span>
              </div>
              {i < NODES.length - 1 && (
                <span className={clsx("flex-1 h-0.5 mx-1 -mt-5 rounded-full", i < at || (phase === "done" && i < at) ? "bg-ok" : "bg-line-strong")} />
              )}
            </div>
          );
        })}
      </div>
      {ended && (
        <div className="mt-3 text-[12px] text-danger text-center">
          {phase === "failed" ? "Failed" : "Stopped"} at {NODE_LABEL[node].toLowerCase()}
        </div>
      )}
    </div>
  );
}

function Verification({ run, phase, verify }: { run: Run; phase: Phase; verify?: Step }) {
  let tone: "ok" | "danger" | "neutral" | "ai" = "neutral";
  let title = "Not checked yet";
  let body = verify ? `Will check: ${verify.label.toLowerCase()}.` : "This goal has no separate check.";
  if (phase === "done") {
    tone = "ok";
    title = verify?.doneLabel ?? "Finished";
    body = verify?.detail ?? "The checker confirmed the result independently, not by trusting the tool's own word.";
  } else if (phase === "stopped" || phase === "failed") {
    tone = "danger";
    title = phase === "failed" ? "Couldn't finish" : "Stopped before it finished";
    body = run.summary ?? "";
  } else if (verify?.status === "active") {
    tone = "ai";
    title = verify.label;
    body = "Checking the outcome against what the goal expected.";
  }
  return (
    <div
      className={clsx(
        "rounded-xl border p-3 text-[12.5px] leading-5",
        tone === "ok" && "border-ok-line bg-ok-soft",
        tone === "danger" && "border-danger-line bg-danger-soft",
        tone === "ai" && "border-ai-line bg-ai-soft",
        tone === "neutral" && "border-line bg-surface",
      )}
    >
      <div
        className={clsx(
          "font-semibold",
          tone === "ok" && "text-ok",
          tone === "danger" && "text-danger",
          tone === "ai" && "text-ai-ink",
        )}
      >
        {title}
      </div>
      {body && <div className="text-fg-2">{body}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ readable JSON

function Json({ value, indent = 0 }: { value: unknown; indent?: number }) {
  const pad = "  ".repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-fg-3">[]</span>;
    return (
      <>
        {"[\n"}
        {value.map((v, i) => (
          <span key={i}>
            {pad}
            {"  "}
            <Json value={v} indent={indent + 1} />
            {i < value.length - 1 ? "," : ""}
            {"\n"}
          </span>
        ))}
        {pad}
        {"]"}
      </>
    );
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <>
        {"{\n"}
        {entries.map(([k, v], i) => (
          <span key={k}>
            {pad}
            {"  "}
            <span className="text-accent">&quot;{k}&quot;</span>
            {": "}
            <Json value={v} indent={indent + 1} />
            {i < entries.length - 1 ? "," : ""}
            {"\n"}
          </span>
        ))}
        {pad}
        {"}"}
      </>
    );
  }
  if (typeof value === "number") return <span className="text-warn">{value}</span>;
  return <span className="text-ok">&quot;{String(value)}&quot;</span>;
}
