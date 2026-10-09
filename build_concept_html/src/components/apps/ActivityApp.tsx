"use client";

import clsx from "clsx";
import { ChevronDown, Cloud, Cpu, Download, History, Search, Undo2, User } from "lucide-react";
import { BrandMark } from "../icons/Icons";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { BRAND } from "@/lib/brand";
import { undoRun } from "@/lib/engine";
import { useOS } from "@/lib/store";
import type { Run } from "@/lib/types";
import { StepRow } from "../command/StepRow";
import { RoutinesView } from "./RoutinesView";
import { AREA_ICON, Button, Chip, timeAgo } from "../ui";

type Filter = "all" | "changes" | "approvals";

export function ActivityApp() {
  const runs = useOS((s) => s.runs);
  const setCommandOpen = useOS((s) => s.setCommandOpen);
  const pushToast = useOS((s) => s.pushToast);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<"history" | "routines">("history");

  const list = runs.filter((r) => {
    if (q && !`${r.request} ${r.summary}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "changes") return r.steps.some((s) => s.tool && s.tool.permission !== "read" && s.status === "done");
    if (filter === "approvals") return r.steps.some((s) => s.broker?.startsWith("asked") || s.broker === "denied");
    return true;
  });

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 flex items-center gap-1 px-4 pt-3">
        {(["history", "routines"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "h-8 px-3.5 rounded-full text-[13px] transition-colors",
              tab === t ? "bg-fg text-surface font-semibold" : "text-fg-2 hover:bg-surface-3 hover:text-fg",
            )}
          >
            {t === "history" ? "History" : "Routines"}
          </button>
        ))}
      </div>
      {tab === "routines" ? (
        <div className="flex-1 min-h-0 overflow-auto scroll-thin">
          <RoutinesView />
        </div>
      ) : (
      <>
      <div className="shrink-0 flex items-center gap-2 px-4 h-13 border-b border-line">
        <div className="flex items-center gap-2 h-8 px-2.5 rounded-lg border border-line bg-surface-2 flex-1 max-w-72">
          <Search size={14} className="text-fg-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search activity"
            className="bg-transparent outline-none text-[13px] flex-1 placeholder:text-fg-3"
          />
        </div>
        <div className="flex rounded-lg border border-line p-0.5 text-[12.5px]">
          {(["all", "changes", "approvals"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx("px-2.5 h-7 rounded-md capitalize", filter === f ? "bg-surface-3 font-medium" : "text-fg-2 hover:text-fg")}
            >
              {f === "all" ? "All" : f === "changes" ? "Changes" : "Approvals"}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" disabled={!runs.length} onClick={() => pushToast({ title: "Activity exported", body: "Saved activity-log.json to Downloads.", tone: "ok" })}>
          <Download size={13} /> Export
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto scroll-thin">
        {!runs.length ? (
          <div className="h-full grid place-items-center p-8">
            <div className="text-center max-w-xs">
              <span className="inline-grid place-items-center size-12 rounded-2xl bg-accent-soft text-accent">
                <History size={22} />
              </span>
              <div className="mt-3 text-[15px] font-semibold">Nothing here yet</div>
              <p className="mt-1 text-[13px] text-fg-2 leading-5">
                Everything {BRAND.name} does shows up here: what it changed, what you approved, and an undo button.
              </p>
              <Button className="mt-4" variant="primary" onClick={() => setCommandOpen(true)}>
                <BrandMark size={15} /> Ask {BRAND.name}
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="text-[13px] font-semibold text-fg-2 px-1 mb-2">Today</div>
            <ul className="grid gap-2">
              {list.map((r) => (
                <Entry key={r.id} run={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
              ))}
              {!list.length && <li className="text-center text-[13px] text-fg-3 py-8">No matching activity</li>}
            </ul>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}

function Entry({ run, open, onToggle }: { run: Run; open: boolean; onToggle: () => void }) {
  const Icon = AREA_ICON[run.area];
  const tools = run.steps.filter((s) => s.tool && s.status !== "pending");
  const asked = run.steps.filter((s) => s.broker?.startsWith("asked")).length;
  const onlineAi = useOS((s) => s.settings.onlineAi);
  const live = run.status === "running" || run.status === "waiting";

  return (
    <li className={clsx("rounded-2xl border bg-surface transition-colors", open ? "border-line-strong" : "border-line hover:border-line-strong")}>
      <div className="flex items-start gap-3 p-3.5 cursor-pointer" onClick={onToggle}>
        <span className={clsx("size-9 rounded-xl grid place-items-center shrink-0 border", run.undone ? "bg-surface-2 border-line text-fg-3" : "bg-accent-soft border-accent-line text-accent")}>
          <Icon size={17} strokeWidth={1.8} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={clsx("text-[14px] font-medium truncate", run.undone && "line-through text-fg-3")}>{run.request}</span>
            {run.undone && <Chip>Undone</Chip>}
            {run.status === "stopped" && <Chip>Stopped</Chip>}
            {run.status === "failed" && <Chip tone="warn">Not available</Chip>}
            {live && <Chip tone="ai">{run.status === "waiting" ? "Needs your OK" : "Working"}</Chip>}
          </div>
          {run.summary && <div className="text-[12.5px] text-fg-2 mt-0.5 leading-5">{run.summary}</div>}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-3">
            <span>{timeAgo(run.startedAt)}</span>
            <span className="flex items-center gap-1">
              {run.route === "cloud" ? <Cloud size={11} /> : <Cpu size={11} />}
              {run.route === "cloud" ? onlineAi : "This computer"}
            </span>
            <span>{tools.length} {tools.length === 1 ? "action" : "actions"}</span>
            {asked > 0 && <span>You approved {asked}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {run.undoable ? (
            <Button size="sm" onClick={() => undoRun(run.id)}>
              <Undo2 size={13} /> Undo
            </Button>
          ) : (
            run.status === "done" &&
            !run.undone &&
            run.irreversibleNote && <span className="text-[11.5px] text-fg-3 pr-1">Can&apos;t be undone</span>
          )}
          <button onClick={onToggle} aria-label="Details" className="size-7 grid place-items-center rounded-md text-fg-3 hover:bg-surface-3">
            <ChevronDown size={15} className={clsx("transition-transform", open && "rotate-180")} />
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="border-t border-line px-4 pt-4">
              <ul>
                {run.steps
                  .filter((s) => s.status !== "pending")
                  .map((s, i, arr) => (
                    <StepRow key={s.id} step={s} details last={i === arr.length - 1} cloud={run.route === "cloud"} />
                  ))}
              </ul>
            </div>
            <dl className="mx-4 mb-4 grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 rounded-xl bg-surface-2 border border-line p-3 text-[12px]">
              <dt className="text-fg-3">Asked by</dt>
              <dd className="flex items-center gap-1">
                <User size={12} /> You, from the command bar
              </dd>
              <dt className="text-fg-3">Thinking</dt>
              <dd>{run.route === "cloud" ? `${onlineAi} (online), names removed first` : "Local model on this computer"}</dd>
              <dt className="text-fg-3">Snapshot</dt>
              <dd>{run.snapshotId ?? "Not needed"}</dd>
              <dt className="text-fg-3">Started</dt>
              <dd>{new Date(run.startedAt).toLocaleTimeString()}</dd>
            </dl>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
