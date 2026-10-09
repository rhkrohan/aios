"use client";

// Your own file actions on the live machine. Same buttons as always (Files,
// Terminal); here they become real changes, made through capd as "you":
// logged, undoable with Cmd+Z, never needing approval (it's you).

import { liveOwner, refreshLive } from "./livemirror";
import { useOS } from "./store";

const os = () => useOS.getState();

/** "~/Downloads" -> "Downloads", "~" -> "" */
export const rel = (dir: string) => (dir === "~" ? "" : dir.replace(/^~\//, ""));
const join = (dir: string, name: string) => [rel(dir), name].filter(Boolean).join("/");
const nameOf = (dir: string, id: string) => os().fs[dir]?.find((i) => i.id === id)?.name;

async function act(tool: string, args: Record<string, unknown>) {
  try {
    const r = await liveOwner("do", { tool, args });
    refreshLive();
    return r;
  } catch (e) {
    os().pushToast({ title: "Couldn't do that on the live machine", body: e instanceof Error ? e.message : String(e), tone: "warn" });
    return null;
  }
}

export function liveNewFolder(dir: string): string {
  const taken = new Set((os().fs[dir] ?? []).map((i) => i.name));
  let name = "New folder";
  for (let n = 2; taken.has(name); n++) name = `New folder ${n}`;
  void act("fs.mkdir", { path: join(dir, name) });
  return `live:${join(dir, name)}`;
}

export function liveRename(dir: string, id: string, name: string) {
  const old = nameOf(dir, id);
  if (!old || !name.trim() || old === name.trim()) return;
  void act("fs.move", { from: join(dir, old), to: join(dir, name.trim()) });
}

export function liveMove(fromDir: string, ids: string[], toDir: string) {
  if (fromDir === toDir) return;
  const moves = ids.map((id) => nameOf(fromDir, id)).filter(Boolean).map((n) => ({ from: join(fromDir, n!), to: `${rel(toDir)}/` }));
  if (moves.length) void act("fs.organize", { moves });
}

export async function liveTrash(fromDir: string, ids: string[]) {
  for (const id of ids) {
    const n = nameOf(fromDir, id);
    if (n) await act("fs.trash", { path: join(fromDir, n) });
  }
}

export async function livePutBack(ids: string[]) {
  for (const id of ids) {
    const n = nameOf("~/Trash", id);
    if (n) await act("fs.restore", { path: `.Trash/${n}` });
  }
}

export async function liveEmptyTrash() {
  for (const item of os().fs["~/Trash"] ?? []) await act("fs.delete", { path: `.Trash/${item.name}` });
}

export async function liveImport(dir: string, files: File[]): Promise<number> {
  let n = 0;
  for (const f of files) {
    if (f.size > 1_000_000 || !/^text\/|json|csv|markdown/.test(f.type || "text/plain") && !/\.(txt|md|csv|json|log)$/i.test(f.name)) {
      os().pushToast({ title: `${f.name} wasn't imported`, body: "The live sandbox takes text files up to 1 MB for now.", tone: "info" });
      continue;
    }
    if (await act("fs.write", { path: join(dir, f.name), text: await f.text() })) n++;
  }
  return n;
}

export async function liveUndo() {
  try {
    await liveOwner("undo");
    refreshLive();
  } catch (e) {
    os().pushToast({ title: "Nothing to undo", body: e instanceof Error ? e.message : String(e), tone: "info" });
  }
}
