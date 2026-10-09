"use client";

import clsx from "clsx";
import { Check, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useSyncExternalStore } from "react";
import { BRAND } from "@/lib/brand";
import { runRequest } from "@/lib/engine";
import { useOS } from "@/lib/store";
import { FileIcon } from "../icons/Icons";
import { StringOrb } from "../icons/StringOrb";
import { AREA_ICON, Button, timeAgo } from "../ui";

const card =
  "glass rounded-[22px] bg-glass-strong backdrop-blur-2xl backdrop-saturate-150 border border-glass-line shadow-[0_18px_40px_-18px_rgba(15,25,45,.35)]";

const subscribeMinute = (cb: () => void) => {
  const t = setInterval(cb, 60_000);
  return () => clearInterval(t);
};

function greeting(h: number) {
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function Widgets() {
  const hour = useSyncExternalStore(subscribeMinute, () => new Date().getHours(), () => null);
  const todos = useOS((s) => s.todos);
  const toggle = useOS((s) => s.toggleTodo);
  const runs = useOS((s) => s.runs);
  const openApp = useOS((s) => s.openApp);
  const dismissed = useOS((s) => s.suggestionDismissed);
  const dismiss = useOS((s) => s.dismissSuggestion);
  const downloads = useOS((s) => (s.fs["~/Downloads"] ?? []).filter((x) => x.kind !== "folder").length);
  const live = useOS((s) => s.settings.liveMachine);
  const fs = useOS((s) => s.fs);
  const left = todos.filter((t) => !t.done).length;

  // live with nothing run yet: the real files that changed most recently
  const RANK: Record<string, number> = { "Just now": 0, Today: 1, Yesterday: 2 };
  const liveRecent = Object.entries(fs)
    .filter(([d]) => d !== "~/Trash")
    .flatMap(([d, items]) => items.filter((i) => i.kind !== "folder" && i.modified in RANK).map((i) => ({ d, i })))
    .sort((a, b) => RANK[a.i.modified] - RANK[b.i.modified])
    .slice(0, 3)
    .map(({ d, i }) => ({ id: i.id, title: i.name, sub: `${i.modified === "Just now" ? "Changed just now" : `Changed ${i.modified.toLowerCase()}`} in ${d === "~" ? "Home" : d.replace(/^~\//, "")}`, area: null, file: { kind: (i.kind === "pdf" || i.kind === "slides" ? i.kind : "text") as "text" | "slides" | "pdf", name: i.name } }));
  const fromRuns = runs.slice(0, 3).map((r) => ({ id: r.id, title: r.request, sub: `${timeAgo(r.startedAt)}, ${r.undone ? "undone" : r.status === "done" ? "done by " + BRAND.name : r.status}`, area: r.area, file: null as null | { kind: "text" | "slides" | "pdf"; name: string } }));
  const recent = runs.length
    ? fromRuns
    : live
      ? liveRecent
      : [
          { id: "a", title: "SIOS design guidelines", sub: "Edited 2m ago in Documents", area: null, file: { kind: "pdf" as const, name: "guidelines.pdf" } },
          { id: "b", title: "Product roadmap", sub: "Viewed 1h ago in Projects", area: null, file: { kind: "slides" as const, name: "roadmap.key" } },
          { id: "c", title: "Q3 notes", sub: "Created 3h ago in Documents", area: null, file: { kind: "text" as const, name: "Q3 notes.md" } },
        ];

  return (
    <aside className="hidden xl:flex fixed right-4 top-[52px] z-[5] w-[316px] flex-col gap-3" aria-label="Widgets">
      {/* greeting */}
      <section className={clsx(card, "p-5")}>
        <div className="flex items-start justify-between">
          <Sun size={30} className="text-[#f2b33d]" fill="#f7c95c" strokeWidth={1.6} />
          <div className="text-right leading-tight">
            <div className="text-[22px] font-medium tabular-nums">16°</div>
            <div className="text-[12px] text-fg-2">Clear</div>
          </div>
        </div>
        <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.01em]">{hour === null ? "Hello" : greeting(hour)}</h2>
        <p className="text-[13.5px] text-fg-2">{left ? `${left} ${left === 1 ? "thing" : "things"} left today.` : "You're all set for today."}</p>
        <ul className="mt-3">
          {todos.map((t) => (
            <li key={t.id} className="border-t border-line/70 first:border-t-0">
              <button onClick={() => toggle(t.id)} className="w-full flex items-center gap-3 py-2.5 text-left">
                <span
                  className={clsx(
                    "size-[18px] rounded-full grid place-items-center shrink-0 transition-colors",
                    t.done ? "bg-ok text-white" : "border-[1.5px] border-fg-3",
                  )}
                >
                  {t.done && <Check size={11} strokeWidth={3} />}
                </span>
                <span className={clsx("flex-1 text-[13.5px] truncate", t.done && "text-fg-2")}>{t.text}</span>
                {t.time && <span className="text-[12px] text-fg-3 tabular-nums">{t.time}</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* recent activity */}
      <section className={clsx(card, "p-4")}>
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[14px] font-semibold">Recent activity</h3>
          <button className="text-[12.5px] text-fg-2 hover:text-fg" onClick={() => openApp("activity")}>
            See all
          </button>
        </div>
        <ul className="mt-2 grid gap-0.5">
          {recent.map((r) => {
            const Icon = r.area ? AREA_ICON[r.area] : null;
            return (
              <li key={r.id}>
                <button
                  onClick={() => openApp(r.area ? "activity" : "files", r.area ? undefined : { path: "~/Documents" })}
                  className="w-full flex items-center gap-3 p-1.5 rounded-xl hover:bg-black/[.04] [:root[data-theme=dark]_&]:hover:bg-white/[.06] text-left"
                >
                  {Icon ? (
                    <span className="size-10 rounded-xl grid place-items-center bg-ai-soft text-ai-ink border border-ai-line shrink-0">
                      <Icon size={18} strokeWidth={1.8} />
                    </span>
                  ) : (
                    <FileIcon kind={r.file!.kind} name={r.file!.name} size={40} />
                  )}
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-medium truncate">{r.title}</span>
                    <span className="block text-[12px] text-fg-2 truncate">{r.sub}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* proactive suggestion: the brain noticed something */}
      <AnimatePresence>
        {!dismissed && downloads > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
            className={clsx(card, "p-4")}
          >
            <div className="flex items-center gap-2 text-[13px] font-semibold">
              <StringOrb size={22} strands={12} /> Suggestion
            </div>
            <p className="mt-2 text-[13.5px] leading-5">
              Your Downloads folder has {downloads} loose files. Want me to sort them into folders?
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  dismiss();
                  void runRequest("Clean up my Downloads");
                }}
              >
                Sort them
              </Button>
              <Button onClick={dismiss}>Not now</Button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </aside>
  );
}
