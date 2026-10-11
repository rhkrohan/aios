"use client";

import clsx from "clsx";
import { EyeOff, Send, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { BRAND } from "@/lib/brand";
import { runRequest } from "@/lib/engine";
import { homeSpot, usePet } from "@/lib/pet";
import { useOS } from "@/lib/store";
import { useTour } from "@/lib/tour";
import type { FileKind, Run, Step } from "@/lib/types";
import { FileIcon } from "../icons/Icons";
import { StringOrb } from "../icons/StringOrb";
import { Hearts, Mouth } from "./PetFace";

const SIZE = 76;

// ---------------------------------------------------------------- where to go

/** Find the place on screen where a step's work happens. */
function targetFor(step: Step | undefined, run: Run): Element | null {
  const q = (s: string) => document.querySelector(s);
  if (run.status === "waiting") return q('[role="alertdialog"]');
  // thinking or checking: stay with the last thing it worked on
  const lastTool = [...run.steps].reverse().find((x) => x.tool && x.status !== "pending");
  const name = (step?.tool ?? lastTool?.tool)?.name ?? "";
  const win = (label: string) => q(`[aria-label="${label}"][role="dialog"]`);
  const dock = (label: string) => q(`nav[aria-label="Dock"] [aria-label="${label}"]`);
  if (name.startsWith("files.") || name === "apps.open") return win("Files") ?? dock("Files");
  if (name.startsWith("gmail.")) return win("Mail") ?? dock("Mail");
  if (name.startsWith("settings.")) return win("Settings") ?? dock("Settings");
  if (name.startsWith("network.")) return q('[aria-label="Wi-Fi"]');
  if (name.startsWith("browser.")) return win("Browser") ?? dock("Browser");
  if (name.startsWith("github.")) return dock("Store");
  return null; // thinking steps: hover where it is
}

const CARRY: Record<string, FileKind> = {
  "files.organize": "folder",
  "files.move": "pdf",
  "files.trash": "text",
  "files.restore": "text",
  "files.write": "text",
  "gmail.send": "doc",
  "gmail.draft": "doc",
};

function shortLabel(text: string) {
  return text.length > 34 ? text.slice(0, 32).trimEnd() + "..." : text;
}

// ---------------------------------------------------------------- the pet

export function Pet() {
  const pet = usePet();
  // the technical tour clears the stage; the everyday one keeps the pets (Wings joins in)
  const tourActive = useTour((s) => s.active && s.kind !== "everyday");
  const run = useOS((s) => s.runs[0]);
  const windows = useOS((s) => s.windows);
  const approval = useOS((s) => s.approval);
  const [eye, setEye] = useState({ x: 0, y: 0 });
  const [hearts, setHearts] = useState<number[]>([]);
  const lastActivity = useRef(0);
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const seenRun = useRef<string | null>(null);
  const reported = useRef<string | null>(null);

  // start at home
  useEffect(() => {
    const h = homeSpot();
    usePet.getState().goTo(h.x, h.y);
    lastActivity.current = Date.now();
  }, []);

  // eyes follow the cursor
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const { x, y } = usePet.getState();
      const dx = e.clientX - (x + SIZE / 2);
      const dy = e.clientY - (y + SIZE / 2);
      const d = Math.max(1, Math.hypot(dx, dy));
      setEye({ x: (dx / d) * 3, y: (dy / d) * 2.5 });
      if (usePet.getState().mood === "sleeping" && d < 140) {
        usePet.getState().setMood("idle");
        lastActivity.current = Date.now();
      }
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // fall asleep when nothing has happened for a while
  useEffect(() => {
    const t = setInterval(() => {
      const s = usePet.getState();
      if (s.mood === "idle" && !s.chatOpen && Date.now() - lastActivity.current > 25000) s.setMood("sleeping");
    }, 3000);
    return () => clearInterval(t);
  }, []);

  // follow the engine: go to where the work is
  useEffect(() => {
    if (!run) return;
    const s = usePet.getState();
    if (s.held) return;
    lastActivity.current = Date.now();
    const ended = ["done", "stopped", "failed"].includes(run.status);
    const visible = run.steps.filter((x) => x.status !== "pending");
    const step = visible.find((x) => x.status === "active") ?? visible[visible.length - 1];

    if (seenRun.current !== run.id && !ended) {
      seenRun.current = run.id;
      s.say("On it!");
    }

    if (ended) {
      if (reported.current === run.id) return;
      reported.current = run.id;
      s.carry(null);
      const ok = run.status === "done";
      s.setMood(ok ? "happy" : "sad");
      s.say(ok ? "Done!" : run.status === "stopped" ? "Stopped. Nothing else changed." : "I couldn't do that one.");
      if (s.chat.some((l) => l.from === "you" && l.text === run.request)) s.addLine({ from: "pet", text: run.summary ?? (ok ? "Done." : "That didn't work.") });
      const t = setTimeout(() => {
        const h = homeSpot();
        const p = usePet.getState();
        if (p.held) return;
        p.goTo(h.x, h.y);
        p.setMood("idle");
        p.say(null);
      }, 2600);
      return () => clearTimeout(t);
    }

    if (run.status === "waiting") {
      s.setMood("waiting");
      s.say("Need your OK on this one");
    } else if (step?.kind === "tool") {
      s.setMood("flying");
      s.say(shortLabel(step.label));
      s.carry(CARRY[step.tool?.name ?? ""] ?? null);
    } else if (step?.kind === "verify") {
      s.setMood("working");
      s.say("Checking it worked");
    } else if (step) {
      s.setMood("working");
      s.say(shortLabel(step.status === "active" ? step.label : step.doneLabel ?? step.label));
    }

    // fly to the target once it exists (windows may open a moment later)
    const raf = requestAnimationFrame(() => {
      const el = targetFor(step, run);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = Math.min(window.innerWidth - SIZE - 12, Math.max(12, run.status === "waiting" ? r.right + 12 : r.right - SIZE - 18));
      const y = Math.min(window.innerHeight - SIZE - 100, Math.max(48, run.status === "waiting" ? r.top + 40 : r.top - SIZE / 2));
      usePet.getState().goTo(x, y);
    });
    return () => cancelAnimationFrame(raf);
  }, [run, windows.length, approval]);

  if (tourActive) return null;

  // hidden: a small orb peeks from the corner
  if (!pet.visible) {
    return (
      <motion.button
        initial={{ x: 40 }}
        animate={{ x: 0 }}
        whileHover={{ x: -6 }}
        onClick={() => pet.setVisible(true)}
        aria-label={`Show your ${BRAND.name} buddy`}
        title="Show your buddy"
        className="fixed right-0 bottom-[150px] z-[970] pl-2 pr-3 py-2 rounded-l-full bg-glass-strong backdrop-blur-xl border border-glass-line border-r-0 shadow-pop"
      >
        <StringOrb size={26} busy={!!run && ["running", "waiting"].includes(run.status)} strands={12} />
      </motion.button>
    );
  }

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { dx: e.clientX - pet.x, dy: e.clientY - pet.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const nx = e.clientX - drag.current.dx;
    const ny = e.clientY - drag.current.dy;
    if (!drag.current.moved && Math.hypot(nx - pet.x, ny - pet.y) < 4) return;
    drag.current.moved = true;
    pet.setHeld(true);
    pet.goTo(nx, ny);
  };
  const onPointerUp = () => {
    const wasDrag = drag.current?.moved;
    drag.current = null;
    pet.setHeld(false);
    lastActivity.current = Date.now();
    if (!wasDrag) {
      // a little love every time you tap it
      const burst = [Date.now(), Date.now() + 1, Date.now() + 2];
      setHearts(burst);
      setTimeout(() => setHearts((h) => h.filter((x) => !burst.includes(x))), 1500);
      pet.setChatOpen(!pet.chatOpen);
      if (pet.mood === "sleeping") pet.setMood("idle");
    }
  };

  const flying = pet.mood === "flying";
  const busy = pet.mood === "flying" || pet.mood === "working" || pet.mood === "waiting";

  return (
    <motion.div
      className="fixed z-[990] select-none"
      animate={{ left: pet.x, top: pet.y }}
      transition={pet.held ? { duration: 0 } : { type: "spring", stiffness: 70, damping: 14, mass: 0.9 }}
      style={{ width: SIZE, height: SIZE }}
    >
      {/* speech bubble */}
      <AnimatePresence>
        {pet.bubble && !pet.chatOpen && (
          <motion.div
            key={pet.bubble}
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="glass absolute bottom-[calc(100%+12px)] right-0 w-max max-w-[260px] rounded-2xl rounded-br-md bg-glass-strong backdrop-blur-xl border border-glass-line shadow-pop px-3 py-1.5 text-[12.5px] font-medium leading-snug line-clamp-3"
          >
            {pet.bubble}
          </motion.div>
        )}
      </AnimatePresence>

      {/* shadow */}
      <motion.span
        className="absolute left-1/2 -translate-x-1/2 rounded-[50%] bg-black/25 blur-[3px]"
        animate={{ width: flying ? 22 : 38, opacity: flying ? 0.25 : 0.45 }}
        style={{ bottom: -10, height: 8 }}
      />

      {/* body */}
      <motion.div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        animate={
          pet.mood === "happy"
            ? { y: [0, -16, 0, -8, 0], rotate: [0, -6, 6, 0], scaleX: [1, 0.92, 1.1, 0.96, 1], scaleY: [1, 1.1, 0.9, 1.04, 1] }
            : pet.mood === "sleeping"
              ? { y: [0, 2, 0], scaleX: [1, 1.05, 1], scaleY: [1, 0.97, 1] }
              : flying
                ? { y: [0, -3, 0], rotate: [-4, 4, -4] }
                : // squash and stretch, like it's breathing and bouncing on its toes
                  { y: [0, -6, 0, 0], scaleX: [1, 0.96, 1.06, 1], scaleY: [1, 1.05, 0.94, 1] }
        }
        transition={{ duration: pet.mood === "happy" ? 0.9 : pet.mood === "sleeping" ? 3.2 : flying ? 0.6 : 2.4, repeat: pet.mood === "happy" ? 0 : Infinity, ease: "easeInOut" }}
        className="relative cursor-grab active:cursor-grabbing"
        style={{ width: SIZE, height: SIZE }}
        role="button"
        aria-label={`${BRAND.name} buddy`}
      >
        {/* the pet is the SIOS orb itself, a little bigger than its box so the strands can reach out */}
        <span className="absolute -inset-[14%] grid place-items-center drop-shadow-[0_6px_14px_rgba(80,90,230,.45)]">
          <StringOrb size={Math.round(SIZE * 1.28)} busy={busy} strands={22} lively={1} />
        </span>
        {/* the eyes were drawn for a 58px pet: scale them with it */}
        <span className="absolute inset-0 pointer-events-none" style={{ transform: `scale(${SIZE / 58})` }}>
          <Eyes mood={pet.mood} eye={eye} />
        </span>
        <Mouth mood={pet.mood} size={SIZE} />
        <Hearts burst={hearts} />
        {pet.mood === "sleeping" && <Zzz />}
      </motion.div>

      {/* carried item */}
      <AnimatePresence>
        {pet.carrying && (
          <motion.span
            initial={{ opacity: 0, y: -6, rotate: -20 }}
            animate={{ opacity: 1, y: 0, rotate: [-12, -4, -12] }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ rotate: { duration: 1.2, repeat: Infinity } }}
            className="absolute -bottom-3 -right-4 drop-shadow-md"
          >
            <FileIcon kind={pet.carrying as FileKind} name={pet.carrying === "folder" ? "Documents" : "file"} size={28} />
          </motion.span>
        )}
      </AnimatePresence>

      <AnimatePresence>{pet.chatOpen && <Chat />}</AnimatePresence>
    </motion.div>
  );
}

function Eyes({ mood, eye }: { mood: string; eye: { x: number; y: number } }) {
  if (mood === "sleeping") {
    return (
      <span className="absolute left-0 right-0 top-[38%] flex justify-center gap-[9px] pointer-events-none">
        {[0, 1].map((i) => (
          <span key={i} className="w-[9px] h-[2.5px] rounded-full bg-[#1a1d3a]" />
        ))}
      </span>
    );
  }
  if (mood === "happy") {
    return (
      <span className="absolute left-0 right-0 top-[34%] flex justify-center gap-[8px] pointer-events-none">
        {[0, 1].map((i) => (
          <svg key={i} width="11" height="7" viewBox="0 0 11 7">
            <path d="M1 6 Q5.5 0 10 6" fill="none" stroke="#1a1d3a" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        ))}
      </span>
    );
  }
  return (
    <span className="absolute left-0 right-0 top-[30%] flex justify-center gap-[7px] pointer-events-none">
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          className="relative w-[11px] h-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.25)] overflow-hidden"
          animate={{ scaleY: [1, 1, 0.1, 1] }}
          transition={{ duration: 4.2, times: [0, 0.92, 0.96, 1], repeat: Infinity, delay: i * 0.04 }}
        >
          <span
            className="absolute size-[6px] rounded-full bg-[#1a1d3a] left-1/2 top-1/2"
            style={{ transform: `translate(calc(-50% + ${eye.x}px), calc(-50% + ${eye.y}px))` }}
          />
        </motion.span>
      ))}
      {mood === "waiting" && (
        <motion.span className="absolute -top-3 right-2 text-[14px] font-bold text-ai-ink" animate={{ y: [0, -3, 0] }} transition={{ duration: 0.8, repeat: Infinity }}>
          ?
        </motion.span>
      )}
    </span>
  );
}

function Zzz() {
  return (
    <span className="absolute -top-4 -right-2 pointer-events-none">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute font-bold text-ai-ink"
          style={{ fontSize: 10 + i * 3, left: i * 7, top: -i * 8 }}
          animate={{ opacity: [0, 1, 0], y: [4, -6] }}
          transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.6 }}
        >
          z
        </motion.span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------- chat

const QUICK = ["Clean up my Downloads", "Find my finance files", "Turn on dark mode"];

function Chat() {
  const pet = usePet();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const flipLeft = pet.x > 380;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [pet.chat.length]);

  const send = (value: string) => {
    const t = value.trim();
    if (!t) return;
    pet.addLine({ from: "you", text: t });
    pet.say("On it!");
    setText("");
    // step aside: the pet narrates with bubbles while it works
    pet.setChatOpen(false);
    void runRequest(t);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, y: 6, transition: { duration: 0.14 } }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      style={{ transformOrigin: flipLeft ? "100% 100%" : "0% 100%" }}
      onPointerDown={(e) => e.stopPropagation()}
      className={clsx(
        "glass absolute bottom-[calc(100%+14px)] w-[320px] rounded-[22px] bg-glass-strong backdrop-blur-3xl border border-glass-line shadow-pop overflow-hidden",
        flipLeft ? "right-0" : "left-0",
      )}
    >
      <div className="flex items-center gap-2 px-3.5 h-11 border-b border-line">
        <span className="text-[13.5px] font-semibold flex-1">Your buddy</span>
        <button
          onClick={() => pet.setVisible(false)}
          title="Work quietly: hide me, tasks keep running"
          className="h-7 px-2 rounded-full flex items-center gap-1 text-[12px] text-fg-2 hover:bg-fg/[.06] hover:text-fg"
        >
          <EyeOff size={13} /> Work quietly
        </button>
        <button aria-label="Close chat" onClick={() => pet.setChatOpen(false)} className="size-7 grid place-items-center rounded-full text-fg-2 hover:bg-fg/[.06]">
          <X size={14} />
        </button>
      </div>
      <div ref={listRef} className="max-h-[240px] overflow-auto scroll-thin px-3.5 py-3 grid gap-2">
        {pet.chat.map((l, i) => (
          <div
            key={i}
            className={clsx(
              "max-w-[85%] px-3 py-2 rounded-2xl text-[13px] leading-snug",
              l.from === "you" ? "justify-self-end bg-ai text-white rounded-br-md" : "justify-self-start bg-fg/[.06] rounded-bl-md",
            )}
          >
            {l.text}
          </div>
        ))}
      </div>
      <div className="px-3 pb-2 flex flex-wrap gap-1.5">
        {QUICK.map((qx) => (
          <button key={qx} onClick={() => send(qx)} className="h-7 px-2.5 rounded-full bg-fg/[.06] hover:bg-fg/[.1] text-[12px] text-fg-2">
            {qx}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="flex items-center gap-2 px-3 pb-3"
      >
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask me to do something..."
          className="flex-1 min-w-0 h-10 px-3.5 rounded-2xl bg-surface/80 border border-line outline-none text-[13.5px] focus:ring-2 focus:ring-ai/30"
          aria-label="Message your buddy"
        />
        <button type="submit" aria-label="Send" className="size-10 rounded-2xl grid place-items-center bg-ai text-white hover:brightness-110">
          <Send size={16} />
        </button>
      </form>
    </motion.div>
  );
}
