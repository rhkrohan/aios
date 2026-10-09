// The object layer of the file system. Files are objects: every change is
// stamped into the file's own history, and the broker can look up a file's
// labels and trust before an AI touches it.

import type { FileEvent, FileItem } from "./types";

export type FS = Record<string, FileItem[]>;

/** Record a change on a file: new history entry, version bump, fresh timestamp. */
export function stamp(item: FileItem, by: string, action: string, goal?: string): FileItem {
  const ev: FileEvent = { at: Date.now(), by, action, goal };
  return {
    ...item,
    history: [ev, ...(item.history ?? [])].slice(0, 20),
    versions: (item.versions ?? 1) + (item.kind === "folder" ? 0 : 1),
    modified: "Just now",
    goal: goal ?? item.goal,
  };
}

/** Find a file anywhere by exact (then partial) name. */
/** Lowercase, letters and digits only: "Lease agreement" matches "lease-agreement.pdf". */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function findByName(fs: FS, name: string): { dir: string; item: FileItem } | null {
  const raw = name.toLowerCase().trim().replace(/\s*\[.*\]$/, "");
  const n = norm(raw);
  if (!n) return null;
  const tests = [(i: FileItem) => i.name.toLowerCase() === raw, (i: FileItem) => norm(i.name).startsWith(n), (i: FileItem) => norm(i.name).includes(n)];
  for (const test of tests) {
    for (const [dir, items] of Object.entries(fs)) {
      if (dir === "~/Trash") continue;
      const hit = items.find(test);
      if (hit) return { dir, item: hit };
    }
  }
  return null;
}

/** Resolve a tool target (a path like ~/Documents/x.pdf, or a bare file name) to the object, if it's a file. */
export function lookup(fs: FS, target: string): { dir: string; item: FileItem } | null {
  if (!target) return null;
  const t = target.trim().replace(/\/+$/, "");
  const slash = t.lastIndexOf("/");
  if (slash > 0) {
    const dir = t.slice(0, slash);
    const name = t.slice(slash + 1);
    const hit = fs[dir]?.find((i) => i.name === name);
    if (hit) return { dir, item: hit };
    // the target may itself be a folder path
    const parent = dir;
    const folder = fs[parent]?.find((i) => i.name === name && i.kind === "folder");
    if (folder) return { dir: parent, item: folder };
  }
  return findByName(fs, t.split("/").pop() ?? t);
}

/** Every label that applies to a path: the item's own plus any folder above it. */
export function labelsAt(fs: FS, target: string): string[] {
  const found = lookup(fs, target);
  const labels = new Set(found?.item.labels ?? []);
  const path = found ? `${found.dir}/${found.item.name}` : target;
  const parts = path.split("/");
  for (let i = 2; i < parts.length; i++) {
    const dir = parts.slice(0, i - 1).join("/") || "~";
    const name = parts[i - 1];
    fs[dir]?.find((x) => x.name === name)?.labels?.forEach((l) => labels.add(l));
  }
  return [...labels];
}

/** Search by meaning as well as by name: labels, origin, AI changes, recency. */
export function searchObjects(fs: FS, query: string, inDir?: string) {
  const q = query.toLowerCase().trim();
  const pool = Object.entries(fs)
    .filter(([dir]) => !inDir || dir === inDir || dir.startsWith(inDir + "/"))
    .filter(([dir]) => dir !== "~/Trash")
    .flatMap(([dir, items]) => items.filter((i) => i.kind !== "folder").map((item) => ({ dir, item })));
  if (!q) return pool;
  const LABEL = ["work", "personal", "sensitive", "finance"].find((l) => q.includes(l) || (l === "finance" && /money|invoice|bill|budget|tax/.test(q)));
  if (LABEL) return pool.filter(({ item }) => item.labels?.some((x) => x.toLowerCase() === LABEL));
  if (/web|download|internet|online|untrusted/.test(q)) return pool.filter(({ item }) => item.trust === "untrusted");
  if (/\bai\b|sios|assistant|changed by/.test(q)) return pool.filter(({ item }) => item.touchedBy || item.history?.some((h) => h.by !== "you"));
  if (/today|recent|new/.test(q)) return pool.filter(({ item }) => ["Just now", "Today"].includes(item.modified));
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  return pool.filter(({ item }) => words.some((w) => item.name.toLowerCase().includes(w)));
}

/** Compact description for the planner: name plus tags, no contents. */
export function describe(item: FileItem) {
  const tags = [...(item.labels ?? []), item.trust === "untrusted" ? `from ${item.origin?.by ?? "web"}` : ""].filter(Boolean);
  const name = item.kind === "folder" ? `${item.name}/` : item.name;
  return tags.length ? `${name} [${tags.join(", ")}]` : name;
}

/**
 * Lineage: mark a file as made from others. It inherits their labels and, if
 * any source is untrusted, becomes untrusted too. Returns the new file system.
 */
export function deriveFrom(fs: FS, dir: string, id: string, sources: FileItem[], madeBy?: { by: string; via?: string }): FS {
  const ids = sources.map((x) => x.id).filter((x) => x !== id);
  if (!ids.length) return fs;
  const inherited = sources.flatMap((x) => x.labels ?? []);
  const untrusted = sources.some((x) => x.trust === "untrusted");
  return {
    ...fs,
    [dir]: (fs[dir] ?? []).map((f) =>
      f.id !== id
        ? f
        : {
            ...f,
            from: Array.from(new Set([...(f.from ?? []), ...ids])),
            labels: Array.from(new Set([...(f.labels ?? []), ...inherited])),
            trust: untrusted ? "untrusted" : f.trust,
            origin: madeBy ? { by: madeBy.by, via: madeBy.via ?? `made from ${sources.map((x) => x.name).join(", ")}` } : f.origin,
          },
    ),
  };
}

/** Find a file anywhere by id. */
export function byId(fs: FS, id: string): { dir: string; item: FileItem } | null {
  for (const [dir, items] of Object.entries(fs)) {
    if (dir === "~/Trash") continue;
    const item = items.find((x) => x.id === id);
    if (item) return { dir, item };
  }
  return null;
}
