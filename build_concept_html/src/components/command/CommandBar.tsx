"use client";

import clsx from "clsx";
import {
  ArrowLeft,
  BookMarked,
  CircleAlert,
  CircleCheck,
  CircleSlash,
  Cloud,
  Cpu,
  CornerDownLeft,
  Info,
  LayoutGrid,
  Mic,
  Sparkles,
  Undo2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BRAND } from "@/lib/brand";
import { runRequest, undoRun } from "@/lib/engine";
import { SUGGESTED, matchScenario, type Scenario } from "@/lib/scenarios";
import { useOS } from "@/lib/store";
import type { AppId, Run } from "@/lib/types";
import { AREA_ICON, Button, Chip, Toggle } from "../ui";
import { StepRow } from "./StepRow";
import { StringOrb } from "../icons/StringOrb";

function suggestionLabel(s: Scenario, theme: "light" | "dark") {
  if (s.id === "theme") return theme === "dark" ? "Turn on light mode" : "Turn on dark mode";
  return s.example;
}

/**
 * The Ask panel. Opens above the orb in the bottom bar (or with ⌘K), shows
 * suggestions or the live run, with the input at the bottom.
 */
export function CommandBar() {
  const open = useOS((s) => s.commandOpen);
  const setOpen = useOS((s) => s.setCommandOpen);
  const focusedRunId = useOS((s) => s.focusedRunId);
  const run = useOS((s) => s.runs.find((r) => r.id === focusedRunId));
  const setFocusedRun = useOS((s) => s.setFocusedRun);
  const theme = useOS((s) => s.theme);
  const busy = useOS((s) => s.runs.some((r) => r.status === "running" || r.status === "waiting"));
  const pushToast = useOS((s) => s.pushToast);
  const openApp = useOS((s) => s.openApp);

  const [text, setText] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Opening fresh after a finished run goes back to suggestions.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    if (run && run.endedAt && Date.now() - run.endedAt > 4000) setFocusedRun(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const items = useMemo(() => {
    const q = text.trim().toLowerCase();
    const list = SUGGESTED.map((s) => ({ s, label: suggestionLabel(s, theme) }));
    if (!q) return list;
    const hit = matchScenario(q);
    return list.filter(({ label, s }) => label.toLowerCase().includes(q) || s === hit);
  }, [text, theme]);

  const rows: { key: string; label: string; hint: string; scenario?: Scenario; typed?: boolean }[] = [
    ...(text.trim() ? [{ key: "typed", label: text.trim(), hint: "Ask in your own words", typed: true }] : []),
    ...items.map(({ s, label }) => ({ key: s.id, label, hint: s.hint, scenario: s })),
  ];

  const submit = (value: string) => {
    if (!value.trim()) return;
    setText("");
    setSel(0);
    setOpen(true);
    void runRequest(value);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (run && !text) {
      if (e.key === "Enter" && run.endedAt) {
        e.preventDefault();
        setFocusedRun(null);
      }
      return;
    }
    const total = rows.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((i) => (i + 1) % Math.max(total, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((i) => (i - 1 + total) % Math.max(total, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = rows[sel];
      if (r) submit(r.label);
    }
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="scrim"
            className="fixed inset-0 z-[940] bg-[#0b1220]/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Opens above the Ask orb in the bottom bar. */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="ask"
            role="dialog"
            aria-label={`Ask ${BRAND.name}`}
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97, transition: { duration: 0.14 } }}
            transition={{ type: "spring", stiffness: 480, damping: 36 }}
            style={{ transformOrigin: "50% 100%" }}
            className={clsx(
              "glass fixed left-1/2 -translate-x-1/2 bottom-[146px] z-[950] w-[min(720px,calc(100vw-32px))] rounded-[26px] bg-glass-strong backdrop-blur-3xl backdrop-saturate-150 border border-glass-line shadow-pop",
              run && (run.status === "running" || run.status === "waiting") && "ai-ring",
            )}
          >
            <div className="rounded-[26px] overflow-hidden">
              {run ? (
                <RunView run={run} onNew={() => { setFocusedRun(null); inputRef.current?.focus(); }} />
              ) : (
                <Suggestions rows={rows} sel={sel} setSel={setSel} onPick={submit} typed={!!text.trim()} />
              )}

              {/* the input sits at the bottom, closest to the orb it came from */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 border-t border-line">
                <StringOrb size={34} busy={busy} strands={18} />
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setSel(0);
                    if (run?.endedAt) setFocusedRun(null);
                  }}
                  onKeyDown={onKey}
                  placeholder={run && !run.endedAt ? "Ask something else..." : `Ask ${BRAND.name} anything...`}
                  className="flex-1 min-w-0 bg-transparent outline-none text-[16px] placeholder:text-fg-3 h-10"
                  aria-label="Request"
                />
                <BarIcon label="Talk (push to talk)" onClick={() => pushToast({ title: "Push to talk", body: "Hold the mic key and speak. Voice arrives in a later build.", tone: "info" })}>
                  <Mic size={18} />
                </BarIcon>
                <BarIcon label="Activity" onClick={() => { setOpen(false); openApp("activity"); }}>
                  <LayoutGrid size={17} />
                </BarIcon>
                <span className="kbd ml-1">esc</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function BarIcon({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className="size-9 grid place-items-center rounded-full text-fg-2 hover:text-fg hover:bg-black/[.05] [:root[data-theme=dark]_&]:hover:bg-white/10 transition-colors">
      {children}
    </button>
  );
}

function Suggestions({
  rows,
  sel,
  setSel,
  onPick,
  typed,
}: {
  rows: { key: string; label: string; hint: string; scenario?: Scenario; typed?: boolean }[];
  sel: number;
  setSel: (i: number) => void;
  onPick: (label: string) => void;
  typed: boolean;
}) {
  const recipes = useOS((s) => s.recipes);
  const settings = useOS((s) => s.settings);
  return (
    <div>
      <div className="px-2 pt-2 pb-1 max-h-[46vh] overflow-auto scroll-thin">
        <div className="px-3 pt-1.5 pb-1.5 text-[12.5px] font-semibold text-fg-2">{typed ? "Run" : "Things you can ask"}</div>
        <ul>
          {rows.map((r, i) => {
            const Icon = r.scenario ? AREA_ICON[r.scenario.area] : Sparkles;
            const isRecipe = r.scenario && recipes.includes(r.scenario.id);
            return (
              <li key={r.key}>
                <button
                  onMouseEnter={() => setSel(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPick(r.label)}
                  className={clsx("w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors", sel === i ? "bg-ai-soft" : "")}
                >
                  <span
                    className={clsx(
                      "size-9 rounded-xl grid place-items-center shrink-0 border transition-colors",
                      sel === i ? "bg-surface border-ai-line text-ai-ink" : "bg-surface/70 border-line text-fg-2",
                    )}
                  >
                    <Icon size={16} strokeWidth={1.8} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-medium truncate">{r.typed ? `“${r.label}”` : r.label}</span>
                    <span className="block text-[12.5px] text-fg-2 truncate">{r.hint}</span>
                  </span>
                  {isRecipe && (
                    <Chip tone="ok" icon={BookMarked}>
                      Saved routine
                    </Chip>
                  )}
                  {sel === i && <CornerDownLeft size={15} className="text-ai-ink shrink-0" />}
                </button>
              </li>
            );
          })}
          {!rows.length && <li className="px-3 py-6 text-center text-[13px] text-fg-3">Type a request and press Enter.</li>}
        </ul>
      </div>
      <div className="flex items-center justify-between px-5 h-10 border-t border-line/70 text-[12px] text-fg-2">
        <span className="flex items-center gap-1.5">
          <Cpu size={13} className="text-ok" />
          Thinks on this computer. {settings.onlineAi ? `${settings.onlineAi} for hard tasks, with your OK.` : ""}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="kbd">↑</span>
          <span className="kbd">↓</span> to choose <span className="kbd ml-1">↵</span> to run
        </span>
      </div>
    </div>
  );
}

// ---------------- run view ----------------

function RunView({ run, onNew }: { run: Run; onNew: () => void }) {
  const showDetails = useOS((s) => s.settings.showDetails);
  const updateSettings = useOS((s) => s.updateSettings);
  const openApp = useOS((s) => s.openApp);
  const setOpen = useOS((s) => s.setCommandOpen);
  const settings = useOS((s) => s.settings);
  const visible = run.steps.filter((s) => s.status !== "pending");
  const finished = run.status === "done" || run.status === "stopped" || run.status === "failed";
  const Icon = AREA_ICON[run.area];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Enter" && finished && !(e.target as HTMLElement).closest("button,input")) onNew();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finished, onNew, setOpen]);

  return (
    <div>
      <div className="flex items-center gap-3 px-4 h-16 border-b border-line">
        <button
          onClick={onNew}
          aria-label="New request"
          className="size-8 grid place-items-center rounded-lg text-fg-2 hover:bg-surface-3 hover:text-fg"
        >
          <ArrowLeft size={17} />
        </button>
        {finished ? (
          <span className="size-9 rounded-[11px] grid place-items-center shrink-0 border bg-accent-soft border-accent-line text-accent">
            <Icon size={17} strokeWidth={1.8} />
          </span>
        ) : (
          <StringOrb size={40} busy strands={20} />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold truncate">{run.request}</div>
          <div className="text-[12px] text-fg-2 flex items-center gap-1.5">
            {run.route === "cloud" ? (
              <>
                <Cloud size={12} /> {settings.onlineAi}, personal details removed
              </>
            ) : (
              <>
                <Cpu size={12} /> On this computer, private
              </>
            )}
          </div>
        </div>
        <StatusChip run={run} />
      </div>

      <div className="px-5 pt-4 max-h-[50vh] overflow-auto scroll-thin">
        <ul>
          <AnimatePresence initial={false}>
            {visible.map((s, i) => (
              <StepRow key={s.id} step={s} details={showDetails} last={i === visible.length - 1} cloud={run.route === "cloud"} />
            ))}
          </AnimatePresence>
        </ul>
      </div>

      <AnimatePresence>
        {finished && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
            className="mx-4 mb-3 mt-1"
          >
            <ResultCard run={run} onNew={onNew} onOpen={(app, props) => { openApp(app, props); setOpen(false); }} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between px-5 h-11 border-t border-line bg-surface-2/60 text-[12px] text-fg-2">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Toggle checked={showDetails} onChange={(v) => updateSettings({ showDetails: v })} label="Show technical details" />
          Show technical details
        </label>
        <span className="tabular-nums">
          {finished && run.endedAt ? `Took ${((run.endedAt - run.startedAt) / 1000).toFixed(1)}s` : `${visible.length} of ${run.steps.length} steps`}
        </span>
      </div>
    </div>
  );
}

function StatusChip({ run }: { run: Run }) {
  if (run.undone) return <Chip tone="neutral" icon={Undo2}>Undone</Chip>;
  switch (run.status) {
    case "running":
      return <Chip tone="ai">Working</Chip>;
    case "waiting":
      return <Chip tone="ai">Needs your OK</Chip>;
    case "done":
      return <Chip tone="ok" icon={CircleCheck}>Done</Chip>;
    case "stopped":
      return <Chip tone="neutral" icon={CircleSlash}>Stopped</Chip>;
    default:
      return <Chip tone="warn" icon={CircleAlert}>Not available</Chip>;
  }
}

function ResultCard({
  run,
  onNew,
  onOpen,
}: {
  run: Run;
  onNew: () => void;
  onOpen: (app: AppId, props?: Record<string, string>) => void;
}) {
  const ok = run.status === "done";
  if (run.status === "failed") {
    return (
      <div className="rounded-2xl border border-warn-line bg-warn-soft p-4">
        <div className="flex gap-2.5 text-[13.5px]">
          <Info size={17} className="text-warn shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">{run.summary}</div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {run.resultAction && (
                <Button variant="primary" size="sm" onClick={() => onOpen(run.resultAction!.app, run.resultAction!.props)}>
                  {run.resultAction.label}
                </Button>
              )}
              {!run.resultAction && SUGGESTED.slice(0, 4).map((s) => (
                <Button key={s.id} size="sm" onClick={() => void runRequest(s.example)}>
                  {s.example}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={clsx("rounded-2xl border p-4", ok ? "border-ok-line bg-ok-soft/70" : "border-line bg-surface-2")}>
      <div className="flex gap-2.5">
        {ok ? (
          <CircleCheck size={18} className="text-ok shrink-0 mt-0.5" />
        ) : (
          <CircleSlash size={18} className="text-fg-2 shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium leading-6">{run.undone ? "Undone. Everything is back the way it was." : run.summary}</div>
          {ok && !run.undone && (run.irreversibleNote || run.savedRecipe || run.usedRecipe || run.undoable) && (
            <div className="mt-1 text-[12.5px] text-fg-2 leading-5">
              {run.undoable && "You can undo this anytime from Activity. "}
              {run.irreversibleNote}
              {run.savedRecipe && " Saved as a routine, so next time is faster."}
              {run.usedRecipe && " Used your saved routine."}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {ok && run.resultAction && !run.undone && (
              <Button variant="primary" size="sm" onClick={() => onOpen(run.resultAction!.app, run.resultAction!.props)}>
                {run.resultAction.label}
              </Button>
            )}
            {run.undoable && (
              <Button size="sm" onClick={() => undoRun(run.id)}>
                <Undo2 size={13} /> Undo
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onOpen("activity")}>
              View in Activity
            </Button>
            <span className="flex-1" />
            <Button size="sm" variant="ghost" onClick={onNew}>
              New request <span className="kbd ml-1">↵</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
