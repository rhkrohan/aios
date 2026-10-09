"use client";

import clsx from "clsx";
import { ChevronDown, Info, RotateCcw, Table2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useOS } from "@/lib/store";
import { CONSTANTS, DEFAULTS, MIX, simulate, type Assumptions, type SideResult } from "@/lib/twin";
import { Button } from "../ui";

// Two series, validated with the dataviz palette checker (light and dark).
const SERIES = {
  light: { sios: "#4f7bf7", screen: "#c86f22" },
  dark: { sios: "#6b8cf2", screen: "#c67a35" },
};
const NAMES = { sios: "SIOS", screen: "AI driving a normal desktop" } as const;
type SeriesKey = keyof typeof NAMES;

const pct = (v: number) => `${Math.round(v * 100)}%`;
const sec = (v: number) => (v >= 60 ? `${(v / 60).toFixed(1)} min` : `${v.toFixed(1)}s`);

interface SliderDef {
  key: keyof Assumptions;
  label: string;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  hint: string;
}

const SLIDERS: SliderDef[] = [
  { key: "goals", label: "Goals to simulate", min: 10, max: 500, step: 10, fmt: (v) => String(v), hint: "A mix of everyday, mail, writing, web and other-AI tasks." },
  { key: "accuracy", label: "Model accuracy per step", min: 0.8, max: 0.99, step: 0.01, fmt: pct, hint: "Chance the model picks a correct single step. Same model on both sides." },
  { key: "toolMs", label: "Typed tool call", min: 50, max: 800, step: 10, fmt: (v) => `${v} ms`, hint: "One direct call into an app or service." },
  { key: "screenStepMs", label: "Screen step", min: 1000, max: 8000, step: 100, fmt: (v) => `${(v / 1000).toFixed(1)}s`, hint: "Screenshot, think, click, wait for the window." },
  { key: "cloudPct", label: "Tasks needing online AI", min: 0, max: 0.6, step: 0.01, fmt: pct, hint: "SIOS only. Writing tasks lean on it more." },
  { key: "injectionPct", label: "Web pages with hidden instructions", min: 0, max: 0.3, step: 0.01, fmt: pct, hint: "Pages that try to give the AI orders." },
];

export function Simulate() {
  const theme = useOS((s) => s.theme);
  const colors = SERIES[theme];
  const [a, setA] = useState<Assumptions>(DEFAULTS);
  const [table, setTable] = useState(false);
  const [how, setHow] = useState(false);
  const r = useMemo(() => simulate(a), [a]);

  return (
    <div className="h-full overflow-auto scroll-thin">
      <div className="grid grid-cols-[290px_1fr] gap-4 p-5 min-w-[880px]">
        {/* assumptions */}
        <aside className="rounded-2xl border border-line bg-surface p-4 h-fit">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-semibold">Assumptions</h3>
            <Button size="sm" variant="ghost" onClick={() => setA(DEFAULTS)}>
              <RotateCcw size={12} /> Reset
            </Button>
          </div>
          <div className="mt-3 grid gap-4">
            {SLIDERS.map((s) => (
              <label key={s.key} className="block">
                <div className="flex items-baseline justify-between text-[12.5px]">
                  <span className="font-medium">{s.label}</span>
                  <span className="tabular-nums text-fg-2">{s.fmt(a[s.key])}</span>
                </div>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={a[s.key]}
                  onChange={(e) => setA({ ...a, [s.key]: Number(e.target.value) })}
                  className="mt-1.5 w-full accent-[var(--accent)] cursor-pointer"
                  aria-label={s.label}
                />
                <div className="text-[11.5px] text-fg-3 leading-4">{s.hint}</div>
              </label>
            ))}
          </div>
          <button onClick={() => setHow((h) => !h)} className="mt-4 flex items-center gap-1 text-[12px] text-fg-2 hover:text-fg">
            <ChevronDown size={13} className={clsx("transition-transform", how && "rotate-180")} /> How this is calculated
          </button>
          {how && (
            <ul className="mt-2 grid gap-1.5 text-[11.5px] text-fg-2 leading-4">
              <li>SIOS step success: accuracy, with {pct(CONSTANTS.typedErrorCut)} of errors removed by typed tools and checked inputs.</li>
              <li>A failed SIOS step gets one retry on the stronger model (loop guard), which removes {pct(CONSTANTS.retryErrorCut)} of errors.</li>
              <li>Screen step success: accuracy x {CONSTANTS.screenPerception} for misreading the screen; a bad step is recovered {pct(CONSTANTS.screenRecover)} of the time.</li>
              <li>
                Time: SIOS steps cost tool time + model time ({CONSTANTS.localModelMs} ms local, {CONSTANTS.cloudModelMs} ms online); screen steps cost the screen step
                time.
              </li>
              <li>
                Hidden instructions: SIOS blocks actions you didn&apos;t ask for; a screen agent follows them {pct(CONSTANTS.injectionFollow)} of the time.
              </li>
              <li>Data: each screen step sends a {CONSTANTS.screenshotMb} MB screenshot; SIOS sends {CONSTANTS.redactedMb * 1000} KB of redacted text per online step.</li>
            </ul>
          )}
        </aside>

        {/* results */}
        <section className="min-w-0 grid gap-4 content-start">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-[12.5px] text-fg-2">
              <Info size={14} /> Modeled estimate from these assumptions, not a measurement.
            </div>
            <span className="flex-1" />
            <Legend colors={colors} />
            <Button size="sm" variant={table ? "secondary" : "ghost"} onClick={() => setTable((t) => !t)}>
              <Table2 size={13} /> {table ? "Show charts" : "Show table"}
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <Tile label="Goals that worked" sios={pct(r.sios.successRate)} screen={pct(r.screen.successRate)} colors={colors} />
            <Tile label="Time per goal" sios={sec(r.sios.avgSeconds)} screen={sec(r.screen.avgSeconds)} colors={colors} />
            <Tile label="Steps per goal" sios={r.sios.stepsPerGoal.toFixed(1)} screen={r.screen.stepsPerGoal.toFixed(1)} colors={colors} />
            <Tile label="Handled on this computer" sios={pct(r.sios.localShare)} screen={pct(r.screen.localShare)} colors={colors} note="Screen agents need a vision model online." />
            <Tile
              label="Times it asked you"
              sios={`${r.sios.approvalsPerGoal.toFixed(2)} per goal`}
              screen="Never"
              colors={colors}
              note="A screen agent has no broker, so it never stops to ask."
            />
            <Tile
              label="Hidden instructions that got through"
              sios={`${r.sios.injectionsSucceeded} of ${r.injectionsSeen}`}
              screen={`${r.screen.injectionsSucceeded} of ${r.injectionsSeen}`}
              colors={colors}
            />
          </div>

          {table ? (
            <ResultTable r={r} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <PairChart title="Goals that worked" unit="%" fmt={(v) => `${Math.round(v)}%`} values={{ sios: r.sios.successRate * 100, screen: r.screen.successRate * 100 }} max={100} colors={colors} />
                <PairChart title="Average time per goal" unit="s" fmt={(v) => sec(v)} values={{ sios: r.sios.avgSeconds, screen: r.screen.avgSeconds }} colors={colors} />
                <PairChart title="Steps per goal" unit="" fmt={(v) => v.toFixed(1)} values={{ sios: r.sios.stepsPerGoal, screen: r.screen.stepsPerGoal }} colors={colors} />
                <PairChart title="Data sent off this computer" unit="MB" fmt={(v) => `${v.toFixed(1)} MB`} values={{ sios: r.sios.cloudMb, screen: r.screen.cloudMb }} colors={colors} />
              </div>
              <ByKind sios={r.sios} screen={r.screen} colors={colors} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Legend({ colors }: { colors: Record<SeriesKey, string> }) {
  return (
    <div className="flex items-center gap-3 text-[12px] text-fg-2" aria-label="Legend">
      {(Object.keys(NAMES) as SeriesKey[]).map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: colors[k] }} />
          {NAMES[k]}
        </span>
      ))}
    </div>
  );
}

function Tile({ label, sios, screen, colors, note }: { label: string; sios: string; screen: string; colors: Record<SeriesKey, string>; note?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5" title={note}>
      <div className="text-[12px] text-fg-2">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="size-2 rounded-full self-center" style={{ background: colors.sios }} aria-hidden />
        <span className="text-[22px] font-semibold tabular-nums leading-tight">{sios}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-fg-2">
        <span className="size-2 rounded-full" style={{ background: colors.screen }} aria-hidden />
        <span className="tabular-nums">{screen}</span> on a normal desktop
      </div>
    </div>
  );
}

/** Two horizontal bars on one shared scale. Hover a bar for its value. */
function PairChart({
  title,
  values,
  fmt,
  colors,
  max,
}: {
  title: string;
  unit: string;
  values: Record<SeriesKey, number>;
  fmt: (v: number) => string;
  colors: Record<SeriesKey, string>;
  max?: number;
}) {
  const [hover, setHover] = useState<SeriesKey | null>(null);
  const top = max ?? Math.max(values.sios, values.screen, 0.0001) * 1.1;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-[13px] font-semibold">{title}</div>
      <div className="mt-3 grid gap-2">
        {(Object.keys(NAMES) as SeriesKey[]).map((k) => {
          const w = Math.max(0.5, (values[k] / top) * 100);
          return (
            <div key={k} className="grid grid-cols-[96px_1fr_72px] items-center gap-2" onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)}>
              <span className="text-[12px] text-fg-2 truncate">{k === "sios" ? "SIOS" : "Screen agent"}</span>
              <div className="relative h-6 flex items-center" aria-label={`${NAMES[k]}: ${fmt(values[k])}`}>
                <div className="h-3.5 rounded-r-[4px] transition-[width] duration-300" style={{ width: `${w}%`, background: colors[k] }} />
                {hover === k && (
                  <div className="absolute -top-8 left-0 z-10 whitespace-nowrap rounded-lg bg-[#1b2027] px-2 py-1 text-[11.5px] text-white shadow-lg">
                    {NAMES[k]}: <span className="font-semibold tabular-nums">{fmt(values[k])}</span>
                  </div>
                )}
              </div>
              <span className="text-[12px] tabular-nums text-fg text-right">{fmt(values[k])}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Success rate by task type: grouped columns, one shared 0 to 100% axis. */
function ByKind({ sios, screen, colors }: { sios: SideResult; screen: SideResult; colors: Record<SeriesKey, string> }) {
  const [hover, setHover] = useState<string | null>(null);
  const H = 160;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold">Goals that worked, by kind of task</div>
        <Legend colors={colors} />
      </div>
      <div className="mt-4 grid grid-cols-[32px_1fr] gap-2">
        <div className="relative" style={{ height: H }}>
          {[100, 50, 0].map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 text-[11px] text-fg-3 tabular-nums" style={{ top: H - (t / 100) * H }}>
              {t}%
            </span>
          ))}
        </div>
        <div>
          <div className="relative flex items-end justify-around gap-3" style={{ height: H }}>
            {[0, 50, 100].map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-line" style={{ top: H - (t / 100) * H }} />
            ))}
            {MIX.map((m) => (
              <div key={m.kind} className="relative flex items-end gap-[2px] h-full">
                {(["sios", "screen"] as SeriesKey[]).map((k) => {
                  const v = (k === "sios" ? sios : screen).byKind[m.kind];
                  const id = `${m.kind}-${k}`;
                  return (
                    <div
                      key={k}
                      className="relative w-7 rounded-t-[4px] transition-[height] duration-300"
                      style={{ height: Math.max(2, v * H), background: colors[k] }}
                      onMouseEnter={() => setHover(id)}
                      onMouseLeave={() => setHover(null)}
                      aria-label={`${m.label}, ${NAMES[k]}: ${pct(v)}`}
                    >
                      {hover === id && (
                        <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded-lg bg-[#1b2027] px-2 py-1 text-[11.5px] text-white shadow-lg">
                          {m.label}, {k === "sios" ? "SIOS" : "screen agent"}: <span className="font-semibold">{pct(v)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-around gap-3">
            {MIX.map((m) => (
              <span key={m.kind} className="w-[58px] text-center text-[11px] leading-4 text-fg-2">
                {m.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultTable({ r }: { r: ReturnType<typeof simulate> }) {
  const rows: [string, string, string][] = [
    ["Goals that worked", pct(r.sios.successRate), pct(r.screen.successRate)],
    ["Average time per goal", sec(r.sios.avgSeconds), sec(r.screen.avgSeconds)],
    ["Steps per goal", r.sios.stepsPerGoal.toFixed(1), r.screen.stepsPerGoal.toFixed(1)],
    ["Handled on this computer", pct(r.sios.localShare), pct(r.screen.localShare)],
    ["Times it asked you, per goal", r.sios.approvalsPerGoal.toFixed(2), "0"],
    ["Hidden instructions blocked", String(r.sios.injectionsBlocked), String(r.screen.injectionsBlocked)],
    ["Hidden instructions that got through", String(r.sios.injectionsSucceeded), String(r.screen.injectionsSucceeded)],
    ["Data sent off this computer", `${r.sios.cloudMb.toFixed(1)} MB`, `${r.screen.cloudMb.toFixed(1)} MB`],
    ...MIX.map((m) => [`Worked: ${m.label}`, pct(r.sios.byKind[m.kind]), pct(r.screen.byKind[m.kind])] as [string, string, string]),
  ];
  return (
    <table className="w-full text-[13px] rounded-2xl border border-line overflow-hidden">
      <thead className="bg-surface-2 text-left text-[12px] text-fg-2">
        <tr>
          <th className="px-4 py-2 font-medium">Measure ({r.goals} goals)</th>
          <th className="px-4 py-2 font-medium text-right">SIOS</th>
          <th className="px-4 py-2 font-medium text-right">AI driving a normal desktop</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([k, s, b]) => (
          <tr key={k} className="border-t border-line">
            <td className="px-4 py-2">{k}</td>
            <td className="px-4 py-2 text-right tabular-nums">{s}</td>
            <td className="px-4 py-2 text-right tabular-nums">{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
