"use client";

// The sliding switch on the home screen: the simulated machine (pretend files,
// scripted demos) or the live one (a real model on the real sandbox, through
// capd and brain-d).

import clsx from "clsx";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { liveFetch, switchMachine } from "@/lib/livemachine";
import { useOS } from "@/lib/store";

type Health = "stopped" | "starting" | "running" | "error";

export function MachineSwitch() {
  const live = useOS((s) => s.settings.liveMachine);
  const [health, setHealth] = useState<Health>("stopped");
  const [why, setWhy] = useState<string | null>(null);

  // while live, keep an eye on the two services
  useEffect(() => {
    if (!live) return;
    let alive = true;
    const check = async () => {
      const st = await liveFetch("/api/live/status").then((r) => r.json()).catch(() => null);
      if (!alive || !st) return;
      if (st.daemon?.error) {
        setHealth("error");
        setWhy(st.daemon.error);
      } else if (st.capd && st.brain) {
        setHealth("running");
        setWhy(null);
      } else {
        setHealth(st.daemon?.busy ? "starting" : "stopped");
        setWhy(st.daemon?.busy ?? null);
      }
    };
    void check();
    const t = setInterval(check, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [live]);

  const pick = (v: boolean) => {
    if (v === live) return;
    if (v) setHealth("starting");
    void switchMachine(v);
  };

  const dot = !live ? null : health === "running" ? "bg-ok" : health === "error" ? "bg-danger" : "bg-warn animate-pulse";
  const status = !live ? "Pretend files and scripted demos" : health === "running" ? "Real files in ~/SIOS-sandbox, through capd" : health === "error" ? (why ?? "Couldn't start") : (why ?? "Starting capd and brain-d");

  return (
    <div className="absolute top-[46px] inset-x-0 z-[5] flex flex-col items-center pointer-events-none">
      <div
        role="radiogroup"
        aria-label="Which machine"
        className="pointer-events-auto relative flex h-9 p-1 rounded-full bg-white/18 backdrop-blur-xl ring-1 ring-white/35 shadow-[0_6px_20px_-10px_rgba(10,20,40,.5)]"
      >
        {[
          { v: false, label: "Simulated" },
          { v: true, label: "Live machine" },
        ].map((o) => (
          <button
            key={o.label}
            role="radio"
            aria-checked={live === o.v}
            onClick={() => pick(o.v)}
            className={clsx(
              "relative z-[1] h-7 px-3.5 rounded-full text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-colors",
              live === o.v ? "text-fg" : "text-white/90 hover:text-white [text-shadow:0_1px_2px_rgba(0,0,0,.35)]",
            )}
          >
            {live === o.v && <motion.span layoutId="machine-thumb" className="absolute inset-0 -z-[1] rounded-full bg-white shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
            {o.v && <span className={clsx("size-1.5 rounded-full", dot ?? "bg-white/70")} />}
            {o.label}
          </button>
        ))}
      </div>
      <span className="mt-1.5 text-[11.5px] text-white/85 [text-shadow:0_1px_3px_rgba(0,0,0,.5)]">{status}</span>
    </div>
  );
}
