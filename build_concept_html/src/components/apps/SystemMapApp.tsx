"use client";

import clsx from "clsx";
import { FlaskConical, Network } from "lucide-react";
import { useOS } from "@/lib/store";
import type { Win } from "@/lib/types";
import { LiveMap } from "../systemmap/LiveMap";
import { Simulate } from "../systemmap/Simulate";

/**
 * The digital twin: see how every part of the machine connects (Live map) and
 * estimate how the design performs at scale (Simulate), before the real image exists.
 */
export function SystemMapApp({ win }: { win: Win }) {
  const tab = win.props?.tab === "simulate" ? "simulate" : "live";
  const setProps = useOS((s) => s.setWindowProps);
  return (
    <div className="h-full flex flex-col bg-surface">
      <div className="shrink-0 flex items-center gap-1 px-5 pt-3">
        {(
          [
            ["live", "Live map", Network],
            ["simulate", "Simulate", FlaskConical],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setProps(win.id, { tab: id })}
            className={clsx(
              "h-8 px-3.5 rounded-full text-[13px] flex items-center gap-1.5 transition-colors",
              tab === id ? "bg-fg text-surface font-semibold" : "text-fg-2 hover:bg-surface-3 hover:text-fg",
            )}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">{tab === "live" ? <LiveMap /> : <Simulate />}</div>
    </div>
  );
}
