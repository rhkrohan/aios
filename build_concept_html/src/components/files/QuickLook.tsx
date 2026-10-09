"use client";

// Quick Look: a big preview of the selected file. Space or Esc closes it,
// arrow keys move through the folder.

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect } from "react";
import { getBlob } from "@/lib/blobs";
import type { FileItem } from "@/lib/types";
import { originText, summaryOf } from "./model";
import { Thumb } from "./Thumb";

const PHOTOS = ["/wallpapers/dusk.jpg", "/wallpapers/lake.jpg"];
const hash = (s: string) => Array.from(s).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function QuickLook({ item, onClose, onPrev, onNext }: { item: FileItem; onClose: () => void; onPrev: () => void; onNext: () => void }) {
  const blob = item.imported ? getBlob(item.id) : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") onNext();
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") onPrev();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, onNext, onPrev]);

  let body: React.ReactNode;
  if (item.kind === "image") {
    const src = blob?.url ?? PHOTOS[hash(item.name) % PHOTOS.length];
    // eslint-disable-next-line @next/next/no-img-element
    body = <img src={src} alt={item.name} className="max-h-full max-w-full rounded-xl object-contain shadow-lg" />;
  } else if (blob?.text !== undefined) {
    body = (
      <pre className="w-full h-full overflow-auto scroll-thin rounded-xl bg-surface p-5 text-[13px] leading-[1.6] font-mono whitespace-pre-wrap text-fg">{blob.text.slice(0, 20000)}</pre>
    );
  } else if (blob && item.kind === "pdf") {
    body = <iframe title={item.name} src={blob.url} className="w-full h-full rounded-xl bg-white" />;
  } else if (blob && (item.kind === "audio" || item.kind === "video")) {
    body = item.kind === "audio" ? <audio controls src={blob.url} /> : <video controls src={blob.url} className="max-h-full max-w-full rounded-xl" />;
  } else {
    const summary = summaryOf(item);
    body = (
      <div className="grid justify-items-center text-center gap-4">
        <Thumb item={item} size={140} />
        {summary && <p className="max-w-sm text-[14px] leading-6 text-fg-2">{summary}</p>}
      </div>
    );
  }

  return (
    <motion.div
      className="absolute inset-0 z-20 grid place-items-center p-5 bg-[#0b1220]/40 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="glass relative w-full max-w-[760px] h-full max-h-[520px] flex flex-col rounded-[22px] bg-glass-strong backdrop-blur-3xl border border-glass-line shadow-pop overflow-hidden"
      >
        <div className="flex items-center gap-2 h-12 px-3 border-b border-line shrink-0">
          <button aria-label="Previous" onClick={onPrev} className="size-8 grid place-items-center rounded-lg text-fg-2 hover:bg-fg/[.06]">
            <ChevronLeft size={17} />
          </button>
          <button aria-label="Next" onClick={onNext} className="size-8 grid place-items-center rounded-lg text-fg-2 hover:bg-fg/[.06]">
            <ChevronRight size={17} />
          </button>
          <div className="flex-1 min-w-0 text-center">
            <div className="text-[14px] font-semibold truncate">{item.name}</div>
            <div className="text-[11.5px] text-fg-3 truncate">
              {[item.size, item.modified, originText(item)].filter(Boolean).join(", ")}
            </div>
          </div>
          <button aria-label="Close" onClick={onClose} className="size-8 grid place-items-center rounded-lg text-fg-2 hover:bg-fg/[.06]">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0 grid place-items-center p-5">{body}</div>
      </motion.div>
    </motion.div>
  );
}
