"use client";

import clsx from "clsx";
import { ChevronLeft, ChevronRight, LayoutGrid, List } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { BRAND } from "@/lib/brand";
import { undoRun } from "@/lib/engine";
import { SIDEBAR } from "@/lib/seed";
import { useOS } from "@/lib/store";
import type { Win } from "@/lib/types";
import { BrandMark, FileIcon, FolderIcon, TrashIcon, folderEmblem } from "../icons/Icons";
import { Button } from "../ui";

export function FilesApp({ win }: { win: Win }) {
  const path = win.props?.path ?? "~";
  const fs = useOS((s) => s.fs);
  const setProps = useOS((s) => s.setWindowProps);
  const runs = useOS((s) => s.runs);
  const [back, setBack] = useState<string[]>([]);
  const [fwd, setFwd] = useState<string[]>([]);
  const [view, setView] = useState<"list" | "grid">("grid");
  const [sel, setSel] = useState<string | null>(null);

  const items = fs[path] ?? [];
  const go = (p: string) => {
    if (p === path) return;
    setBack((b) => [...b, path]);
    setFwd([]);
    setSel(null);
    setProps(win.id, { path: p });
  };
  const crumbs = path.split("/").map((seg, i, arr) => ({ label: seg === "~" ? "Home" : seg, path: arr.slice(0, i + 1).join("/") }));
  const here = crumbs[crumbs.length - 1].label;

  const touched = items.some((x) => x.touchedBy);
  const aiRun = runs.find((r) => r.undoable && r.resultAction?.props?.path === path);

  return (
    <div className="h-full flex">
      <aside className="w-52 shrink-0 border-r border-line bg-surface-2/70 px-2 py-3 hidden sm:flex flex-col gap-0.5">
        <div className="px-2.5 pb-1.5 text-[12px] font-semibold text-fg-3">Places</div>
        {SIDEBAR.map((p) => {
          const on = path === p.path || (p.path !== "~" && path.startsWith(p.path + "/"));
          return (
            <button
              key={p.path}
              onClick={() => go(p.path)}
              className={clsx(
                "w-full flex items-center gap-2.5 px-2 h-9 rounded-[10px] text-[13.5px] text-left transition-colors",
                on ? "bg-surface shadow-[0_1px_2px_rgba(0,0,0,.06),0_0_0_1px_var(--line)] font-semibold" : "text-fg-2 hover:bg-surface-3 hover:text-fg",
              )}
            >
              <FolderIcon size={22} emblem={folderEmblem(p.label)} />
              {p.label}
            </button>
          );
        })}
        <div className="mt-auto">
          <button className="w-full flex items-center gap-2.5 px-2 h-9 rounded-[10px] text-[13.5px] text-fg-2 hover:bg-surface-3">
            <TrashIcon size={22} /> Trash
          </button>
          <div className="mx-2 mt-3">
            <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <div className="h-full w-[38%] rounded-full bg-accent" />
            </div>
            <div className="mt-1.5 text-[11.5px] text-fg-3">194 GB of 512 GB used</div>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col bg-surface">
        <div className="h-12 shrink-0 flex items-center gap-1 px-3 border-b border-line">
          <NavBtn
            label="Back"
            disabled={!back.length}
            onClick={() => {
              const prev = back[back.length - 1];
              setBack((b) => b.slice(0, -1));
              setFwd((f) => [path, ...f]);
              setProps(win.id, { path: prev });
            }}
          >
            <ChevronLeft size={17} />
          </NavBtn>
          <NavBtn
            label="Forward"
            disabled={!fwd.length}
            onClick={() => {
              const next = fwd[0];
              setFwd((f) => f.slice(1));
              setBack((b) => [...b, path]);
              setProps(win.id, { path: next });
            }}
          >
            <ChevronRight size={17} />
          </NavBtn>
          <nav aria-label="Path" className="flex items-center ml-1 min-w-0 text-[13.5px]">
            {crumbs.map((c, i) => (
              <span key={c.path} className="flex items-center min-w-0">
                {i > 0 && <span className="text-fg-3 px-0.5">/</span>}
                <button
                  onClick={() => go(c.path)}
                  className={clsx("px-1.5 h-7 rounded-md truncate hover:bg-surface-3", i === crumbs.length - 1 ? "font-semibold text-fg" : "text-fg-2")}
                >
                  {c.label}
                </button>
              </span>
            ))}
          </nav>
          <span className="flex-1" />
          <div className="flex rounded-[10px] bg-surface-3 p-0.5">
            <NavBtn label="Grid view" active={view === "grid"} onClick={() => setView("grid")}>
              <LayoutGrid size={15} />
            </NavBtn>
            <NavBtn label="List view" active={view === "list"} onClick={() => setView("list")}>
              <List size={15} />
            </NavBtn>
          </div>
        </div>

        <AnimatePresence>
          {touched && aiRun && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden shrink-0">
              <div className="flex items-center gap-2.5 mx-3 mt-3 px-3 py-2 rounded-xl bg-ai-soft border border-ai-line text-[13px]">
                <BrandMark size={16} className="text-ai-ink" />
                <span className="flex-1 min-w-0 truncate text-fg">
                  <span className="font-semibold">{BRAND.name} changed {here}.</span> <span className="text-fg-2">{aiRun.summary}</span>
                </span>
                <Button size="sm" onClick={() => undoRun(aiRun.id)}>
                  Undo
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 min-h-0 overflow-auto scroll-thin" onClick={() => setSel(null)}>
          {view === "grid" ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-x-1 gap-y-2 p-4">
              <AnimatePresence initial={false}>
                {items.map((it) => (
                  <motion.button
                    layout
                    key={it.id}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ type: "spring", stiffness: 420, damping: 30 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSel(it.id);
                    }}
                    onDoubleClick={() => it.kind === "folder" && go(`${path}/${it.name}`)}
                    className="group flex flex-col items-center gap-1.5 px-1.5 pt-2 pb-1.5 rounded-xl text-center outline-none"
                  >
                    <span className={clsx("rounded-xl p-1.5 transition-colors", sel === it.id ? "bg-surface-3" : "group-hover:bg-surface-2")}>
                      <FileIcon kind={it.kind} name={it.name} size={60} ai={!!it.touchedBy} />
                    </span>
                    <span
                      className={clsx(
                        "text-[12.5px] leading-[1.3] line-clamp-2 break-words px-1.5 rounded-md max-w-full",
                        sel === it.id ? "bg-accent text-white [:root[data-theme=dark]_&]:text-[#10161d]" : "text-fg",
                      )}
                    >
                      {it.name}
                    </span>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-surface/95 backdrop-blur z-[1]">
                <tr className="text-left text-[12px] text-fg-3 border-b border-line">
                  <th className="font-medium pl-4 py-2">Name</th>
                  <th className="font-medium w-32">Modified</th>
                  <th className="font-medium w-24 pr-4 text-right">Size</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {items.map((it, i) => (
                    <motion.tr
                      key={it.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSel(it.id);
                      }}
                      onDoubleClick={() => it.kind === "folder" && go(`${path}/${it.name}`)}
                      className={clsx(
                        "cursor-default",
                        sel === it.id ? "bg-accent text-white [:root[data-theme=dark]_&]:text-[#10161d]" : i % 2 ? "bg-surface-2/60" : "",
                      )}
                    >
                      <td className="pl-3 py-1">
                        <span className="flex items-center gap-2.5 min-w-0">
                          <FileIcon kind={it.kind} name={it.name} size={26} />
                          <span className="truncate">{it.name}</span>
                          {it.touchedBy && sel !== it.id && (
                            <span className="text-[11px] font-semibold text-ai-ink bg-ai-soft rounded-full px-2 border border-ai-line">New</span>
                          )}
                        </span>
                      </td>
                      <td className={clsx(sel === it.id ? "" : "text-fg-2")}>{it.modified}</td>
                      <td className={clsx("pr-4 text-right tabular-nums", sel === it.id ? "" : "text-fg-2")}>{it.size ?? "--"}</td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          )}
          {!items.length && <div className="grid place-items-center h-40 text-[13px] text-fg-3">This folder is empty</div>}
        </div>

        <div className="h-8 shrink-0 border-t border-line px-4 flex items-center text-[12px] text-fg-3">
          {items.length} {items.length === 1 ? "item" : "items"}
          {sel && <span className="ml-1">, 1 selected</span>}
        </div>
      </div>
    </div>
  );
}

function NavBtn({ children, onClick, disabled, active, label }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; active?: boolean; label: string }) {
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "size-7.5 grid place-items-center rounded-lg text-fg-2 hover:bg-surface-3 hover:text-fg disabled:opacity-30 disabled:pointer-events-none",
        active && "bg-surface text-fg shadow-[0_1px_2px_rgba(0,0,0,.1)] hover:bg-surface",
      )}
    >
      {children}
    </button>
  );
}
