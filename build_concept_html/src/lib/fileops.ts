"use client";

// Your own file actions in Files. These are human actions, so they don't go
// through the AI broker, but they are still stamped into each file's history
// and can be undone (Cmd+Z in Files).

import { putBlob } from "./blobs";
import { liveEmptyTrash, liveImport, liveMove, liveNewFolder, livePutBack, liveRename, liveTrash, liveUndo } from "./liveops";
import { stamp } from "./objects";
import { useOS } from "./store";
import type { FileItem } from "./types";

type FS = Record<string, FileItem[]>;
const os = () => useOS.getState();
const undoStack: FS[] = [];

function commit(next: FS) {
  // anything not routed to the live machine above must never edit the mirror
  if (os().settings.liveMachine) return;
  undoStack.push(os().fs);
  if (undoStack.length > 30) undoStack.shift();
  os().setFs(next);
}

export function canUndo() {
  return os().settings.liveMachine || undoStack.length > 0;
}

export function undoLast() {
  if (os().settings.liveMachine) {
    void liveUndo();
    return true;
  }
  const prev = undoStack.pop();
  if (prev) os().setFs(prev);
  return !!prev;
}

export const childPath = (dir: string, name: string) => (dir === "~" ? `~/${name}` : `${dir}/${name}`);

function uniqueName(items: FileItem[], name: string) {
  if (!items.some((i) => i.name === name)) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let n = 2;
  while (items.some((i) => i.name === `${base} ${n}${ext}`)) n++;
  return `${base} ${n}${ext}`;
}

export function newFolder(dir: string): string {
  if (os().settings.liveMachine) return liveNewFolder(dir);
  const fs = os().fs;
  const name = uniqueName(fs[dir] ?? [], "New folder");
  const id = "dir_" + Date.now();
  const folder: FileItem = { id, name, kind: "folder", modified: "Just now", origin: { by: "you" }, trust: "trusted", history: [{ at: Date.now(), by: "you", action: "Created" }] };
  commit({ ...fs, [dir]: [...(fs[dir] ?? []), folder], [childPath(dir, name)]: [] });
  return id;
}

/** Rename, keeping a folder's contents attached to its new path. */
export function rename(dir: string, id: string, name: string) {
  if (os().settings.liveMachine) return liveRename(dir, id, name);
  const fs = os().fs;
  const item = fs[dir]?.find((i) => i.id === id);
  const clean = name.trim();
  if (!item || !clean || clean === item.name) return;
  if (fs[dir].some((i) => i.name === clean && i.id !== id)) return;
  const next: FS = { ...fs, [dir]: fs[dir].map((i) => (i.id === id ? stamp({ ...i, name: clean }, "you", `Renamed from ${item.name}`) : i)) };
  if (item.kind === "folder") {
    const oldP = childPath(dir, item.name);
    const newP = childPath(dir, clean);
    for (const key of Object.keys(fs)) {
      if (key === oldP || key.startsWith(oldP + "/")) {
        next[newP + key.slice(oldP.length)] = fs[key];
        delete next[key];
      }
    }
  }
  commit(next);
}

/** Move items into another folder. Refuses to move a folder into itself. */
export function moveItems(fromDir: string, ids: string[], toDir: string) {
  if (os().settings.liveMachine) return liveMove(fromDir, ids, toDir);
  if (fromDir === toDir) return;
  const fs = os().fs;
  const moving = (fs[fromDir] ?? []).filter((i) => ids.includes(i.id));
  if (!moving.length) return;
  for (const m of moving) {
    const p = childPath(fromDir, m.name);
    if (m.kind === "folder" && (toDir === p || toDir.startsWith(p + "/"))) return;
  }
  const next: FS = { ...fs, [fromDir]: fs[fromDir].filter((i) => !ids.includes(i.id)), [toDir]: [...(fs[toDir] ?? [])] };
  for (const m of moving) {
    const name = uniqueName(next[toDir], m.name);
    next[toDir].push(stamp({ ...m, name }, "you", `Moved from ${fromDir} to ${toDir}`));
    if (m.kind === "folder") {
      const oldP = childPath(fromDir, m.name);
      const newP = childPath(toDir, name);
      for (const key of Object.keys(fs)) {
        if (key === oldP || key.startsWith(oldP + "/")) {
          next[newP + key.slice(oldP.length)] = fs[key];
          delete next[key];
        }
      }
    }
  }
  commit(next);
}

export function trashItems(fromDir: string, ids: string[]) {
  if (os().settings.liveMachine) return void liveTrash(fromDir, ids);
  const fs = os().fs;
  const moving = (fs[fromDir] ?? []).filter((i) => ids.includes(i.id));
  if (!moving.length) return;
  const trash = [...(fs["~/Trash"] ?? []), ...moving.map((m) => ({ ...stamp(m, "you", `Moved to Trash from ${fromDir}`), trashedFrom: fromDir }))];
  commit({ ...fs, [fromDir]: fs[fromDir].filter((i) => !ids.includes(i.id)), "~/Trash": trash });
}

export function putBack(ids: string[]) {
  if (os().settings.liveMachine) return void livePutBack(ids);
  const fs = os().fs;
  const next: FS = { ...fs, "~/Trash": (fs["~/Trash"] ?? []).filter((i) => !ids.includes(i.id)) };
  for (const item of (fs["~/Trash"] ?? []).filter((i) => ids.includes(i.id))) {
    const back = item.trashedFrom ?? "~/Documents";
    next[back] = [...(next[back] ?? []), { ...stamp(item, "you", "Put back from Trash"), trashedFrom: undefined }];
  }
  commit(next);
}

export function emptyTrash() {
  if (os().settings.liveMachine) return void liveEmptyTrash();
  commit({ ...os().fs, "~/Trash": [] });
}

// ---------------------------------------------------------------- import

const EXT: [RegExp, FileItem["kind"]][] = [
  [/\.(pdf)$/i, "pdf"],
  [/\.(jpe?g|png|gif|webp|heic|bmp|svg)$/i, "image"],
  [/\.(docx?|pages|rtf|odt)$/i, "doc"],
  [/\.(xlsx?|csv|numbers|ods|tsv)$/i, "sheet"],
  [/\.(pptx?|key|odp)$/i, "slides"],
  [/\.(zip|tar|gz|tgz|7z|rar|bz2|xz)$/i, "archive"],
  [/\.(dmg|pkg|exe|msi|rpm|deb|appimage|flatpak)$/i, "installer"],
  [/\.(js|jsx|ts|tsx|py|rs|go|java|c|cc|cpp|h|sh|rb|php|swift|kt|json|ya?ml|toml|html|css|sql)$/i, "code"],
  [/\.(txt|md|markdown|log|ini|cfg)$/i, "text"],
  [/\.(mp3|wav|m4a|flac|aac|ogg)$/i, "audio"],
  [/\.(mp4|mov|webm|mkv|avi)$/i, "video"],
];

export function kindOf(name: string, mime = ""): FileItem["kind"] {
  for (const [re, kind] of EXT) if (re.test(name)) return kind;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/")) return "text";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "text";
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

const READABLE = new Set(["text", "code"]);

/** Bring real files from your computer into a folder. Returns how many arrived. */
export async function importFiles(dir: string, files: File[]): Promise<number> {
  if (os().settings.liveMachine) return liveImport(dir, files);
  const added: FileItem[] = [];
  const existing = [...(os().fs[dir] ?? [])];
  for (const f of files) {
    const kind = kindOf(f.name, f.type);
    const id = "imp_" + Math.random().toString(36).slice(2, 10);
    let text: string | undefined;
    if ((READABLE.has(kind) || /\.csv$/i.test(f.name)) && f.size < 2_000_000) text = await f.text();
    putBlob(id, { url: URL.createObjectURL(f), text, mime: f.type || "application/octet-stream" });
    const name = uniqueName([...existing, ...added], f.name);
    added.push({
      id,
      name,
      kind,
      size: formatSize(f.size),
      modified: "Just now",
      origin: { by: "you", via: "imported from your computer" },
      trust: "trusted",
      imported: true,
      mime: f.type,
      versions: 1,
      history: [{ at: Date.now(), by: "you", action: "Imported from your computer" }],
    });
  }
  if (added.length) {
    const fs = os().fs;
    commit({ ...fs, [dir]: [...(fs[dir] ?? []), ...added] });
  }
  return added.length;
}
