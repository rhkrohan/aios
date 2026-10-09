import type { FileItem, Network, Person } from "./types";

let n = 0;
type Meta = Pick<FileItem, "origin" | "trust" | "labels" | "versions">;
const f = (name: string, kind: FileItem["kind"], size: string | undefined, modified: string, meta: Meta = {}): FileItem => ({
  id: `f${++n}`,
  name,
  kind,
  size,
  modified,
  trust: "trusted",
  ...meta,
});

// Provenance shorthands
const web = (via: string, at?: string): Meta => ({ origin: { by: "web", via, at }, trust: "untrusted" });
const mail = (from: string): Meta => ({ origin: { by: "email", via: `attachment from ${from}` }, trust: "untrusted" });
const you = (via?: string, labels?: string[], versions?: number): Meta => ({ origin: { by: "you", via }, trust: "trusted", labels, versions });

export const FOLDERS = ["~", "~/Documents", "~/Downloads", "~/Projects", "~/Projects/sios", "~/Pictures"] as const;

export const SIDEBAR: { path: string; label: string }[] = [
  { path: "~", label: "Home" },
  { path: "~/Documents", label: "Documents" },
  { path: "~/Downloads", label: "Downloads" },
  { path: "~/Projects", label: "Projects" },
  { path: "~/Pictures", label: "Pictures" },
];

export const DOWNLOADS_MESSY: FileItem[] = [
  f("Q3 board notes.pdf", "pdf", "2.4 MB", "Today", { ...mail("Muhammad Rashid"), labels: ["Work"] }),
  f("IMG_4021.jpg", "image", "3.1 MB", "Today", you("phone sync", ["Personal"])),
  f("vscode-1.98-x86_64.rpm", "installer", "112 MB", "Yesterday", web("code.visualstudio.com")),
  f("invoice-0932.pdf", "pdf", "184 KB", "Yesterday", { ...mail("billing@cloudhost.example"), labels: ["Finance"] }),
  f("Screenshot 2026-10-02.png", "image", "1.2 MB", "Oct 2", you("screenshot")),
  f("budget-2026.xlsx", "sheet", "96 KB", "Oct 2", { ...you("Sheets export", ["Finance", "Personal"], 4) }),
  f("lecture-07-slides.pdf", "pdf", "8.7 MB", "Oct 1", web("learn.drexel.edu")),
  f("dataset-final(2).zip", "archive", "48 MB", "Sep 30", web("drive.google.com share link")),
  f("IMG_3998.jpg", "image", "2.9 MB", "Sep 29", you("phone sync", ["Personal"])),
  f("resume_v6.docx", "doc", "64 KB", "Sep 28", you("Word", ["Personal"], 6)),
  f("obsidian-1.8.AppImage", "installer", "96 MB", "Sep 27", web("github.com/obsidianmd")),
  f("Screenshot 2026-09-26.png", "image", "980 KB", "Sep 26", you("screenshot")),
  f("podcast-ep12.mp3", "audio", "41 MB", "Sep 25", web("podcasts.example.fm")),
  f("fonts-pack.tar.gz", "archive", "12 MB", "Sep 24", web("fontsource.example")),
  f("lease-agreement.pdf", "pdf", "1.1 MB", "Sep 22", { ...mail("leasing@parkview.example"), labels: ["Sensitive", "Personal"] }),
  f("notes.txt", "text", "4 KB", "Sep 20", you("Text editor", undefined, 2)),
];

export const ORGANIZE_GROUPS: { folder: string; kinds: FileItem["kind"][] }[] = [
  { folder: "Documents", kinds: ["pdf", "doc", "sheet", "text"] },
  { folder: "Images", kinds: ["image"] },
  { folder: "Installers", kinds: ["installer"] },
  { folder: "Archives", kinds: ["archive"] },
  { folder: "Media", kinds: ["audio", "video"] },
];

/** A few files start out with a history of being made from others. */
function link(fs: Record<string, FileItem[]>, child: string, parents: string[]) {
  const all = Object.values(fs).flat();
  const c = all.find((x) => x.name === child);
  if (c) c.from = parents.map((p) => all.find((x) => x.name === p)?.id).filter((x): x is string => !!x);
  return fs;
}

export function initialFs(): Record<string, FileItem[]> {
  const fs: Record<string, FileItem[]> = {
    "~": [
      f("Documents", "folder", undefined, "Today"),
      f("Downloads", "folder", undefined, "Today"),
      f("Projects", "folder", undefined, "Yesterday"),
      f("Pictures", "folder", undefined, "Oct 3"),
    ],
    "~/Documents": [
      f("Q3 notes.md", "text", "12 KB", "Oct 6", you("Text editor", ["Work"], 7)),
      f("Weekly notes, Oct 6.md", "text", "8 KB", "Oct 6", you("Text editor", ["Work"], 3)),
      f("Course schedule.pdf", "pdf", "220 KB", "Sep 2", { ...web("drexel.edu"), labels: ["Personal"] }),
      f("Taxes 2025", "folder", undefined, "Apr 12", you(undefined, ["Sensitive", "Finance"])),
    ],
    "~/Downloads": DOWNLOADS_MESSY.map((x) => ({ ...x })),
    "~/Projects": [
      f("sios", "folder", undefined, "Today", you("git", ["Work"])),
      f("vault", "folder", undefined, "Oct 4", you("git", ["Work"])),
      f("portfolio-site", "folder", undefined, "Aug 19", you("git", ["Personal"])),
    ],
    "~/Projects/sios": [
      f("Containerfile", "code", "2 KB", "Today", you("git", ["Work"], 12)),
      f("build_files", "folder", undefined, "Today", you("git", ["Work"])),
      f("docs", "folder", undefined, "Today", you("git", ["Work"])),
      f("system_files", "folder", undefined, "Sep 28", you("git", ["Work"])),
      f("README.md", "text", "6 KB", "Sep 28", you("git", ["Work"], 5)),
      f("Justfile", "code", "3 KB", "Sep 28", you("git", ["Work"], 3)),
    ],
    "~/Trash": [],
    "~/Pictures": [
      f("Screenshots", "folder", undefined, "Oct 2", you()),
      f("wallpaper-draft.png", "image", "4.2 MB", "Sep 18", you("Krita", ["Work"], 2)),
    ],
  };
  link(fs, "Weekly notes, Oct 6.md", ["Q3 notes.md"]);
  link(fs, "wallpaper-draft.png", ["IMG_3998.jpg"]);
  link(fs, "README.md", ["Q3 notes.md"]);
  return fs;
}

export const TEAM: Person[] = [
  { name: "Muhammad Rashid", email: "m.rashid@example.com", role: "Co-founder", initials: "MR", tone: "#5b7fa6" },
  { name: "Sara Okafor", email: "sara.okafor@example.com", role: "Design", initials: "SO", tone: "#8a6d9e" },
  { name: "Daniel Kim", email: "dkim@example.com", role: "Advisor", initials: "DK", tone: "#5f8a6a" },
];

export const NETWORKS: Network[] = [
  { ssid: "Home-5G", signal: 4, secured: true, saved: true },
  { ssid: "Drexel-Guest", signal: 3, secured: false, saved: true },
  { ssid: "CoffeeLab", signal: 2, secured: true, saved: false },
  { ssid: "NETGEAR-41", signal: 1, secured: true, saved: false },
];
