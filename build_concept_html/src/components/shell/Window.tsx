"use client";

import clsx from "clsx";
import { Minus, Square, X } from "lucide-react";
import { motion } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { useOS } from "@/lib/store";
import type { Win } from "@/lib/types";
import { AppIcon } from "../icons/Icons";

const TOPBAR = 34;

export function Window({ win, active, children, toolbar }: { win: Win; active: boolean; children: ReactNode; toolbar?: ReactNode }) {
  const focus = useOS((s) => s.focusWindow);
  const move = useOS((s) => s.moveWindow);
  const close = useOS((s) => s.closeWindow);
  const minimize = useOS((s) => s.minimizeWindow);
  const [max, setMax] = useState(false);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,input")) return;
    if (max) return;
    drag.current = { dx: e.clientX - win.x, dy: e.clientY - win.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const x = Math.min(Math.max(e.clientX - drag.current.dx, -win.w + 120), window.innerWidth - 120);
    const y = Math.min(Math.max(e.clientY - drag.current.dy, TOPBAR + 4), window.innerHeight - 60);
    move(win.id, x, y);
  };
  const onPointerUp = () => (drag.current = null);

  const frame = max
    ? { left: 0, top: TOPBAR, width: "100vw", height: `calc(100vh - ${TOPBAR}px)` }
    : { left: win.x, top: win.y, width: win.w, height: win.h };

  return (
    <motion.section
      role="dialog"
      aria-label={win.title}
      initial={{ opacity: 0, scale: 0.965, y: 8 }}
      animate={{ opacity: win.minimized ? 0 : 1, scale: win.minimized ? 0.9 : 1, y: win.minimized ? 40 : 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 6, transition: { duration: 0.14 } }}
      transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
      onPointerDown={() => !active && focus(win.id)}
      style={{ ...frame, zIndex: win.z, pointerEvents: win.minimized ? "none" : "auto" }}
      className={clsx(
        "fixed flex flex-col overflow-hidden bg-surface text-fg",
        max ? "rounded-none" : "rounded-[14px]",
        "shadow-window transition-[filter] duration-200",
      )}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => setMax((m) => !m)}
        className={clsx(
          "h-11 shrink-0 flex items-center gap-2 pl-3.5 pr-2 border-b border-line select-none",
          active ? "bg-surface-2" : "bg-surface-2/60",
          !max && "cursor-grab active:cursor-grabbing",
        )}
      >
        <span className={clsx("transition-opacity", !active && "opacity-50 grayscale")}>
          <AppIcon app={win.app} size={20} />
        </span>
        <div className={clsx("text-[13.5px] font-semibold truncate", !active && "text-fg-3")}>{win.title}</div>
        <div className="flex-1 min-w-0 flex items-center justify-center">{toolbar}</div>
        <div className="flex items-center gap-0.5">
          <WinBtn label="Minimize" onClick={() => minimize(win.id)}>
            <Minus size={13} />
          </WinBtn>
          <WinBtn label="Maximize" onClick={() => setMax((m) => !m)}>
            <Square size={10.5} />
          </WinBtn>
          <WinBtn label="Close" onClick={() => close(win.id)} danger>
            <X size={14} />
          </WinBtn>
        </div>
      </div>
      <div className="flex-1 min-h-0 relative">{children}</div>
    </motion.section>
  );
}

function WinBtn({ children, onClick, label, danger }: { children: ReactNode; onClick: () => void; label: string; danger?: boolean }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={clsx(
        "size-6.5 grid place-items-center rounded-full text-fg-2 transition-colors",
        danger ? "hover:bg-danger hover:text-white" : "hover:bg-surface-3 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
