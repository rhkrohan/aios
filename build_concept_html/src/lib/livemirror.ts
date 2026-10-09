"use client";

// Live mirror: while the live machine is on, the desktop, Files and Threads
// show the real sandbox instead of the pretend file system. It's read from
// capd's folder every couple of seconds; the pretend files come back when you
// switch the live machine off.

import { useEffect } from "react";
import { putBlob } from "./blobs";
import { formatSize, kindOf } from "./fileops";
import { followExternal, liveFetch } from "./livemachine";
import { useOS } from "./store";
import { TEAM } from "./seed";
import type { AuditEntry, FileItem, MailMessage, Person } from "./types";

interface LiveNode {
  name: string;
  path: string;
  kind: "file" | "folder";
  size?: number;
  labels: string[];
  untrusted: boolean;
  origin?: string;
  from: string[];
  modified: number;
  text?: string;
  trashedFrom?: string;
  children?: LiveNode[];
}

type FS = Record<string, FileItem[]>;
const id = (path: string) => `live:${path}`;

function when(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60e3) return "Just now";
  const day = new Date(ms);
  const today = new Date();
  if (day.toDateString() === today.toDateString()) return "Today";
  if (new Date(today.getTime() - 86400e3).toDateString() === day.toDateString()) return "Yesterday";
  return day.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** "made by openai-agent", "email attachment from Muhammad"... into SIOS's origin shape. */
function origin(o?: string): FileItem["origin"] {
  if (!o) return undefined;
  if (/^made by you|^you/i.test(o)) return { by: "you", via: o.replace(/^made by you,?\s*(in\s*)?/i, "") || undefined };
  if (/email/i.test(o)) return { by: "email", via: o };
  if (/web|download/i.test(o)) return { by: "web", via: o };
  const m = o.match(/^made by (.+)$/i);
  return m ? { by: m[1] === "openai-agent" ? "OpenAI (live)" : m[1], via: "through capd" } : { by: o };
}

export function mirror(tree: LiveNode[]): FS {
  const fs: FS = { "~/Trash": [] };
  // the sandbox's hidden .Trash is the Trash in Files
  const trash = tree.find((n) => n.name === ".Trash");
  tree = tree.filter((n) => n.name !== ".Trash");
  const walk = (nodes: LiveNode[], dir: string) => {
    fs[dir] = nodes.map((n) => {
      const item: FileItem = {
        id: id(n.path),
        name: n.name,
        kind: n.kind === "folder" ? "folder" : kindOf(n.name),
        size: n.size !== undefined ? formatSize(n.size) : undefined,
        modified: when(n.modified),
        labels: n.labels,
        trust: n.untrusted ? "untrusted" : "trusted",
        origin: origin(n.origin),
        from: n.from.map(id),
        touchedBy: Date.now() - n.modified < 8000 ? "live" : undefined,
      };
      if (n.text !== undefined) {
        putBlob(item.id, { url: "", text: n.text, mime: "text/plain" });
        item.imported = true;
      }
      return item;
    });
    for (const n of nodes) if (n.kind === "folder") walk(n.children ?? [], dir === "~" ? `~/${n.name}` : `${dir}/${n.name}`);
  };
  walk(tree, "~");
  if (trash?.children) {
    walk(trash.children, "~/Trash");
    fs["~/Trash"] = fs["~/Trash"].map((item, i) => {
      const from = trash.children![i]?.trashedFrom ?? "";
      const dir = from.includes("/") ? `~/${from.slice(0, from.lastIndexOf("/"))}` : "~";
      return { ...item, trashedFrom: dir };
    });
  }
  return fs;
}

/** capd's decision log, in the shape Security Center reads. */
function auditFrom(tail: { seq: number; at: number; principal: string; cap: string; tool: string; target: string; decision: string; reason: string; checks: { id: string; result: string; detail: string }[]; prev: string; hash: string }[]): AuditEntry[] {
  const outcome: Record<string, AuditEntry["outcome"]> = { allowed: "allowed", you: "allowed", approved: "asked-yes", asked: "asked-yes", denied: "asked-no", blocked: "blocked" };
  const decision: Record<string, AuditEntry["decision"]> = { allowed: "allow", you: "allow", approved: "ask", asked: "ask", denied: "ask", blocked: "block" };
  return tail
    .filter((e) => e.decision !== "asked") // the answer that follows tells the story
    .reverse()
    .map((e) => ({
      id: `live-${e.seq}`,
      seq: e.seq,
      at: e.at * 1000,
      principal: e.principal,
      goal: e.cap,
      tool: e.tool,
      target: e.target,
      decision: decision[e.decision] ?? "allow",
      outcome: outcome[e.decision] ?? "allowed",
      reason: e.reason,
      checks: (e.checks ?? []).map((c) => ({ id: c.id, label: c.id, result: c.result as AuditEntry["checks"][number]["result"], detail: c.detail })),
      prevHash: e.prev,
      hash: e.hash,
    }));
}

/** Sent mail from capd's outbox, in the shape Mail reads. */
function mailFrom(out: { id: string; to: string[] | string; subject?: string; body?: string; attachment?: { path: string } | null; at: number }[], people: Person[]): MailMessage[] {
  return out.map((m) => ({
    id: m.id,
    to: [m.to].flat().map((email) => people.find((p) => p.email === email) ?? { name: email, email, role: "", initials: email.slice(0, 2).toUpperCase(), tone: "#7a8699" }),
    subject: m.subject ?? "(no subject)",
    body: m.body ?? "",
    attachment: m.attachment?.path?.split("/").pop(),
    time: new Date(m.at * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  }));
}

let kick: (() => void) | null = null;
/** Pull the real sandbox right now (after your own file actions). */
export function refreshLive() {
  kick?.();
}

async function owner(action: string, params: Record<string, unknown> = {}) {
  const r = await liveFetch("/api/live/owner", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...params }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "the live machine refused");
  return j.ok;
}
export { owner as liveOwner };

/** Keep the file system in step with the real sandbox while live mode is on. */
export function useLiveMirror() {
  const live = useOS((s) => s.settings.liveMachine);
  useEffect(() => {
    if (!live) return;
    // the pretend machine, for when you switch back
    const saved = { fs: useOS.getState().fs, mail: useOS.getState().mail, audit: useOS.getState().audit };
    let last = "";
    let lastMail = "";
    let lastAudit = "";
    let alive = true;
    const pull = async () => {
      try {
        const j = await liveFetch("/api/live/fs").then((r) => r.json());
        if (!alive || !Array.isArray(j.tree) || j.tree.length === 0) return;
        const key = JSON.stringify(j.tree);
        if (key === last) return;
        last = key;
        useOS.getState().setFs(mirror(j.tree));
      } catch {
        /* capd or the sandbox isn't there yet; keep trying */
      }
    };
    // what left the computer, and every decision, from capd itself
    const records = async () => {
      try {
        const [out, audit] = await Promise.all([owner("outbox"), owner("audit", { n: 200 })]);
        if (!alive) return;
        const mk = JSON.stringify(out);
        if (mk !== lastMail) {
          lastMail = mk;
          useOS.setState({ mail: mailFrom(out ?? [], TEAM) });
        }
        const ak = JSON.stringify(audit?.tail?.length) + (audit?.tail?.at(-1)?.hash ?? "");
        if (ak !== lastAudit) {
          lastAudit = ak;
          useOS.setState({ audit: auditFrom(audit?.tail ?? []), liveIntact: audit?.verify?.intact ?? null });
        }
      } catch {
        /* not running yet */
      }
    };
    kick = () => {
      void pull();
      void records();
    };
    // tell brain-d what the system looks like right now (on SIOS it reads this from D-Bus)
    let lastState = "";
    let lastSent = 0;
    const report = async () => {
      const s = useOS.getState();
      const top = [...s.windows].filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0];
      const system = {
        time: new Date().toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }),
        theme: s.theme,
        wallpaper: s.wallpaper,
        wifi: s.wifi.connected ? `on, connected to ${s.wifi.connected}` : "off",
        wifi_networks_nearby: s.wifi.networks.map((n) => n.ssid),
        bluetooth: s.bluetooth ? "on" : "off",
        volume: `${s.volume}%`,
        brightness: `${s.brightness}%`,
        do_not_disturb: s.dnd ? "on" : "off",
        open_apps: Array.from(new Set(s.windows.filter((w) => !w.minimized).map((w) => w.app))),
        front_app: top?.app ?? "none",
        installed_store_apps: Object.keys(s.installed),
        // what online models may see from memory: 0 nothing personal, 1 only what the task needs, 2 full
        privacy: s.settings.privacy,
      };
      const key = JSON.stringify({ ...system, time: "" });
      // send when something changed, and now and then anyway (brain-d may have restarted)
      if (key === lastState && Date.now() - lastSent < 30_000) return;
      lastState = key;
      lastSent = Date.now();
      await liveFetch("/api/live/brain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "state", system }) }).catch(() => {});
    };
    // goals outside AIs started over MCP show up here, for the owner to decide
    const external = async () => {
      try {
        const j = await liveFetch("/api/live/recent").then((r) => r.json());
        for (const g of j.goals ?? []) if (g.principal !== "owner") void followExternal(g.goal, g.request, g.principal);
      } catch {
        /* brain-d not running yet */
      }
    };
    // "Stop all AI" pauses every AI capd has seen, for real; resuming lifts it
    const unsub = useOS.subscribe((st, prev) => {
      if (st.aiPaused === prev.aiPaused) return;
      const who = Array.from(new Set(st.audit.map((e) => e.principal).filter((p) => p !== "you")));
      for (const principal of who) void owner(st.aiPaused ? "pause" : "resume", { principal }).catch(() => {});
    });
    void pull();
    void records();
    const t = setInterval(() => {
      void pull();
      void records();
      void external();
      void report();
    }, 2000);
    return () => {
      alive = false;
      clearInterval(t);
      unsub();
      kick = null;
      useOS.setState({ fs: saved.fs, mail: saved.mail, audit: saved.audit, liveIntact: null });
    };
  }, [live]);
}
