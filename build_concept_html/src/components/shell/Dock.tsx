"use client";

import clsx from "clsx";
import { Activity, Folder, Globe, Mail, Settings, ShoppingBag, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
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

/** One quiet bar: line icons on both sides, the assistant raised in the middle. */
export function Dock() {
  const windows = useOS((s) => s.windows);
  const openApp = useOS((s) => s.openApp);
  const focusWindow = useOS((s) => s.focusWindow);
  const minimize = useOS((s) => s.minimizeWindow);
  const visible = windows.filter((w) => !w.minimized);
  const topZ = Math.max(0, ...visible.map((w) => w.z));
  const focused = visible.find((w) => w.z === topZ)?.app;

  const item = (app: (typeof LEFT)[number]) => {
    const win = windows.find((w) => w.app === app.id);
    return (
      <BarItem
        key={app.id}
        label={app.name}
        icon={app.icon}
        focused={focused === app.id}
        running={!!win}
        onClick={() => {
          if (!win) return openApp(app.id);
          if (!win.minimized && win.z === topZ) return minimize(win.id);
          focusWindow(win.id);
        }}
      />
    );
  };

  return (
    <nav aria-label="Dock" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[960]">
      <div className="glass relative flex items-center h-[84px] px-3 rounded-[34px] bg-glass-strong backdrop-blur-3xl backdrop-saturate-150 border border-glass-line shadow-[0_1px_0_rgba(255,255,255,.7)_inset,0_28px_60px_-22px_rgba(10,20,40,.55)]">
        <div className="flex items-center gap-1">{LEFT.map(item)}</div>
        <AskButton />
        <div className="flex items-center gap-1">{RIGHT.map(item)}</div>
      </div>
    </nav>
  );
}

function BarItem({
  label,
  icon: Icon,
  focused,
  running,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  focused: boolean;
  running: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={clsx(
        "group relative w-[76px] h-[66px] flex flex-col items-center justify-center gap-1.5 rounded-[20px] transition-all duration-200 outline-none",
        "focus-visible:ring-2 focus-visible:ring-accent/40",
        focused
          ? "bg-white/90 [:root[data-theme=dark]_&]:bg-white/12 shadow-[0_1px_0_rgba(255,255,255,.9)_inset,0_8px_20px_-8px_rgba(30,40,80,.35)]"
          : "hover:bg-black/[.04] [:root[data-theme=dark]_&]:hover:bg-white/[.06]",
      )}
    >
      <Icon size={23} strokeWidth={1.6} className={clsx("transition-colors", focused ? "text-ai-ink" : "text-fg")} />
      <span className={clsx("text-[12px] leading-none", focused ? "font-semibold text-fg" : "font-medium text-fg-2 group-hover:text-fg")}>
        {label}
      </span>
      <span className={clsx("absolute bottom-1 size-1 rounded-full bg-fg/45 transition-opacity", running && !focused ? "opacity-100" : "opacity-0")} />
    </button>
  );
}

function AskButton() {
  const open = useOS((s) => s.commandOpen);
  const setOpen = useOS((s) => s.setCommandOpen);
  const brain = useOS(selectBrainState);
  const busy = brain === "working" || brain === "waiting";

  return (
    <div className="relative w-[136px] h-[84px] mx-2">
      <motion.button
        aria-label={`Ask ${BRAND.name}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 500, damping: 28 }}
        className="glass absolute left-0 -top-[30px] w-[136px] h-[136px] rounded-full flex flex-col items-center justify-center gap-0.5 bg-glass-strong backdrop-blur-3xl border border-glass-line shadow-[0_1px_0_rgba(255,255,255,.8)_inset,0_22px_44px_-18px_rgba(40,40,120,.55)] outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <StringOrb size={84} busy={busy} />
        <span className="text-[13px] font-semibold text-fg">{brain === "paused" ? "Paused" : brain === "waiting" ? "Needs you" : busy ? "Working" : `Ask ${BRAND.name}`}</span>
      </motion.button>
    </div>
  );
}

/** A soft 3D sphere. Breathes while the assistant works. */
export function OrbSphere({ size = 64, busy = false }: { size?: number; busy?: boolean }) {
  return (
    <span className="relative grid place-items-center" style={{ width: size, height: size }}>
      <span
        className={clsx("absolute -inset-2 rounded-full blur-xl transition-opacity duration-500", busy ? "opacity-90 animate-pulse" : "opacity-45")}
        style={{ background: "radial-gradient(closest-side, rgba(110,98,255,.65), transparent)" }}
      />
      <motion.span
        className="relative rounded-full"
        style={{
          width: size,
          height: size,
          background:
            "radial-gradient(circle at 34% 28%, #f2efff 0%, #b9b0ff 14%, #7c6cff 38%, #4a46e8 64%, #2b2fb3 88%, #232690 100%)",
          boxShadow: "inset -6px -8px 16px rgba(20,20,90,.45), inset 4px 6px 12px rgba(255,255,255,.35), 0 8px 18px -6px rgba(60,50,200,.55)",
        }}
        animate={busy ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        transition={busy ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0.4 }}
      />
    </span>
  );
}
