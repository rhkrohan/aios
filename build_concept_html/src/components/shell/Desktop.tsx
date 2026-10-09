"use client";

import { Monitor } from "lucide-react";
import { type FolderColor } from "../icons/Icons";
import { DesktopDisc } from "./DesktopDisc";
import { Launcher } from "./Launcher";
import { MachineSwitch } from "./MachineSwitch";
import { useLiveMirror } from "@/lib/livemirror";
import { Widgets } from "./Widgets";
import { SetupFlow, markSetupSeen } from "./SetupFlow";
import { PowerLayer } from "./Power";
import { Tour } from "./Tour";
import { useTour } from "@/lib/tour";
import { Play } from "lucide-react";
import { Wallpaper } from "./Wallpaper";
import { AnimatePresence } from "motion/react";
import { useEffect } from "react";
import { BRAND } from "@/lib/brand";
import { useOS } from "@/lib/store";
import { MISSIONS } from "@/lib/missions";
import { registerScenarios } from "@/lib/scenarios";

registerScenarios(MISSIONS);
import type { Win } from "@/lib/types";
import { ApprovalSheet } from "../approval/ApprovalSheet";
import { ActivityApp } from "../apps/ActivityApp";
import { FilesApp } from "../apps/FilesApp";
import { MailApp } from "../apps/MailApp";
import { SettingsApp } from "../apps/SettingsApp";
import { StoreApp } from "../apps/StoreApp";
import { SecurityApp } from "../apps/SecurityApp";
import { GoalsApp } from "../apps/GoalsApp";
import { SystemMapApp } from "../apps/SystemMapApp";
import { MemoryApp } from "../apps/MemoryApp";
import { BrowserApp } from "../apps/SimpleApps";
import { TerminalApp } from "../apps/TerminalApp";
import { CommandBar } from "../command/CommandBar";
import { TaskPill } from "../command/TaskPill";
import { Pet } from "../pet/Pet";
import { PetTeam } from "../pet/PetTeam";
import { Dock } from "./Dock";
import { Toasts } from "./Toasts";
import { TopBar } from "./TopBar";
import { Window } from "./Window";

function AppBody({ win }: { win: Win }) {
  switch (win.app) {
    case "files":
      return <FilesApp win={win} />;
    case "activity":
      return <ActivityApp />;
    case "settings":
      return <SettingsApp win={win} />;
    case "mail":
      return <MailApp />;
    case "browser":
      return <BrowserApp win={win} />;
    case "terminal":
      return <TerminalApp win={win} />;
    case "store":
      return <StoreApp win={win} />;
    case "security":
      return <SecurityApp win={win} />;
    case "goals":
      return <GoalsApp win={win} />;
    case "systemmap":
      return <SystemMapApp win={win} />;
    case "memory":
      return <MemoryApp />;
  }
}

let booted = false;

const DESKTOP_ITEMS: { label: string; path: string; color?: FolderColor; thumb?: string }[] = [
  { label: "Projects", path: "~/Projects", color: "blue" },
  { label: "Documents", path: "~/Documents", color: "violet" },
  { label: "Downloads", path: "~/Downloads", color: "teal" },
  { label: "Pictures", path: "~/Pictures", thumb: "/wallpapers/lake.jpg" },
];

export function Desktop() {
  useLiveMirror();
  const theme = useOS((s) => s.theme);
  const windows = useOS((s) => s.windows);
  const commandOpen = useOS((s) => s.commandOpen);
  const setCommandOpen = useOS((s) => s.setCommandOpen);
  const openApp = useOS((s) => s.openApp);
  const tourActive = useTour((s) => s.active);
  const approval = useOS((s) => s.approval);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!booted) {
      booted = true;
      // First visit: the machine starts powered off. Later visits: a short boot.
      if (!markSetupSeen()) useOS.getState().setPower("off");
    }
    const unsub = useOS.subscribe((st, prev) => {
      if (st.power === "on" && prev.power !== "on") {
        setTimeout(() => useOS.getState().pushToast({ title: `${BRAND.name} is ready`, body: "The assistant is running on this computer.", tone: "ok" }), 900);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // ⌘K / Ctrl+K, and Ctrl+Space as a stand-in for Super+Space (browsers can't see Super).
      if (((e.metaKey || e.ctrlKey) && k === "k") || (e.ctrlKey && e.code === "Space")) {
        e.preventDefault();
        if (!useOS.getState().approval) setCommandOpen(!useOS.getState().commandOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCommandOpen]);

  const topZ = Math.max(0, ...windows.filter((w) => !w.minimized).map((w) => w.z));

  return (
    <div className="fixed inset-0 overflow-hidden select-none">
      <Wallpaper />
      <TopBar />

      {/* hero wordmark, part of the wallpaper layer */}
      <div className="absolute inset-x-0 top-[19%] grid justify-items-center pointer-events-none text-white [text-shadow:0_2px_24px_rgba(20,30,50,.45),0_1px_3px_rgba(20,30,50,.35)]">
        <div className="font-display font-extralight text-[clamp(56px,7.2vw,104px)] leading-none tracking-[.5em] pl-[.5em]">{BRAND.name}</div>
        <div className="mt-5 font-display font-normal text-[13px] tracking-[.62em] pl-[.62em] uppercase text-white/85">{BRAND.tagline}</div>
        {!tourActive && (
        <button
          onClick={() => useTour.getState().start()}
          className="pointer-events-auto mt-7 h-10 pl-3 pr-4 rounded-full flex items-center gap-2 text-[13.5px] font-semibold text-white bg-white/15 hover:bg-white/25 backdrop-blur-xl ring-1 ring-white/35 [text-shadow:none] transition-colors"
        >
          <span className="size-6 rounded-full bg-white text-[#1d1f24] grid place-items-center">
            <Play size={11} fill="currentColor" />
          </span>
          Watch it in action
        </button>
        )}
      </div>

      <MachineSwitch />

      {/* desktop items */}
      <div className="absolute top-[52px] left-3 grid gap-3">
        {DESKTOP_ITEMS.map((d) => (
          <DesktopDisc key={d.label} label={d.label} path={d.path} photo={d.thumb} onOpen={() => openApp("files", { path: d.path })} />
        ))}
      </div>

      <Widgets />

      {/* windows */}
      <AnimatePresence>
        {windows.map((w) => (
          <Window key={w.id} win={w} active={w.z === topZ && !commandOpen && !approval}>
            <AppBody win={w} />
          </Window>
        ))}
      </AnimatePresence>

      <Dock />
      <CommandBar />
      <Launcher />
      <TaskPill />
      <PetTeam />
      <Pet />
      <ApprovalSheet />
      <Toasts />
      <SetupFlow />
      <PowerLayer />
      <Tour />

      {/* phones: this is a desktop OS mock */}
      <div className="md:hidden fixed inset-0 z-[2000] grid place-items-center bg-surface-2 p-6 text-center">
        <div className="max-w-xs">
          <span className="inline-grid place-items-center size-12 rounded-2xl bg-accent-soft text-accent">
            <Monitor size={22} />
          </span>
          <div className="mt-3 text-[16px] font-semibold">{BRAND.name} is a desktop</div>
          <p className="mt-1 text-[13px] text-fg-2 leading-5">Open this preview on a laptop or desktop screen to try it.</p>
        </div>
      </div>
    </div>
  );
}
