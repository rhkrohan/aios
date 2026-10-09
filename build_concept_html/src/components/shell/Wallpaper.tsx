"use client";

import clsx from "clsx";
import { useMemo } from "react";
import { selectBrainState, useOS } from "@/lib/store";

const VP = { x: 1060, y: 610 };
const N = 14;

function mix(a: string, b: string, t: number) {
  const pa = a.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

const PALETTE = {
  light: { outer: "#eceeeb", inner: "#a9bfd6", edge: "#ffffff", edgeOpacity: 0.55, glow: 0.55, bg: "#e9ece9" },
  dark: { outer: "#101419", inner: "#233a54", edge: "#9fc0e0", edgeOpacity: 0.07, glow: 0.7, bg: "#0e1216" },
};

/** The tunnel: nested arches receding to a vanishing point, with the lantern at the end. */
function TunnelWallpaper() {
  const theme = useOS((s) => s.theme);
  const brain = useOS(selectBrainState);
  const p = PALETTE[theme];

  const arches = useMemo(
    () =>
      Array.from({ length: N }, (_, i) => {
        const s = Math.pow(0.79, i);
        const half = 1150 * s;
        const base = VP.y + 560 * s;
        const shoulder = base - 430 * s;
        const d = `M${VP.x - half} ${base + 400}V${shoulder}A${half} ${half} 0 0 1 ${VP.x + half} ${shoulder}V${base + 400}Z`;
        return { d, t: i / (N - 1) };
      }),
    [],
  );

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden style={{ background: p.bg, transition: "background .6s ease" }}>
      <svg className="absolute inset-0 size-full" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="lantern" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffe2ad" />
            <stop offset="0.25" stopColor="#f5b551" stopOpacity="0.85" />
            <stop offset="1" stopColor="#f0a33a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={p.bg} stopOpacity="0" />
            <stop offset="1" stopColor={p.bg} stopOpacity={theme === "dark" ? 0.5 : 0.35} />
          </linearGradient>
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.6 0" />
          </filter>
        </defs>

        {arches.map((a, i) => (
          <path
            key={i}
            d={a.d}
            fill={mix(p.outer.slice(1), p.inner.slice(1), Math.pow(a.t, 1.15))}
            stroke={p.edge}
            strokeOpacity={p.edgeOpacity * (1 - a.t * 0.5)}
            strokeWidth={1.6}
            style={{ transition: "fill .6s ease" }}
          />
        ))}

        <g className={clsx("lantern", brain === "working" && "lantern-working", brain === "waiting" && "lantern-waiting")}>
          <circle cx={VP.x} cy={VP.y + 4} r="300" fill="url(#lantern)" opacity={p.glow * 0.55} />
          <circle cx={VP.x} cy={VP.y + 4} r="90" fill="url(#lantern)" opacity={p.glow} />
          <circle cx={VP.x} cy={VP.y + 8} r="7" fill="#ffe7bd" />
        </g>

        <rect width="1600" height="1000" fill="url(#haze)" />
        <rect width="1600" height="1000" filter="url(#grain)" opacity={theme === "dark" ? 0.05 : 0.07} style={{ mixBlendMode: "overlay" }} />
      </svg>
    </div>
  );
}

const PHOTO: Record<"dusk" | "lake", string> = {
  dusk: "/wallpapers/dusk.jpg",
  lake: "/wallpapers/lake.jpg",
};

export function Wallpaper() {
  const wallpaper = useOS((s) => s.wallpaper);
  const theme = useOS((s) => s.theme);
  const brain = useOS(selectBrainState);
  if (wallpaper === "tunnel") return <TunnelWallpaper />;
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#1a1f2a]" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={PHOTO[wallpaper]} alt="" className="absolute inset-0 size-full object-cover" draggable={false} />
      {/* keeps the top bar and wordmark readable */}
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/15 to-transparent" />
      <div className={clsx("absolute inset-0 bg-[#070a10] transition-opacity duration-700", theme === "dark" ? "opacity-45" : "opacity-0")} />
      {/* the AI's light rises from the ask bar while it works */}
      <div
        className={clsx(
          "absolute left-1/2 bottom-0 -translate-x-1/2 w-[1100px] h-[520px] rounded-[50%] blur-3xl transition-opacity duration-700",
          "bg-[radial-gradient(closest-side,rgba(111,160,255,.55),rgba(122,92,240,.25),transparent)]",
          brain === "idle" || brain === "paused" ? "opacity-0" : brain === "waiting" ? "opacity-100" : "opacity-70 animate-pulse",
        )}
      />
    </div>
  );
}
