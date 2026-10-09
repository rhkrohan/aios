"use client";

// The real sandbox folder, as capd sees it: files with their labels, trust and
// what they were made from, plus capd's latest decisions. Refreshes on its own,
// so you can watch the live machine work.

import clsx from "clsx";
import { Ban, Check, CircleHelp, Lock, RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { liveFetch } from "@/lib/livemachine";
import type { FileKind } from "@/lib/types";
import { FolderIcon } from "../icons/Icons";
import { FileGlyph } from "../ui";

interface Node {
  name: string;
  path: string;
  kind: "file" | "folder";
  size?: number;
  labels: string[];
  untrusted: boolean;
  origin?: string;
  from: string[];
  blocked: boolean;
  modified: number;
  children?: Node[];
}

interface Decision {
  seq: number;
  principal: string;
  tool: string;
  target: string;
  decision: string;
  reason: string;
}

const KIND: Record<string, FileKind> = { md: "text", txt: "text", csv: "sheet", pdf: "pdf", json: "code", png: "image", jpg: "image" };
const kindOf = (name: string): FileKind => KIND[name.split(".").pop()?.toLowerCase() ?? ""] ?? "text";
const LABEL_DOT: Record<string, string> = { Finance: "bg-[#c99a2e]", Sensitive: "bg-danger", Personal: "bg-[#8a6d9e]", Work: "bg-accent" };

export function LiveSandbox() {
  const [tree, setTree] = useState<Node[] | null>(null);
  const [root, setRoot] = useState("");
  const [up, setUp] = useState<boolean | null>(null);
  const [log, setLog] = useState<Decision[]>([]);
  const [intact, setIntact] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [fs, st] = await Promise.all([liveFetch("/api/live/fs").then((r) => r.json()), liveFetch("/api/live/status").then((r) => r.json())]);
        if (!alive) return;
        setTree(fs.tree ?? []);
        setRoot(fs.root ?? "");
        setUp(!!st.up);
        setLog((st.audit?.tail ?? []).slice().reverse());
        setIntact(st.audit?.verify?.intact ?? null);
      } catch {
        if (alive) setUp(false);
      }
    };
    load();
    const t = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="flex-1 min-h-0 min-w-0 flex">
      <div className="flex-1 min-w-0 overflow-auto scroll-thin px-4 py-3">
        <div className="flex items-center gap-2 text-[12.5px] text-fg-2 mb-2">
          <span className={clsx("h-6 px-2 rounded-full inline-flex items-center gap-1.5", up ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
            <span className="size-1.5 rounded-full bg-current" /> {up === null ? "Checking" : up ? "Live machine running" : "Live machine stopped"}
          </span>
          <span className="font-mono text-[11.5px] text-fg-3 truncate">{root}</span>
          <RefreshCw size={12} className="ml-auto text-fg-3" aria-label="Refreshes every 2 seconds" />
        </div>
        {tree === null ? null : tree.length === 0 ? (
          <p className="text-[13px] text-fg-2 mt-6">
            The sandbox is empty or missing. Turn on Settings, Brain, Live machine: it starts capd for you, and the first start fills the sandbox with demo files.
          </p>
        ) : (
          <ul>{tree.map((n) => <Row key={n.path} n={n} depth={0} />)}</ul>
        )}
      </div>

      {/* capd's decisions, newest first */}
      <aside className="w-[290px] shrink-0 border-l border-line bg-surface-2/60 flex flex-col min-h-0">
        <div className="px-4 pt-3 pb-2 flex items-center gap-2">
          <span className="text-[13px] font-semibold">Decisions</span>
          {intact !== null && (
            <span className={clsx("ml-auto h-5 px-1.5 rounded-full text-[11px] inline-flex items-center", intact ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger")}>
              {intact ? "log intact" : "log tampered"}
            </span>
          )}
        </div>
        <ol className="flex-1 overflow-auto scroll-thin px-3 pb-3 space-y-1">
          {log.length === 0 && <li className="px-1 text-[12.5px] text-fg-3">Nothing yet. Turn on Settings, Brain, Live machine, then ask something.</li>}
          {log.map((d) => (
            <li key={d.seq} className="rounded-lg bg-surface px-2.5 py-2 border border-line">
              <div className="flex items-center gap-1.5 text-[12px]">
                <Verdict d={d.decision} />
                <span className="font-mono text-fg">{d.tool}</span>
                <span className="ml-auto text-[10.5px] text-fg-3">#{d.seq}</span>
              </div>
              {d.target && <div className="mt-0.5 text-[11.5px] text-fg-2 truncate">{d.target}</div>}
              {d.decision !== "allowed" && d.reason && <div className="mt-0.5 text-[11.5px] text-fg-3 leading-snug">{d.reason}</div>}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

function Verdict({ d }: { d: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    allowed: { cls: "bg-ok-soft text-ok", icon: <Check size={11} /> },
    approved: { cls: "bg-ok-soft text-ok", icon: <Check size={11} /> },
    asked: { cls: "bg-ai-soft text-ai-ink", icon: <CircleHelp size={11} /> },
    denied: { cls: "bg-warn-soft text-warn", icon: <Ban size={11} /> },
    blocked: { cls: "bg-danger-soft text-danger", icon: <Ban size={11} /> },
  };
  const m = map[d] ?? map.asked;
  return (
    <span className={clsx("h-5 px-1.5 rounded-full inline-flex items-center gap-1 text-[11px] font-medium", m.cls)}>
      {m.icon}
      {d}
    </span>
  );
}

function Row({ n, depth }: { n: Node; depth: number }) {
  return (
    <li>
      <div className={clsx("flex items-center gap-2 h-9 rounded-lg px-2 hover:bg-surface-3", n.blocked && "opacity-70")} style={{ paddingLeft: 8 + depth * 18 }}>
        {n.kind === "folder" ? <FolderIcon size={20} /> : <FileGlyph kind={kindOf(n.name)} name={n.name} size={20} />}
        <span className="text-[13px] truncate">{n.name}</span>
        {n.blocked && (
          <span className="inline-flex items-center gap-1 text-[11px] text-danger">
            <Lock size={11} /> blocked for AI
          </span>
        )}
        {n.untrusted && (
          <span className="inline-flex items-center gap-1 text-[11px] text-warn">
            <ShieldAlert size={11} /> untrusted
          </span>
        )}
        <span className="flex gap-1">
          {n.labels.map((l) => (
            <span key={l} className="h-5 px-1.5 rounded-full bg-fg/[.06] text-[10.5px] text-fg-2 inline-flex items-center gap-1">
              <span className={clsx("size-1.5 rounded-full", LABEL_DOT[l] ?? "bg-fg-3")} />
              {l}
            </span>
          ))}
        </span>
        {n.from.length > 0 && <span className="ml-auto text-[11px] text-ai-ink truncate max-w-[45%]">made from {n.from.map((f) => f.split("/").pop()).join(", ")}</span>}
      </div>
      {n.children && n.children.length > 0 && (
        <ul>
          {n.children.map((c) => (
            <Row key={c.path} n={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
