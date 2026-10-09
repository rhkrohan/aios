import type { FileItem, Network, Person } from "./types";

let n = 0;
const f = (name: string, kind: FileItem["kind"], size: string | undefined, modified: string): FileItem => ({
  id: `f${++n}`,
  name,
  kind,
  size,
  modified,
});

export const FOLDERS = ["~", "~/Documents", "~/Downloads", "~/Projects", "~/Projects/sios", "~/Pictures"] as const;

export const SIDEBAR: { path: string; label: string }[] = [
  { path: "~", label: "Home" },
  { path: "~/Documents", label: "Documents" },
  { path: "~/Downloads", label: "Downloads" },
  { path: "~/Projects", label: "Projects" },
  { path: "~/Pictures", label: "Pictures" },
];

export const DOWNLOADS_MESSY: FileItem[] = [
  f("Q3 board notes.pdf", "pdf", "2.4 MB", "Today"),
  f("IMG_4021.jpg", "image", "3.1 MB", "Today"),
  f("vscode-1.98-x86_64.rpm", "installer", "112 MB", "Yesterday"),
  f("invoice-0932.pdf", "pdf", "184 KB", "Yesterday"),
  f("Screenshot 2026-10-02.png", "image", "1.2 MB", "Oct 2"),
  f("budget-2026.xlsx", "sheet", "96 KB", "Oct 2"),
  f("lecture-07-slides.pdf", "pdf", "8.7 MB", "Oct 1"),
  f("dataset-final(2).zip", "archive", "48 MB", "Sep 30"),
  f("IMG_3998.jpg", "image", "2.9 MB", "Sep 29"),
  f("resume_v6.docx", "doc", "64 KB", "Sep 28"),
  f("obsidian-1.8.AppImage", "installer", "96 MB", "Sep 27"),
  f("Screenshot 2026-09-26.png", "image", "980 KB", "Sep 26"),
  f("podcast-ep12.mp3", "audio", "41 MB", "Sep 25"),
  f("fonts-pack.tar.gz", "archive", "12 MB", "Sep 24"),
  f("lease-agreement.pdf", "pdf", "1.1 MB", "Sep 22"),
  f("notes.txt", "text", "4 KB", "Sep 20"),
];

export const ORGANIZE_GROUPS: { folder: string; kinds: FileItem["kind"][] }[] = [
  { folder: "Documents", kinds: ["pdf", "doc", "sheet", "text"] },
  { folder: "Images", kinds: ["image"] },
  { folder: "Installers", kinds: ["installer"] },
  { folder: "Archives", kinds: ["archive"] },
  { folder: "Media", kinds: ["audio", "video"] },
];

export function initialFs(): Record<string, FileItem[]> {
  return {
    "~": [
      f("Documents", "folder", undefined, "Today"),
      f("Downloads", "folder", undefined, "Today"),
      f("Projects", "folder", undefined, "Yesterday"),
      f("Pictures", "folder", undefined, "Oct 3"),
    ],
    "~/Documents": [
      f("Q3 notes.md", "text", "12 KB", "Oct 6"),
      f("Weekly notes, Oct 6.md", "text", "8 KB", "Oct 6"),
      f("Course schedule.pdf", "pdf", "220 KB", "Sep 2"),
      f("Taxes 2025", "folder", undefined, "Apr 12"),
    ],
    "~/Downloads": DOWNLOADS_MESSY.map((x) => ({ ...x })),
    "~/Projects": [
      f("sios", "folder", undefined, "Today"),
      f("vault", "folder", undefined, "Oct 4"),
      f("portfolio-site", "folder", undefined, "Aug 19"),
    ],
    "~/Projects/sios": [
      f("Containerfile", "code", "2 KB", "Today"),
      f("build_files", "folder", undefined, "Today"),
      f("docs", "folder", undefined, "Today"),
      f("system_files", "folder", undefined, "Sep 28"),
      f("README.md", "text", "6 KB", "Sep 28"),
      f("Justfile", "code", "3 KB", "Sep 28"),
    ],
    "~/Pictures": [
      f("Screenshots", "folder", undefined, "Oct 2"),
      f("wallpaper-draft.png", "image", "4.2 MB", "Sep 18"),
    ],
  };
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
