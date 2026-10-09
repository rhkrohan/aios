"use client";

// Threads: your files as a map of where they came from and what was made from
// them. Click a file and its whole thread lights up, with data flowing along it.
// Drag any file onto the orb to ask about it.

import clsx from "clsx";
import { AppWindow, Bot, CircleHelp, Globe, Mail, Search, Send, ShieldX, Sparkles, User, X, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { BRAND } from "@/lib/brand";
import { useOS } from "@/lib/store";
import { NODE_H, buildThreads, threadOf, type TEdge, type TGraph, type TNode } from "@/lib/threads";
import { BrandMark } from "../icons/Icons";
import { Button, FileGlyph } from "../ui";
import { dirLabel, originText } from "./model";

const TONE_ICON: Record<string, LucideIcon> = { you: User, email: Mail, web: Globe, app: AppWindow, unknown: CircleHelp, sent: Send, blocked: ShieldX };
const TONE_CLASS: Record<string, string> = {
  you: "bg-accent-soft text-accent",
  email: "bg-warn-soft text-warn",
  web: "bg-warn-soft text-warn",
  ai: "bg-ai-soft text-ai-ink",
  app: "bg-ai-soft text-ai-ink",
  unknown: "bg-fg/[.06] text-fg-3",
  sent: "bg-ok-soft text-ok",
  blocked: "bg-danger-soft text-danger",
};

export function Threads({ onReveal, onLook }: { onReveal: (dir: string, id: string) => void; onLook: (id: string) => void }) {
  const fs = useOS((s) => s.fs);
  const mail = useOS((s) => s.mail);
  const runs = useOS((s) => s.runs);
  const setAskFiles = useOS((s) => s.setAskFiles);
  const setCommandOpen = useOS((s) => s.setCommandOpen);
  const [onlyThreads, setOnlyThreads] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const g = useMemo(() => buildThreads({ fs, mail, runs, onlyThreads }), [fs, mail, runs, onlyThreads]);
  const focus = sel && g.nodes.some((n) => n.id === sel) ? sel : null;
  const lit = useMemo(() => (focus ? threadOf(g, focus) : hover ? threadOf(g, hover) : null), [g, focus, hover]);
  const match = q.trim().toLowerCase();
  const byId = useMemo(() => new Map(g.nodes.map((n) => [n.id, n])), [g]);
  const selNode = focus ? byId.get(focus) : undefined;
  const threadCount = g.edges.filter((e) => e.kind !== "origin").length;

  const ask = (n: TNode) => {
    if (!n.item || !n.dir) return;
    setAskFiles([{ id: n.item.id, dir: n.dir, name: n.item.name }]);
    setCommandOpen(true);
  };

  return (
    <div className="flex-1 min-h-0 min-w-0 flex">
      <div className="flex-1 min-w-0 flex flex-col">
        {/* controls */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 shrink-0">
          <div className="flex shrink-0 rounded-[10px] bg-surface-3 p-0.5 text-[12.5px] font-medium">
            {[
              { on: true, label: "With threads" },
              { on: false, label: "All files" },
            ].map((o) => (
              <button
                key={o.label}
                onClick={() => setOnlyThreads(o.on)}
                className={clsx("h-7 px-2.5 rounded-[8px] whitespace-nowrap transition-colors", onlyThreads === o.on ? "bg-surface shadow-sm text-fg" : "text-fg-2 hover:text-fg")}
              >
                {o.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 h-8 px-2.5 rounded-[10px] bg-surface-3 text-[12.5px] w-48 min-w-24 shrink">
            <Search size={13} className="text-fg-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find in threads" className="bg-transparent outline-none flex-1 min-w-0" aria-label="Find in threads" />
          </label>
          <span className="ml-auto text-[12px] text-fg-3 truncate min-w-0">Drag a file onto the orb to ask about it</span>
        </div>

        {/* the map */}
        <div className="flex-1 min-h-0 overflow-auto scroll-thin" onClick={() => setSel(null)}>
          {g.nodes.length === 0 ? (
            <Empty />
          ) : (
            <div className="relative mx-4 mb-6" style={{ width: g.width, height: g.height }}>
              {g.columns.map((c) => (
                <div key={c.x} className="absolute top-0 text-[11.5px] font-semibold text-fg-3" style={{ left: c.x, width: c.w }}>
                  {c.title}
                </div>
              ))}
              <Edges g={g} byId={byId} lit={lit?.edges ?? null} />
              {g.nodes.map((n) => (
                <Node
                  key={n.id}
                  n={n}
                  selected={focus === n.id}
                  dim={(!!lit && !lit.nodes.has(n.id)) || (!!match && !n.label.toLowerCase().includes(match))}
                  onClick={() => setSel(n.id === focus ? null : n.id)}
                  onOpen={() => n.item && onLook(n.item.id)}
                  onHover={(h) => setHover(h ? n.id : null)}
                />
              ))}
            </div>
          )}
          {onlyThreads && g.nodes.length > 0 && threadCount < 6 && (
            <p className="mx-4 mb-6 text-[12.5px] text-fg-3 max-w-md">
              Threads grow as you and your AIs make things. Try &ldquo;Prepare the Q3 board packet and send it to the team&rdquo; and watch a long one appear.
            </p>
          )}
        </div>
      </div>

      {/* the story of the selected thread */}
      <AnimatePresence>
        {selNode && lit && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            className="shrink-0 border-l border-line bg-surface-2/60 overflow-hidden"
          >
            <Story node={selNode} thread={lit.nodes} byId={byId} onClose={() => setSel(null)} onReveal={onReveal} onAsk={ask} />
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

function Node({ n, selected, dim, onClick, onOpen, onHover }: { n: TNode; selected: boolean; dim: boolean; onClick: () => void; onOpen: () => void; onHover: (h: boolean) => void }) {
  const it = n.item;
  const Icon = n.tone ? TONE_ICON[n.tone] : undefined;
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: dim ? 0.28 : 1, scale: 1, left: n.x, top: n.y }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      style={{ position: "absolute", width: n.w, height: NODE_H }}
      draggable={!!it}
      onDragStart={(e) => {
        if (!it || !n.dir) return;
        const ev = e as unknown as React.DragEvent;
        ev.dataTransfer.setData("application/x-sios", JSON.stringify([{ id: it.id, dir: n.dir }]));
        ev.dataTransfer.effectAllowed = "copyMove";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
        // once the story panel has opened, bring the file to the middle of the map
        const el = e.currentTarget as HTMLElement;
        setTimeout(() => el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }), 380);
      }}
      onDoubleClick={onOpen}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      role="button"
      aria-label={n.label}
      aria-pressed={selected}
      className={clsx(
        "flex items-center gap-2 px-2 rounded-xl border text-[12.5px] cursor-pointer select-none transition-[box-shadow,border-color]",
        selected ? "border-ai bg-surface shadow-[0_0_0_3px_rgba(79,123,247,.18)]" : "border-line bg-surface hover:border-ai-line",
        n.kind === "source" && "rounded-full",
        n.tone === "blocked" && "border-danger/40",
      )}
    >
      {it ? (
        <FileGlyph kind={it.kind} name={it.name} size={18} />
      ) : n.tone === "ai" ? (
        <span className={clsx("size-5 rounded-full grid place-items-center", TONE_CLASS.ai)}>
          <BrandMark size={12} />
        </span>
      ) : Icon ? (
        <span className={clsx("size-5 rounded-full grid place-items-center", TONE_CLASS[n.tone ?? "unknown"])}>
          <Icon size={12} strokeWidth={2.2} />
        </span>
      ) : null}
      <span className={clsx("truncate flex-1 min-w-0", n.kind !== "file" && "font-medium", n.tone === "blocked" && "text-danger")}>{n.label}</span>
      {n.kind === "source" && <span className="text-[11px] text-fg-3 tabular-nums">{n.count}</span>}
      {it && <Marks labels={it.labels} untrusted={it.trust === "untrusted"} />}
    </motion.div>
  );
}

const LABEL_DOT: Record<string, string> = { Finance: "bg-[#c99a2e]", Sensitive: "bg-danger", Personal: "bg-[#8a6d9e]", Work: "bg-accent" };

function Marks({ labels, untrusted }: { labels?: string[]; untrusted: boolean }) {
  return (
    <span className="flex items-center gap-0.5 shrink-0" title={[...(labels ?? []), untrusted ? "untrusted" : ""].filter(Boolean).join(", ")}>
      {(labels ?? []).map((l) => (
        <span key={l} className={clsx("size-1.5 rounded-full", LABEL_DOT[l] ?? "bg-fg-3")} />
      ))}
      {untrusted && <span className="ml-0.5 text-[10px] font-bold text-warn">!</span>}
    </span>
  );
}

function Edges({ g, byId, lit }: { g: TGraph; byId: Map<string, TNode>; lit: Set<string> | null }) {
  return (
    <svg className="absolute inset-0 pointer-events-none overflow-visible" width={g.width} height={g.height} aria-hidden>
      {/* quiet lines first, lit ones on top */}
      {[...g.edges].sort((a, b) => Number(!!lit?.has(a.id)) - Number(!!lit?.has(b.id))).map((e) => (
        <EdgePath key={e.id} e={e} a={byId.get(e.from)} b={byId.get(e.to)} on={!!lit?.has(e.id)} dim={!!lit && !lit.has(e.id)} />
      ))}
    </svg>
  );
}

function EdgePath({ e, a, b, on, dim }: { e: TEdge; a?: TNode; b?: TNode; on: boolean; dim: boolean }) {
  if (!a || !b) return null;
  const x1 = a.x + a.w;
  const y1 = a.y + NODE_H / 2;
  const x2 = b.x;
  const y2 = b.y + NODE_H / 2;
  const dx = Math.max(24, (x2 - x1) / 2);
  const d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
  const color = e.kind === "blocked" ? "var(--danger)" : e.kind === "sent" ? "var(--ok)" : on ? "var(--ai)" : "var(--fg-3)";
  return (
    <g style={{ opacity: dim ? 0.12 : on ? 1 : e.kind === "origin" ? 0.22 : 0.45, transition: "opacity .25s" }}>
      <path d={d} fill="none" stroke={color} strokeWidth={on ? 2 : 1.25} strokeDasharray={e.kind === "blocked" ? "4 4" : undefined} />
      {on && e.kind !== "blocked" && <path d={d} fill="none" stroke={color} strokeWidth={3} className="thread-flow" strokeLinecap="round" />}
      {e.kind === "blocked" && <circle cx={x2 - 2} cy={y2} r={3} fill="var(--danger)" />}
    </g>
  );
}

function Story({
  node,
  thread,
  byId,
  onClose,
  onReveal,
  onAsk,
}: {
  node: TNode;
  thread: Set<string>;
  byId: Map<string, TNode>;
  onClose: () => void;
  onReveal: (dir: string, id: string) => void;
  onAsk: (n: TNode) => void;
}) {
  // left to right, top to bottom: the order the data travelled
  const steps = [...thread].map((id) => byId.get(id)!).filter(Boolean).sort((a, b) => a.x - b.x || a.y - b.y);
  const it = node.item;
  const inherited = it?.labels ?? [];
  return (
    <div className="w-[300px] h-full flex flex-col">
      <div className="flex items-start gap-2 px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] font-semibold text-fg-3">Thread</div>
          <div className="text-[15px] font-semibold truncate">{node.label}</div>
        </div>
        <button onClick={onClose} aria-label="Close thread" className="size-7 rounded-lg grid place-items-center text-fg-3 hover:bg-surface-3">
          <X size={15} />
        </button>
      </div>
      {it && (
        <div className="px-4 pb-3 flex flex-wrap gap-1">
          {inherited.map((l) => (
            <span key={l} className="h-6 px-2 rounded-full bg-fg/[.06] text-[11.5px] text-fg-2 inline-flex items-center gap-1">
              <span className={clsx("size-1.5 rounded-full", LABEL_DOT[l] ?? "bg-fg-3")} />
              {l}
            </span>
          ))}
          {it.trust === "untrusted" && <span className="h-6 px-2 rounded-full bg-warn-soft text-warn text-[11.5px] inline-flex items-center">Untrusted</span>}
        </div>
      )}
      <ol className="flex-1 overflow-auto scroll-thin px-4 pb-3 relative">
        {steps.map((s, i) => (
          <li key={s.id} className="relative pl-6 pb-3">
            {i < steps.length - 1 && <span className="absolute left-[7px] top-4 bottom-0 w-px bg-ai/30" />}
            <span className={clsx("absolute left-0 top-1 size-[15px] rounded-full border-2", s.id === node.id ? "bg-ai border-ai" : s.tone === "blocked" ? "bg-danger border-danger" : "bg-surface border-ai/50")} />
            <div className={clsx("text-[13px] leading-snug", s.id === node.id ? "font-semibold" : "font-medium", s.tone === "blocked" && "text-danger")}>{s.label}</div>
            <div className="text-[12px] text-fg-2 leading-snug mt-0.5">{storyLine(s, (id) => byId.get(`f:${id}`)?.label)}</div>
          </li>
        ))}
      </ol>
      {it && node.dir && (
        <div className="px-4 py-3 border-t border-line flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => onReveal(node.dir!, it.id)}>
            Show in folder
          </Button>
          <Button size="sm" onClick={() => onAsk(node)}>
            <Sparkles size={13} /> Ask about it
          </Button>
        </div>
      )}
    </div>
  );
}

function storyLine(n: TNode, nameOf: (id: string) => string | undefined): string {
  if (n.kind === "source") {
    if (n.tone === "you") return "Things you made or saved yourself.";
    if (n.tone === "email") return "Attachments from email. Untrusted until you say otherwise.";
    if (n.tone === "web") return "Downloads from the web. Untrusted until you say otherwise.";
    if (n.tone === "ai") return `Made by ${BRAND.name} for one of your goals.`;
    return `Made by ${n.label}.`;
  }
  if (n.kind === "out") return n.tone === "blocked" ? "An AI tried to send this out. The broker blocked it." : `${n.sub ?? "Email"}. Checked by the broker, approved by you.`;
  const it = n.item!;
  const where = `In ${dirLabel(n.dir ?? "~")}.`;
  if (!it.from?.length) return `${originText(it)}. ${where}`;
  const by = it.origin?.by === "you" ? "you" : it.origin?.by === "SIOS" ? BRAND.name : (it.origin?.by ?? "someone");
  const parents = it.from.map(nameOf).filter(Boolean).join(" and ");
  const inherited = it.labels?.length ? ` Carries ${it.labels.join(", ")}${it.trust === "untrusted" ? ", untrusted" : ""} from them.` : "";
  return `Made by ${by} from ${parents || "other files"}.${inherited} ${where}`;
}

function Empty() {
  return (
    <div className="h-full grid place-items-center text-center px-8">
      <div>
        <Bot size={28} className="mx-auto text-fg-3" />
        <p className="mt-2 text-[14px] font-medium">No threads yet</p>
        <p className="mt-1 text-[12.5px] text-fg-3 max-w-xs">When a file is made from other files, by you or an AI, the thread shows up here.</p>
      </div>
    </div>
  );
}
