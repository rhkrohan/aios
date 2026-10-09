"use client";

import { ArrowLeft, ArrowRight, Lock, RotateCw, Search } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { useOS } from "@/lib/store";

export function BrowserApp() {
  return (
    <div className="h-full flex flex-col">
      <div className="h-11 shrink-0 flex items-center gap-1.5 px-2.5 border-b border-line">
        {[ArrowLeft, ArrowRight, RotateCw].map((I, i) => (
          <span key={i} className="size-7 grid place-items-center rounded-md text-fg-3">
            <I size={15} />
          </span>
        ))}
        <div className="flex-1 flex items-center gap-2 h-8 px-3 rounded-lg bg-surface-2 border border-line text-[12.5px] text-fg-2">
          <Lock size={12} /> start.page
        </div>
      </div>
      <div className="flex-1 grid place-items-center wallpaper">
        <div className="w-full max-w-md px-6 text-center">
          <div className="text-[28px] font-semibold tracking-[-0.02em]">Good afternoon</div>
          <div className="mt-5 flex items-center gap-2.5 h-12 px-4 rounded-2xl bg-surface shadow-window text-[14px] text-fg-3">
            <Search size={16} /> Search the web
          </div>
        </div>
      </div>
    </div>
  );
}

export function TerminalApp() {
  const runs = useOS((s) => s.runs);
  const grants = useOS((s) => s.grants);
  return (
    <div className="h-full bg-[#15171a] text-[#d7dae0] font-mono text-[12.5px] leading-[1.7] p-4 overflow-auto scroll-thin">
      <div>
        <span className="text-[#94c29a]">rohan@{BRAND.device}</span>:<span className="text-[#8fb3d9]">~</span>$ systemctl --user status brain-d
      </div>
      <div className="text-[#94c29a]">● brain-d.service - {BRAND.name} brain</div>
      <div className="pl-4 text-[#a9a9a4]">Active: active (running)</div>
      <div className="pl-4 text-[#a9a9a4]">Runs this session: {runs.length}</div>
      <div className="pl-4 text-[#a9a9a4]">Session grants: {grants.length ? grants.join(", ") : "none"}</div>
      <div className="mt-2">
        <span className="text-[#94c29a]">rohan@{BRAND.device}</span>:<span className="text-[#8fb3d9]">~</span>$ <span className="inline-block w-2 h-4 align-middle bg-[#d7dae0] animate-pulse" />
      </div>
    </div>
  );
}
