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
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { useOS } from "@/lib/store";
import { checkMeta } from "../checks";
import { CHAPTERS, useTour } from "@/lib/tour";
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
  const { active, chapter, paused, finished, start, stop, togglePause } = useTour();

  // ?demo in the URL starts auto mode on load, for sharing a link.
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo")) {
      const t = setTimeout(() => useTour.getState().start(), 600);
      return () => clearTimeout(t);
    }
  }, []);

  return (
    <>
      <Cursor />
      <AnimatePresence>{active && <XRay key="xray" />}</AnimatePresence>
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
                {finished ? "That's SIOS" : CHAPTERS[chapter]}
              </motion.span>
            </AnimatePresence>
            {finished ? (
              <ChipBtn onClick={start} label="Watch again">
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
