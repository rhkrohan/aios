import { NextResponse } from "next/server";
import { lstatSync, readFileSync, readdirSync, statSync } from "node:fs";

const TEXT = /\.(md|txt|csv|json|log)$/i;
import { join } from "node:path";
import { SANDBOX, STATE_DIR, liveGuard } from "@/lib/server/capd";

export const runtime = "nodejs";

interface Meta {
  labels?: string[];
  untrusted?: boolean;
  origin?: string;
  from?: string[];
}

// The real sandbox, read-only, with capd's labels and lineage. For the Live sandbox view.
export async function GET(req: Request) {
  const refused = liveGuard(req);
  if (refused) return refused;
  let meta: { files?: Record<string, Meta>; blocked?: string[] } = {};
  try {
    meta = JSON.parse(readFileSync(join(STATE_DIR, "meta.json"), "utf8"));
  } catch {
    /* no labels yet */
  }
  const files = meta.files ?? {};
  const inherited = (rel: string) => {
    const labels = new Set<string>();
    let untrusted = false;
    for (const [p, m] of Object.entries(files)) {
      if (rel === p || rel.startsWith(p + "/")) {
        (m.labels ?? []).forEach((l) => labels.add(l));
        untrusted ||= !!m.untrusted;
      }
    }
    return { labels: [...labels], untrusted };
  };
  const walk = (rel: string): unknown[] => {
    const dir = join(SANDBOX, rel);
    return readdirSync(dir)
      // skip hidden files and links (a link could loop, or point outside the sandbox)
      .filter((n) => (!n.startsWith(".") || (rel === "" && n === ".Trash")) && !lstatSync(join(dir, n)).isSymbolicLink())
      .sort()
      .map((name) => {
        const r = rel ? `${rel}/${name}` : name;
        const st = statSync(join(dir, name));
        const m = files[r] ?? {};
        const base = { name, path: r, trashedFrom: (files[r] as { trashed_from?: string } | undefined)?.trashed_from, ...inherited(r), origin: m.origin, from: m.from ?? [], modified: st.mtimeMs, blocked: (meta.blocked ?? []).some((b) => r === b || r.startsWith(b + "/")) };
        if (st.isDirectory()) return { ...base, kind: "folder", children: walk(r) };
        // small text files come with their contents, for Quick Look
        const text = TEXT.test(name) && st.size <= 32_768 ? readFileSync(join(dir, name), "utf8") : undefined;
        return { ...base, kind: "file", size: st.size, text };
      });
  };
  try {
    return NextResponse.json({ root: SANDBOX, tree: walk("") });
  } catch {
    return NextResponse.json({ root: SANDBOX, tree: [], missing: true });
  }
}
