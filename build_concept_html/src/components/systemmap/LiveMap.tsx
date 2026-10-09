"use client";

import clsx from "clsx";
import { Play, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { runRequest } from "@/lib/engine";
import { useOS } from "@/lib/store";
import type { Run } from "@/lib/types";
import { Button, Chip } from "../ui";
import { EDGES, LAYERS, NODES, NODE_H, NODE_W, adapterOf, layout, targetOf, type MapNode } from "./nodes";

const POS = layout();
const VIEW_W = 1000;
const VIEW_H = 450;

/** A bezier from the side of one node to the facing side of another. */
function edgePath(a: string, b: string) {
  const p = POS[a];
  const q = POS[b];
  if (!p || !q) return "";
  const forward = q.x > p.x + 10;
  const backward = q.x < p.x - 10;
  const y1 = p.y + NODE_H / 2;
  const y2 = q.y + NODE_H / 2;
  if (forward) {
    const x1 = p.x + NODE_W;
    const x2 = q.x;
    const dx = (x2 - x1) / 2;
    return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }
  if (backward) {
    const x1 = p.x;
    const x2 = q.x + NODE_W;
    const dx = (x1 - x2) / 2;
    return `M${x1} ${y1} C${x1 - dx} ${y1}, ${x2 + dx} ${y2}, ${x2} ${y2}`;
  }
  // same column: loop out to the right
  const x = p.x + NODE_W;
  return `M${x} ${y1} C${x + 34} ${y1}, ${x + 34} ${y2}, ${x} ${y2}`;
}

interface Pulse {
  id: number;
  d: string;
  red: boolean;
}

function PulseDot({ pulse, onDone, ms = 560 }: { pulse: Pulse; onDone: (id: number) => void; ms?: number }) {
  const pathRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  useEffect(() => {
    const path = pathRef.current;
    const dot = dotRef.current;
    if (!path || !dot) return;
    const len = path.getTotalLength();
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const pt = path.getPointAtLength(len * e);
      dot.setAttribute("cx", String(pt.x));
      dot.setAttribute("cy", String(pt.y));
      if (k < 1) raf = requestAnimationFrame(tick);
      else onDone(pulse.id);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pulse, onDone, ms]);
  const color = pulse.red ? "var(--danger)" : "var(--ai)";
  return (
    <g>
      <path ref={pathRef} d={pulse.d} style={{ fill: "none", stroke: color, strokeOpacity: 0.55, strokeWidth: 2 }} />
      <circle ref={dotRef} r={5} style={{ fill: color }} />
    </g>
  );
}

function interfaceFor(principal: string) {
  if (principal === "claude-desktop") return "claude";
  if (principal === "phone") return "phone";
  return "ask";
}

export function LiveMap() {
  const runs = useOS((s) => s.runs);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [glow, setGlow] = useState<Record<string, "on" | "red">>({});
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [selected, setSelected] = useState<MapNode | null>(null);
  const seen = useRef(new Map<string, string>());
  const timers = useRef<number[]>([]);
  const pulseId = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const later = (ms: number, fn: () => void) => {
      timers.current.push(window.setTimeout(fn, ms));
    };
    const light = (id: string, red = false) => {
      setCounts((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
      setGlow((g) => ({ ...g, [id]: red ? "red" : "on" }));
      later(red ? 1400 : 900, () =>
        setGlow((g) => {
          const n = { ...g };
          delete n[id];
          return n;
        }),
      );
    };
    // play hops one after another; each hop lights its destination
    const play = (hops: [string, string][], red = false, startAt = 0) => {
      hops.forEach(([a, b], i) => {
        later(startAt + i * 480, () => {
          if (!reduce) setPulses((p) => [...p, { id: ++pulseId.current, d: edgePath(a, b), red: red && i === hops.length - 1 }]);
          light(b, red && i === hops.length - 1);
        });
      });
    };

    const onStep = (run: Run, stepIdx: number, status: string, firstForRun: boolean) => {
      const st = run.steps[stepIdx];
      const iface = interfaceFor(run.principal);
      if (firstForRun) play([[iface, "context"]]);
      const model = run.route === "cloud" ? "online" : "local";
      if (status === "active") {
        if (st.kind === "context") light("context");
        else if (st.kind === "reflex") play([["context", "reflex"]]);
        else if (st.kind === "recipe") play([["reflex", "recipes"]]);
        else if (st.kind === "route") play([["reflex", "router"]]);
        else if (st.kind === "think") play([["router", model], ["router", "planner"]]);
        else if (st.kind === "guard") {
          light("context");
          light("policy");
        } else if (st.kind === "tool") {
          play([["planner", "policy"]]);
          light("trust");
          light("leases");
        } else if (st.kind === "verify") light("checker");
      }
      if (st.kind === "tool" && st.tool && (status === "done" || status === "blocked")) {
        light("audit");
        if (status === "blocked") {
          light("policy", true);
          return;
        }
        const ad = adapterOf(st.tool.adapter);
        if (!ad) {
          play([["policy", "context"]]);
          return;
        }
        if (ad === "mcp" || st.tool.name === "network.connect_wifi") light("vault");
        play([
          ["policy", ad],
          [ad, targetOf(st.tool.name)],
        ]);
      }
    };

    const scan = (list: Run[]) => {
      for (const run of [...list].reverse()) {
        const firstForRun = !seen.current.has(run.id);
        if (firstForRun) seen.current.set(run.id, "seen");
        let announced = !firstForRun;
        run.steps.forEach((st, i) => {
          const key = `${run.id}:${st.id}`;
          const prev = seen.current.get(key);
          if (st.status === "pending" || prev === st.status) return;
          seen.current.set(key, st.status);
          onStep(run, i, st.status, !announced);
          announced = true;
        });
      }
    };
    // Runs that existed before the map opened don't replay.
    for (const run of useOS.getState().runs) {
      seen.current.set(run.id, "seen");
      run.steps.forEach((st) => seen.current.set(`${run.id}:${st.id}`, st.status));
    }
    const unsub = useOS.subscribe((s, prev) => {
      if (s.runs !== prev.runs) scan(s.runs);
    });
    const pending = timers.current;
    return () => {
      unsub();
      pending.forEach(clearTimeout);
    };
  }, []);

  const removePulse = useMemo(() => (id: number) => setPulses((p) => p.filter((x) => x.id !== id)), []);

  // session stats from the real runs
  const stats = useMemo(() => {
    const done = runs.filter((r) => r.endedAt);
    const tools = runs.flatMap((r) => r.steps.filter((s) => s.tool && s.status !== "pending"));
    const avg = done.length ? done.reduce((a, r) => a + (r.endedAt! - r.startedAt), 0) / done.length / 1000 : 0;
    return {
      goals: runs.length,
      tools: tools.length,
      asked: tools.filter((s) => s.broker?.startsWith("asked")).length,
      blocked: tools.filter((s) => s.status === "blocked").length,
      avg,
      local: runs.length ? Math.round((runs.filter((r) => r.route === "local").length / runs.length) * 100) : 100,
    };
  }, [runs]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <p className="flex-1 text-[13px] text-fg-2 leading-5 max-w-[640px]">
          The whole machine, wired the way the plan says. Ask something and watch it travel: memory, decision, model, the broker&apos;s checks, an adapter, then
          the app. Click any part to see what it does.
        </p>
        <Button
          variant="primary"
          onClick={() => {
            useOS.getState().setCommandOpen(true);
            void runRequest("Clean up my Downloads");
          }}
        >
          <Play size={13} fill="currentColor" /> Run a demo goal
        </Button>
      </div>

      <div className="flex-1 min-h-0 flex gap-3 px-5">
        <div className="flex-1 min-w-0 rounded-2xl border border-line bg-surface overflow-auto scroll-thin">
          <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full h-auto min-w-[760px] select-none" role="img" aria-label="Map of SIOS components and how requests flow between them">
            {LAYERS.map((l) => (
              <g key={l.id}>
                <rect x={l.x} y={18} width={NODE_W + 20} height={VIEW_H - 30} rx={16} style={{ fill: "var(--surface-2)", stroke: "var(--line)" }} />
                <text x={l.x + 14} y={44} style={{ fill: "var(--fg-2)", fontSize: 12.5, fontWeight: 600 }}>
                  {l.label}
                </text>
              </g>
            ))}
            <text x={LAYERS[0].x + 14} y={346} style={{ fill: "var(--fg-2)", fontSize: 12.5, fontWeight: 600 }}>
              Models
            </text>

            {EDGES.map(([a, b]) => (
              <path key={a + b} d={edgePath(a, b)} style={{ fill: "none", stroke: "var(--line-strong)", strokeWidth: 1.2, opacity: 0.75 }} />
            ))}

            {pulses.map((p) => (
              <PulseDot key={p.id} pulse={p} onDone={removePulse} />
            ))}

            {NODES.map((n) => {
              const p = POS[n.id];
              const g = glow[n.id];
              const on = selected?.id === n.id;
              const count = counts[n.id] ?? 0;
              return (
                <g
                  key={n.id}
                  onClick={() => setSelected(on ? null : n)}
                  className="cursor-pointer"
                  role="button"
                  aria-label={`${n.label}${count ? `, ${count} calls this session` : ""}`}
                >
                  <rect
                    x={p.x}
                    y={p.y}
                    width={NODE_W}
                    height={NODE_H}
                    rx={9}
                    style={{
                      fill: g === "red" ? "var(--danger-soft)" : g ? "var(--ai-soft)" : "var(--surface)",
                      stroke: g === "red" ? "var(--danger)" : g ? "var(--ai)" : on ? "var(--accent)" : "var(--line-strong)",
                      strokeWidth: g || on ? 2 : 1,
                      transition: "fill .25s, stroke .25s",
                    }}
                  />
                  <text x={p.x + 11} y={p.y + NODE_H / 2 + 4.5} style={{ fill: "var(--fg)", fontSize: 12.5, fontWeight: 500 }}>
                    {n.label}
                  </text>
                  {count > 0 && (
                    <text x={p.x + NODE_W - 10} y={p.y + NODE_H / 2 + 4.5} textAnchor="end" style={{ fill: "var(--fg-3)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                      {count}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {selected && (
          <aside className="w-[280px] shrink-0 rounded-2xl border border-line bg-surface p-4 overflow-auto scroll-thin">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <div className="text-[12px] text-fg-3">{selected.layer === "models" ? "Models" : LAYERS.find((l) => l.id === selected.layer)?.label}</div>
                <div className="text-[16px] font-semibold">{selected.label}</div>
              </div>
              <button aria-label="Close" onClick={() => setSelected(null)} className="size-7 grid place-items-center rounded-md text-fg-3 hover:bg-surface-3">
                <X size={14} />
              </button>
            </div>
            <p className="mt-2 text-[13px] leading-5">{selected.job}</p>
            <dl className="mt-3 grid gap-2.5 text-[12.5px]">
              {(
                [
                  ["Process", selected.process],
                  ["Runs as", selected.runsAs],
                  ["Talks over", selected.channel],
                  ["Its data", selected.data],
                  ["Offline or crash", selected.offline],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-fg-3">{k}</dt>
                  <dd className="text-fg">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 rounded-xl bg-surface-2 border border-line p-3">
              <div className="text-[12px] text-fg-3">Calls this session</div>
              <div className="text-[22px] font-semibold tabular-nums">{counts[selected.id] ?? 0}</div>
            </div>
          </aside>
        )}
      </div>

      <div className="grid grid-cols-6 gap-2 px-5 py-4">
        {(
          [
            ["Goals", String(stats.goals)],
            ["Tool calls", String(stats.tools)],
            ["Asked you", String(stats.asked)],
            ["Blocked", String(stats.blocked)],
            ["Avg goal time", stats.avg ? `${stats.avg.toFixed(1)}s` : "--"],
            ["Thought locally", `${stats.local}%`],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line px-3 py-2">
            <div className={clsx("text-[18px] font-semibold tabular-nums leading-tight", k === "Blocked" && stats.blocked > 0 && "text-danger")}>{v}</div>
            <div className="text-[11.5px] text-fg-2">{k}</div>
          </div>
        ))}
      </div>
      <div className="px-5 pb-3 -mt-2 flex items-center gap-2 text-[11.5px] text-fg-3">
        <Chip tone="ai">Live</Chip> Real numbers from this session. Includes demo timings, so treat times as illustrative.
      </div>
    </div>
  );
}
