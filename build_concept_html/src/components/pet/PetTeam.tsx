"use client";

// The pet team: helper pets that follow the leader like ducklings. Each one has
// a long-running job (watch a folder, run on a schedule, or one big job) and is
// its own AI identity, "Pip (helper)", with its own passes and log lines. When a
// run finishes, the helper hops over to the leader with the news.

import clsx from "clsx";
import { Clock, Eye, Pause, Play, Plus, RotateCw, Sparkles, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { liveFetch, switchMachine } from "@/lib/livemachine";
import { usePet } from "@/lib/pet";
import { useOS } from "@/lib/store";
import { HELPER_NAMES, useTeam, type HelperStatus } from "@/lib/team";
import { useTour } from "@/lib/tour";
import { Button } from "../ui";
import { HelperBody, Hearts, PASTELS } from "./PetFace";

const LEADER = 76;
const SIZE = 40;

async function brainCtl(action: string, params: Record<string, unknown> = {}) {
  const r = await liveFetch("/api/live/brain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...params }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error ?? "brain-d refused");
  return j.ok;
}

function jobLine(h: HelperStatus["helper"]) {
  if (h.kind === "watch") return `Watches ${h.folder}: ${h.request}`;
  if (h.kind === "every") return `Every ${h.every_min >= 1440 ? `${Math.round(h.every_min / 1440)} day` : h.every_min >= 60 ? `${Math.round(h.every_min / 60)} h` : `${h.every_min} min`}: ${h.request}`;
  return `One big job: ${h.request}`;
}

function ago(secs: number) {
  const d = Date.now() / 1000 - secs;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  return `${Math.round(d / 86400)} d ago`;
}

export function PetTeam() {
  const pet = usePet();
  const live = useOS((s) => s.settings.liveMachine);
  const tour = useTour((s) => s.active);
  const team = useTeam();

  // keep the team in step with brain-d, and announce finished runs once
  useEffect(() => {
    if (!live) {
      useTeam.getState().set({ helpers: [] });
      return;
    }
    let alive = true;
    const pull = async () => {
      try {
        const list: HelperStatus[] = (await brainCtl("helpers_list")) ?? [];
        if (!alive) return;
        const t = useTeam.getState();
        const announced = { ...t.announced };
        for (const s of list) {
          const n = s.helper.runs.length;
          if (announced[s.helper.id] === undefined) announced[s.helper.id] = n; // don't replay old news
          else if (n > announced[s.helper.id]) {
            announced[s.helper.id] = n;
            const r = s.helper.runs[0];
            report(s.helper.id, s.helper.name, r.text, r.failed);
          }
        }
        useTeam.getState().set({ helpers: list, announced });
      } catch {
        /* brain-d not up yet */
      }
    };
    void pull();
    const t = setInterval(pull, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [live]);

  if (!pet.visible || tour) return null;

  // the ducklings: in a little row behind the leader, wherever it goes
  const spots = team.helpers.map((_, i) => ({ x: pet.x - (i + 1) * (SIZE + 10) + 6, y: pet.y + LEADER - SIZE + 4 }));

  return (
    <>
      {team.helpers.map((s, i) => (
        <HelperPet key={s.helper.id} s={s} spot={spots[i]} leader={{ x: pet.x, y: pet.y }} index={i} />
      ))}

      {/* the little plus: make a new helper */}
      <motion.button
        className="fixed z-[991] size-6 rounded-full grid place-items-center bg-white text-ai-ink shadow-[0_3px_10px_-2px_rgba(60,60,200,.45)] ring-1 ring-ai/20 hover:scale-110 transition-transform"
        animate={{ left: pet.x - 10, top: pet.y - 8 }}
        transition={pet.held ? { duration: 0 } : { type: "spring", stiffness: 70, damping: 14 }}
        onClick={() => team.set({ creating: !team.creating, open: null })}
        aria-label="Make a new helper pet"
        title="Make a new helper pet"
      >
        <Plus size={14} strokeWidth={2.6} />
      </motion.button>

      <AnimatePresence>{team.creating && <NewHelper key="new" live={live} anchor={{ x: pet.x, y: pet.y }} />}</AnimatePresence>
      <AnimatePresence>{team.open && <ReportCard key={team.open} s={team.helpers.find((h) => h.helper.id === team.open)} anchor={{ x: pet.x, y: pet.y }} />}</AnimatePresence>
    </>
  );
}

/** A finished run: the helper hops to the leader, the leader says it out loud. */
function report(id: string, name: string, text: string, failed: boolean) {
  useTeam.getState().set({ reporting: { id, text } });
  setTimeout(() => {
    usePet.getState().say(`${name}: ${text.length > 70 ? text.slice(0, 68) + "..." : text}`);
    usePet.getState().setMood(failed ? "sad" : "happy");
  }, 700);
  setTimeout(() => {
    useTeam.getState().set({ reporting: null });
    usePet.getState().say(null);
    usePet.getState().setMood("idle");
  }, 6000);
  useOS.setState((st) => ({
    notifications: [{ id: `helper-${id}-${Date.now()}`, title: `${name} reports: ${text.slice(0, 110)}`, tone: (failed ? "warn" : "ok") as "ok" | "warn", at: Date.now() }, ...st.notifications].slice(0, 30),
  }));
}

function HelperPet({ s, spot, leader, index }: { s: HelperStatus; spot: { x: number; y: number }; leader: { x: number; y: number }; index: number }) {
  const reporting = useTeam((t) => t.reporting?.id === s.helper.id);
  const set = useTeam((t) => t.set);
  const [hearts, setHearts] = useState<number[]>([]);
  const mood = reporting ? "happy" : s.state === "working" ? "working" : s.state === "waiting" ? "waiting" : s.state === "paused" ? "paused" : "idle";
  // hop over to the leader with news, then back in line
  const at = reporting ? { x: leader.x - SIZE + 4, y: leader.y - 6 } : spot;
  return (
    <motion.div
      className="fixed z-[989] select-none"
      style={{ width: SIZE, height: SIZE }}
      animate={{ left: at.x, top: at.y }}
      transition={{ type: "spring", stiffness: 60 - index * 6, damping: 12, mass: 0.8 + index * 0.1 }}
    >
      <span className="absolute left-1/2 -translate-x-1/2 rounded-[50%] bg-black/20 blur-[2px]" style={{ bottom: -7, width: 26, height: 6 }} />
      <motion.button
        onClick={() => {
          const b = [Date.now(), Date.now() + 1];
          setHearts(b);
          setTimeout(() => setHearts((h) => h.filter((x) => !b.includes(x))), 1400);
          set({ open: useTeam.getState().open === s.helper.id ? null : s.helper.id, creating: false });
        }}
        aria-label={`${s.helper.name}, ${s.state}`}
        title={`${s.helper.name}: ${jobLine(s.helper)}`}
        className="relative block"
        style={{ width: SIZE, height: SIZE }}
        animate={
          reporting
            ? { y: [0, -18, 0, -10, 0], rotate: [0, -10, 10, 0] }
            : mood === "working"
              ? { y: [0, -5, 0], rotate: [-5, 5, -5] }
              : mood === "paused"
                ? { scaleX: [1, 1.04, 1], scaleY: [1, 0.96, 1] }
                : { y: [0, -4, 0, 0], scaleX: [1, 0.95, 1.06, 1], scaleY: [1, 1.06, 0.94, 1] }
        }
        transition={{ duration: reporting ? 0.9 : mood === "working" ? 0.7 : 2.2 + index * 0.3, repeat: reporting ? 2 : Infinity, ease: "easeInOut", delay: index * 0.15 }}
      >
        <HelperBody size={SIZE} color={s.helper.color} mood={mood} busy={mood === "working"} />
        {/* what it's up to */}
        {mood === "working" && (
          <motion.span className="absolute -top-2 -right-2 size-4 rounded-full bg-white grid place-items-center shadow" animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
            <RotateCw size={10} className="text-ai-ink" />
          </motion.span>
        )}
        {mood === "waiting" && (
          <motion.span className="absolute -top-3 right-0 text-[13px] font-black text-ai-ink" animate={{ y: [0, -3, 0] }} transition={{ duration: 0.8, repeat: Infinity }}>
            ?
          </motion.span>
        )}
        {reporting && (
          <motion.span className="absolute -top-3 -left-2 text-[#ffc94d]" animate={{ scale: [0.6, 1.2, 1], rotate: [0, 20, 0] }} transition={{ duration: 0.8, repeat: 3 }}>
            <Sparkles size={14} fill="currentColor" />
          </motion.span>
        )}
        <Hearts burst={hearts} />
      </motion.button>
      <span className="absolute left-1/2 -translate-x-1/2 -bottom-[22px] whitespace-nowrap text-[10.5px] font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">{s.helper.name}</span>
    </motion.div>
  );
}

/** Popover placement next to the leader, kept on screen. */
function place(anchor: { x: number; y: number }, w: number, h: number) {
  const W = typeof window === "undefined" ? 1600 : window.innerWidth;
  const H = typeof window === "undefined" ? 960 : window.innerHeight;
  return { left: Math.max(12, Math.min(W - w - 12, anchor.x - w + LEADER)), top: Math.max(48, Math.min(H - h - 100, anchor.y - h - 18)) };
}

function NewHelper({ live, anchor }: { live: boolean; anchor: { x: number; y: number } }) {
  const set = useTeam((t) => t.set);
  const helpers = useTeam((t) => t.helpers);
  const taken = useMemo(() => helpers.map((h) => h.helper.name), [helpers]);
  const fs = useOS((s) => s.fs);
  const pushToast = useOS((s) => s.pushToast);
  const folders = useMemo(() => Object.keys(fs).filter((d) => d !== "~" && d !== "~/Trash").map((d) => d.replace(/^~\//, "")).sort(), [fs]);
  const [name, setName] = useState(() => HELPER_NAMES.find((n) => !taken.includes(n)) ?? `Helper ${taken.length + 1}`);
  const [color, setColor] = useState(Object.keys(PASTELS)[taken.length % Object.keys(PASTELS).length]);
  const [kind, setKind] = useState<"watch" | "every" | "once">("watch");
  const [folder, setFolder] = useState("Downloads");
  const [every, setEvery] = useState(60);
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const examples = { watch: "Sort new files into Documents/Finance and Documents/Notes", every: "Move anything older than a week in Downloads to the Trash and tell me what moved", once: "Organize everything in Downloads by type and year" };
  const pos = place(anchor, 360, live ? 470 : 200);

  const create = async () => {
    setBusy(true);
    try {
      await brainCtl("helpers_add", { name, color, kind, folder, every_min: every, request: request.trim() || examples[kind] });
      pushToast({ title: `${name} joined the team`, body: kind === "once" ? "Starting on the job now." : "It reports back when it has news.", tone: "ok" });
      set({ creating: false });
    } catch (e) {
      pushToast({ title: "Couldn't make that helper", body: e instanceof Error ? e.message : String(e), tone: "warn" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.97 }}
      className="glass fixed z-[995] w-[360px] rounded-3xl bg-glass-strong backdrop-blur-2xl border border-glass-line shadow-pop p-4"
      style={pos}
      role="dialog"
      aria-label="New helper"
    >
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-semibold flex-1">A new helper</span>
        <button aria-label="Close" onClick={() => set({ creating: false })} className="size-7 grid place-items-center rounded-full text-fg-3 hover:bg-fg/[.07]">
          <X size={15} />
        </button>
      </div>
      {!live ? (
        <div className="mt-2 text-[13px] text-fg-2">
          Helpers do real work, so they live on the live machine.
          <Button className="mt-3 w-full" onClick={() => void switchMachine(true)}>
            Switch to the live machine
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-3 text-[13px]">
          <div className="flex items-center gap-3">
            <span className="relative block shrink-0" style={{ width: 44, height: 44 }}>
              <HelperBody size={44} color={color} mood="happy" busy={false} />
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" maxLength={20} className="flex-1 min-w-0 h-9 rounded-xl border border-line bg-surface px-3 font-semibold" />
          </div>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Color">
            {Object.entries(PASTELS).map(([k, p]) => (
              <button key={k} role="radio" aria-checked={color === k} aria-label={p.label} onClick={() => setColor(k)} className={clsx("size-7 rounded-full ring-2 transition-transform", color === k ? "ring-fg scale-110" : "ring-transparent")} style={{ background: p.ring }} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-fg/[.06] p-1" role="radiogroup" aria-label="Job">
            {([
              { k: "watch", label: "Watch a folder", icon: Eye },
              { k: "every", label: "On a schedule", icon: Clock },
              { k: "once", label: "One big job", icon: Sparkles },
            ] as const).map((o) => (
              <button key={o.k} role="radio" aria-checked={kind === o.k} onClick={() => setKind(o.k)} className={clsx("h-14 rounded-lg flex flex-col items-center justify-center gap-1 text-[11.5px] font-medium", kind === o.k ? "bg-surface shadow-sm text-fg" : "text-fg-2")}>
                <o.icon size={15} />
                {o.label}
              </button>
            ))}
          </div>
          {kind === "watch" && (
            <label className="flex items-center gap-2">
              <span className="text-fg-3 w-20">Watch</span>
              <select value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Folder to watch" className="flex-1 h-9 rounded-xl border border-line bg-surface px-2">
                {folders.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
          )}
          {kind === "every" && (
            <label className="flex items-center gap-2">
              <span className="text-fg-3 w-20">Every</span>
              <select value={every} onChange={(e) => setEvery(Number(e.target.value))} aria-label="How often" className="flex-1 h-9 rounded-xl border border-line bg-surface px-2">
                {[
                  [1, "minute (for testing)"],
                  [15, "15 minutes"],
                  [60, "hour"],
                  [1440, "day"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          )}
          <textarea value={request} onChange={(e) => setRequest(e.target.value)} rows={3} placeholder={examples[kind]} aria-label="The job" className="w-full rounded-xl border border-line bg-surface p-2.5 text-[13px]" />
          <p className="text-[11.5px] text-fg-3 leading-snug">It works as &ldquo;{name || "Helper"} (helper)&rdquo;: its own passes, its own lines in the log. It asks you before anything new, unless a standing rule covers it.</p>
          <Button className="w-full" disabled={busy || !name.trim()} onClick={create}>
            <Plus size={14} /> Add {name || "helper"} to the team
          </Button>
        </div>
      )}
    </motion.div>
  );
}

function ReportCard({ s, anchor }: { s?: HelperStatus; anchor: { x: number; y: number } }) {
  const set = useTeam((t) => t.set);
  const pushToast = useOS((s2) => s2.pushToast);
  if (!s) return null;
  const h = s.helper;
  const pos = place(anchor, 340, 380);
  const act = async (action: string, params: Record<string, unknown>, done?: string) => {
    try {
      await brainCtl(action, params);
      if (done) pushToast({ title: done, tone: "info" });
    } catch (e) {
      pushToast({ title: "Not now", body: e instanceof Error ? e.message : String(e), tone: "warn" });
    }
  };
  const stateWord = { idle: "Resting, ready for its next turn", working: "Working on it right now", waiting: "Waiting for your OK", done: "Just finished", paused: "Paused" }[s.state];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.97 }}
      className="glass fixed z-[995] w-[340px] rounded-3xl bg-glass-strong backdrop-blur-2xl border border-glass-line shadow-pop p-4"
      style={pos}
      role="dialog"
      aria-label={`${h.name}'s report card`}
    >
      <div className="flex items-center gap-3">
        <span className="relative block shrink-0" style={{ width: 44, height: 44 }}>
          <HelperBody size={44} color={h.color} mood={s.state === "working" ? "working" : s.state === "paused" ? "paused" : "happy"} busy={s.state === "working"} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold">{h.name}</div>
          <div className="text-[12px] text-fg-2">{stateWord}</div>
        </div>
        <button aria-label="Close" onClick={() => set({ open: null })} className="size-7 grid place-items-center rounded-full text-fg-3 hover:bg-fg/[.07]">
          <X size={15} />
        </button>
      </div>
      <div className="mt-3 rounded-2xl bg-fg/[.05] px-3 py-2 text-[12.5px] leading-snug">{jobLine(h)}</div>
      <div className="mt-3 text-[11.5px] font-semibold text-fg-3">Reports</div>
      <ul className="mt-1.5 max-h-[150px] overflow-auto scroll-thin space-y-1.5">
        {h.runs.length === 0 && <li className="text-[12.5px] text-fg-3">Nothing yet. It reports here after each run.</li>}
        {h.runs.map((r) => (
          <li key={r.goal + r.at} className="flex gap-2 text-[12.5px]">
            <span className={clsx("mt-1 size-2 rounded-full shrink-0", r.failed ? "bg-warn" : "bg-ok")} />
            <span className="min-w-0">
              <span className="text-fg">{r.text}</span>
              <span className="block text-[11px] text-fg-3">{ago(r.at)}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-1.5">
        <Button size="sm" disabled={s.state === "working" || s.state === "waiting"} onClick={() => act("helpers_run_now", { id: h.id }, `${h.name} is on it`)}>
          <Play size={12} /> Run now
        </Button>
        <Button size="sm" variant="secondary" onClick={() => act("helpers_update", { id: h.id, active: !h.active }, h.active ? `${h.name} is taking a nap` : `${h.name} is back at work`)}>
          {h.active ? <Pause size={12} /> : <Play size={12} />} {h.active ? "Pause" : "Resume"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => act("helpers_remove", { id: h.id }, `${h.name} retired`).then(() => set({ open: null }))}>
          <Trash2 size={12} /> Retire
        </Button>
      </div>
    </motion.div>
  );
}
