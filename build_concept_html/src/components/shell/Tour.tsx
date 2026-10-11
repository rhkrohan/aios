"use client";

import clsx from "clsx";
import {
  AppWindow,
  Bot,
  Brain,
  Cable,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Mic,
  User,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { currentVoice, setVoice } from "@/lib/demoAudio";
import { liveFetch } from "@/lib/livemachine";
import { useOS } from "@/lib/store";
import { checkMeta } from "../checks";
import { chaptersFor, useTour, type TourKind } from "@/lib/tour";
import type { PolicyCheck, Run, Step } from "@/lib/types";

// ---------------------------------------------------------------- cursor

function Cursor() {
  const { cursor, clicks } = useTour();
  return (
    <AnimatePresence>
      {cursor.visible && (
        <motion.div
          className="fixed z-[2600] pointer-events-none"
          style={{ left: cursor.x, top: cursor.y }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.span
            key={clicks}
            className="absolute -left-5 -top-5 size-10 rounded-full border-2 border-[#7d9dff]"
            initial={{ opacity: clicks ? 0.9 : 0, scale: 0.3 }}
            animate={{ opacity: 0, scale: 1.6 }}
            transition={{ duration: 0.5 }}
          />
          <svg width="26" height="26" viewBox="0 0 24 24" className="-ml-[3px] -mt-[2px] drop-shadow-[0_2px_4px_rgba(0,0,0,.35)]">
            <path d="M4 2.5 19.5 11 12.7 12.6 9.3 19.5z" fill="#fff" stroke="#111" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------- X-ray

const LAYERS: { icon: LucideIcon; key: string }[] = [
  { icon: User, key: "who" },
  { icon: Brain, key: "brain" },
  { icon: ShieldCheck, key: "broker" },
  { icon: Cable, key: "tunnel" },
  { icon: AppWindow, key: "app" },
];


function layerOf(run: Run, step: Step | undefined): number {
  if (!step) return 0;
  if (step.kind === "tool") {
    if (run.status === "waiting" || step.status === "blocked") return 2;
    if (step.status === "active") return step.broker ? 3 : 2;
    return 4;
  }
  if (step.kind === "verify") return run.status === "done" ? 4 : 1;
  return 1;
}

function verdictOf(run: Run, checks?: PolicyCheck[]) {
  if (run.status === "waiting") return { word: "Needs you", tone: "ask" as const };
  if (run.status === "done") return { word: "Done", tone: "ok" as const };
  if (run.status === "stopped" || run.status === "failed") return { word: "Blocked", tone: "fail" as const };
  if (!checks) return null;
  if (checks.some((c) => c.result === "fail")) return { word: "Block", tone: "fail" as const };
  if (checks.some((c) => c.result === "ask")) return { word: "Ask", tone: "ask" as const };
  return { word: "Allow", tone: "ok" as const };
}

const TONE = {
  pass: "bg-ok text-white",
  ask: "bg-ai text-white",
  fail: "bg-danger text-white",
  skip: "bg-fg/10 text-fg-3",
} as const;

function XRay() {
  const run = useOS((s) => s.runs[0]);
  if (!run) return null;
  const visible = run.steps.filter((s) => s.status !== "pending");
  const current = visible.find((s) => s.status === "active") ?? visible[visible.length - 1];
  const lastTool = [...visible].reverse().find((s) => s.tool && s.checks);
  const layer = run.status === "done" ? 4 : layerOf(run, current);
  const verdict = verdictOf(run, lastTool?.checks);
  const fromApp = run.principal !== "owner";
  const blockedAt = lastTool?.checks?.find((c) => c.result === "fail")?.id;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="glass fixed left-4 bottom-4 z-[2500] w-[330px] rounded-[22px] bg-glass-strong backdrop-blur-3xl border border-glass-line shadow-pop p-4"
    >
      {/* who + request */}
      <div className="flex items-center gap-2.5">
        <span className={clsx("size-8 rounded-full grid place-items-center text-white shrink-0", fromApp ? "bg-[#c46b45]" : "bg-[#2f3540]")}>
          {fromApp ? <Bot size={16} /> : <User size={16} />}
        </span>
        <span className="text-[13px] font-semibold truncate">{run.request}</span>
      </div>

      {/* layers */}
      <div className="relative mt-4 flex justify-between px-1">
        <div className="absolute left-5 right-5 top-1/2 h-[2px] -translate-y-1/2 bg-fg/10" />
        <motion.div
          className="absolute left-5 top-1/2 h-[2px] -translate-y-1/2 bg-ai"
          animate={{ width: `calc(${(layer / 4) * 100}% - ${(layer / 4) * 40}px)` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
        <motion.span
          className="absolute top-1/2 size-3 -mt-1.5 rounded-full bg-ai shadow-[0_0_12px_3px_rgba(125,157,255,.8)]"
          animate={{ left: `calc(${(layer / 4) * 100}% - ${(layer / 4) * 40}px + 14px)` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
        {LAYERS.map((l, i) => {
          const on = i === layer;
          const passed = i < layer;
          const blocked = i === 2 && verdict?.tone === "fail";
          return (
            <motion.span
              key={l.key}
              animate={{ scale: on ? 1.18 : 1 }}
              className={clsx(
                "relative z-[1] size-10 rounded-full grid place-items-center border-2 transition-colors duration-300",
                blocked ? "bg-danger border-danger text-white" : on ? "bg-ai border-ai text-white shadow-[0_0_18px_2px_rgba(125,157,255,.6)]" : passed ? "bg-surface border-ai text-ai-ink" : "bg-surface border-line text-fg-3",
              )}
            >
              {i === 0 && fromApp ? <Bot size={17} /> : <l.icon size={17} />}
            </motion.span>
          );
        })}
      </div>

      {/* broker checks */}
      <div className="mt-4 grid grid-cols-6 gap-x-1 gap-y-2">
        {lastTool?.checks?.map((c, i) => {
          const meta = checkMeta(c.id);
          return (
            <motion.div
              key={`${lastTool.id}-${c.id}`}
              initial={{ opacity: 0, y: 6, scale: 0.6 }}
              animate={{ opacity: 1, y: 0, scale: c.id === blockedAt ? 1.15 : 1 }}
              transition={{ delay: i * 0.09, type: "spring", stiffness: 400, damping: 22 }}
              className="flex flex-col items-center gap-1"
            >
              <span className={clsx("size-7 rounded-lg grid place-items-center", TONE[c.result])}>
                <meta.icon size={14} strokeWidth={2.2} />
              </span>
              <span className="text-[9.5px] font-semibold text-fg-3">{meta.word}</span>
            </motion.div>
          )
        }) ?? Array.from({ length: 12 }, (_, i) => <span key={i} className="h-7 rounded-lg bg-fg/[.06]" />)}
      </div>

      {/* verdict */}
      <AnimatePresence mode="wait">
        {verdict && (
          <motion.div
            key={`${verdict.word}-${lastTool?.id ?? ""}-${run.status}`}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1, transition: { type: "spring", stiffness: 420, damping: 22, delay: 0.6 } }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.1 } }}
            className={clsx(
              "mt-3 h-10 rounded-xl grid place-items-center text-[15px] font-bold tracking-wide uppercase",
              verdict.tone === "ok" && "bg-ok-soft text-ok",
              verdict.tone === "ask" && "bg-ai-soft text-ai-ink",
              verdict.tone === "fail" && "bg-danger-soft text-danger",
            )}
          >
            {verdict.word}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------- chip + controls

export function Tour() {
  const { active, chapter, paused, finished, start, stop, togglePause, kind, sound, xray, set } = useTour();
  const CHAPTERS = chaptersFor(kind);
  const [gate, setGate] = useState(false);

  // ?demo in the URL starts auto mode on load, for sharing a link (?demo=how for the technical tour).
  useEffect(() => {
    const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    if (q?.has("demo")) {
      const k: TourKind = q.get("demo") === "how" ? "how-it-works" : "everyday";
      // browsers only allow sound after a click: if nobody has clicked yet, ask for one
      const clicked = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive;
      const t = setTimeout(() => (k === "everyday" && !clicked ? setGate(true) : useTour.getState().start(k)), 600);
      return () => clearTimeout(t);
    }
  }, []);

  return (
    <>
      <Cursor />
      <AnimatePresence>{active && xray && <XRay key="xray" />}</AnimatePresence>
      <AnimatePresence>{active && kind === "everyday" && finished && <Finale key="finale" />}</AnimatePresence>
      <Preparing />
      <AnimatePresence>
        {gate && (
          <motion.div key="gate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[2470] grid place-items-center bg-[rgba(10,14,24,.45)] backdrop-blur-md">
            <button
              autoFocus
              onClick={() => {
                setGate(false);
                useTour.getState().start("everyday");
              }}
              className="h-14 px-7 rounded-full bg-white text-[#1d1f24] text-[17px] font-semibold inline-flex items-center gap-2.5 shadow-pop"
            >
              <Play size={16} fill="currentColor" /> Watch the demo, sound on
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {active && (
          <motion.div
            key="chip"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass fixed top-12 left-1/2 -translate-x-1/2 z-[2500] flex items-center gap-3 h-11 pl-4 pr-1.5 rounded-full bg-glass-strong backdrop-blur-3xl border border-glass-line shadow-pop"
          >
            <span className="flex gap-1">
              {CHAPTERS.map((c, i) => (
                <motion.span
                  key={c}
                  animate={{ width: i === chapter && !finished ? 22 : 7 }}
                  className={clsx("h-[7px] rounded-full", finished || i < chapter ? "bg-ai" : i === chapter ? "bg-ai" : "bg-fg/15")}
                />
              ))}
            </span>
            <AnimatePresence mode="wait">
              <motion.span
                key={finished ? "end" : chapter}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="text-[14px] font-semibold min-w-[96px]"
              >
                {finished ? (kind === "everyday" ? "Your week" : "That's SIOS") : CHAPTERS[chapter]}
              </motion.span>
            </AnimatePresence>
            {kind === "everyday" && (
              <>
                <VoicePicker />
                <ChipBtn onClick={() => set({ sound: !sound })} label={sound ? "Turn the sound off" : "Turn the sound on"}>
                  {sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
                </ChipBtn>
                <ChipBtn onClick={() => set({ xray: !xray })} label={xray ? "Hide the inside view" : "Show what happens inside"}>
                  <ShieldCheck size={15} className={xray ? "text-ai" : undefined} />
                </ChipBtn>
              </>
            )}
            {finished ? (
              <ChipBtn onClick={() => start()} label="Watch again">
                <RotateCcw size={15} />
              </ChipBtn>
            ) : (
              <ChipBtn onClick={togglePause} label={paused ? "Play" : "Pause"}>
                {paused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}
              </ChipBtn>
            )}
            <ChipBtn onClick={stop} label="Exit">
              <X size={15} />
            </ChipBtn>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ChipBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="size-8 rounded-full grid place-items-center text-fg-2 hover:bg-black/[.06] hover:text-fg [:root[data-theme=dark]_&]:hover:bg-white/10"
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- captions and the end card

/** Where each tool lives, in the words of the app you'd see. */
const APP_OF: [RegExp, string][] = [
  [/^(gmail|mail)\./, "Mail"],
  [/^files\./, "Files"],
  [/^reminders\./, "Reminders"],
  [/^(browser|forms)\./, "Browser"],
  [/^docs\./, "Compare"],
  [/^memory\./, "Memory"],
  [/^helpers\./, "Team"],
];

function Finale() {
  const startedAt = useTour((t) => t.startedAt);
  const start = useTour((t) => t.start);
  const runs = useOS((s) => s.runs).filter((r) => !r.parentId && r.startedAt >= startedAt);
  const audit = useOS((s) => s.audit).filter((e) => e.at >= startedAt);
  const openApp = useOS((s) => s.openApp);
  const steps = runs.flatMap((r) => r.steps).filter((s) => s.tool);
  const actions = steps.filter((s) => s.status === "done").length;
  const apps = new Set(steps.map((s) => APP_OF.find(([re]) => re.test(s.tool!.name))?.[1]).filter(Boolean)).size;
  const asked = audit.filter((e) => e.outcome === "asked-yes" || e.outcome === "asked-no").length;
  const blocked = audit.filter((e) => e.outcome === "blocked").length;
  const sentWithoutYou = audit.filter((e) => e.outcome === "allowed" && /^(gmail\.send|mail\.auto_reply|forms\.(submit|attach))/.test(e.tool)).length;
  const stats: [number, string][] = [
    [runs.length, runs.length === 1 ? "sentence" : "sentences"],
    [actions, `actions across ${apps} apps`],
    [asked, asked === 1 ? "question for you" : "questions for you"],
    [blocked, blocked === 1 ? "trick blocked" : "tricks blocked"],
    [sentWithoutYou, "things sent without you"],
  ];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[2450] grid place-items-center bg-[rgba(10,14,24,.35)] backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 140, damping: 18, delay: 0.15 }}
        className="glass w-[min(560px,calc(100vw-32px))] rounded-[28px] bg-glass-strong backdrop-blur-3xl border border-glass-line shadow-pop p-8"
        role="dialog"
        aria-label="Your week"
      >
        <div className="text-[13px] font-semibold text-ai-ink">Your week with SIOS</div>
        <h2 className="mt-1 text-[28px] leading-tight font-semibold tracking-[-0.02em]">You said four sentences. It did the rest.</h2>
        <ul className="mt-6 grid gap-2.5">
          {stats.map(([n, label], i) => (
            <motion.li key={label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.18 }} className="flex items-baseline gap-3">
              <span className={clsx("w-14 text-right text-[30px] font-semibold tabular-nums tracking-[-0.02em]", i === 4 ? "text-ok" : "text-fg")}>{n}</span>
              <span className="text-[16px] text-fg-2">{label}</span>
            </motion.li>
          ))}
        </ul>
        <div className="mt-7 flex gap-2">
          <button
            onClick={() => {
              useTour.getState().stop();
              openApp("security", { page: "decisions" });
            }}
            className="h-10 px-4 rounded-full bg-ai text-white text-[14px] font-medium"
          >
            See everything it did
          </button>
          <button onClick={() => start()} className="h-10 px-4 rounded-full border border-line text-[14px] font-medium inline-flex items-center gap-1.5">
            <RotateCcw size={14} /> Watch again
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------- act cards, getting ready, the narrator's voice

function Preparing() {
  const p = useTour((t) => t.preparing);
  return (
    <AnimatePresence>
      {p && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[2470] grid place-items-center bg-[rgba(10,14,24,.45)] backdrop-blur-md">
          <div className="w-[320px] text-center text-white">
            <div className="text-[17px] font-medium">Getting the narrator ready</div>
            <div className="mt-1 text-[13px] text-white/70">Only the first time. After this it starts right away.</div>
            <div className="mt-4 h-1.5 rounded-full bg-white/20 overflow-hidden">
              <motion.div className="h-full bg-white" animate={{ width: `${Math.round((100 * p.done) / Math.max(1, p.of))}%` }} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface NarratorVoice {
  id: string;
  name: string;
  about: string;
  preview?: string;
}

/** Choose the narrator from the voices on your ElevenLabs account that suit it. */
function VoicePicker() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<NarratorVoice[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(currentVoice());
  const [fallback, setFallback] = useState<string | null>(null);
  const toggle = () => {
    setOpen((o) => !o);
    if (!list)
      liveFetch("/api/audio?voices")
        .then((r) => r.json())
        .then((d) => {
          setList(d.voices ?? []);
          setFallback(d.default ?? null);
        })
        .catch(() => setList([]));
  };
  const current = chosen ?? fallback;
  return (
    <div className="relative">
      <ChipBtn onClick={toggle} label="Choose the narrator's voice">
        <Mic size={15} />
      </ChipBtn>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="glass absolute right-0 top-11 w-72 max-h-[60vh] overflow-auto scroll-thin rounded-2xl bg-glass-strong backdrop-blur-3xl border border-glass-line shadow-pop p-1.5"
            role="listbox"
            aria-label="Narrator voices"
          >
            <div className="px-2.5 pt-1.5 pb-1 text-[11.5px] text-fg-3">Voices from your ElevenLabs account. The next line uses the one you pick.</div>
            {list === null && <div className="px-2.5 py-3 text-[13px] text-fg-3">Loading voices…</div>}
            {list?.length === 0 && <div className="px-2.5 py-3 text-[13px] text-fg-3">No voices. Is ELEVENLABS_API_KEY in .env.local?</div>}
            {list?.map((v) => (
              <div key={v.id} className={clsx("flex items-center gap-2 rounded-xl px-2.5 py-2", current === v.id ? "bg-ai-soft" : "hover:bg-black/[.04]")}>
                <button
                  role="option"
                  aria-selected={current === v.id}
                  onClick={() => {
                    setVoice(v.id);
                    setChosen(v.id);
                  }}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="text-[13.5px] font-medium">{v.name}</div>
                  <div className="text-[11.5px] text-fg-3 truncate">{v.about}</div>
                </button>
                {v.preview && (
                  <button onClick={() => void new Audio(v.preview).play().catch(() => {})} aria-label={`Hear ${v.name}`} title="Hear a sample" className="size-7 grid place-items-center rounded-full text-fg-2 hover:bg-black/[.06]">
                    <Play size={12} fill="currentColor" />
                  </button>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
