"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import clsx from "clsx";

export function Popover({
  open,
  onClose,
  children,
  align = "right",
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      // Ignore clicks on the trigger: the trigger toggles itself.
      const target = e.target as HTMLElement;
      if (ref.current && !ref.current.contains(target) && !target.closest("[data-popover-trigger]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
          className={clsx(
            "absolute top-[calc(100%+8px)] z-[1000] rounded-2xl border border-line bg-surface/95 backdrop-blur-xl text-fg shadow-pop",
            align === "right" && "right-0 origin-top-right",
            align === "left" && "left-0 origin-top-left",
            align === "center" && "left-1/2 -translate-x-1/2 origin-top",
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
