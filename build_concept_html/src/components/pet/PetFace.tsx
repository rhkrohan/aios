"use client";

// The cute parts every pet shares: blushing cheeks, a mouth that follows its
// mood, and a ripple of light when you tap it. Helpers are the
// same orb in a soft pastel, a bit smaller.

import { AnimatePresence, motion } from "motion/react";
import { StringOrb } from "../icons/StringOrb";

export const PASTELS: Record<string, { glow: string; tint: string; ring: string; label: string; hue: number }> = {
  mint: { hue: -80, label: "Mint", glow: "rgba(110,220,180,.55)", tint: "radial-gradient(circle at 40% 35%,rgba(255,255,255,.7),rgba(150,235,200,.55) 50%,rgba(70,190,150,.35))", ring: "#7fdcb7" },
  peach: { hue: 150, label: "Peach", glow: "rgba(255,170,140,.55)", tint: "radial-gradient(circle at 40% 35%,rgba(255,255,255,.7),rgba(255,195,170,.6) 50%,rgba(240,140,110,.35))", ring: "#ffb59a" },
  lavender: { hue: 35, label: "Lavender", glow: "rgba(185,150,255,.55)", tint: "radial-gradient(circle at 40% 35%,rgba(255,255,255,.7),rgba(205,185,255,.6) 50%,rgba(150,115,240,.35))", ring: "#c3a8ff" },
  butter: { hue: 185, label: "Butter", glow: "rgba(255,215,110,.55)", tint: "radial-gradient(circle at 40% 35%,rgba(255,255,255,.75),rgba(255,230,150,.6) 50%,rgba(235,190,80,.35))", ring: "#ffd77a" },
  sky: { hue: -30, label: "Sky", glow: "rgba(120,190,255,.55)", tint: "radial-gradient(circle at 40% 35%,rgba(255,255,255,.7),rgba(170,215,255,.6) 50%,rgba(90,160,240,.35))", ring: "#8cc8ff" },
};

/** A tiny mouth: a smile most of the time, an "o" when it needs you, a yawn when sleepy. */
export function Mouth({ mood, size }: { mood: string; size: number }) {
  const s = size / 58;
  return (
    <span className="absolute left-1/2 -translate-x-1/2 pointer-events-none" style={{ top: "57%" }}>
      {mood === "waiting" ? (
        <span className="block rounded-full border-[2px] border-[#1a1d3a]" style={{ width: 7 * s, height: 8 * s }} />
      ) : mood === "sleeping" ? (
        <motion.span className="block rounded-full bg-[#1a1d3a]/80" style={{ width: 6 * s }} animate={{ height: [2 * s, 7 * s, 2 * s] }} transition={{ duration: 3.2, repeat: Infinity }} />
      ) : (
        <svg width={12 * s} height={7 * s} viewBox="0 0 12 7">
          <path d={mood === "happy" ? "M1.5 1.5 Q6 7.5 10.5 1.5" : "M2.5 2 Q6 5.5 9.5 2"} fill={mood === "happy" ? "#ff7a9a" : "none"} stroke="#1a1d3a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

/** A soft ripple of the orb's own light when you tap it. */
export function Hearts({ burst }: { burst: number[] }) {
  return (
    <AnimatePresence>
      {burst.slice(0, 2).map((id, i) => (
        <motion.span
          key={id}
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ border: "1.5px solid rgba(150,160,255,.85)", boxShadow: "0 0 14px 2px rgba(120,130,255,.45), inset 0 0 10px rgba(170,180,255,.35)" }}
          initial={{ opacity: 0.9, scale: 0.7 }}
          animate={{ opacity: 0, scale: 1.9 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeOut", delay: i * 0.18 }}
        />
      ))}
    </AnimatePresence>
  );
}

/** A helper's body: the same orb as the leader, smaller, in its own color. */
export function HelperBody({ size, color, mood, busy }: { size: number; color: string; mood: string; busy: boolean }) {
  const p = PASTELS[color] ?? PASTELS.mint;
  return (
    <>
      <span className="absolute -inset-[14%] grid place-items-center" style={{ filter: `hue-rotate(${p.hue}deg) saturate(1.25) drop-shadow(0 5px 10px ${p.glow})` }}>
        <StringOrb size={Math.round(size * 1.28)} busy={busy} strands={16} lively={1} />
      </span>
      <MiniEyes mood={mood} size={size} />
      <Mouth mood={mood} size={size} />
    </>
  );
}

function MiniEyes({ mood, size }: { mood: string; size: number }) {
  const s = size / 58;
  if (mood === "sleeping" || mood === "paused") {
    return (
      <span className="absolute left-0 right-0 top-[38%] flex justify-center pointer-events-none" style={{ gap: 8 * s }}>
        {[0, 1].map((i) => (
          <span key={i} className="rounded-full bg-[#1a1d3a]" style={{ width: 8 * s, height: 2.4 * s }} />
        ))}
      </span>
    );
  }
  if (mood === "happy") {
    return (
      <span className="absolute left-0 right-0 top-[33%] flex justify-center pointer-events-none" style={{ gap: 7 * s }}>
        {[0, 1].map((i) => (
          <svg key={i} width={10 * s} height={6 * s} viewBox="0 0 11 7">
            <path d="M1 6 Q5.5 0 10 6" fill="none" stroke="#1a1d3a" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        ))}
      </span>
    );
  }
  return (
    <span className="absolute left-0 right-0 top-[30%] flex justify-center pointer-events-none" style={{ gap: 6 * s }}>
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          className="relative rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.25)] overflow-hidden"
          style={{ width: 10 * s, height: 12 * s }}
          animate={{ scaleY: [1, 1, 0.1, 1] }}
          transition={{ duration: 3.6 + i * 0.3, times: [0, 0.9, 0.95, 1], repeat: Infinity }}
        >
          <span className="absolute rounded-full bg-[#1a1d3a] left-1/2 top-[55%] -translate-x-1/2 -translate-y-1/2" style={{ width: 5.5 * s, height: 5.5 * s }} />
          <span className="absolute rounded-full bg-white" style={{ width: 2 * s, height: 2 * s, left: "52%", top: "34%" }} />
        </motion.span>
      ))}
    </span>
  );
}
