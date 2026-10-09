"use client";

import clsx from "clsx";
import { Activity, Folder, Globe, Mail, Settings, ShoppingBag, type LucideIcon } from "lucide-react";
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import { useRef, useState } from "react";
import { BRAND } from "@/lib/brand";
import { selectBrainState, useOS } from "@/lib/store";
import type { AppId } from "@/lib/types";
import { StringOrb } from "../icons/StringOrb";

const LEFT: { id: AppId; name: string; icon: LucideIcon }[] = [
  { id: "files", name: "Files", icon: Folder },
  { id: "browser", name: "Browser", icon: Globe },
  { id: "mail", name: "Mail", icon: Mail },
];
const RIGHT: { id: AppId; name: string; icon: LucideIcon }[] = [
  { id: "store", name: "Store", icon: ShoppingBag },
  { id: "activity", name: "Activity", icon: Activity },
  { id: "settings", name: "Settings", icon: Settings },
];

const BASE = 44; // resting slot size
const PEAK = 66; // size right under the pointer
const REACH = 130; // how far the magnification spreads, in px

/** A slim bar. Icons grow as the pointer passes over them, like macOS. */
export function Dock() {
  const windows = useOS((s) => s.windows);
  const openApp = useOS((s) => s.openApp);
  const focusWindow = useOS((s) => s.focusWindow);
  const minimize = useOS((s) => s.minimizeWindow);
  const visible = windows.filter((w) => !w.minimized);
  const topZ = Math.max(0, ...visible.map((w) => w.z));
  const focused = visible.find((w) => w.z === topZ)?.app;
  const mouseX = useMotionValue(Infinity);

  const item = (app: (typeof LEFT)[number]) => {
    const win = windows.find((w) => w.app === app.id);
    return (
      <DockIcon
        key={app.id}
        mouseX={mouseX}
        label={app.name}
        focused={focused === app.id}
        running={!!win}
        icon={app.icon}
        onClick={() => {
          if (!win) return openApp(app.id);
          if (!win.minimized && win.z === topZ) return minimize(win.id);
          focusWindow(win.id);
        }}
      />
    );
  };

  return (
    <nav aria-label="Dock" className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[960]">
      <div
        onMouseMove={(e) => mouseX.set(e.clientX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        className="glass flex items-end gap-1 h-[58px] px-2 pb-[7px] rounded-[22px] bg-glass-strong backdrop-blur-3xl backdrop-saturate-150 border border-glass-line shadow-[0_1px_0_rgba(255,255,255,.6)_inset,0_18px_40px_-16px_rgba(10,20,40,.45)]"
      >
        {LEFT.map(item)}
        <span className="w-px h-6 self-center bg-fg/10 mx-1" />
        <AskButton mouseX={mouseX} />
        <span className="w-px h-6 self-center bg-fg/10 mx-1" />
        {RIGHT.map(item)}
      </div>
    </nav>
  );
}

function useMagnify(mouseX: MotionValue<number>, ref: React.RefObject<HTMLElement | null>) {
  const distance = useTransform(mouseX, (x) => {
    const b = ref.current?.getBoundingClientRect();
    return b ? x - b.left - b.width / 2 : Infinity;
  });
  const target = useTransform(distance, [-REACH, 0, REACH], [BASE, PEAK, BASE]);
  const size = useSpring(target, { mass: 0.12, stiffness: 190, damping: 14 });
  const scale = useTransform(size, (s) => s / BASE);
  return { size, scale };
}

function DockIcon({
  mouseX,
  label,
  focused,
  running,
  icon: Icon,
  onClick,
}: {
  mouseX: MotionValue<number>;
  label: string;
  focused: boolean;
  running: boolean;
  icon: LucideIcon;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { size, scale } = useMagnify(mouseX, ref);
  const [hover, setHover] = useState(false);
  return (
    <motion.button
      ref={ref}
      style={{ width: size, height: size }}
      onClick={onClick}
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      aria-label={label}
      className={clsx(
        "relative grid place-items-center rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        focused && "bg-white/85 [:root[data-theme=dark]_&]:bg-white/12 shadow-[0_1px_0_rgba(255,255,255,.9)_inset,0_4px_12px_-6px_rgba(30,40,80,.35)]",
      )}
    >
      <Tooltip show={hover} label={label} />
      <motion.span style={{ scale }} className="grid place-items-center">
        <Icon size={20} strokeWidth={1.7} className={focused ? "text-ai-ink" : "text-fg"} />
      </motion.span>
      <span className={clsx("absolute -bottom-[5px] size-1 rounded-full bg-fg/50 transition-opacity", running ? "opacity-100" : "opacity-0")} />
    </motion.button>
  );
}

function Tooltip({ show, label }: { show: boolean; label: string }) {
  return (
    <motion.span
      initial={false}
      animate={{ opacity: show ? 1 : 0, y: show ? 0 : 4 }}
      transition={{ duration: 0.12 }}
      className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#1b2027]/92 px-2.5 py-1 text-[12px] font-medium text-white"
    >
      {label}
    </motion.span>
  );
}

function AskButton({ mouseX }: { mouseX: MotionValue<number> }) {
  const open = useOS((s) => s.commandOpen);
  const setOpen = useOS((s) => s.setCommandOpen);
  const brain = useOS(selectBrainState);
  const busy = brain === "working" || brain === "waiting";
  const ref = useRef<HTMLButtonElement>(null);
  const { size, scale } = useMagnify(mouseX, ref);
  const [hover, setHover] = useState(false);
  const [dropping, setDropping] = useState(false);
  const setAskFiles = useOS((s) => s.setAskFiles);
  const fs = useOS((s) => s.fs);
  const label = dropping ? "Ask about these" : brain === "paused" ? "AI paused" : brain === "waiting" ? "Needs your OK" : busy ? "Working" : `Ask ${BRAND.name}  ⌘K`;

  return (
    <motion.button
      ref={ref}
      aria-label={`Ask ${BRAND.name}`}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("application/x-sios")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        try {
          const list = JSON.parse(e.dataTransfer.getData("application/x-sios")) as { id: string; dir: string }[];
          const files = list
            .map(({ id, dir }) => ({ id, dir, name: fs[dir]?.find((x) => x.id === id)?.name ?? "" }))
            .filter((x) => x.name);
          if (files.length) {
            setAskFiles(files);
            setOpen(true);
          }
        } catch {
          /* not ours */
        }
      }}
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      style={{ width: size, height: size }}
      className={clsx(
        "relative grid place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        "bg-white/70 [:root[data-theme=dark]_&]:bg-white/10 border border-glass-line",
        busy && "ring-2 ring-ai/40",
        dropping && "ring-4 ring-ai/60 scale-110",
      )}
    >
      <Tooltip show={hover || dropping} label={label} />
      <motion.span style={{ scale }} className="grid place-items-center">
        <StringOrb size={30} busy={busy} strands={16} />
      </motion.span>
    </motion.button>
  );
}
