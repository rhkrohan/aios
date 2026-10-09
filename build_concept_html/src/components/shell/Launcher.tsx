"use client";

// The launcher: one search box for apps, files, settings and quick actions,
// like Spotlight on macOS or Start search on Windows. Option+Space (or
// Ctrl+Space) opens it. If nothing fits, the last row hands the words to SIOS.

import clsx from "clsx";
import { ArrowRight, Brain, FlaskConical, Moon, Lock, Palette, Play, Plug, Radio, Search, ShieldCheck, Sun, Wifi, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BRAND } from "@/lib/brand";
import { runRequest } from "@/lib/engine";
import { searchObjects } from "@/lib/objects";
import { useOS } from "@/lib/store";
import { useTour } from "@/lib/tour";
import type { AppId, FileItem } from "@/lib/types";
import { AppIcon } from "../icons/Icons";
import { StringOrb } from "../icons/StringOrb";
import { FileGlyph } from "../ui";
import { FolderDisc } from "../icons/FolderDisc";
import { dirLabel } from "../files/model";

const APPS: { id: AppId; name: string; words: string }[] = [
  { id: "files", name: "Files", words: "finder explorer documents folders threads" },
  { id: "browser", name: "Browser", words: "web internet safari chrome" },
  { id: "mail", name: "Mail", words: "email inbox" },
  { id: "store", name: "Store", words: "apps install mcp tools" },
  { id: "activity", name: "Activity", words: "history tasks routines" },
  { id: "terminal", name: "Terminal", words: "shell command line console" },
  { id: "security", name: "Security Center", words: "permissions trust audit privacy iam" },
  { id: "goals", name: "Goals", words: "processes tasks running monitor" },
  { id: "systemmap", name: "System Map", words: "twin architecture simulate diagram" },
  { id: "memory", name: "Memory", words: "remember vault facts people preferences history what do you know about me" },
  { id: "settings", name: "Settings", words: "preferences system control" },
];

interface Item {
  key: string;
  group: string;
  title: string;
  sub?: string;
  icon: React.ReactNode;
  run: () => void;
}

const SETTING_PAGES: { page: string; title: string; words: string; icon: LucideIcon }[] = [
  { page: "brain", title: "Brain and AI", words: "model openai live machine planner online local", icon: Brain },
  { page: "permissions", title: "Permissions", words: "rules allow ask block access", icon: ShieldCheck },
  { page: "connections", title: "Connected AI apps", words: "claude chatgpt mcp clients", icon: Plug },
  { page: "appearance", title: "Appearance", words: "theme dark light wallpaper", icon: Palette },
  { page: "wifi", title: "Wi-Fi", words: "wifi network internet wireless", icon: Wifi },
  { page: "lab", title: "Test lab", words: "test files packs sandbox reset demo data", icon: FlaskConical },
];

const has = (hay: string, q: string) => q.split(/\s+/).every((w) => hay.toLowerCase().includes(w));

export function Launcher() {
  const open = useOS((s) => s.launcherOpen);
  const setOpen = useOS((s) => s.setLauncherOpen);
  const fs = useOS((s) => s.fs);
  const theme = useOS((s) => s.theme);
  const live = useOS((s) => s.settings.liveMachine);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // Option+Space or Ctrl+Space opens it anywhere (Cmd+Space belongs to macOS itself)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && (e.altKey || e.ctrlKey) && !e.metaKey) {
        e.preventDefault();
        useOS.getState().setLauncherOpen(!useOS.getState().launcherOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // start fresh each time it closes
  const close = () => {
    setOpen(false);
    setQ("");
    setSel(0);
  };
  const os = useOS.getState;

  const items = useMemo<Item[]>(() => {
    const query = q.trim().toLowerCase();
    const out: Item[] = [];
    const apps = APPS.filter((a) => !query || has(`${a.name} ${a.words}`, query));
    out.push(
      ...apps.slice(0, query ? 5 : 6).map((a) => ({
        key: `app:${a.id}`,
        group: "Apps",
        title: a.name,
        icon: <AppIcon app={a.id} size={26} />,
        run: () => os().openApp(a.id),
      })),
    );
    if (query) {
      // folders by name, files by name and by meaning ("finance", "from the web"...)
      const folders = Object.entries(fs)
        .flatMap(([dir, list]) => list.filter((f) => f.kind === "folder" && f.name.toLowerCase().includes(query)).map((item) => ({ dir, item })))
        .slice(0, 3);
      out.push(
        ...folders.map(({ dir, item }) => ({
          key: `dir:${dir}/${item.name}`,
          group: "Folders",
          title: item.name,
          sub: dirLabel(dir),
          icon: <FolderDisc path={dir === "~" ? `~/${item.name}` : `${dir}/${item.name}`} name={item.name} size={26} tone="surface" />,
          run: () => os().openApp("files", { path: dir === "~" ? `~/${item.name}` : `${dir}/${item.name}` }),
        })),
      );
      const files = (searchObjects(fs, query) as { dir: string; item: FileItem }[]).slice(0, 6);
      out.push(
        ...files.map(({ dir, item }) => ({
          key: `file:${dir}/${item.id}`,
          group: "Files",
          title: item.name,
          sub: [dirLabel(dir), ...(item.labels ?? []), item.trust === "untrusted" ? "untrusted" : ""].filter(Boolean).join(" · "),
          icon: <FileGlyph kind={item.kind} name={item.name} size={26} />,
          run: () => os().openApp("files", { path: dir }),
        })),
      );
      out.push(
        ...SETTING_PAGES.filter((p) => has(`${p.title} ${p.words} settings`, query)).map((p) => ({
          key: `set:${p.page}`,
          group: "Settings",
          title: p.title,
          sub: "Settings",
          icon: <Tile icon={p.icon} />,
          run: () => os().openApp("settings", { page: p.page }),
        })),
      );
    }
    const actions: (Item & { words: string })[] = [
      { key: "act:theme", group: "Actions", title: theme === "dark" ? "Turn on light mode" : "Turn on dark mode", words: "dark light mode theme appearance", icon: <Tile icon={theme === "dark" ? Sun : Moon} />, run: () => os().setTheme(theme === "dark" ? "light" : "dark") },
      { key: "act:live", group: "Actions", title: live ? "Switch the live machine off" : "Switch the live machine on", words: "live machine real files sandbox capd openai", icon: <Tile icon={Radio} />, run: () => os().updateSettings({ liveMachine: !live }) },
      { key: "act:lock", group: "Actions", title: "Lock screen", words: "lock screen away", icon: <Tile icon={Lock} />, run: () => os().setPower("locked") },
      { key: "act:demo", group: "Actions", title: "Watch the demo", words: "demo tour auto watch", icon: <Tile icon={Play} />, run: () => useTour.getState().start() },
    ];
    out.push(...actions.filter((a) => query && has(`${a.title} ${a.words}`, query)));
    if (query) {
      out.push({
        key: "ask",
        group: `Ask ${BRAND.name}`,
        title: `“${q.trim()}”`,
        sub: live ? "Runs on the live machine, through capd" : "Let the assistant do it",
        icon: <StringOrb size={26} strands={12} />,
        run: () => void runRequest(q.trim()),
      });
    }
    return out;
  }, [q, fs, theme, live, os]);

  const pick = (i: number) => {
    const it = items[i];
    if (!it) return;
    close();
    it.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(items.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(sel);
    }
  };

  let lastGroup = "";
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] flex justify-center pt-[16vh] px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={close}>
          <motion.div
            role="dialog"
            aria-label="Search"
            initial={{ y: -10, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 520, damping: 34 }}
            onMouseDown={(e) => e.stopPropagation()}
            className="glass w-full max-w-[620px] h-fit max-h-[62vh] flex flex-col rounded-[22px] bg-glass-strong backdrop-blur-3xl backdrop-saturate-150 border border-glass-line shadow-pop overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 h-14 border-b border-line/70">
              <Search size={19} className="text-fg-3 shrink-0" />
              <input
                ref={input}
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setSel(0);
                }}
                onKeyDown={onKey}
                placeholder="Search apps, files and settings"
                className="flex-1 min-w-0 bg-transparent outline-none text-[18px] placeholder:text-fg-3"
                aria-label="Search apps, files and settings"
              />
              <span className="kbd">esc</span>
            </div>
            <ul className="flex-1 overflow-auto scroll-thin p-2" role="listbox" aria-label="Results">
              {items.map((it, i) => {
                const header = it.group !== lastGroup ? it.group : null;
                lastGroup = it.group;
                return (
                  <li key={it.key}>
                    {header && <div className="px-2.5 pt-2 pb-1 text-[11.5px] font-semibold text-fg-3">{header}</div>}
                    <button
                      role="option"
                      aria-selected={i === sel}
                      onMouseMove={() => setSel(i)}
                      onClick={() => pick(i)}
                      className={clsx("w-full flex items-center gap-3 px-2.5 h-11 rounded-xl text-left", i === sel ? "bg-accent-soft" : "hover:bg-fg/[.04]")}
                    >
                      <span className="size-[26px] grid place-items-center shrink-0">{it.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-medium truncate">{it.title}</span>
                        {it.sub && <span className="block text-[11.5px] text-fg-3 truncate">{it.sub}</span>}
                      </span>
                      {i === sel && <ArrowRight size={15} className="text-fg-3" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Tile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="size-[26px] rounded-[8px] bg-surface-3 grid place-items-center text-fg-2">
      <Icon size={15} />
    </span>
  );
}
