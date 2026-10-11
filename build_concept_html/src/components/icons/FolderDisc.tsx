"use client";

// A folder as a disc, in the spirit of an identity disc: you read what's inside
// from its rings instead of opening it.
//
//   outer ring   what kinds of files, sized by how many
//   inner ring   how much came from the web or email (amber), and a gold or
//                red tick if it holds Finance or Sensitive files
//   core         the folder's emblem (or a photo); glows AI blue when an AI
//                changed something inside, and light runs around the rim while
//                an AI is working in it right now

import clsx from "clsx";
import { Code2, Download, FileText, Folder, Image as ImageIcon, Lock, Music, type LucideIcon } from "lucide-react";
import { useId } from "react";
import { selectBrainState, useOS } from "@/lib/store";
import type { FileItem, FileKind } from "@/lib/types";
import { FILE_COLOR } from "./Icons";

const FOLDER_SEG = "#8fb3ff";

const EMBLEM: Record<string, LucideIcon> = {
  projects: Code2,
  documents: FileText,
  downloads: Download,
  pictures: ImageIcon,
  screenshots: ImageIcon,
  images: ImageIcon,
  media: Music,
};

export interface DiscStats {
  total: number;
  segments: { kind: FileKind; n: number; color: string }[];
  untrusted: number;
  finance: boolean;
  sensitive: boolean;
  aiTouched: boolean;
}

export function discStats(items: FileItem[]): DiscStats {
  const counts = new Map<FileKind, number>();
  for (const it of items) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);
  const segments = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => ({ kind, n, color: kind === "folder" ? FOLDER_SEG : FILE_COLOR[kind] }));
  return {
    total: items.length,
    segments,
    untrusted: items.filter((x) => x.trust === "untrusted").length,
    finance: items.some((x) => x.labels?.includes("Finance")),
    sensitive: items.some((x) => x.labels?.includes("Sensitive")),
    aiTouched: items.some((x) => x.touchedBy || x.origin?.by === "SIOS"),
  };
}

/** Plain words for a disc, for tooltips and screen readers. */
export function discSummary(s: DiscStats): string {
  if (!s.total) return "Empty";
  const parts = s.segments.slice(0, 3).map((g) => `${g.n} ${g.kind === "folder" ? (g.n === 1 ? "folder" : "folders") : g.kind === "pdf" ? (g.n === 1 ? "PDF" : "PDFs") : g.n === 1 ? g.kind : `${g.kind}s`}`);
  if (s.untrusted) parts.push(`${s.untrusted} from the web or email`);
  return parts.join(", ");
}

function arc(r: number, a0: number, a1: number): string {
  // a full ring: two half arcs, since one arc from a point back to itself draws nothing
  if (a1 - a0 >= Math.PI * 2 - 1e-3) return `${arc(r, 0, Math.PI)} ${arc(r, Math.PI, Math.PI * 2 - 1e-4).replace("M", "L")}`;
  const p = (a: number) => [50 + r * Math.sin(a), 50 - r * Math.cos(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

const TAU = Math.PI * 2;

export function FolderDisc({
  path,
  name,
  size = 64,
  tone = "glass",
  photo,
  open = false,
  locked = false,
}: {
  /** The folder's path, to read its contents. */
  path?: string;
  name: string;
  size?: number;
  /** glass: on the wallpaper. surface: inside a window. */
  tone?: "glass" | "surface";
  photo?: string;
  /** Hovered or selected: rings separate a little and light up. */
  open?: boolean;
  locked?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const items = useOS((s) => (path ? s.fs[path] : undefined));
  const brain = useOS(selectBrainState);
  const s = discStats(items ?? []);
  const working = brain === "working" && (items ?? []).some((x) => x.touchedBy);
  const mini = size < 36;
  const Emblem = locked ? Lock : (EMBLEM[name.toLowerCase()] ?? Folder);

  // outer ring segments, with small gaps between them
  const gap = s.segments.length > 1 ? 0.07 : 0;
  const segs = s.segments.map((g, i) => {
    const start = s.segments.slice(0, i).reduce((t, x) => t + (x.n / Math.max(1, s.total)) * TAU, 0);
    const span = (g.n / Math.max(1, s.total)) * TAU;
    // folders inside: a white segment (near-white inside a window, so it still shows)
    const color = g.kind === "folder" ? (tone === "glass" ? "#ffffff" : "#dfe4ec") : g.color;
    return { ...g, color, a0: start + gap / 2, a1: start + span - gap / 2 };
  });
  const untrustedSpan = (s.untrusted / Math.max(1, s.total)) * TAU;
  const onGlass = tone === "glass";

  return (
    <span className="relative inline-grid place-items-center shrink-0" style={{ width: size, height: size }} title={`${name}: ${discSummary(s)}`}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="overflow-visible" aria-hidden>
        <defs>
          <radialGradient id={`body${id}`} cx="50%" cy="38%" r="65%">
            {/* on the wallpaper: clear glass (the blur behind it does the work), lit from the top */}
            <stop offset="0" stopColor={onGlass ? "rgba(255,255,255,.26)" : "var(--surface)"} />
            <stop offset="1" stopColor={onGlass ? "rgba(255,255,255,.04)" : "var(--surface-3)"} />
          </radialGradient>
          <radialGradient id={`core${id}`} cx="50%" cy="40%" r="60%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor={s.aiTouched ? "#dfe7ff" : onGlass ? "#f4f7fb" : "#eef1f6"} />
          </radialGradient>
          <clipPath id={`clip${id}`}>
            <circle cx="50" cy="50" r="19" />
          </clipPath>
          <filter id={`glow${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>

        {/* body and rim */}
        <circle cx="50" cy="50" r="48" fill={`url(#body${id})`} />
        <circle cx="50" cy="50" r="48" fill="none" stroke={onGlass ? "rgba(255,255,255,.7)" : "var(--line)"} strokeWidth={onGlass ? 1.2 : 1} />
        {onGlass && <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(10,20,40,.18)" strokeWidth="1" transform="translate(0 1)" />}

        {/* outer ring: what's inside */}
        <g style={{ transform: `scale(${open ? 1.03 : 1})`, transformOrigin: "50px 50px", transition: "transform .35s cubic-bezier(.2,.8,.2,1)" }}>
          <circle cx="50" cy="50" r="41" fill="none" stroke={onGlass ? "rgba(255,255,255,.3)" : "var(--surface-3)"} strokeWidth="6" />
          {segs.map((g) => (
            <g key={g.kind}>
              {open && !mini && <path d={arc(41, g.a0, g.a1)} fill="none" stroke={g.color} strokeWidth="6" strokeLinecap="round" opacity=".55" filter={`url(#glow${id})`} />}
              <path d={arc(41, g.a0, g.a1)} fill="none" stroke={g.color} strokeWidth="6" strokeLinecap={segs.length > 1 ? "round" : "butt"} opacity={open ? 1 : 0.88} />
            </g>
          ))}
          {/* a light running around the rim while an AI works here */}
          {working && <circle cx="50" cy="50" r="41" fill="none" stroke="#9fb6ff" strokeWidth="6" strokeLinecap="round" pathLength={100} strokeDasharray="8 92" className="disc-run" filter={`url(#glow${id})`} />}
        </g>

        {/* groove */}
        {!mini && <circle cx="50" cy="50" r="34.5" fill="none" stroke={onGlass ? "rgba(255,255,255,.5)" : "var(--line)"} strokeWidth=".6" />}

        {/* inner ring: trust and sensitive labels */}
        {!mini && (
          <g style={{ transform: `scale(${open ? 0.97 : 1})`, transformOrigin: "50px 50px", transition: "transform .35s cubic-bezier(.2,.8,.2,1)" }}>
            <circle cx="50" cy="50" r="29" fill="none" stroke={onGlass ? "rgba(255,255,255,.4)" : "var(--surface-3)"} strokeWidth="2.2" />
            {s.untrusted > 0 && <path d={arc(29, 0, Math.min(untrustedSpan, TAU - 0.001))} fill="none" stroke="#e0a03a" strokeWidth="2.2" strokeLinecap="round" />}
            {s.finance && <circle cx="50" cy="21" r="2.4" fill="#c99a2e" stroke={onGlass ? "#fff" : "var(--surface)"} strokeWidth=".8" transform="rotate(200 50 50)" />}
            {s.sensitive && <circle cx="50" cy="21" r="2.4" fill="#c4504b" stroke={onGlass ? "#fff" : "var(--surface)"} strokeWidth=".8" transform="rotate(160 50 50)" />}
          </g>
        )}

        {/* core */}
        {s.aiTouched && <circle cx="50" cy="50" r="22" fill="#4f7bf7" opacity=".55" filter={`url(#glow${id})`} className="disc-pulse" />}
        {/* a soft shadow under the core so it sits above the glass */}
        {onGlass && <circle cx="50" cy="51.5" r={mini ? 22 : 19} fill="rgba(10,20,40,.18)" filter={`url(#glow${id})`} />}
        <circle cx="50" cy="50" r={mini ? 22 : 19} fill={`url(#core${id})`} stroke={s.aiTouched ? "#4f7bf7" : onGlass ? "#ffffff" : "var(--line)"} strokeWidth={s.aiTouched ? 1.4 : 0.8} />
        {photo && <image href={photo} x="31" y="31" width="38" height="38" preserveAspectRatio="xMidYMid slice" clipPath={`url(#clip${id})`} />}
      </svg>
      {!photo && (
        <Emblem
          size={Math.max(9, Math.round(size * (mini ? 0.3 : 0.2)))}
          strokeWidth={2}
          className={clsx("absolute", s.aiTouched ? "text-ai" : locked ? "text-danger" : "text-[#4a5568]")}
        />
      )}
    </span>
  );
}
