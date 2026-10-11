"use client";

// Memory map: the context graph over time. You in the middle, your groups
// around you, what SIOS knows clustered by group, and the history ring on the
// outside where every episode links to the memories it actually recalled.
// Drag the time bar (or press play) to watch it grow. "Seen by" shows one
// AI's view: what it may read lights up, the rest dims (like a mount namespace).

import clsx from "clsx";
import { Lock, Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export interface MapMem {
  id: string;
  text: string;
  kind: string;
  group: string;
  labels: string[];
  source: string;
  created: number;
  last_used: number;
  uses: number;
  links?: string[];
  by?: string;
  /** Simulations: when it was forgotten or reclaimed. */
  gone?: number;
  person?: { name: string; email: string; role: string };
}

const W = 820;
const H = 640;
const CX = W / 2;
const CY = H / 2;
const GROUPS = ["People", "Habits", "Work", "Personal", "Finance"];
export const GROUP_HEX: Record<string, string> = {
  People: "#8a6d9e",
  Habits: "var(--ai)",
  Work: "var(--accent)",
  Personal: "#c1457d",
  Finance: "#c99a2e",
  History: "var(--fg-3)",
};
const AUTHOR_HEX = [
  "var(--ai)",
  "#2f9e8f",
  "#d9822b",
  "#c1457d",
  "#4a7bd0",
  "#8a6d9e",
];

interface Node {
  m: MapMem;
  x: number;
  y: number;
  r: number;
}

function at(angle: number, rx: number, ry: number) {
  return { x: CX + Math.cos(angle) * rx, y: CY + Math.sin(angle) * ry };
}
const groupAngle = (g: string) =>
  -Math.PI / 2 + (GROUPS.indexOf(g) / GROUPS.length) * Math.PI * 2;

/** Episodes start with brain-d's "day N:" stamp; the map has real times, so drop it. */
const plain = (t: string) => t.replace(/^day \d+:\s*/, "");

function stamp(secs: number) {
  return new Date(secs * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function MemoryMap({
  memories,
  shares,
}: {
  memories: MapMem[];
  shares: Record<string, string[]>;
}) {
  const [pick, setPick] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [viewer, setViewer] = useState("you");
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState<number | null>(null); // null: now
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now() / 1000), 30000);
    return () => clearInterval(i);
  }, []);

  const first = useMemo(
    () => Math.min(...memories.map((m) => m.created), now),
    [memories, now],
  );
  const last = useMemo(
    () => Math.max(...memories.map((m) => m.created), first + 1),
    [memories, first],
  );
  const time = t ?? last;

  // play: sweep from the first memory to now in about six seconds
  const raf = useRef(0);
  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const from = t !== null && t < last ? t : first;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 6000);
      setT(from + (last - from) * k);
      if (k < 1) raf.current = requestAnimationFrame(step);
      else {
        setPlaying(false);
        setT(null);
      }
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // layout: fixed places, so a memory never jumps around as the graph grows
  const nodes = useMemo(() => {
    const out = new Map<string, Node>();
    const known = memories.filter((m) => m.kind !== "episode");
    for (const g of GROUPS) {
      const inGroup = known
        .filter((m) => m.group === g)
        .sort((a, b) => a.created - b.created);
      const base = groupAngle(g);
      inGroup.forEach((m, i) => {
        // a little sunflower around the group's direction
        const ring = 0.5 + 0.08 * (i % 3);
        const spread = (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 0.17;
        const p = at(base + spread, W * ring * 0.72, H * ring * 0.72);
        out.set(m.id, { m, ...p, r: 6 + Math.min(8, Math.sqrt(m.uses) * 2.4) });
      });
    }
    const episodes = memories
      .filter((m) => m.kind === "episode")
      .sort((a, b) => a.created - b.created);
    episodes.forEach((m, i) => {
      // the history ring: oldest at the top, going clockwise
      const a =
        -Math.PI / 2 + ((i + 0.5) / Math.max(episodes.length, 1)) * Math.PI * 2;
      out.set(m.id, { m, ...at(a, W * 0.46, H * 0.45), r: 7 });
    });
    return out;
  }, [memories]);

  const people = memories.filter((m) => m.person);
  const edges = useMemo(() => {
    const e: { a: string; b: string; kind: "recalled" | "mentions" }[] = [];
    for (const m of memories) {
      for (const l of m.links ?? [])
        if (nodes.has(l)) e.push({ a: m.id, b: l, kind: "recalled" });
      if (m.kind === "person") continue;
      const words = m.text.toLowerCase();
      for (const p of people) {
        const firstName = p.person!.name.split(" ")[0].toLowerCase();
        if (
          firstName.length > 2 &&
          new RegExp(`\\b${firstName}\\b`).test(words) &&
          !(m.links ?? []).includes(p.id)
        )
          e.push({ a: m.id, b: p.id, kind: "mentions" });
      }
    }
    return e;
  }, [memories, nodes, people]);

  const authors = useMemo(
    () =>
      Array.from(
        new Set(memories.map((m) => m.by).filter(Boolean) as string[]),
      ),
    [memories],
  );
  const authorHex = (by?: string) =>
    by ? AUTHOR_HEX[authors.indexOf(by) % AUTHOR_HEX.length] : "var(--fg-3)";

  const born = (id: string) => {
    const m = nodes.get(id)?.m;
    return !!m && m.created <= time && !(m.gone && m.gone <= time);
  };
  const sees = (m: MapMem) =>
    viewer === "you" ||
    ((shares[viewer] ?? []).includes(m.group) &&
      !m.labels.includes("Sensitive"));
  const focus = hover ?? pick;
  const near = useMemo(() => {
    if (!focus) return null;
    const s = new Set([focus]);
    for (const e of edges)
      if (e.a === focus || e.b === focus) {
        s.add(e.a);
        s.add(e.b);
      }
    return s;
  }, [focus, edges]);

  const shown = memories.filter((m) => born(m.id));
  // a busy map (a long simulation) keeps task-to-task lines for the dot you're looking at
  const busy = shown.filter((m) => m.kind === "episode").length > 60;
  const goneEpisodes = memories.filter(
    (m) => m.kind === "episode" && m.gone && m.gone <= time,
  ).length;
  const counts = {
    known: shown.filter((m) => m.kind === "fact" || m.kind === "preference")
      .length,
    people: shown.filter((m) => m.kind === "person").length,
    episodes: shown.filter((m) => m.kind === "episode").length,
  };
  const picked = pick && born(pick) ? nodes.get(pick)?.m : null;

  if (memories.length === 0)
    return (
      <p className="py-16 text-center text-[13px] text-fg-3">
        Nothing to map yet. Remember something, or give SIOS a task, and it
        shows up here.
      </p>
    );

  return (
    <div className="h-full min-h-0 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-fg-3">Seen by</span>
        {["you", ...Object.keys(shares)].map((v) => (
          <button
            key={v}
            onClick={() => setViewer(v)}
            aria-pressed={viewer === v}
            className={clsx(
              "h-7 px-2.5 rounded-full border",
              viewer === v
                ? "bg-ai text-white border-ai"
                : "border-line text-fg-2 hover:bg-surface-3",
            )}
          >
            {v === "you" ? "You (everything)" : v}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-3 text-fg-3">
          <span className="inline-flex items-center gap-1.5">
            <svg width="22" height="6">
              <line
                x1="0"
                y1="3"
                x2="22"
                y2="3"
                stroke="var(--ai)"
                strokeWidth="2"
              />
            </svg>
            recalled for a task
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="22" height="6">
              <line
                x1="0"
                y1="3"
                x2="22"
                y2="3"
                stroke="var(--fg-3)"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
            </svg>
            mentions a person
          </span>
        </span>
      </div>

      <div className="flex-1 min-h-0 flex rounded-2xl border border-line bg-surface-2/50 overflow-hidden">
        <div className="relative flex-1 min-w-0">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="absolute inset-0 w-full h-full block"
            role="img"
            aria-label="Memory map"
          >
            {/* the history ring */}
            <ellipse
              cx={CX}
              cy={CY}
              rx={W * 0.46}
              ry={H * 0.45}
              fill="none"
              stroke="var(--line)"
              strokeDasharray="2 6"
            />
            <text
              x={CX}
              y={CY + H * 0.45 + 22}
              textAnchor="middle"
              fontSize="13"
              fill="var(--fg-3)"
            >
              history, oldest at the top, clockwise
              {goneEpisodes > 0 ? ` (${goneEpisodes} oldest cleared out)` : ""}
            </text>

            {/* you to your groups */}
            {GROUPS.map((g) => {
              const p = at(groupAngle(g), W * 0.2, H * 0.22);
              const any = shown.some(
                (m) => m.group === g && m.kind !== "episode",
              );
              return (
                <g key={g} opacity={any ? 1 : 0.3}>
                  <line
                    x1={CX}
                    y1={CY}
                    x2={p.x}
                    y2={p.y}
                    stroke="var(--line-strong)"
                    strokeWidth="1.5"
                  />
                  {shown
                    .filter(
                      (m) =>
                        m.group === g &&
                        nodes.has(m.id) &&
                        m.kind !== "episode",
                    )
                    .map((m) => {
                      const n = nodes.get(m.id)!;
                      return (
                        <line
                          key={m.id}
                          x1={p.x}
                          y1={p.y}
                          x2={n.x}
                          y2={n.y}
                          stroke={GROUP_HEX[g]}
                          strokeOpacity={near && !near.has(m.id) ? 0.06 : 0.22}
                          strokeWidth="1"
                        />
                      );
                    })}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="15"
                    fill="var(--surface)"
                    stroke={GROUP_HEX[g]}
                    strokeWidth="2"
                    opacity={
                      viewer !== "you" && !(shares[viewer] ?? []).includes(g)
                        ? 0.35
                        : 1
                    }
                  />
                  <text
                    x={p.x}
                    y={p.y + 30}
                    textAnchor="middle"
                    fontSize="14"
                    fontWeight="600"
                    fill="var(--fg-2)"
                  >
                    {g}
                  </text>
                </g>
              );
            })}

            {/* the links between memories */}
            {edges
              .filter((e) => born(e.a) && born(e.b))
              .filter(
                (e) =>
                  !busy ||
                  focus === e.a ||
                  focus === e.b ||
                  nodes.get(e.b)!.m.kind !== "episode",
              )
              .map((e, i) => {
                const a = nodes.get(e.a)!;
                const b = nodes.get(e.b)!;
                const lit = !near || (near.has(e.a) && near.has(e.b));
                // bend toward the middle, like threads pulled through
                const mx = (a.x + b.x) / 2 + (CX - (a.x + b.x) / 2) * 0.35;
                const my = (a.y + b.y) / 2 + (CY - (a.y + b.y) / 2) * 0.35;
                return (
                  <path
                    key={i}
                    d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`}
                    fill="none"
                    stroke={
                      e.kind === "recalled" ? authorHex(a.m.by) : "var(--fg-3)"
                    }
                    strokeWidth={e.kind === "recalled" ? 1.8 : 1.2}
                    strokeDasharray={e.kind === "mentions" ? "3 4" : undefined}
                    opacity={lit ? (near ? 0.95 : busy ? 0.14 : 0.5) : 0.04}
                  />
                );
              })}

            {/* you */}
            <circle cx={CX} cy={CY} r="26" fill="var(--ai)" opacity=".14" />
            <circle cx={CX} cy={CY} r="17" fill="var(--ai)" />
            <text
              x={CX}
              y={CY + 4}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill="white"
            >
              You
            </text>

            {/* memories */}
            {Array.from(nodes.values())
              .filter((n) => born(n.m.id))
              .map((n) => {
                const m = n.m;
                const episode = m.kind === "episode";
                const fill = episode
                  ? authorHex(m.by)
                  : (GROUP_HEX[m.group] ?? "var(--fg-3)");
                // warm if used lately, like a page still in the cache
                const hot =
                  m.last_used > 0
                    ? Math.max(0, 1 - (now - m.last_used) / 3600)
                    : 0;
                const dim = (near && !near.has(m.id)) || !sees(m);
                const isNew =
                  t !== null && time - m.created < (last - first) * 0.04;
                return (
                  <g
                    key={m.id}
                    transform={`translate(${n.x},${n.y})`}
                    opacity={dim ? 0.15 : 1}
                    className="cursor-pointer"
                    onMouseEnter={() => setHover(m.id)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setPick(pick === m.id ? null : m.id)}
                    role="button"
                    aria-label={m.person?.name ?? m.text}
                  >
                    {hot > 0.05 && (
                      <circle r={n.r + 7} fill={fill} opacity={0.18 * hot} />
                    )}
                    {isNew && (
                      <circle
                        r={n.r + 10}
                        fill="none"
                        stroke={fill}
                        strokeWidth="1.5"
                        opacity=".6"
                      />
                    )}
                    {m.person ? (
                      <>
                        <circle
                          r={n.r + 4}
                          fill="var(--surface)"
                          stroke={fill}
                          strokeWidth="2"
                        />
                        <text
                          y="3.5"
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight="700"
                          fill={fill}
                        >
                          {m.person.name
                            .split(" ")
                            .map((w) => w[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase()}
                        </text>
                      </>
                    ) : (
                      <circle
                        r={n.r}
                        fill={fill}
                        stroke={pick === m.id ? "var(--fg)" : "var(--surface)"}
                        strokeWidth={pick === m.id ? 2.5 : 1.5}
                      />
                    )}
                    {m.labels.includes("Sensitive") && (
                      <circle
                        r={n.r + 3}
                        fill="none"
                        stroke="var(--danger)"
                        strokeWidth="1.5"
                        strokeDasharray="2 2"
                      />
                    )}
                    {!episode && (focus === m.id || m.uses > 1 || m.person) && (
                      <text
                        y={n.r + 15}
                        textAnchor="middle"
                        fontSize="13"
                        fill="var(--fg-2)"
                      >
                        {(m.person?.name ?? m.text).slice(0, 26)}
                        {(m.person?.name ?? m.text).length > 26 ? "…" : ""}
                      </text>
                    )}
                  </g>
                );
              })}
          </svg>

          {authors.length > 0 && (
            <div className="absolute left-3 top-3 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-fg-2 max-w-[80%]">
              {authors.map((a) => (
                <span key={a} className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: authorHex(a) }}
                  />
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>

        <aside className="w-56 shrink-0 border-l border-line bg-surface/70 p-3.5 overflow-auto scroll-thin text-[12.5px]">
          {!picked && (
            <div className="text-fg-2 leading-snug space-y-2">
              <p className="font-semibold text-fg text-[13px]">
                How to read it
              </p>
              <p>
                You sit in the middle. Around you are your groups, and what SIOS
                knows sits near its group. Bigger dots get used more; a soft
                glow means used in the last hour.
              </p>
              <p>
                The dotted ring is history. Each dot is something an AI did,
                colored by which AI did it, with lines to the memories it
                recalled to do it.
              </p>
              <p>Press play to watch it grow, or tap any dot.</p>
            </div>
          )}
          {picked && (
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{
                    background:
                      picked.kind === "episode"
                        ? authorHex(picked.by)
                        : GROUP_HEX[picked.group],
                  }}
                />
                <span className="font-semibold text-[13px]">
                  {picked.kind === "episode"
                    ? "Something that happened"
                    : picked.kind === "person"
                      ? "Person"
                      : picked.kind === "preference"
                        ? "Preference"
                        : "Fact"}
                </span>
                <span className="ml-auto text-fg-3">{picked.group}</span>
              </div>
              <p className="mt-2 leading-snug text-fg">{plain(picked.text)}</p>
              <dl className="mt-2.5 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-fg-2">
                <dt className="text-fg-3">Since</dt>
                <dd>{stamp(picked.created)}</dd>
                <dt className="text-fg-3">From</dt>
                <dd className="truncate">{picked.by || picked.source}</dd>
                <dt className="text-fg-3">Used</dt>
                <dd>
                  {picked.uses === 0 ? "not yet" : `${picked.uses}×`}
                  {picked.uses > 0 &&
                    picked.last_used > 0 &&
                    `, last ${stamp(picked.last_used)}`}
                </dd>
              </dl>
              {picked.labels.includes("Sensitive") && (
                <div className="mt-2 inline-flex items-center gap-1 text-danger">
                  <Lock size={11} /> Never sent to an online model
                </div>
              )}
              {(() => {
                const out = edges
                  .filter((e) => e.a === picked.id)
                  .map((e) => nodes.get(e.b)!.m);
                const into = edges
                  .filter((e) => e.b === picked.id)
                  .map((e) => nodes.get(e.a)!.m);
                const list = picked.kind === "episode" ? out : into;
                if (!list.length) return null;
                return (
                  <>
                    <div className="mt-3 text-[11.5px] font-semibold text-fg-3">
                      {picked.kind === "episode"
                        ? "What it recalled"
                        : "Where it was used"}
                    </div>
                    <ul className="mt-1 space-y-1">
                      {list.slice(0, 5).map((x) => (
                        <li key={x.id}>
                          <button
                            onClick={() => setPick(x.id)}
                            className="text-left leading-snug hover:text-ai-ink line-clamp-2"
                          >
                            {x.person?.name ?? plain(x.text)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                );
              })()}
            </div>
          )}
        </aside>
      </div>

      {/* time */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause" : "Play how memory grew"}
          className="size-9 shrink-0 grid place-items-center rounded-full bg-ai text-white hover:opacity-90"
        >
          {playing ? (
            <Pause size={15} />
          ) : (
            <Play size={15} className="translate-x-px" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <input
            type="range"
            min={first}
            max={last}
            step={Math.max(1, (last - first) / 400)}
            value={time}
            onChange={(e) => (
              setPlaying(false),
              setT(
                Number(e.target.value) >= last ? null : Number(e.target.value),
              )
            )}
            className="w-full accent-[var(--ai)]"
            aria-label="Point in time"
          />
          <div className="flex justify-between text-[11px] text-fg-3 tabular-nums">
            <span>{stamp(first)}</span>
            <span className="text-fg-2 font-medium">
              {t === null ? "Now" : stamp(time)}: {counts.known} things known,{" "}
              {counts.people} people, {counts.episodes} things done
            </span>
            <span>{stamp(last)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
