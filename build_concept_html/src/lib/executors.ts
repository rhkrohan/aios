"use client";

// What each live tool actually does to the simulated machine. These run only
// AFTER the broker allowed the step. Each returns an undo where it can.

import { BRAND } from "./brand";
import { ORGANIZE_GROUPS, TEAM } from "./seed";
import { useOS } from "./store";
import { getBlob } from "./blobs";
import { describe, findByName, searchObjects, stamp } from "./objects";
import type { AppId, FileItem } from "./types";

const os = () => useOS.getState();
type Args = Record<string, string>;
type Result = { output: Record<string, unknown>; undo?: () => void; fail?: string };

function findFile(name: string): { path: string; item: FileItem } | null {
  const hit = findByName(os().fs, name);
  return hit ? { path: hit.dir, item: hit.item } : null;
}

const normPath = (p: string) => {
  const s = (p || "~").trim().replace(/\/+$/, "");
  if (s.startsWith("~")) return s;
  if (s.startsWith("/home/")) return "~" + s.slice(s.indexOf("/", 6));
  const cap = s.charAt(0).toUpperCase() + s.slice(1);
  return "~/" + cap;
};

function ensureFolder(fs: Record<string, FileItem[]>, path: string) {
  if (fs[path]) return;
  fs[path] = [];
  const parent = path.slice(0, path.lastIndexOf("/")) || "~";
  const name = path.slice(path.lastIndexOf("/") + 1);
  ensureFolder(fs, parent);
  if (!fs[parent].some((i) => i.name === name))
    fs[parent] = [...fs[parent], { id: "fold_" + path, name, kind: "folder", modified: "Just now", touchedBy: BRAND.name, origin: { by: "SIOS", via: "files.move" } }];
}

const APP_ALIASES: Record<string, AppId> = {
  files: "files", finder: "files", dolphin: "files", browser: "browser", web: "browser", mail: "mail", email: "mail", gmail: "mail",
  settings: "settings", terminal: "terminal", store: "store", activity: "activity", security: "security", goals: "goals", systemmap: "systemmap", map: "systemmap",
};

export function execute(tool: string, args: Args, goal: string): Result {
  const s = os();
  switch (tool) {
    case "files.find": {
      const hits = searchObjects(s.fs, args.query || "", args.in ? normPath(args.in) : undefined);
      return { output: { found: hits.length, files: hits.slice(0, 8).map(({ dir, item }) => `${dir}/${item.name}`) } };
    }
    case "files.read": {
      const hit = findFile(args.path?.split("/").pop() ?? "");
      if (!hit) return { output: {}, fail: `Couldn't find ${args.path}` };
      const blob = hit.item.imported ? getBlob(hit.item.id) : undefined;
      const preview = blob?.text !== undefined ? blob.text.slice(0, 800) : "(contents read)";
      return { output: { name: hit.item.name, size: hit.item.size ?? "", preview } };
    }
    case "files.organize": {
      const path = normPath(args.in || "~/Downloads");
      const prev = s.fs;
      const loose = (prev[path] ?? []).filter((x) => x.kind !== "folder");
      if (!loose.length) return { output: { moved: 0, note: "Nothing to sort" } };
      const next = { ...prev, [path]: (prev[path] ?? []).filter((x) => x.kind === "folder") };
      const made: string[] = [];
      for (const g of ORGANIZE_GROUPS) {
        const files = loose.filter((x) => g.kinds.includes(x.kind));
        if (!files.length) continue;
        made.push(g.folder);
        next[`${path}/${g.folder}`] = files.map((x) => ({ ...stamp(x, BRAND.name, `Sorted into ${g.folder}`, goal), touchedBy: BRAND.name }));
        next[path] = [...next[path], { id: `fold_${path}_${g.folder}`, name: g.folder, kind: "folder", modified: "Just now", touchedBy: BRAND.name, goal, origin: { by: "SIOS", via: "files.organize" } }];
      }
      s.setFs(next);
      s.openApp("files", { path });
      return { output: { moved: loose.length, folders: made }, undo: () => os().setFs(prev) };
    }
    case "files.move": {
      const hit = findFile(args.name);
      if (!hit) return { output: {}, fail: `Couldn't find a file called ${args.name}` };
      const prev = s.fs;
      const to = normPath(args.to);
      const next = { ...prev };
      ensureFolder(next, to);
      next[hit.path] = next[hit.path].filter((i) => i.id !== hit.item.id);
      next[to] = [...(next[to] ?? []), { ...stamp(hit.item, BRAND.name, `Moved from ${hit.path} to ${to}`, goal), touchedBy: BRAND.name }];
      s.setFs(next);
      s.openApp("files", { path: to });
      return { output: { moved: hit.item.name, from: hit.path, to }, undo: () => os().setFs(prev) };
    }
    case "files.write": {
      const full = normPath(args.path || "~/Documents/Note.md");
      const dir = full.slice(0, full.lastIndexOf("/")) || "~/Documents";
      const name = full.slice(full.lastIndexOf("/") + 1) || "Note.md";
      const prev = s.fs;
      const next = { ...prev };
      ensureFolder(next, dir);
      const file: FileItem = { id: "f_" + Date.now(), name, kind: "text", size: `${Math.max(1, Math.round((args.text?.length ?? 0) / 1000))} KB`, modified: "Just now", touchedBy: BRAND.name, goal, origin: { by: "SIOS", via: "files.write" }, trust: "trusted", versions: 1, history: [{ at: Date.now(), by: BRAND.name, action: "Created", goal }] };
      next[dir] = [file, ...(next[dir] ?? [])];
      s.setFs(next);
      s.openApp("files", { path: dir });
      return { output: { created: `${dir}/${name}` }, undo: () => os().setFs(prev) };
    }
    case "files.trash": {
      const hit = findFile(args.name);
      if (!hit) return { output: {}, fail: `Couldn't find a file called ${args.name}` };
      const prev = s.fs;
      const trashed = { ...stamp(hit.item, BRAND.name, `Moved to Trash from ${hit.path}`, goal), trashedFrom: hit.path };
      s.setFs({ ...prev, [hit.path]: prev[hit.path].filter((i) => i.id !== hit.item.id), "~/Trash": [...(prev["~/Trash"] ?? []), trashed] });
      return { output: { trashed: hit.item.name, restorable: true }, undo: () => os().setFs(prev) };
    }
    case "files.restore": {
      const trash = s.fs["~/Trash"] ?? [];
      const n = (args.name || "").toLowerCase();
      const item = trash.find((i) => i.name.toLowerCase() === n) ?? trash.find((i) => i.name.toLowerCase().includes(n));
      if (!item) return { output: {}, fail: `There's nothing called ${args.name} in the Trash` };
      const prev = s.fs;
      const back = item.trashedFrom ?? "~/Documents";
      const next: Record<string, FileItem[]> = { ...prev, "~/Trash": trash.filter((i) => i.id !== item.id) };
      ensureFolder(next, back);
      next[back] = [...(next[back] ?? []), { ...stamp(item, BRAND.name, `Put back from Trash`, goal), trashedFrom: undefined }];
      s.setFs(next);
      s.openApp("files", { path: back });
      return { output: { restored: item.name, to: back }, undo: () => os().setFs(prev) };
    }
    case "apps.open": {
      const app = APP_ALIASES[(args.app || "").toLowerCase()];
      if (!app) return { output: {}, fail: `There's no app called ${args.app}` };
      s.openApp(app, args.target ? { path: normPath(args.target) } : undefined);
      return {
        output: { opened: app },
        undo: () => {
          const w = os().windows.find((x) => x.app === app);
          if (w) os().closeWindow(w.id);
        },
      };
    }
    case "settings.set_theme": {
      const prev = s.theme;
      const t = /dark/i.test(args.theme) ? "dark" : "light";
      s.setTheme(t);
      return { output: { theme: t }, undo: () => os().setTheme(prev) };
    }
    case "network.list":
      return { output: { networks: s.wifi.networks.map((n) => n.ssid) } };
    case "network.connect_wifi": {
      const net = s.wifi.networks.find((n) => n.ssid.toLowerCase() === (args.ssid || "").toLowerCase());
      if (!net) return { output: {}, fail: `No network called ${args.ssid} is in range` };
      const prev = s.wifi.connected;
      s.setWifi(net.ssid);
      return { output: { connected: net.ssid, password: `‹secret:wifi/${net.ssid}›` }, undo: () => os().setWifi(prev) };
    }
    case "people.resolve": {
      const q = (args.query || "").toLowerCase();
      const people = /team|everyone|all/.test(q) ? TEAM : TEAM.filter((p) => p.name.toLowerCase().includes(q.split(" ")[0]));
      return { output: { people: people.map((p) => ({ name: p.name, email: p.email })) } };
    }
    case "memory.search":
      return { output: { results: ["Main project: SIOS", "Prefers files grouped by type", "Team: Muhammad, Sara, Daniel"] } };
    case "gmail.draft":
      return { output: { draft: true, to: args.to, subject: args.subject } };
    case "gmail.send": {
      const to = (args.to || "").split(/[,;]\s*/).filter(Boolean);
      const people = to.map((addr) => TEAM.find((p) => p.email === addr || p.name.toLowerCase().includes(addr.toLowerCase())) ?? { name: addr, email: addr, initials: addr.slice(0, 2).toUpperCase(), tone: "#7d8794" });
      s.addMail({ id: "m" + Date.now(), to: people, subject: args.subject || "(no subject)", body: args.body || "", time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) });
      return { output: { sent: true, to } };
    }
    case "browser.read":
      s.openApp("browser", { url: "article" });
      return { output: { title: "The quiet shift to local AI", trust: "untrusted" } };
    case "github.pr.read":
      return { output: { pull_requests: ["#14 Add brain-d stub unit (review requested)", "#13 Wallpaper and branding", "#11 Pin Aurora digest"] } };
    default:
      return { output: {}, fail: `${tool} isn't a real tool` };
  }
}

/** A small, safe snapshot of the machine for the planner. No secrets, no file contents. */
export function plannerState() {
  const s = os();
  const folders = ["~/Documents", "~/Downloads", "~/Projects", "~/Pictures", "~/Projects/sios"];
  return {
    folders: Object.fromEntries([...folders, "~/Trash"].map((f) => [f, (s.fs[f] ?? []).map(describe)])),
    theme: s.theme,
    wifi: { connected: s.wifi.connected, in_range: s.wifi.networks.map((n) => n.ssid) },
    installed_services: Object.keys(s.installed),
    people: TEAM.map((p) => `${p.name} <${p.email}>`),
  };
}
