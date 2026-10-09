"use client";

import clsx from "clsx";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { BRAND } from "@/lib/brand";
import { undoRun } from "@/lib/engine";
import { useOS } from "@/lib/store";
import { Button } from "../ui";
import { BrandMark } from "../icons/Icons";

export function Toasts() {
  const toasts = useOS((s) => s.toasts);
  const dismiss = useOS((s) => s.dismissToast);
  const openApp = useOS((s) => s.openApp);

  return (
    <div className="fixed bottom-4 right-4 z-[960] w-[340px] max-w-[calc(100vw-24px)] grid gap-2" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = t.tone === "ok" ? CircleCheck : t.tone === "warn" ? CircleAlert : Info;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.16 } }}
              transition={{ type: "spring", stiffness: 480, damping: 36 }}
              className="glass rounded-[20px] bg-glass-strong backdrop-blur-3xl backdrop-saturate-150 border border-glass-line shadow-pop p-3.5"
            >
              <div className="flex items-center gap-1.5 text-[11.5px] text-fg-3 font-medium mb-1.5">
                <BrandMark size={13} /> {BRAND.name}
                <span className="opacity-60">now</span>
                <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="ml-auto size-5 grid place-items-center rounded-full hover:bg-surface-3">
                  <X size={12} />
                </button>
              </div>
              <div className="flex gap-2.5">
                <Icon size={17} className={clsx("shrink-0 mt-px", t.tone === "ok" ? "text-ok" : t.tone === "warn" ? "text-warn" : "text-accent")} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium leading-5">{t.title}</div>
                  {t.body && <div className="text-[12.5px] text-fg-2 mt-0.5 leading-5">{t.body}</div>}
                  {(t.action || t.undoRunId) && (
                    <div className="mt-2.5 flex gap-1.5">
                      {t.action && (
                        <Button
                          size="sm"
                          onClick={() => {
                            openApp(t.action!.app, t.action!.props);
                            dismiss(t.id);
                          }}
                        >
                          {t.action.label}
                        </Button>
                      )}
                      {t.undoRunId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            undoRun(t.undoRunId!);
                            dismiss(t.id);
                          }}
                        >
                          Undo
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
