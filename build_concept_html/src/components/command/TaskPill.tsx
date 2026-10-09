"use client";

// A quiet, single-line view of the task that's running. Sits just above the
// bar. Click it to expand into the full step-by-step view.

import clsx from "clsx";
import { ArrowUpRight, Check, ChevronUp, CircleSlash, Undo2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { undoRun } from "@/lib/engine";
import { principalName } from "@/lib/policy";
import { useOS } from "@/lib/store";
import type { Run } from "@/lib/types";
import { StringOrb } from "../icons/StringOrb";

const LINGER = 7000; // how long a finished task stays visible

function childLabel(r: Run) {
  if (r.waitingOn) return `waiting, ${r.waitingOn}`;
  const s = r.steps.filter((x) => x.status !== "pending");
  const cur = s.find((x) => x.status === "active") ?? s[s.length - 1];
  return (cur?.status === "active" ? cur.label : cur?.doneLabel ?? cur?.label) ?? "starting";
}

export function TaskPill() {
  // the newest top-level goal; sub-goals show through it
  const run = useOS((s) => s.runs.find((r) => !r.parentId));
  const child = useOS((s) => (run ? s.runs.find((r) => r.parentId === run.id && (r.status === "running" || r.status === "waiting")) : undefined));
  const commandOpen = useOS((s) => s.commandOpen);
  const setOpen = useOS((s) => s.setCommandOpen);
  const setFocusedRun = useOS((s) => s.setFocusedRun);
  const openApp = useOS((s) => s.openApp);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  const ended = !!run && ["done", "stopped", "failed"].includes(run.status);

  // re-check after the linger time so the pill can fade out on its own
  useEffect(() => {
    if (!run?.endedAt) return;
    const t = setTimeout(() => setNow(Date.now()), LINGER + 50);
    return () => clearTimeout(t);
  }, [run?.endedAt]);

  const expired = ended && run?.endedAt !== undefined && now - run.endedAt > LINGER && now > 0;
  const show = !!run && !commandOpen && dismissed !== run.id && !expired;

  const visible = run ? run.steps.filter((s) => s.status !== "pending") : [];
  const current = visible.find((s) => s.status === "active") ?? visible[visible.length - 1];
  const label = !run
    ? ""
    : ended
      ? run.undone
        ? "Undone"
        : run.summary ?? ""
      : run.status === "waiting"
        ? "Waiting for your OK"
        : run.waitingOn
          ? `Waiting: ${run.waitingOn}`
        : child
          ? `${child.principal !== "owner" ? principalName(child.principal) : "Sub-goal"}: ${childLabel(child)}`
          : (current?.status === "active" ? current.label : current?.doneLabel ?? current?.label) ?? "Starting";
  const progress = run ? (ended ? 1 : visible.length / Math.max(1, run.steps.length)) : 0;

  const expand = () => {
    if (!run) return;
    setFocusedRun(run.id);
    setOpen(true);
  };

  return (
    <AnimatePresence>
      {show && run && (
        <motion.div
          key={run.id}
          initial={{ opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97, transition: { duration: 0.18 } }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          className="glass fixed left-1/2 -translate-x-1/2 bottom-[84px] z-[955] w-[min(460px,calc(100vw-32px))] rounded-[20px] bg-glass-strong backdrop-blur-3xl border border-glass-line shadow-[0_18px_40px_-16px_rgba(10,20,40,.45)] overflow-hidden"
        >
          <div className="flex items-center gap-3 pl-3 pr-2 h-14">
            <span className="shrink-0">
              {ended ? (
                <span
                  className={clsx(
                    "size-7 rounded-full grid place-items-center",
                    run.status === "done" && !run.undone ? "bg-ok text-white" : "bg-fg/10 text-fg-2",
                  )}
                >
                  {run.status === "done" && !run.undone ? <Check size={15} strokeWidth={2.6} /> : run.undone ? <Undo2 size={14} /> : <CircleSlash size={14} />}
                </span>
              ) : (
                <StringOrb size={28} busy strands={14} />
              )}
            </span>
            <button onClick={expand} className="flex-1 min-w-0 text-left" aria-label="Show steps">
              <div className="text-[12px] text-fg-3 truncate">{run.request}</div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16 }}
                  className={clsx("text-[13.5px] font-medium truncate", run.status === "waiting" && "text-ai-ink")}
                >
                  {label}
                </motion.div>
              </AnimatePresence>
            </button>
            {ended && run.undoable && (
              <PillBtn onClick={() => undoRun(run.id)} label="Undo">
                <Undo2 size={14} />
              </PillBtn>
            )}
            {ended && run.resultAction && !run.undone && run.status === "done" && (
              <PillBtn onClick={() => openApp(run.resultAction!.app, run.resultAction!.props)} label="Open">
                <ArrowUpRight size={15} />
              </PillBtn>
            )}
            {!ended && (
              <PillBtn onClick={expand} label="Show steps">
                <ChevronUp size={15} />
              </PillBtn>
            )}
            {ended && (
              <PillBtn onClick={() => setDismissed(run.id)} label="Dismiss">
                <X size={14} />
              </PillBtn>
            )}
          </div>
          <div className="h-[3px] bg-fg/[.06]">
            <motion.div
              className={clsx("h-full", ended && run.status !== "done" ? "bg-fg/30" : "bg-ai")}
              animate={{ width: `${progress * 100}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 22 }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PillBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="h-8 px-2.5 rounded-full flex items-center gap-1 text-[12.5px] font-medium text-fg-2 hover:text-fg hover:bg-black/[.05] [:root[data-theme=dark]_&]:hover:bg-white/10"
    >
      {children}
      {label !== "Dismiss" && label !== "Show steps" && label}
    </button>
  );
}
