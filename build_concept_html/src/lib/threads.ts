// Threads: the file system drawn as where things came from and what was made
// from them. Pure functions: build the graph from the machine's state, lay it
// out in columns, and walk a file's whole thread.

import { BRAND } from "./brand";
import type { FileItem, MailMessage, Run } from "./types";

export type SourceTone = "you" | "email" | "web" | "ai" | "app" | "unknown";

export interface TNode {
  id: string;
  kind: "source" | "file" | "out";
  x: number;
  y: number;
  w: number;
  label: string;
  sub?: string;
  tone?: SourceTone | "sent" | "blocked";
  item?: FileItem;
  dir?: string;
  count?: number;
}

export interface TEdge {
  id: string;
  from: string;
  to: string;
  kind: "origin" | "made" | "sent" | "blocked";
}

export interface TGraph {
  nodes: TNode[];
  edges: TEdge[];
  width: number;
  height: number;
  /** x position and title of each column, for the headers. */
  columns: { x: number; w: number; title: string }[];
}

export const ROW = 40;
export const NODE_H = 32;
const SRC_W = 124;
const FILE_W = 188;
const GAP = 52;
const GROUP_GAP = 18;
const TOP = 44; // room for the column headers

const SOURCE_ORDER: SourceTone[] = ["you", "email", "web", "ai", "app", "unknown"];

export function sourceOf(item: FileItem): { key: string; tone: SourceTone; label: string } {
  const by = item.origin?.by;
  if (!by) return { key: "unknown", tone: "unknown", label: "Unknown" };
  if (by === "you") return { key: "you", tone: "you", label: "You" };
  if (by === "email") return { key: "email", tone: "email", label: "Email" };
  if (by === "web") return { key: "web", tone: "web", label: "The web" };
  if (by === "SIOS" || by === BRAND.name || by === "assistant") return { key: "ai", tone: "ai", label: BRAND.name };
  return { key: `app:${by}`, tone: "app", label: by };
}

interface Input {
  fs: Record<string, FileItem[]>;
  mail: MailMessage[];
  runs: Run[];
  /** Only files that are part of a thread (made from something, or made into something). */
  onlyThreads: boolean;
}

export function buildThreads({ fs, mail, runs, onlyThreads }: Input): TGraph {
  // every file (not folders, not trash), with where it lives
  const files: { item: FileItem; dir: string }[] = [];
  for (const [dir, items] of Object.entries(fs)) {
    if (dir === "~/Trash") continue;
    for (const item of items) if (item.kind !== "folder") files.push({ item, dir });
  }
  const byId = new Map(files.map((f) => [f.item.id, f]));
  const byName = new Map(files.map((f) => [f.item.name, f]));

  // file -> file edges (lineage)
  const made: TEdge[] = [];
  const children = new Map<string, string[]>();
  for (const { item } of files) {
    for (const p of item.from ?? []) {
      if (!byId.has(p)) continue;
      made.push({ id: `m:${p}>${item.id}`, from: `f:${p}`, to: `f:${item.id}`, kind: "made" });
      children.set(p, [...(children.get(p) ?? []), item.id]);
    }
  }

  // file -> outside world: sent mail, and sends the broker blocked
  const outs: { node: Omit<TNode, "x" | "y">; fileId: string; kind: "sent" | "blocked" }[] = [];
  for (const m of mail) {
    const f = m.attachment ? byName.get(m.attachment) : undefined;
    if (!f) continue;
    outs.push({
      node: { id: `o:${m.id}`, kind: "out", w: FILE_W, label: `Sent to ${m.to.map((p) => p.name.split(" ")[0]).join(", ")}`, sub: m.subject, tone: "sent" },
      fileId: f.item.id,
      kind: "sent",
    });
  }
  for (const r of runs) {
    for (const st of r.steps) {
      if (st.status !== "blocked" || !st.tool || !/send|upload|share|post/.test(st.tool.name)) continue;
      const attach = st.tool.input.attach ?? st.tool.input.attachment ?? st.tool.input.path;
      const f = typeof attach === "string" ? (byName.get(attach) ?? byName.get(attach.split("/").pop() ?? "")) : undefined;
      if (!f) continue;
      const to = Array.isArray(st.tool.input.to) ? st.tool.input.to.join(", ") : String(st.tool.input.to ?? "outside");
      outs.push({ node: { id: `b:${r.id}:${st.id}`, kind: "out", w: FILE_W, label: `Blocked: to ${to}`, sub: "The broker stopped it", tone: "blocked" }, fileId: f.item.id, kind: "blocked" });
    }
  }
  const hasOut = new Set(outs.map((o) => o.fileId));

  const derived = files.filter((f) => (f.item.from ?? []).some((p) => byId.has(p)));
  const derivedIds = new Set(derived.map((f) => f.item.id));
  const originals = files.filter((f) => !derivedIds.has(f.item.id) && (!onlyThreads || children.has(f.item.id) || hasOut.has(f.item.id)));

  // depth: originals are 0, a made file is one more than its deepest parent
  const depth = new Map<string, number>();
  const depthOf = (id: string, seen = new Set<string>()): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const parents = (byId.get(id)?.item.from ?? []).filter((p) => byId.has(p));
    const d = parents.length ? 1 + Math.max(...parents.map((p) => depthOf(p, seen))) : 0;
    depth.set(id, d);
    return d;
  };
  for (const f of files) depthOf(f.item.id);
  const maxDepth = Math.max(0, ...derived.map((f) => depth.get(f.item.id) ?? 0));

  const colX = (d: number) => SRC_W + GAP + d * (FILE_W + GAP);
  const nodes: TNode[] = [];
  const pos = new Map<string, TNode>();
  const put = (n: TNode) => {
    nodes.push(n);
    pos.set(n.id, n);
  };

  // sources and the originals they produced, grouped
  const groups = new Map<string, { tone: SourceTone; label: string; files: typeof originals }>();
  for (const f of originals) {
    const s = sourceOf(f.item);
    if (!groups.has(s.key)) groups.set(s.key, { tone: s.tone, label: s.label, files: [] });
    groups.get(s.key)!.files.push(f);
  }
  const ordered = [...groups.entries()].sort((a, b) => SOURCE_ORDER.indexOf(a[1].tone) - SOURCE_ORDER.indexOf(b[1].tone) || a[1].label.localeCompare(b[1].label));
  const edges: TEdge[] = [];
  let y = TOP;
  for (const [key, g] of ordered) {
    // files with threads first inside each group, so lines stay short
    g.files.sort((a, b) => Number(children.has(b.item.id) || hasOut.has(b.item.id)) - Number(children.has(a.item.id) || hasOut.has(a.item.id)) || a.item.name.localeCompare(b.item.name));
    const top = y;
    for (const f of g.files) {
      put({ id: `f:${f.item.id}`, kind: "file", x: colX(0), y, w: FILE_W, label: f.item.name, item: f.item, dir: f.dir });
      edges.push({ id: `s:${key}>${f.item.id}`, from: `s:${key}`, to: `f:${f.item.id}`, kind: "origin" });
      y += ROW;
    }
    put({ id: `s:${key}`, kind: "source", x: 0, y: (top + y - ROW) / 2, w: SRC_W, label: g.label, tone: g.tone, count: g.files.length });
    y += GROUP_GAP;
  }

  // made files: column by depth, row near their parents
  const placeColumn = (want: { id: string; y: number; node: Omit<TNode, "x" | "y">; x: number }[]) => {
    want.sort((a, b) => a.y - b.y);
    let last = -Infinity;
    for (const w of want) {
      const yy = Math.max(w.y, last + ROW);
      put({ ...w.node, x: w.x, y: yy });
      last = yy;
    }
  };
  for (let d = 1; d <= maxDepth; d++) {
    const col = derived.filter((f) => depth.get(f.item.id) === d);
    placeColumn(
      col.map((f) => {
        const ps = (f.item.from ?? []).map((p) => pos.get(`f:${p}`)).filter((n): n is TNode => !!n);
        const yy = ps.length ? ps.reduce((s, n) => s + n.y, 0) / ps.length : TOP;
        return { id: f.item.id, y: yy, x: colX(d), node: { id: `f:${f.item.id}`, kind: "file", w: FILE_W, label: f.item.name, item: f.item, dir: f.dir } };
      }),
    );
  }
  edges.push(...made.filter((e) => pos.has(e.from) && pos.has(e.to)));

  // the outside world, in the last column
  const outX = colX(maxDepth + 1);
  placeColumn(
    outs
      .filter((o) => pos.has(`f:${o.fileId}`))
      .map((o) => ({ id: o.node.id, y: pos.get(`f:${o.fileId}`)!.y, x: outX, node: o.node })),
  );
  for (const o of outs) if (pos.has(`f:${o.fileId}`) && pos.has(o.node.id)) edges.push({ id: `e:${o.node.id}`, from: `f:${o.fileId}`, to: o.node.id, kind: o.kind });

  const columns = [
    { x: 0, w: SRC_W, title: "Came from" },
    { x: colX(0), w: FILE_W, title: "Your files" },
    ...Array.from({ length: maxDepth }, (_, i) => ({ x: colX(i + 1), w: FILE_W, title: i === 0 ? "Made from them" : "Then made into" })),
    ...(outs.length ? [{ x: outX, w: FILE_W, title: "Left this computer" }] : []),
  ];
  const height = Math.max(TOP + ROW, ...nodes.map((n) => n.y + ROW));
  const width = Math.max(...columns.map((c) => c.x + c.w));
  return { nodes, edges, width, height, columns };
}

/** Everything upstream and downstream of a node: its whole thread. */
export function threadOf(g: TGraph, id: string): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set([id]);
  const edges = new Set<string>();
  const walk = (dir: "up" | "down", at: string) => {
    for (const e of g.edges) {
      const [here, next] = dir === "up" ? [e.to, e.from] : [e.from, e.to];
      if (here !== at || edges.has(e.id)) continue;
      edges.add(e.id);
      nodes.add(next);
      walk(dir, next);
    }
  };
  walk("up", id);
  walk("down", id);
  return { nodes, edges };
}
