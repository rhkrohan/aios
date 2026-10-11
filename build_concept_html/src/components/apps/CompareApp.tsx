"use client";

// Compare: two documents side by side, clause by clause, with what changed
// marked and said in plain words. The assistant opens it after docs.compare;
// on SIOS it's a small local document viewer, nothing leaves the computer.

import clsx from "clsx";
import { AlertTriangle, FileText } from "lucide-react";
import { motion } from "motion/react";
import { COMPARISONS } from "@/lib/everyday";
import type { Win } from "@/lib/types";

export function CompareApp({ win }: { win: Win }) {
  const c = COMPARISONS[win.props?.doc ?? "lease"] ?? COMPARISONS.lease;
  const changed = c.rows.filter((r) => r.note);
  return (
    <div className="h-full flex flex-col text-[13px]">
      <div className="px-5 py-3 border-b border-line flex items-center gap-3">
        <span className="h-6 px-2 rounded-full bg-warn-soft text-warn text-[12px] font-semibold inline-flex items-center gap-1.5">
          <AlertTriangle size={12} /> {changed.length} things changed
        </span>
        <span className="text-fg-2 truncate">{c.summary}</span>
      </div>
      <div className="grid grid-cols-[180px_1fr_1fr] border-b border-line bg-surface-2/60 text-[12px] font-semibold text-fg-2">
        <div className="px-4 py-2" />
        {[c.before, c.after].map((d) => (
          <div key={d} className="px-4 py-2 flex items-center gap-1.5 border-l border-line">
            <FileText size={13} /> {d}
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-auto scroll-thin">
        {c.rows.map((r, i) => (
          <motion.div
            key={r.clause}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.12 }}
            className={clsx("grid grid-cols-[180px_1fr_1fr] border-b border-line", r.note && "bg-warn-soft/40")}
          >
            <div className="px-4 py-3 font-medium">{r.clause}</div>
            <div className="px-4 py-3 border-l border-line text-fg-2">{r.a}</div>
            <div className="px-4 py-3 border-l border-line">
              <span className={clsx(r.note && "font-semibold")}>{r.b}</span>
              {r.note && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 + i * 0.12 }} className="mt-1 text-[12px] text-warn font-medium">
                  {r.note}
                </motion.div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
