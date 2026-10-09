"use client";

import clsx from "clsx";
import {
  BatteryFull,
  Bluetooth,
  Check,
  MoonStar,
  SlidersHorizontal,
  Cloud,
  Cpu,
  Lock,
  Search,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { BRAND } from "@/lib/brand";
import { selectBrainState, useOS } from "@/lib/store";
import { Popover } from "./Popover";
import { ControlCenter } from "./ControlCenter";
import { usePowerPrompt } from "./Power";
import type { AppId } from "@/lib/types";
import { Button, Chip, timeAgo } from "../ui";
import { AppIcon, BrandMark } from "../icons/Icons";
import { StringOrb } from "../icons/StringOrb";

// Ticks every 15s. Server snapshot is null so the clock never causes a hydration mismatch.
const subscribeClock = (cb: () => void) => {
  const t = setInterval(cb, 15_000);
  return () => clearInterval(t);
};

function Clock() {
  const tick = useSyncExternalStore(subscribeClock, () => Math.floor(Date.now() / 15_000), () => null);
  if (tick === null) return <span className="w-28" />;
  const now = new Date();
  return (
    <span className="tabular-nums">
      {now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
      <span className="mx-2" />
      {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
    </span>
  );
}

const barBtn =
  "h-7 px-2 rounded-md inline-flex items-center gap-1.5 text-[var(--topbar-fg)] hover:bg-black/[.06] [:root[data-theme=dark]_&]:hover:bg-white/10 transition-colors";

const APP_MENU: { id: AppId; name: string }[] = [
  { id: "files", name: "Files" },
  { id: "browser", name: "Browser" },
  { id: "mail", name: "Mail" },
  { id: "store", name: "Store" },
  { id: "activity", name: "Activity" },
  { id: "terminal", name: "Terminal" },
  { id: "security", name: "Security Center" },
  { id: "settings", name: "Settings" },
];

function MenuItem({ children, onClick, hint }: { children: React.ReactNode; onClick: () => void; hint?: string }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13px] text-left hover:bg-ai-soft">
      {children}
      {hint && <span className="ml-auto text-[11.5px] text-fg-3">{hint}</span>}
    </button>
  );
}

export function TopBar() {
  const openApp = useOS((s) => s.openApp);
  const setCommandOpen = useOS((s) => s.setCommandOpen);
  const wifi = useOS((s) => s.wifi);
  const [menu, setMenu] = useState<null | "brain" | "wifi" | "control" | "apps" | "system" | "power">(null);
  const setPower = useOS((s) => s.setPower);
  const setSetupOpen = useOS((s) => s.setSetupOpen);
  const pick = (fn: () => void) => () => {
    fn();
    setMenu(null);
  };

  return (
    <header
      className="glass fixed inset-x-0 top-0 z-[900] h-9 flex items-center justify-between px-2.5 text-[13px] backdrop-blur-2xl backdrop-saturate-150 border-b border-glass-line shadow-[0_1px_0_rgba(0,0,0,.04)]"
      style={{ background: "var(--topbar)", color: "var(--topbar-fg)" }}
    >
      <div className="flex items-center gap-0.5 min-w-0">
        <div className="relative mr-1">
          <button
            data-popover-trigger
            aria-label={`${BRAND.name} menu`}
            onClick={() => setMenu(menu === "power" ? null : "power")}
            className="size-7 grid place-items-center rounded-full hover:bg-black/[.06] [:root[data-theme=dark]_&]:hover:bg-white/10"
          >
            <span className="size-[22px] rounded-full grid place-items-center bg-[var(--topbar-fg)] text-[var(--surface)]">
              <BrandMark size={13} lantern={false} />
            </span>
          </button>
          <Popover open={menu === "power"} onClose={() => setMenu(null)} align="left" className="w-[230px] p-1.5">
            <MenuItem onClick={pick(() => openApp("security"))}>Security Center</MenuItem>
            <MenuItem onClick={pick(() => openApp("settings"))}>Settings</MenuItem>
            <div className="my-1 h-px bg-line" />
            <MenuItem onClick={pick(() => setPower("sleeping"))}>Sleep</MenuItem>
            <MenuItem onClick={pick(() => usePowerPrompt.getState().ask("restart"))}>Restart...</MenuItem>
            <MenuItem onClick={pick(() => usePowerPrompt.getState().ask("shutdown"))}>Shut down...</MenuItem>
            <div className="my-1 h-px bg-line" />
            <MenuItem onClick={pick(() => setPower("locked"))} hint="⌃⌘Q">
              Lock screen
            </MenuItem>
          </Popover>
        </div>
        <button className={clsx(barBtn, "font-medium hidden lg:inline-flex")} onClick={() => openApp("activity")}>
          Workspaces
        </button>
        <button className={clsx(barBtn, "font-medium hidden lg:inline-flex")} onClick={() => openApp("files")}>
          Files
        </button>
        <div className="relative hidden lg:block">
          <button data-popover-trigger className={clsx(barBtn, "font-medium", menu === "apps" && "bg-black/[.06]")} onClick={() => setMenu(menu === "apps" ? null : "apps")}>
            Apps
          </button>
          <Popover open={menu === "apps"} onClose={() => setMenu(null)} align="left" className="w-[230px] p-1.5">
            {APP_MENU.map((a) => (
              <MenuItem key={a.id} onClick={pick(() => openApp(a.id))}>
                <AppIcon app={a.id} size={22} /> {a.name}
              </MenuItem>
            ))}
          </Popover>
        </div>
        <div className="relative hidden lg:block">
          <button data-popover-trigger className={clsx(barBtn, "font-medium", menu === "system" && "bg-black/[.06]")} onClick={() => setMenu(menu === "system" ? null : "system")}>
            System
          </button>
          <Popover open={menu === "system"} onClose={() => setMenu(null)} align="left" className="w-[240px] p-1.5">
            <MenuItem onClick={pick(() => openApp("settings"))}>Settings</MenuItem>
            <MenuItem onClick={pick(() => openApp("settings", { page: "connections" }))}>Connected AI apps</MenuItem>
            <MenuItem onClick={pick(() => setSetupOpen(true))}>Run setup again</MenuItem>
            <div className="my-1 h-px bg-line" />
            <div className="px-2.5 py-1.5 text-[11.5px] text-fg-3 leading-4">
              {BRAND.name} preview build. Nothing here touches a real system.
            </div>
          </Popover>
        </div>
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 font-display font-light text-[17px] tracking-[.42em] pl-[.42em] select-none">
        {BRAND.name}
      </div>

      <div className="flex items-center gap-0.5">
        <BrainPill open={menu === "brain"} onToggle={() => setMenu(menu === "brain" ? null : "brain")} />
        <div className="relative">
          <Popover open={menu === "brain"} onClose={() => setMenu(null)} className="w-[340px]">
            <BrainPanel onClose={() => setMenu(null)} />
          </Popover>
        </div>
        <button className={barBtn} onClick={() => setCommandOpen(true)} aria-label={`Search or ask ${BRAND.name}`}>
          <Search size={15} strokeWidth={2} />
        </button>
        <div className="relative">
          <button data-popover-trigger className={barBtn} onClick={() => setMenu(menu === "wifi" ? null : "wifi")} aria-label="Wi-Fi">
            {wifi.connected ? <Wifi size={15} strokeWidth={2} /> : <WifiOff size={15} strokeWidth={2} />}
          </button>
          <Popover open={menu === "wifi"} onClose={() => setMenu(null)} className="w-[280px] p-2">
            <WifiPanel />
          </Popover>
        </div>
        <span className={clsx(barBtn, "hidden md:inline-flex")}>
          <Bluetooth size={15} strokeWidth={2} />
        </span>
        <span className={barBtn}>
          <span className="hidden lg:inline tabular-nums text-[12.5px]">100%</span>
          <BatteryFull size={19} strokeWidth={1.6} />
        </span>
        <div className="relative">
          <button
            data-popover-trigger
            onClick={() => setMenu(menu === "control" ? null : "control")}
            className={clsx(barBtn, "font-medium pl-2 pr-1.5", menu === "control" && "bg-black/[.06]")}
            aria-label="Control center and notifications"
          >
            <SlidersHorizontal size={14} strokeWidth={2} className="mr-0.5" />
            <Clock />
            <NoteDot />
          </button>
          <Popover open={menu === "control"} onClose={() => setMenu(null)}>
            <ControlCenter />
          </Popover>
        </div>
      </div>
    </header>
  );
}

function NoteDot() {
  const n = useOS((s) => s.notifications.length);
  const dnd = useOS((s) => s.dnd);
  if (dnd) return <MoonStar size={12} className="ml-0.5 opacity-80" />;
  return n ? <span className="ml-0.5 size-1.5 rounded-full bg-ai" /> : null;
}

function BrainPill({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const state = useOS(selectBrainState);
  const running = useOS((s) => s.runs.find((r) => r.status === "running" || r.status === "waiting"));
  const setCommandOpen = useOS((s) => s.setCommandOpen);
  const setFocusedRun = useOS((s) => s.setFocusedRun);

  const onClick = () => {
    if (state === "paused") {
      useOS.getState().openApp("security");
      return;
    }
    if (state !== "idle" && running) {
      setFocusedRun(running.id);
      setCommandOpen(true);
      return;
    }
    onToggle();
  };

  return (
    <button
      data-popover-trigger
      onClick={onClick}
      aria-label="Assistant status"
      className={clsx(
        "h-7 mr-1 pl-1 pr-2.5 rounded-full inline-flex items-center gap-1.5 transition-all duration-300 max-w-[280px]",
        state === "idle" && "hover:bg-black/[.06] [:root[data-theme=dark]_&]:hover:bg-white/10",
        (state === "working" || state === "waiting") && "bg-ai-soft text-ai-ink ring-1 ring-ai-line",
        state === "paused" && "bg-danger-soft text-danger ring-1 ring-danger-line",
        open && "bg-black/[.06]",
      )}
    >
      <StringOrb size={24} busy={state === "working" || state === "waiting"} strands={12} />
      <span className="font-medium truncate text-[12.5px]">
        {state === "idle" && "Ready"}
        {state === "working" && (running ? running.request : "Working")}
        {state === "waiting" && "Needs your OK"}
        {state === "paused" && "AI paused"}
      </span>
    </button>
  );
}

function BrainPanel({ onClose }: { onClose: () => void }) {
  const settings = useOS((s) => s.settings);
  const grants = useOS((s) => s.grants);
  const standing = useOS((s) => s.standingRules);
  const revoke = useOS((s) => s.revokeGrants);
  const runs = useOS((s) => s.runs);
  const openApp = useOS((s) => s.openApp);

  return (
    <div className="p-1.5">
      <div className="px-3 pt-2.5 pb-3">
        <div className="text-[12px] text-fg-3 font-medium">Assistant</div>
        <div className="mt-1 text-[16px] font-semibold flex items-center gap-2">
          <StringOrb size={26} strands={12} /> Ready when you are
        </div>
      </div>

      <div className="grid gap-1.5 px-1.5">
        <div className="rounded-xl border border-line bg-surface-2 p-3 flex gap-3">
          <span className="size-8 rounded-lg bg-ok-soft text-ok grid place-items-center shrink-0">
            <Cpu size={16} />
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-medium">Thinks on this computer</div>
            <div className="text-[12px] text-fg-2">Everyday tasks stay private and work offline.</div>
          </div>
        </div>
        <div className="rounded-xl border border-line bg-surface-2 p-3 flex gap-3">
          <span className="size-8 rounded-lg bg-accent-soft text-accent grid place-items-center shrink-0">
            <Cloud size={16} />
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-medium">{settings.onlineAi ?? "No online AI"} for hard tasks</div>
            <div className="text-[12px] text-fg-2">
              {settings.askBeforeCloud ? "Always asks first. Personal details removed." : "Used without asking. Personal details removed."}
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 pt-3.5 pb-1">
        <div className="flex items-center justify-between">
          <div className="text-[12px] font-semibold text-fg-2 flex items-center gap-1.5">
            <ShieldCheck size={13} /> Allowed without asking
          </div>
          {grants.length > 0 && (
            <button className="text-[11.5px] text-accent hover:underline" onClick={revoke}>
              Reset
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {standing.map((g) => (
            <Chip key={g} tone="neutral" icon={Lock}>
              {g}, always
            </Chip>
          ))}
          {grants.map((g) => (
            <Chip key={g} tone="accent" icon={Check}>
              {g}, this session
            </Chip>
          ))}
          {!grants.length && <span className="text-[12px] text-fg-3">Nothing else yet this session.</span>}
        </div>
      </div>

      {runs.length > 0 && (
        <div className="px-3 pt-3 pb-1">
          <div className="text-[12px] font-semibold text-fg-2">Recent</div>
          <ul className="mt-1.5 grid gap-1">
            {runs.slice(0, 3).map((r) => (
              <li key={r.id} className="flex items-center justify-between text-[12.5px] gap-2">
                <span className="truncate">{r.request}</span>
                <span className="text-fg-3 shrink-0">{timeAgo(r.startedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-1.5 p-2 pt-3">
        <Button
          size="sm"
          className="flex-1"
          onClick={() => {
            openApp("activity");
            onClose();
          }}
        >
          Activity
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={() => {
            openApp("settings", { page: "brain" });
            onClose();
          }}
        >
          Brain settings
        </Button>
      </div>
    </div>
  );
}

function WifiPanel() {
  const wifi = useOS((s) => s.wifi);
  const setWifi = useOS((s) => s.setWifi);
  return (
    <div>
      <div className="px-2.5 pt-1.5 pb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold">Wi-Fi</span>
        <span className="text-[12px] text-fg-3">{wifi.connected ? "Connected" : "Off"}</span>
      </div>
      {wifi.networks.map((n) => {
        const on = wifi.connected === n.ssid;
        return (
          <button
            key={n.ssid}
            onClick={() => setWifi(on ? null : n.ssid)}
            className={clsx(
              "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13px] hover:bg-surface-3",
              on && "bg-accent-soft",
            )}
          >
            <Wifi size={14} className={clsx(on ? "text-accent" : "text-fg-2", n.signal < 3 && "opacity-60")} />
            <span className="flex-1 truncate">{n.ssid}</span>
            {n.secured && <Lock size={11} className="text-fg-3" />}
            {on && <Check size={14} className="text-accent" />}
          </button>
        );
      })}
    </div>
  );
}
