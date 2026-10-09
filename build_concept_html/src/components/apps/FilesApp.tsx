"use client";

import clsx from "clsx";
import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FolderPlus,
  Globe,
  Info,
  LayoutGrid,
  List,
  Lock,
  PanelRight,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Waypoints,
  Radio,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BRAND } from "@/lib/brand";
import { undoRun } from "@/lib/engine";
import {
  canUndo,
  childPath,
  emptyTrash,
  importFiles,
  moveItems,
  newFolder,
  putBack,
  rename,
  trashItems,
  undoLast,
} from "@/lib/fileops";
import { SIDEBAR } from "@/lib/seed";
import { useOS } from "@/lib/store";
import type { FileItem, Win } from "@/lib/types";
import { Inspector } from "../files/Inspector";
import { QuickLook } from "../files/QuickLook";
import { Thumb } from "../files/Thumb";
import { Threads } from "../files/Threads";
import { LiveSandbox } from "../files/LiveSandbox";
import {
  VIEWS,
  allItems,
  dirLabel,
  isView,
  originShort,
  viewItems,
  type Located,
} from "../files/model";
import { BrandMark, FolderIcon, TrashIcon, folderEmblem } from "../icons/Icons";
import { Button } from "../ui";

const VIEW_ICON: Record<string, LucideIcon> = {
  "view:threads": Waypoints,
  "view:live": Radio,
  "view:ai": Sparkles,
  "view:web": Globe,
  "view:sensitive": Lock,
  "view:recent": Clock,
};

type Sort = "date" | "name" | "kind" | "size";
const SORTS: { id: Sort; label: string }[] = [
  { id: "date", label: "Date" },
  { id: "name", label: "Name" },
  { id: "kind", label: "Kind" },
  { id: "size", label: "Size" },
];

const RANK: Record<string, number> = { "Just now": 0, Today: 1, Yesterday: 2 };
const dateRank = (m: string) => RANK[m] ?? 3;
const GROUP_LABEL = ["Today", "Today", "Yesterday", "Earlier"];
const bytes = (s?: string) => {
  if (!s) return 0;
  const m = s.match(/([\d.]+)\s*(B|KB|MB|GB)/);
  if (!m) return 0;
  return (
    Number(m[1]) *
    ({ B: 1, KB: 1e3, MB: 1e6, GB: 1e9 } as Record<string, number>)[m[2]]
  );
};

export function FilesApp({ win }: { win: Win }) {
  const path = win.props?.path ?? "~";
  const fs = useOS((s) => s.fs);
  const setProps = useOS((s) => s.setWindowProps);
  const runs = useOS((s) => s.runs);
  const pushToast = useOS((s) => s.pushToast);
  const [back, setBack] = useState<string[]>([]);
  const [fwd, setFwd] = useState<string[]>([]);
  const [view, setView] = useState<"list" | "grid">("grid");
  const [sort, setSort] = useState<Sort>("date");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [inspector, setInspector] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [look, setLook] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    id: string | null;
  } | null>(null);
  const [dropping, setDropping] = useState(false);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const virtual = isView(path);
  const inTrash = path === "~/Trash";
  const live = path === "view:live";
  const threads = path === "view:threads" || live;

  const items: Located[] = useMemo(() => {
    const base: Located[] = virtual
      ? viewItems(fs, path)
      : (fs[path] ?? []).map((item) => ({ item, dir: path }));
    const filtered = q.trim()
      ? base.filter(({ item }) =>
          item.name.toLowerCase().includes(q.trim().toLowerCase()),
        )
      : base;
    const cmp: Record<Sort, (a: Located, b: Located) => number> = {
      date: (a, b) =>
        dateRank(a.item.modified) - dateRank(b.item.modified) ||
        a.item.name.localeCompare(b.item.name),
      name: (a, b) =>
        a.item.name.localeCompare(b.item.name, undefined, { numeric: true }),
      kind: (a, b) =>
        a.item.kind.localeCompare(b.item.kind) ||
        a.item.name.localeCompare(b.item.name),
      size: (a, b) => bytes(b.item.size) - bytes(a.item.size),
    };
    const folders = filtered
      .filter((x) => x.item.kind === "folder")
      .sort(cmp.name);
    const files = filtered
      .filter((x) => x.item.kind !== "folder")
      .sort(cmp[sort]);
    return [...folders, ...files];
  }, [fs, path, q, sort, virtual]);

  // Sections: folders first, then files grouped by date (when sorting by date).
  const sections = useMemo(() => {
    const out: { title: string | null; rows: Located[] }[] = [];
    const folders = items.filter((x) => x.item.kind === "folder");
    const files = items.filter((x) => x.item.kind !== "folder");
    if (folders.length)
      out.push({ title: files.length ? "Folders" : null, rows: folders });
    if (sort === "date" && files.length) {
      for (const label of ["Today", "Yesterday", "Earlier"]) {
        const rows = files.filter(
          (x) => GROUP_LABEL[dateRank(x.item.modified)] === label,
        );
        if (rows.length) out.push({ title: label, rows });
      }
    } else if (files.length)
      out.push({ title: folders.length ? "Files" : null, rows: files });
    return out;
  }, [items, sort]);

  const flat = sections.flatMap((s) => s.rows);
  const selected = flat.filter((x) => sel.includes(x.item.id));
  const single = selected.length === 1 ? selected[0] : null;
  const lookAt =
    flat.find((x) => x.item.id === look) ??
    (look ? allItems(fs).find((x) => x.item.id === look) : undefined);

  const go = (p: string) => {
    if (p === path) return;
    setBack((b) => [...b, path]);
    setFwd([]);
    setSel([]);
    setQ("");
    setProps(win.id, { path: p });
  };
  const openItem = ({ item, dir }: Located) => {
    if (item.kind === "folder") go(childPath(dir, item.name));
    else setLook(item.id);
  };

  const clickItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    rootRef.current?.focus();
    setMenu(null);
    if (e.metaKey || e.ctrlKey)
      setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    else if (e.shiftKey && anchor) {
      const a = flat.findIndex((x) => x.item.id === anchor);
      const b = flat.findIndex((x) => x.item.id === id);
      setSel(
        flat.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.item.id),
      );
    } else {
      setSel([id]);
      setAnchor(id);
    }
  };

  // Every action works on the selection, grouped by the folder each item lives in.
  const byDir = (list: Located[]) =>
    list.reduce<Record<string, string[]>>(
      (acc, { item, dir }) => ((acc[dir] ??= []).push(item.id), acc),
      {},
    );

  const doTrash = (list = selected) => {
    if (!list.length) return;
    if (inTrash) return;
    Object.entries(byDir(list)).forEach(([dir, ids]) => trashItems(dir, ids));
    setSel([]);
    pushToast({
      title: `Moved ${list.length === 1 ? `"${list[0].item.name}"` : `${list.length} items`} to Trash`,
      body: "Put it back from the Trash anytime.",
      tone: "info",
    });
  };

  const doNewFolder = () => {
    if (virtual) return;
    const id = newFolder(path);
    setSel([id]);
    setRenaming(id);
  };

  const doImport = async (files: File[]) => {
    const target = virtual || inTrash ? "~/Documents" : path;
    const n = await importFiles(target, files);
    if (n) {
      if (target !== path) go(target);
      pushToast({
        title: `Imported ${n} ${n === 1 ? "file" : "files"}`,
        body: "From your computer. Kept for this session only.",
        tone: "ok",
      });
    }
  };

  // keyboard shortcuts while the Files window is focused
  const onKey = (e: React.KeyboardEvent) => {
    if (renaming || look || (e.target as HTMLElement).tagName === "INPUT")
      return;
    if (e.key === " " && single) {
      e.preventDefault();
      setLook(single.item.id);
    } else if (
      (e.key === "Backspace" || e.key === "Delete") &&
      selected.length
    ) {
      e.preventDefault();
      doTrash();
    } else if (e.key === "F2" && single) {
      e.preventDefault();
      setRenaming(single.item.id);
    } else if (e.key === "Enter" && single) {
      e.preventDefault();
      openItem(single);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (undoLast()) pushToast({ title: "Undone", tone: "info" });
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSel(flat.map((x) => x.item.id));
    } else if (
      (e.metaKey || e.ctrlKey) &&
      e.shiftKey &&
      e.key.toLowerCase() === "n"
    ) {
      e.preventDefault();
      doNewFolder();
    }
  };

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  const viewMeta = VIEWS.find((v) => v.path === path);
  const crumbs = virtual
    ? [{ label: viewMeta?.label ?? "View", path }]
    : path
        .split("/")
        .map((seg, i, arr) => ({
          label: seg === "~" ? "Home" : seg,
          path: arr.slice(0, i + 1).join("/"),
        }));
  const here = crumbs[crumbs.length - 1].label;
  const touched = !virtual && items.some((x) => x.item.touchedBy);
  const aiRun = runs.find(
    (r) => r.undoable && r.resultAction?.props?.path === path,
  );

  // drag and drop: internal moves, and real files from your computer
  const dragStart = (e: React.DragEvent, loc: Located) => {
    const list = sel.includes(loc.item.id) ? selected : [loc];
    if (!sel.includes(loc.item.id)) setSel([loc.item.id]);
    e.dataTransfer.setData(
      "application/x-sios",
      JSON.stringify(list.map(({ item, dir }) => ({ id: item.id, dir }))),
    );
    e.dataTransfer.effectAllowed = "move";
  };
  const dropInto = (e: React.DragEvent, toDir: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropOn(null);
    setDropping(false);
    const raw = e.dataTransfer.getData("application/x-sios");
    if (raw) {
      const list = JSON.parse(raw) as { id: string; dir: string }[];
      const groups = list.reduce<Record<string, string[]>>(
        (acc, x) => ((acc[x.dir] ??= []).push(x.id), acc),
        {},
      );
      if (toDir === "~/Trash")
        Object.entries(groups).forEach(([dir, ids]) => trashItems(dir, ids));
      else
        Object.entries(groups).forEach(([dir, ids]) =>
          moveItems(dir, ids, toDir),
        );
      setSel([]);
    } else if (e.dataTransfer.files.length) {
      void (async () => {
        const n = await importFiles(toDir, Array.from(e.dataTransfer.files));
        if (n)
          pushToast({
            title: `Imported ${n} ${n === 1 ? "file" : "files"}`,
            body: `Into ${dirLabel(toDir)}. Kept for this session only.`,
            tone: "ok",
          });
      })();
    }
  };
  const allowDrop = (e: React.DragEvent, key?: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes("Files")
      ? "copy"
      : "move";
    if (key) setDropOn(key);
  };

  const menuFor = menu?.id ? flat.find((x) => x.item.id === menu.id) : null;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKey}
      className="h-full flex outline-none relative"
    >
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void doImport(Array.from(e.target.files));
          e.target.value = "";
        }}
      />

      {/* sidebar */}
      <aside className="w-52 shrink-0 border-r border-line bg-surface-2/70 px-2 py-3 hidden sm:flex flex-col gap-0.5 overflow-auto scroll-thin">
        <div className="px-2.5 pb-1.5 text-[12px] font-semibold text-fg-3">
          Places
        </div>
        {SIDEBAR.map((p) => {
          const on =
            path === p.path ||
            (p.path !== "~" && path.startsWith(p.path + "/"));
          return (
            <SideBtn
              key={p.path}
              on={on}
              drop={dropOn === p.path}
              onClick={() => go(p.path)}
              onDragOver={(e) => allowDrop(e, p.path)}
              onDragLeave={() => setDropOn(null)}
              onDrop={(e) => dropInto(e, p.path)}
            >
              <FolderIcon size={22} emblem={folderEmblem(p.label)} />
              {p.label}
            </SideBtn>
          );
        })}

        <div className="px-2.5 pt-3.5 pb-1.5 text-[12px] font-semibold text-fg-3">
          Views
        </div>
        {VIEWS.map((v) => {
          const Icon = VIEW_ICON[v.path];
          const n = viewItems(fs, v.path).length;
          return (
            <SideBtn
              key={v.path}
              on={path === v.path}
              onClick={() => go(v.path)}
              title={v.hint}
            >
              <span
                className={clsx(
                  "size-[22px] rounded-md grid place-items-center shrink-0",
                  v.path === "view:threads" && "bg-ai text-white",
                  v.path === "view:live" && "bg-ok text-white",
                  v.path === "view:ai" && "bg-ai-soft text-ai-ink",
                  v.path === "view:web" && "bg-warn-soft text-warn",
                  v.path === "view:sensitive" && "bg-danger-soft text-danger",
                  v.path === "view:recent" && "bg-surface-3 text-fg-2",
                )}
              >
                <Icon size={13} />
              </span>
              <span className="flex-1 truncate">{v.label}</span>
              {n > 0 && (
                <span className="text-[11px] text-fg-3 tabular-nums">{n}</span>
              )}
            </SideBtn>
          );
        })}

        <div className="mt-auto pt-3">
          <SideBtn
            on={inTrash}
            drop={dropOn === "~/Trash"}
            onClick={() => go("~/Trash")}
            onDragOver={(e) => allowDrop(e, "~/Trash")}
            onDragLeave={() => setDropOn(null)}
            onDrop={(e) => dropInto(e, "~/Trash")}
          >
            <TrashIcon size={22} full={(fs["~/Trash"]?.length ?? 0) > 0} />
            <span className="flex-1">Trash</span>
            {(fs["~/Trash"]?.length ?? 0) > 0 && (
              <span className="text-[11px] text-fg-3 tabular-nums">
                {fs["~/Trash"].length}
              </span>
            )}
          </SideBtn>
          <div className="mx-2 mt-3">
            <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <div className="h-full w-[38%] rounded-full bg-accent" />
            </div>
            <div className="mt-1.5 text-[11.5px] text-fg-3">
              194 GB of 512 GB used
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col bg-surface">
        {/* toolbar */}
        <div className="h-12 shrink-0 flex items-center gap-1 px-3 border-b border-line">
          <NavBtn
            label="Back"
            disabled={!back.length}
            onClick={() => {
              const prev = back[back.length - 1];
              setBack((b) => b.slice(0, -1));
              setFwd((f) => [path, ...f]);
              setSel([]);
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
              setSel([]);
              setProps(win.id, { path: next });
            }}
          >
            <ChevronRight size={17} />
          </NavBtn>
          <nav
            aria-label="Path"
            className="flex items-center ml-1 min-w-0 text-[13.5px]"
          >
            {crumbs.map((c, i) => (
              <span key={c.path} className="flex items-center min-w-0">
                {i > 0 && (
                  <ChevronRight size={13} className="text-fg-3 shrink-0" />
                )}
                <button
                  onClick={() => go(c.path)}
                  onDragOver={(e) => !virtual && allowDrop(e)}
                  onDrop={(e) => !virtual && dropInto(e, c.path)}
                  className={clsx(
                    "px-1.5 h-7 rounded-md truncate hover:bg-surface-3",
                    i === crumbs.length - 1
                      ? "font-semibold text-fg"
                      : "text-fg-2",
                  )}
                >
                  {c.label}
                </button>
              </span>
            ))}
          </nav>
          <span className="flex-1" />

          {!threads && (
            <>
              <label className="flex items-center gap-1.5 h-8 px-2.5 w-44 rounded-[10px] bg-surface-3 text-fg-3 focus-within:ring-2 focus-within:ring-accent/30">
                <Search size={14} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={`Search ${virtual ? "view" : here}`}
                  className="flex-1 min-w-0 bg-transparent outline-none text-[12.5px] text-fg placeholder:text-fg-3"
                  aria-label="Search this folder"
                />
              </label>

              <div className="relative">
                <NavBtn
                  label={`Sort by ${sort}`}
                  onClick={() => setSortOpen(!sortOpen)}
                  active={sortOpen}
                >
                  <ArrowDownUp size={15} />
                </NavBtn>
                {sortOpen && (
                  <div
                    className="absolute right-0 top-9 z-30 w-36 rounded-xl border border-line bg-surface shadow-pop p-1"
                    onMouseLeave={() => setSortOpen(false)}
                  >
                    <div className="px-2 py-1 text-[11px] font-semibold text-fg-3">
                      Sort by
                    </div>
                    {SORTS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSort(s.id);
                          setSortOpen(false);
                        }}
                        className={clsx(
                          "w-full text-left px-2 h-8 rounded-lg text-[13px] hover:bg-surface-3",
                          sort === s.id && "font-semibold text-accent",
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex rounded-[10px] bg-surface-3 p-0.5">
                <NavBtn
                  label="Grid view"
                  active={view === "grid"}
                  onClick={() => setView("grid")}
                >
                  <LayoutGrid size={15} />
                </NavBtn>
                <NavBtn
                  label="List view"
                  active={view === "list"}
                  onClick={() => setView("list")}
                >
                  <List size={15} />
                </NavBtn>
              </div>
            </>
          )}
          <span className="w-px h-5 bg-line mx-0.5" />
          <NavBtn
            label="New folder"
            disabled={virtual || inTrash}
            onClick={doNewFolder}
          >
            <FolderPlus size={16} />
          </NavBtn>
          <NavBtn
            label="Import from your computer"
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={15} />
          </NavBtn>
          <NavBtn
            label={inspector ? "Hide inspector" : "Show inspector"}
            active={inspector}
            onClick={() => setInspector((v) => !v)}
          >
            <PanelRight size={15} />
          </NavBtn>
        </div>

        {/* banners */}
        <AnimatePresence>
          {touched && aiRun && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden shrink-0"
            >
              <div className="flex items-center gap-2.5 mx-3 mt-3 px-3 py-2 rounded-xl bg-ai-soft border border-ai-line text-[13px]">
                <BrandMark size={16} className="text-ai-ink" />
                <span className="flex-1 min-w-0 truncate text-fg">
                  <span className="font-semibold">
                    {BRAND.name} changed {here}.
                  </span>{" "}
                  <span className="text-fg-2">{aiRun.summary}</span>
                </span>
                <Button size="sm" onClick={() => undoRun(aiRun.id)}>
                  Undo
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {inTrash && (fs["~/Trash"]?.length ?? 0) > 0 && (
          <div className="flex items-center gap-2.5 mx-3 mt-3 px-3 py-2 rounded-xl bg-surface-2 border border-line text-[13px] shrink-0">
            <Trash2 size={15} className="text-fg-2" />
            <span className="flex-1 text-fg-2">
              Items here can be put back where they came from.
            </span>
            {sel.length > 0 && (
              <Button size="sm" onClick={() => (putBack(sel), setSel([]))}>
                Put back
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => emptyTrash()}>
              Empty Trash
            </Button>
          </div>
        )}

        <div className="flex-1 min-h-0 flex relative">
          {live && <LiveSandbox />}
          {threads && !live && (
            <Threads
              onLook={(id) => setLook(id)}
              onReveal={(dir, id) => {
                go(dir);
                setSel([id]);
              }}
            />
          )}
          {/* content */}
          <div
            className={clsx(
              "flex-1 min-w-0 overflow-auto scroll-thin relative",
              threads && "hidden",
            )}
            onClick={() => {
              setSel([]);
              setMenu(null);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, id: null });
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("Files")) setDropping(true);
              allowDrop(e);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setDropping(false);
            }}
            onDrop={(e) =>
              dropInto(e, virtual || inTrash ? "~/Documents" : path)
            }
          >
            {sections.map((sec, si) => (
              <section key={si} className={clsx(view === "grid" ? "px-4" : "")}>
                {sec.title && (
                  <div
                    className={clsx(
                      "sticky top-0 z-[2] bg-surface/90 backdrop-blur text-[12px] font-semibold text-fg-3",
                      view === "grid" ? "pt-4 pb-1.5" : "px-4 pt-3 pb-1.5",
                    )}
                  >
                    {sec.title}
                  </div>
                )}
                {view === "grid" ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-x-1 gap-y-1 pb-2 pt-1">
                    <AnimatePresence initial={false}>
                      {sec.rows.map((loc) => {
                        const it = loc.item;
                        const on = sel.includes(it.id);
                        const count =
                          it.kind === "folder"
                            ? fs[childPath(loc.dir, it.name)]?.length
                            : undefined;
                        return (
                          <motion.div
                            layout
                            key={it.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{
                              type: "spring",
                              stiffness: 420,
                              damping: 32,
                            }}
                            draggable={!renaming}
                            onDragStartCapture={(e) =>
                              dragStart(e as unknown as React.DragEvent, loc)
                            }
                            onDragOver={(e) =>
                              it.kind === "folder" && allowDrop(e, it.id)
                            }
                            onDragLeave={() => setDropOn(null)}
                            onDrop={(e) =>
                              it.kind === "folder" &&
                              dropInto(e, childPath(loc.dir, it.name))
                            }
                            onClick={(e) => clickItem(e, it.id)}
                            onDoubleClick={() => openItem(loc)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!on) setSel([it.id]);
                              setMenu({
                                x: e.clientX,
                                y: e.clientY,
                                id: it.id,
                              });
                            }}
                            className={clsx(
                              "group flex flex-col items-center gap-1 px-1.5 pt-2.5 pb-2 rounded-2xl text-center cursor-default select-none transition-colors",
                              on
                                ? "bg-accent-soft ring-1 ring-accent-line"
                                : "hover:bg-surface-2",
                              dropOn === it.id &&
                                "bg-accent-soft ring-2 ring-accent",
                            )}
                          >
                            <Thumb item={it} dir={loc.dir} size={68} count={count} />
                            {renaming === it.id ? (
                              <RenameInput
                                initial={it.name}
                                onDone={(name) => {
                                  if (name !== null)
                                    rename(loc.dir, it.id, name);
                                  setRenaming(null);
                                  rootRef.current?.focus();
                                }}
                              />
                            ) : (
                              <span
                                onDoubleClick={(e) => {
                                  if (on && !virtual) {
                                    e.stopPropagation();
                                    setRenaming(it.id);
                                  }
                                }}
                                className={clsx(
                                  "mt-0.5 text-[12.5px] leading-[1.3] line-clamp-2 break-words max-w-full",
                                  on
                                    ? "font-semibold text-accent-strong"
                                    : "text-fg",
                                )}
                              >
                                {it.name}
                              </span>
                            )}
                            <span className="text-[11px] text-fg-3 truncate max-w-full">
                              {virtual
                                ? `in ${dirLabel(loc.dir)}`
                                : it.kind === "folder"
                                  ? `${count ?? 0} ${count === 1 ? "item" : "items"}`
                                  : (it.size ?? it.modified)}
                            </span>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div>
                    {sec.rows.map((loc) => {
                      const it = loc.item;
                      const on = sel.includes(it.id);
                      const count =
                        it.kind === "folder"
                          ? fs[childPath(loc.dir, it.name)]?.length
                          : undefined;
                      return (
                        <div
                          key={it.id}
                          draggable={!renaming}
                          onDragStart={(e) => dragStart(e, loc)}
                          onDragOver={(e) =>
                            it.kind === "folder" && allowDrop(e, it.id)
                          }
                          onDragLeave={() => setDropOn(null)}
                          onDrop={(e) =>
                            it.kind === "folder" &&
                            dropInto(e, childPath(loc.dir, it.name))
                          }
                          onClick={(e) => clickItem(e, it.id)}
                          onDoubleClick={() => openItem(loc)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!on) setSel([it.id]);
                            setMenu({ x: e.clientX, y: e.clientY, id: it.id });
                          }}
                          className={clsx(
                            "mx-2 grid grid-cols-[1fr_110px_100px_80px] items-center gap-3 h-11 px-2 rounded-xl text-[13px] cursor-default select-none",
                            on
                              ? "bg-accent-soft ring-1 ring-accent-line"
                              : "hover:bg-surface-2",
                            dropOn === it.id && "ring-2 ring-accent",
                          )}
                        >
                          <span className="flex items-center gap-2.5 min-w-0">
                            <Thumb item={it} dir={loc.dir} size={30} />
                            {renaming === it.id ? (
                              <RenameInput
                                initial={it.name}
                                onDone={(name) => {
                                  if (name !== null)
                                    rename(loc.dir, it.id, name);
                                  setRenaming(null);
                                  rootRef.current?.focus();
                                }}
                              />
                            ) : (
                              <span
                                className={clsx(
                                  "truncate",
                                  on && "font-semibold text-accent-strong",
                                )}
                              >
                                {it.name}
                              </span>
                            )}
                            {virtual && (
                              <span className="text-[11.5px] text-fg-3 truncate shrink-0">
                                in {dirLabel(loc.dir)}
                              </span>
                            )}
                          </span>
                          <span className="text-fg-2 flex items-center gap-1.5 truncate">
                            <span
                              className={clsx(
                                "size-1.5 rounded-full shrink-0",
                                it.trust === "untrusted" ? "bg-warn" : "bg-ok",
                              )}
                            />
                            {originShort(it)}
                          </span>
                          <span className="text-fg-2 truncate">
                            {it.modified}
                          </span>
                          <span className="text-fg-2 text-right tabular-nums">
                            {it.kind === "folder"
                              ? `${count ?? 0} items`
                              : (it.size ?? "--")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}

            {!items.length && (
              <div className="h-full min-h-60 grid place-items-center p-8 text-center">
                <div>
                  <div className="mx-auto size-14 rounded-2xl bg-surface-2 grid place-items-center text-fg-3">
                    {q ? (
                      <Search size={22} />
                    ) : inTrash ? (
                      <Trash2 size={22} />
                    ) : (
                      <Upload size={22} />
                    )}
                  </div>
                  <div className="mt-3 text-[14px] font-semibold">
                    {q
                      ? "No matches"
                      : inTrash
                        ? "Trash is empty"
                        : virtual
                          ? "Nothing here right now"
                          : "This folder is empty"}
                  </div>
                  {!q && !virtual && !inTrash && (
                    <p className="mt-1 text-[12.5px] text-fg-2">
                      Drop files from your computer here, or press Import.
                    </p>
                  )}
                </div>
              </div>
            )}

            <AnimatePresence>
              {dropping && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="pointer-events-none absolute inset-2 z-10 rounded-2xl border-2 border-dashed border-accent bg-accent-soft/60 grid place-items-center"
                >
                  <div className="text-center">
                    <Upload size={28} className="mx-auto text-accent" />
                    <div className="mt-2 text-[14px] font-semibold text-accent-strong">
                      Drop to import into{" "}
                      {virtual || inTrash ? "Documents" : here}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {inspector &&
            !threads &&
            (single ? (
              <Inspector
                item={single.item}
                dir={single.dir}
                onClose={() => setInspector(false)}
              />
            ) : (
              <aside className="w-[280px] shrink-0 border-l border-line bg-surface-2/50 grid place-items-center p-6 text-center">
                <div>
                  <div className="text-[13px] font-semibold">
                    {selected.length > 1
                      ? `${selected.length} items selected`
                      : "Select a file"}
                  </div>
                  <p className="mt-1 text-[12px] text-fg-2 leading-5">
                    See where it came from, whether it&apos;s trusted, and which
                    AI can reach it.
                  </p>
                </div>
              </aside>
            ))}

          <AnimatePresence>
            {lookAt && (
              <QuickLook
                item={lookAt.item}
                onClose={() => {
                  setLook(null);
                  rootRef.current?.focus();
                }}
                onNext={() => {
                  const files = flat.filter((x) => x.item.kind !== "folder");
                  const i = files.findIndex((x) => x.item.id === look);
                  const n = files[(i + 1) % files.length];
                  setLook(n.item.id);
                  setSel([n.item.id]);
                }}
                onPrev={() => {
                  const files = flat.filter((x) => x.item.kind !== "folder");
                  const i = files.findIndex((x) => x.item.id === look);
                  const n = files[(i - 1 + files.length) % files.length];
                  setLook(n.item.id);
                  setSel([n.item.id]);
                }}
              />
            )}
          </AnimatePresence>
        </div>

        {/* status bar */}
        <div className="h-8 shrink-0 border-t border-line px-4 flex items-center gap-3 text-[12px] text-fg-3">
          {threads ? (
            <span>
              {live ? "The real sandbox. Refreshes every 2 seconds; changes come only through capd." : "Click a file to follow its thread. Double-click to preview."}
            </span>
          ) : (
            <span>
              {items.length} {items.length === 1 ? "item" : "items"}
              {sel.length > 0 && `, ${sel.length} selected`}
            </span>
          )}
          <span className="flex-1" />
          {!threads && (
            <span className="hidden md:inline">
              Space to preview, F2 to rename, Delete to trash, drag to move
            </span>
          )}
          {canUndo() && (
            <button
              onClick={() => undoLast()}
              className="flex items-center gap-1 text-fg-2 hover:text-fg"
            >
              <Undo2 size={12} /> Undo
            </button>
          )}
        </div>
      </div>

      {/* right-click menu */}
      {menu && (
        <div
          className="fixed z-[1200] w-52 rounded-xl border border-line bg-surface/95 backdrop-blur-xl shadow-pop p-1 text-[13px]"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {menuFor ? (
            <>
              <MenuBtn
                icon={Eye}
                onClick={() => (openItem(menuFor), setMenu(null))}
              >
                {menuFor.item.kind === "folder" ? "Open" : "Quick Look"}
              </MenuBtn>
              {!virtual && !inTrash && (
                <MenuBtn
                  icon={Pencil}
                  onClick={() => (setRenaming(menuFor.item.id), setMenu(null))}
                >
                  Rename
                </MenuBtn>
              )}
              <MenuBtn
                icon={Info}
                onClick={() => (setInspector(true), setMenu(null))}
              >
                Get info
              </MenuBtn>
              <div className="my-1 h-px bg-line" />
              {inTrash ? (
                <MenuBtn
                  icon={Undo2}
                  onClick={() => (
                    putBack(selected.map((x) => x.item.id)),
                    setSel([]),
                    setMenu(null)
                  )}
                >
                  Put back
                </MenuBtn>
              ) : (
                <MenuBtn
                  icon={Trash2}
                  danger
                  onClick={() => (doTrash(), setMenu(null))}
                >
                  Move to Trash
                </MenuBtn>
              )}
            </>
          ) : (
            <>
              <MenuBtn
                icon={FolderPlus}
                onClick={() => (doNewFolder(), setMenu(null))}
              >
                New folder
              </MenuBtn>
              <MenuBtn
                icon={Upload}
                onClick={() => (fileInput.current?.click(), setMenu(null))}
              >
                Import files
              </MenuBtn>
              {canUndo() && (
                <MenuBtn
                  icon={Undo2}
                  onClick={() => (undoLast(), setMenu(null))}
                >
                  Undo
                </MenuBtn>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RenameInput({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (name: string | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = initial.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);
  return (
    <input
      ref={ref}
      defaultValue={initial}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => onDone(e.currentTarget.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onDone(e.currentTarget.value);
        if (e.key === "Escape") onDone(null);
      }}
      className="w-full max-w-[150px] h-6 px-1.5 rounded-md border border-accent bg-surface text-[12.5px] text-center outline-none ring-2 ring-accent/25"
      aria-label="New name"
    />
  );
}

function MenuBtn({
  children,
  icon: Icon,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  icon: LucideIcon;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full flex items-center gap-2.5 px-2.5 h-8 rounded-lg text-left hover:bg-surface-3",
        danger && "text-danger",
      )}
    >
      <Icon size={14} />
      {children}
    </button>
  );
}

function SideBtn({
  children,
  on,
  drop,
  onClick,
  title,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  children: React.ReactNode;
  on: boolean;
  drop?: boolean;
  onClick: () => void;
  title?: string;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={clsx(
        "w-full flex items-center gap-2.5 px-2 h-9 rounded-[10px] text-[13.5px] text-left transition-colors shrink-0",
        on
          ? "bg-surface shadow-[0_1px_2px_rgba(0,0,0,.06),0_0_0_1px_var(--line)] font-semibold"
          : "text-fg-2 hover:bg-surface-3 hover:text-fg",
        drop && "bg-accent-soft ring-2 ring-accent text-fg",
      )}
    >
      {children}
    </button>
  );
}

function NavBtn({
  children,
  onClick,
  disabled,
  active,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "size-8 grid place-items-center rounded-lg text-fg-2 hover:bg-surface-3 hover:text-fg disabled:opacity-30 disabled:pointer-events-none",
        active &&
          "bg-surface text-fg shadow-[0_1px_2px_rgba(0,0,0,.1)] hover:bg-surface",
      )}
    >
      {children}
    </button>
  );
}

export type { FileItem };
