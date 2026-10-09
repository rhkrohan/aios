"use client";

// SIOS icon set. Hand-drawn SVGs on a 64px grid.
// Slate = the system. Lantern amber = the AI's light at the end of the tunnel.

import { useId } from "react";
import type { AppId, FileKind } from "@/lib/types";

// ---------------------------------------------------------------- brand mark

/** Three nested arches (the tunnel) with the lantern at the end. */
export function BrandMark({ size = 16, lantern = true, className }: { size?: number; lantern?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M2.5 21V10.5a9.5 9.5 0 0 1 19 0V21" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M6.5 21v-9.5a5.5 5.5 0 0 1 11 0V21" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" opacity=".7" />
      <path d="M10.2 21v-8.2a1.8 1.8 0 0 1 3.6 0V21" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" opacity=".45" />
      {lantern && <circle cx="12" cy="17.6" r="1.7" fill="var(--ai)" />}
    </svg>
  );
}

// ---------------------------------------------------------------- emblems (24px grid, stroked)

const EMBLEM: Record<string, React.ReactNode> = {
  home: <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" />,
  documents: <path d="M6 7.5h12M6 12h12M6 16.5h7.5" />,
  downloads: <path d="M12 4.5v10.5m-4.5-4.5L12 15l4.5-4.5M5.5 19.5h13" />,
  projects: <path d="m8.5 7-5 5 5 5m7-10 5 5-5 5" />,
  pictures: (
    <>
      <path d="m3.5 18 5-5.5 4 4 2.5-2.5 5.5 4" />
      <circle cx="15.5" cy="8" r="2" />
    </>
  ),
  media: (
    <>
      <path d="M9 17.5V6l10-2v11.5" />
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="16.5" cy="15.5" r="2.5" />
    </>
  ),
  archive: <path d="M4 8h16v11H4zM3 4.5h18V8H3zM10 12h4" />,
  installer: <path d="m12 3.5 8 4.2v8.6l-8 4.2-8-4.2V7.7zm0 8.4 8-4.2m-8 4.2-8-4.2m8 4.2v8.6" />,
  taxes: <path d="M7 4.5h10v15H7zM9.5 9h5m-5 3.5h5m-5 3.5h3" />,
};

export function folderEmblem(name: string): keyof typeof EMBLEM | undefined {
  const n = name.toLowerCase();
  if (n === "home" || n === "~") return "home";
  if (n.startsWith("document")) return "documents";
  if (n.startsWith("download")) return "downloads";
  if (n.startsWith("project")) return "projects";
  if (["pictures", "images", "screenshots"].includes(n)) return "pictures";
  if (n === "media" || n === "music") return "media";
  if (n.startsWith("archive")) return "archive";
  if (n.startsWith("installer")) return "installer";
  if (n.startsWith("tax")) return "taxes";
  return undefined;
}

// ---------------------------------------------------------------- folder

export type FolderColor = "blue" | "violet" | "teal" | "amber" | "rose";

const FOLDER: Record<FolderColor, { back: [string, string]; front: [string, string, string]; ink: string }> = {
  blue: { back: ["#3f8fe6", "#2a6fcf"], front: ["#9fd2fd", "#6db3f8", "#4593ec"], ink: "#2563c4" },
  violet: { back: ["#7f6fe6", "#5f4fcf"], front: ["#c3b9fd", "#9e8ff8", "#7d6cec"], ink: "#5443c0" },
  teal: { back: ["#2fa592", "#1f8574"], front: ["#93e3d2", "#5cc9b3", "#36ab95"], ink: "#1b7a69" },
  amber: { back: ["#e59a2f", "#c97a1c"], front: ["#ffd796", "#fbb860", "#ef9a35"], ink: "#b0650f" },
  rose: { back: ["#e0647e", "#c44863"], front: ["#ffb9c8", "#f88ca3", "#ea6b87"], ink: "#b33a56" },
};

export function FolderIcon({ size = 48, emblem, ai = false, color = "blue" }: { size?: number; emblem?: string; ai?: boolean; color?: FolderColor }) {
  const id = useId().replace(/:/g, "");
  const c = FOLDER[color];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0 overflow-visible">
      <defs>
        <linearGradient id={`fb${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.back[0]} />
          <stop offset="1" stopColor={c.back[1]} />
        </linearGradient>
        <linearGradient id={`ff${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.front[0]} />
          <stop offset=".55" stopColor={c.front[1]} />
          <stop offset="1" stopColor={c.front[2]} />
        </linearGradient>
        <filter id={`fs${id}`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="1.6" stdDeviation="1.6" floodColor="#1c2f45" floodOpacity=".28" />
        </filter>
      </defs>
      <g filter={`url(#fs${id})`}>
        {/* back + tab */}
        <path d="M6 15a4 4 0 0 1 4-4h13.2a4 4 0 0 1 2.9 1.2l2.6 2.8H54a4 4 0 0 1 4 4V30H6z" fill={`url(#fb${id})`} />
        {/* paper peeking out */}
        <rect x="10" y="17.5" width="44" height="22" rx="2" fill="#f4f7fa" />
        <rect x="12.5" y="19.5" width="39" height="22" rx="2" fill="#ffffff" opacity=".9" />
        {/* front */}
        <path d="M4 26a4.5 4.5 0 0 1 4.5-4.5h47A4.5 4.5 0 0 1 60 26v22.5a6.5 6.5 0 0 1-6.5 6.5h-43A6.5 6.5 0 0 1 4 48.5z" fill={`url(#ff${id})`} />
        <path d="M8.5 22.25h47" stroke="#fff" strokeOpacity=".55" strokeWidth="1.2" strokeLinecap="round" />
      </g>
      {emblem && EMBLEM[emblem] && (
        <g transform="translate(22.4 28.6) scale(.8)" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* emboss: light edge below, engraved stroke on top */}
          <g stroke="#fff" strokeOpacity=".45" strokeWidth="2.4" transform="translate(0 1.1)">
            {EMBLEM[emblem]}
          </g>
          <g stroke={c.ink} strokeOpacity=".7" strokeWidth="2.4">
            {EMBLEM[emblem]}
          </g>
        </g>
      )}
      {ai && <AiSpark />}
    </svg>
  );
}

/** Small orb badge: "SIOS made or changed this". */
function AiSpark() {
  return (
    <g transform="translate(46 4)">
      <circle cx="8" cy="8" r="8" fill="#4f7bf7" stroke="#fff" strokeWidth="2" />
      <path d="M8 3.8 9.2 6.8l3 1.2-3 1.2L8 12.2 6.8 9.2 3.8 8l3-1.2z" fill="#fff" />
    </g>
  );
}

// ---------------------------------------------------------------- files

export const FILE_COLOR: Record<Exclude<FileKind, "folder">, string> = {
  pdf: "#d4524b",
  doc: "#3b74bf",
  sheet: "#2e8d5c",
  slides: "#dc7637",
  image: "#7b62c4",
  archive: "#8b7652",
  installer: "#56616e",
  code: "#2f5d8a",
  text: "#6b7480",
  audio: "#c1457d",
  video: "#c1457d",
};

function ext(name: string, kind: FileKind) {
  const m = name.match(/\.([a-z0-9]+)$/i);
  if (m) {
    const e = m[1].toUpperCase();
    if (e === "APPIMAGE") return "APP";
    if (e === "GZ") return "TGZ";
    return e.slice(0, 4);
  }
  if (kind === "code") return name.toLowerCase().includes("justfile") ? "JUST" : "CODE";
  return "";
}

export function FileIcon({ kind, name, size = 48, ai = false }: { kind: FileKind; name: string; size?: number; ai?: boolean }) {
  const id = useId().replace(/:/g, "");
  if (kind === "folder") return <FolderIcon size={size} emblem={folderEmblem(name)} ai={ai} />;
  const c = FILE_COLOR[kind];
  const label = ext(name, kind);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0 overflow-visible">
      <defs>
        <linearGradient id={`pg${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#f1f3f5" />
        </linearGradient>
        <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9cc4ea" />
          <stop offset="1" stopColor="#f3d9b1" />
        </linearGradient>
        <filter id={`ps${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.4" stdDeviation="1.4" floodColor="#1c2430" floodOpacity=".22" />
        </filter>
      </defs>
      <g filter={`url(#ps${id})`}>
        <path d="M15 4h24.5L52 16.5V55a5 5 0 0 1-5 5H15a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5z" fill={`url(#pg${id})`} />
      </g>
      <path d="M39.5 4v8.5a4 4 0 0 0 4 4H52z" fill="#dde2e8" />
      <path d="M15 4.5h24.3" stroke="#fff" strokeWidth="1" />

      {/* contents */}
      {kind === "image" && (
        <g>
          <rect x="15" y="19" width="32" height="22" rx="3" fill={`url(#sky${id})`} />
          <circle cx="39" cy="25" r="3" fill="#fff6dc" />
          <path d="M15 37.5 23.5 29l6 6 4-3.5L47 40v-2.5 0A3.5 3.5 0 0 1 44 41H18a3 3 0 0 1-3-3z" fill={c} opacity=".85" />
        </g>
      )}
      {(kind === "pdf" || kind === "doc" || kind === "text") && (
        <g stroke={kind === "text" ? "#aab2bc" : c} strokeOpacity={kind === "text" ? 1 : 0.55} strokeWidth="2.4" strokeLinecap="round">
          <path d="M17 20h18M17 26h26M17 32h26M17 38h16" />
        </g>
      )}
      {kind === "sheet" && (
        <g>
          <rect x="16" y="18" width="30" height="22" rx="2" fill={c} opacity=".12" />
          <path d="M16 25.3h30M16 32.6h30M26 18v22M36 18v22" stroke={c} strokeOpacity=".6" strokeWidth="1.4" />
          <rect x="16" y="18" width="30" height="22" rx="2" fill="none" stroke={c} strokeOpacity=".6" strokeWidth="1.4" />
        </g>
      )}
      {kind === "slides" && (
        <g>
          <rect x="16" y="19" width="30" height="20" rx="2.5" fill={c} opacity=".18" />
          <path d="M21 33h8M21 28h14" stroke={c} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}
      {kind === "code" && (
        <path d="m24 23-6 6 6 6m14-12 6 6-6 6m-5-15-4 18" fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {kind === "archive" && (
        <g>
          <path d="M31 4v36" stroke={c} strokeOpacity=".25" strokeWidth="6" />
          <path d="M28.5 8h5m-5 6h5m-5 6h5m-5 6h5" stroke={c} strokeWidth="2.2" strokeLinecap="round" />
          <rect x="27.5" y="29" width="7" height="9" rx="2" fill={c} />
        </g>
      )}
      {kind === "installer" && (
        <g fill="none" stroke={c} strokeWidth="2.2" strokeLinejoin="round">
          <path d="m31 17 12 6v12l-12 6-12-6V23z" fill={c} fillOpacity=".12" />
          <path d="m19 23 12 6 12-6M31 29v12" />
        </g>
      )}
      {(kind === "audio" || kind === "video") && (
        <path d="M17 29v4m5-9v14m5-18v22m5-16v10m5-14v18m5-11v4" stroke={c} strokeWidth="2.6" strokeLinecap="round" />
      )}

      {/* type badge */}
      {label && (
        <g>
          <rect x="7" y="43.5" width={Math.max(22, label.length * 6.6 + 9)} height="12.5" rx="3.5" fill={c} />
          <text
            x={7 + Math.max(22, label.length * 6.6 + 9) / 2}
            y="52.6"
            textAnchor="middle"
            fontSize="8.6"
            fontWeight="700"
            fill="#fff"
            letterSpacing=".3"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {label}
          </text>
        </g>
      )}
      {ai && <AiSpark />}
    </svg>
  );
}

// ---------------------------------------------------------------- app icons

const APP_BG: Record<AppId | "assistant", [string, string]> = {
  files: ["#f4f8fd", "#dfe8f3"],
  browser: ["#6fcbff", "#2a6fe6"],
  mail: ["#5ab2ff", "#1f66e0"],
  terminal: ["#3b4048", "#121418"],
  activity: ["#3b4048", "#17191d"],
  settings: ["#eceff2", "#a7afb8"],
  store: ["#8aa8ff", "#5a5ff0"],
  security: ["#5fd0a0", "#1f8a66"],
  goals: ["#ffb057", "#e8743b"],
  systemmap: ["#6ea8ff", "#3b4fd8"],
  memory: ["#c79bff", "#7b4fe0"],
  assistant: ["#8fd3ff", "#4f6ef0"],
};

export function AppIcon({ app, size = 48 }: { app: AppId | "assistant"; size?: number }) {
  const id = useId().replace(/:/g, "");
  const [a, b] = APP_BG[app];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
        <linearGradient id={`gl${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".32" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`lg${id}`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#ffd28a" />
          <stop offset=".35" stopColor="#f0a83c" stopOpacity=".85" />
          <stop offset="1" stopColor="#f0a83c" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="15" fill={`url(#bg${id})`} />
      <rect x="2" y="2" width="60" height="60" rx="15" fill={`url(#gl${id})`} />
      <rect x="2.5" y="2.5" width="59" height="59" rx="14.5" fill="none" stroke="#fff" strokeOpacity=".18" />

      {app === "files" && (
        <g>
          <path d="M13 21a3 3 0 0 1 3-3h9.5l3 3H48a3 3 0 0 1 3 3v3H13z" fill="#2f7fe0" />
          <rect x="16" y="22.5" width="32" height="12" rx="1.5" fill="#fff" />
          <path d="M11 28.5a3 3 0 0 1 3-3h36a3 3 0 0 1 3 3V45a4 4 0 0 1-4 4H15a4 4 0 0 1-4-4z" fill="#59a8f5" />
          <path d="M14 26.1h36" stroke="#a9d4fd" strokeWidth="1.2" />
        </g>
      )}
      {app === "browser" && (
        <g fill="none" stroke="#fff" strokeWidth="2.4">
          <circle cx="32" cy="32" r="16.5" fill="#fff" fillOpacity=".12" />
          <ellipse cx="32" cy="32" rx="7.5" ry="16.5" />
          <path d="M15.5 32h33M18 23.5h28M18 40.5h28" strokeOpacity=".85" />
        </g>
      )}
      {app === "mail" && (
        <g>
          <rect x="12.5" y="19" width="39" height="27" rx="4.5" fill="#fff" />
          <path d="m14 21.5 15.7 12.2a3.8 3.8 0 0 0 4.6 0L50 21.5" fill="none" stroke="#2f7fe0" strokeOpacity=".8" strokeWidth="2.6" strokeLinejoin="round" />
        </g>
      )}
      {app === "terminal" && (
        <g strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="m17 24 8 7-8 7" stroke="#fff" strokeWidth="3.2" />
          <path d="M30 40h15" stroke="#fff" strokeOpacity=".75" strokeWidth="3.2" />
        </g>
      )}
      {app === "activity" && (
        <g>
          {[
            [17, 36, "#6ee7a8"],
            [25, 28, "#5fd39a"],
            [33, 20, "#4cc38a"],
            [41, 30, "#6ee7a8"],
          ].map(([x, y, c]) => (
            <rect key={x as number} x={x as number} y={y as number} width="6" height={46 - (y as number)} rx="2" fill={c as string} />
          ))}
        </g>
      )}
      {app === "settings" && (
        <g>
          <g fill="#59616b">
            {Array.from({ length: 8 }, (_, i) => (
              <rect key={i} x="29" y="11" width="6" height="9" rx="2" transform={`rotate(${i * 45} 32 32)`} />
            ))}
          </g>
          <circle cx="32" cy="32" r="14" fill="#59616b" />
          <circle cx="32" cy="32" r="9" fill="#e5e8ec" />
          <circle cx="32" cy="32" r="4.5" fill="#59616b" />
        </g>
      )}
      {app === "assistant" && <OrbStar />}
      {app === "goals" && (
        <g fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
          <circle cx="32" cy="32" r="15" strokeOpacity=".5" />
          <circle cx="32" cy="32" r="8" />
          <circle cx="32" cy="32" r="2.2" fill="#fff" />
          <path d="M32 32 46 18" />
        </g>
      )}
      {app === "memory" && (
        <g fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
          {/* linked memories: a small constellation */}
          <path d="M21 24 32 18l11 6M21 24l4 15 7 7 7-7 4-15M32 18v12m-7 9 7-9 7 9" strokeWidth="2.4" strokeOpacity=".75" />
          {[[21, 24], [32, 18], [43, 24], [25, 39], [39, 39], [32, 46], [32, 30]].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="3.4" fill="#fff" stroke="none" />
          ))}
        </g>
      )}
      {app === "systemmap" && (
        <g fill="#fff">
          <rect x="15" y="16" width="12" height="9" rx="2.5" />
          <rect x="37" y="16" width="12" height="9" rx="2.5" />
          <rect x="26" y="39" width="12" height="9" rx="2.5" />
          <path d="M21 25v5h22v-5M32 30v9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {app === "security" && (
        <g>
          <path d="M32 13 47 19v11.5c0 9.6-6.3 17.6-15 20.5-8.7-2.9-15-10.9-15-20.5V19z" fill="#fff" />
          <path d="m25.5 31.5 4.8 4.8 8.8-9.3" fill="none" stroke="#1f8a66" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {app === "store" && (
        <g>
          <path d="M18 25h28l-2.2 21a3 3 0 0 1-3 2.7H23.2a3 3 0 0 1-3-2.7z" fill="#fff" />
          <path d="M25 27v-4.5a7 7 0 0 1 14 0V27" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" />
          <circle cx="32" cy="37" r="3.4" fill="#5a5ff0" />
        </g>
      )}
    </svg>
  );
}

function OrbStar() {
  return <path d="M32 15c1.6 8.7 7.3 15.4 17 17-9.7 1.6-15.4 8.3-17 17-1.6-8.7-7.3-15.4-17-17 9.7-1.6 15.4-8.3 17-17z" fill="#fff" />;
}

/** The SIOS orb: the AI's face. Spins slowly while working. */
export function Orb({ size = 36, busy = false }: { size?: number; busy?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <span className="relative inline-grid place-items-center shrink-0" style={{ width: size, height: size }}>
      {busy && <span className="absolute -inset-1 rounded-full bg-[#6fa0ff]/45 blur-md animate-pulse" />}
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="relative">
        <defs>
          <radialGradient id={`o${id}`} cx=".32" cy=".28" r=".9">
            <stop offset="0" stopColor="#c9ecff" />
            <stop offset=".35" stopColor="#6fb2ff" />
            <stop offset=".75" stopColor="#4f6ef0" />
            <stop offset="1" stopColor="#6a4fe0" />
          </radialGradient>
        </defs>
        <circle cx="32" cy="32" r="31" fill={`url(#o${id})`} />
        <circle cx="32" cy="32" r="30.5" fill="none" stroke="#fff" strokeOpacity=".45" />
        <g className={busy ? "origin-center animate-[spin_3s_linear_infinite]" : undefined} style={{ transformOrigin: "32px 32px" }}>
          <g transform="translate(32 32) scale(.72) translate(-32 -32)">
            <OrbStar />
          </g>
        </g>
      </svg>
    </span>
  );
}

// ---------------------------------------------------------------- trash

export function TrashIcon({ size = 48, full = false }: { size?: number; full?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0 overflow-visible">
      <defs>
        <linearGradient id={`tb${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c9d2dc" />
          <stop offset=".5" stopColor="#f3f6f9" />
          <stop offset="1" stopColor="#c3ccd6" />
        </linearGradient>
        <filter id={`ts${id}`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="1.6" stdDeviation="1.6" floodColor="#1c2f45" floodOpacity=".25" />
        </filter>
      </defs>
      <g filter={`url(#ts${id})`}>
        <path d="M13 17h38l-3.4 37.2A5 5 0 0 1 42.6 59H21.4a5 5 0 0 1-5-4.8z" fill={`url(#tb${id})`} />
        <rect x="10" y="11" width="44" height="7" rx="3.5" fill="#dfe5eb" />
        <path d="M26 11V9a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v2" fill="none" stroke="#aab5c1" strokeWidth="2.4" />
      </g>
      <path d="M24.5 25l1.3 25m6.2-25v25m7.5-25-1.3 25" stroke="#8b98a6" strokeOpacity=".7" strokeWidth="2" strokeLinecap="round" />
      {full && <path d="M18 17c4-6 10-3 14-6s10 0 14 6z" fill="#f4f7fa" stroke="#c9d2dc" />}
    </svg>
  );
}
