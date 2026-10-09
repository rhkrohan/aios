// Files as objects: provenance, trust, labels, history and per-agent access.
// Everything the Files app and the broker need to reason about a file.

import { BRAND } from "@/lib/brand";
import type { useOS } from "@/lib/store";
import type { FileItem } from "@/lib/types";

type OS = ReturnType<typeof useOS.getState>;

export interface Located {
  item: FileItem;
  dir: string;
}

export const LABELS = ["Work", "Personal", "Sensitive", "Finance"] as const;

export const VIEWS: { path: string; label: string; hint: string }[] = [
  { path: "view:threads", label: "Threads", hint: "Where your files came from and what was made from them" },
  { path: "view:live", label: "Live sandbox", hint: "The real folder the live machine works in, with capd's decisions" },
  { path: "view:ai", label: "Changed by AI", hint: `Everything ${BRAND.name} created or moved` },
  { path: "view:web", label: "From the web", hint: "Untrusted until you say otherwise" },
  { path: "view:sensitive", label: "Sensitive", hint: "Hidden from connected AI apps" },
  { path: "view:recent", label: "Recent", hint: "Today and yesterday" },
];

const RECENT = ["Just now", "Today", "Yesterday"];

/** All items across the file system, with the folder each lives in. */
export function allItems(fs: Record<string, FileItem[]>): Located[] {
  return Object.entries(fs).flatMap(([dir, items]) => items.map((item) => ({ item, dir })));
}

export function viewItems(fs: Record<string, FileItem[]>, view: string): Located[] {
  const all = allItems(fs);
  switch (view) {
    case "view:ai":
      return all.filter(({ item }) => item.touchedBy || item.origin?.by === "SIOS");
    case "view:web":
      return all.filter(({ item }) => item.trust === "untrusted");
    case "view:sensitive":
      return all.filter(({ item }) => item.labels?.includes("Sensitive"));
    case "view:recent":
      return all.filter(({ item }) => RECENT.includes(item.modified) && item.kind !== "folder");
    default:
      return [];
  }
}

export const isView = (p: string) => p.startsWith("view:");

export function dirLabel(dir: string) {
  return dir === "~" ? "Home" : dir.replace(/^~\//, "");
}

export function objAddress(dir: string, name: string) {
  return `obj://home${dir === "~" ? "" : dir.slice(1)}/${name}`;
}

/** Plain words for where a file came from. */
export function originText(item: FileItem): string {
  const o = item.origin;
  if (!o) return "Origin unknown";
  if (o.via?.startsWith("made from ")) return `Made by ${o.by === "you" ? "you" : o.by} ${o.via.slice(5)}`;
  switch (o.by) {
    case "web":
      return `Downloaded from ${o.via ?? "the web"}`;
    case "email":
      return `Saved from an email ${o.via ? o.via.replace(/^attachment /, "attachment ") : ""}`.trim();
    case "you":
      return o.via ? `Made by you, via ${o.via}` : "Made by you";
    case "SIOS":
      return `Made by ${BRAND.name}${o.via ? ` with ${o.via}` : ""}`;
    default:
      return `From ${o.by}${o.via ? `, via ${o.via}` : ""}`;
  }
}

export function originShort(item: FileItem): string {
  const o = item.origin;
  if (!o) return "Unknown";
  if (o.by === "web") return "Web";
  if (o.by === "email") return "Email";
  if (o.by === "you") return "You";
  if (o.by === "SIOS") return BRAND.name;
  return o.by;
}

/** Longest matching Access map rule for a path. */
export function ruleFor(state: OS, fullPath: string) {
  const key = Object.keys(state.scopeRules)
    .filter((k) => k.startsWith("~") && (fullPath === k || fullPath.startsWith(k + "/")))
    .sort((a, b) => b.length - a.length)[0];
  return key ? { key, rule: state.scopeRules[key] } : undefined;
}

export type Reach = "full" | "open-change" | "open-ask" | "blocked";

export interface AccessRow {
  who: string;
  reach: Reach;
  why: string;
}

export function accessFor(state: OS, dir: string, item: FileItem): AccessRow[] {
  const full = dir === "~" ? `~/${item.name}` : `${dir}/${item.name}`;
  const scope = ruleFor(state, full);
  const sensitive = item.labels?.includes("Sensitive");
  const rows: AccessRow[] = [{ who: "You", reach: "full", why: "Owner" }];

  const assistant: AccessRow =
    scope?.rule === "block"
      ? { who: `${BRAND.name} assistant`, reach: "blocked", why: `${scope.key} is blocked in your Access map` }
      : scope?.rule === "allow"
        ? { who: `${BRAND.name} assistant`, reach: "open-change", why: `Changes in ${scope.key} are allowed` }
        : { who: `${BRAND.name} assistant`, reach: "open-ask", why: scope ? `Changes in ${scope.key} ask first` : "Changes ask first" };
  rows.push(assistant);

  const claude = state.connectedApps["claude-desktop"];
  if (claude) {
    const files = claude.areas.includes("Files");
    rows.push(
      !files
        ? { who: "Claude Desktop", reach: "blocked", why: "Not allowed to use Files" }
        : sensitive
          ? { who: "Claude Desktop", reach: "blocked", why: "Labelled Sensitive, hidden from connected apps" }
          : assistant.reach === "blocked"
            ? { ...assistant, who: "Claude Desktop" }
            : { who: "Claude Desktop", reach: "open-ask", why: "Connected app, every change asks" },
    );
  }
  return rows;
}

export const REACH_LABEL: Record<Reach, string> = {
  full: "Full access",
  "open-change": "Can open and change",
  "open-ask": "Can open, asks to change",
  blocked: "Blocked",
};

function ago(at: number) {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)} days ago`;
}

/** The file's history, newest first: real recorded changes, then its older story. */
export function historyOf(item: FileItem): { title: string; when: string; ai?: boolean }[] {
  const out: { title: string; when: string; ai?: boolean }[] = [];
  if (item.history?.length) {
    for (const h of item.history) {
      const ai = h.by !== "you";
      out.push({ title: `${h.action}${ai ? ` by ${h.by}` : ""}${h.goal ? ` for "${h.goal}"` : ""}`, when: ago(h.at), ai });
    }
    out.push({ title: originText(item), when: "First version", ai: item.origin?.by === "SIOS" });
    return out.slice(0, 8);
  }
  if (item.goal && item.origin?.by !== "SIOS") out.push({ title: `Moved by ${BRAND.name} for "${item.goal}"`, when: "Just now", ai: true });
  const v = item.versions ?? 1;
  const editor = item.origin?.by === "you" ? "you" : item.origin?.by === "SIOS" ? BRAND.name : "you";
  for (let i = v; i >= 2 && out.length < 5; i--) out.push({ title: `Version ${i}, edited by ${editor}`, when: i === v ? item.modified : `${v - i + 1} edits ago` });
  out.push({ title: originText(item), when: v > 1 ? "First version" : item.modified, ai: item.origin?.by === "SIOS" });
  return out;
}

const SUMMARIES: Record<string, string> = {
  "Q3 board notes.pdf": "Board meeting notes: Q3 revenue, hiring plan, and the Phase 0 image milestone.",
  "invoice-0932.pdf": "Hosting invoice for September, $48.20, due Oct 15.",
  "lecture-07-slides.pdf": "Lecture 7: virtual memory and page tables, 42 slides.",
  "resume_v6.docx": "Your resume, sixth draft. Two pages, last edited Sep 28.",
  "lease-agreement.pdf": "Apartment lease, 12 months, with rent amount and signatures.",
  "notes.txt": "Loose notes: grocery list and two links to read later.",
  "Q3 notes.md": "Q3 notes: image build status, ISO, VM testing next.",
  "Weekly notes, Oct 6.md": "This week: Aurora base done, signing works, wallpaper next.",
  "Course schedule.pdf": "Fall term timetable, 4 courses, Tuesday and Thursday heavy.",
  "README.md": "Project readme: what SIOS is, how to build the image.",
  "Project update.md": `Weekly update written by ${BRAND.name}, three sections, names restored locally.`,
};

export function summaryOf(item: FileItem): string | null {
  if (!["text", "doc", "pdf"].includes(item.kind)) return null;
  return SUMMARIES[item.name] ?? "A short document. Open it to read more.";
}
