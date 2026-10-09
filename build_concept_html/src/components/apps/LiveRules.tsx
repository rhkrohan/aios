"use client";

// Live machine: the owner's standing rules (kept by capd) and watchers (kept by
// brain-d). Rules let matching plans start without asking; watchers start a
// request when new files land in a folder.

import { Eye, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { liveFetch } from "@/lib/livemachine";
import { liveOwner } from "@/lib/livemirror";
import { useOS } from "@/lib/store";
import { Button } from "../ui";

interface Rule {
  id: string;
  tools: string[];
  paths: string[];
  note: string;
}
interface Watcher {
  id: string;
  folder: string;
  request: string;
}

async function brainCtl(action: string, params: Record<string, unknown> = {}) {
  const r = await liveFetch("/api/live/brain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...params }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "brain-d refused");
  return j.ok;
}

export function LiveRules() {
  const live = useOS((s) => s.settings.liveMachine);
  const pushToast = useOS((s) => s.pushToast);
  const [rules, setRules] = useState<Rule[]>([]);
  const [watchers, setWatchers] = useState<Watcher[]>([]);
  const [folder, setFolder] = useState("Downloads");
  const [request, setRequest] = useState("Tidy my Downloads");

  const load = () => {
    liveOwner("rules").then((r) => setRules(r ?? [])).catch(() => {});
    brainCtl("watch_list").then((w) => setWatchers(w ?? [])).catch(() => {});
  };
  useEffect(() => {
    if (!live) return;
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [live]);

  if (!live) return null;
  return (
    <div className="rounded-2xl border border-line p-4 space-y-4">
      <div>
        <div className="flex items-center gap-2 text-[13.5px] font-semibold">
          <ShieldCheck size={15} className="text-ok" /> Standing rules on the live machine
        </div>
        <p className="mt-0.5 text-[12.5px] text-fg-2">Plans that fit a rule start without asking. Anything that can&apos;t be undone always asks, whatever the rules say.</p>
        <ul className="mt-2.5 space-y-1.5">
          {rules.length === 0 && <li className="text-[12.5px] text-fg-3">None yet. Tick &ldquo;Always allow plans like this&rdquo; when you approve a plan.</li>}
          {rules.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 text-[12.5px]">
              <span className="min-w-0 flex-1">
                <span className="block font-medium truncate">{r.note || "Standing rule"}</span>
                <span className="block text-fg-3 truncate">
                  {r.tools.join(", ")} in {r.paths.length ? r.paths.map((p) => p || "the whole home").join(", ") : "no folders"}
                </span>
              </span>
              <button aria-label="Remove rule" onClick={() => liveOwner("rule_remove", { id: r.id }).then(load)} className="size-7 grid place-items-center rounded-lg text-fg-3 hover:bg-danger-soft hover:text-danger">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="flex items-center gap-2 text-[13.5px] font-semibold">
          <Eye size={15} className="text-ai-ink" /> Watchers
        </div>
        <p className="mt-0.5 text-[12.5px] text-fg-2">When new files land in a folder, SIOS starts your request. It still asks you, unless a standing rule covers it.</p>
        <ul className="mt-2.5 space-y-1.5">
          {watchers.map((w) => (
            <li key={w.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 text-[12.5px]">
              <span className="min-w-0 flex-1 truncate">
                New files in <b>{w.folder}</b>: &ldquo;{w.request}&rdquo;
              </span>
              <button aria-label="Remove watcher" onClick={() => brainCtl("watch_remove", { id: w.id }).then(load)} className="size-7 grid place-items-center rounded-lg text-fg-3 hover:bg-danger-soft hover:text-danger">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2.5 flex gap-2">
          <input value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Folder to watch" className="h-9 w-36 rounded-lg border border-line bg-surface px-2.5 text-[13px]" />
          <input value={request} onChange={(e) => setRequest(e.target.value)} aria-label="What to do" className="h-9 flex-1 min-w-0 rounded-lg border border-line bg-surface px-2.5 text-[13px]" />
          <Button
            size="sm"
            onClick={() =>
              brainCtl("watch_add", { folder, request })
                .then(() => {
                  load();
                  pushToast({ title: `Watching ${folder}`, tone: "ok" });
                })
                .catch((e) => pushToast({ title: "Couldn't add the watcher", body: String(e.message ?? e), tone: "warn" }))
            }
          >
            Watch
          </Button>
        </div>
      </div>
    </div>
  );
}
