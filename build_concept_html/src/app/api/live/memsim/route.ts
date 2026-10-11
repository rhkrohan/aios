import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { STATE_DIR, brainUp, liveGuard } from "@/lib/server/capd";

export const runtime = "nodejs";

// Memory over time: runs `capd memsim`, months of made-up life through the real
// memory store on its own throwaway store (never your memory). With "ai", the
// model behind brain-d spots patterns and answers the weekly checks.
const AIOS = process.env.AIOS_DIR || join(process.cwd(), "..");
const BIN = join(AIOS, "capd", "target", "release", "capd");
const OUT = join(STATE_DIR, "memsim");

const g = globalThis as unknown as { __memsim?: { running: boolean; progress: number; of: number; error: string | null } };
const job = (g.__memsim ??= { running: false, progress: 0, of: 0, error: null });

export async function POST(req: Request) {
  const refused = liveGuard(req);
  if (refused) return refused;
  if (job.running) return NextResponse.json({ error: "A simulation is already running." }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  const days = Math.min(730, Math.max(7, Number(body.days) || 180));
  const seed = Math.max(1, Math.floor(Number(body.seed) || 7));
  const ai = body.ai === true;
  if (ai && !(await brainUp())) return NextResponse.json({ error: "Start the live machine first: GPT is reached through brain-d." }, { status: 503 });
  if (!existsSync(BIN)) return NextResponse.json({ error: "capd isn't built yet." }, { status: 503 });

  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const k of ["HOME", "PATH", "USER", "TMPDIR", "SIOS_STATE", "SIOS_ROOT"]) if (process.env[k]) env[k] = process.env[k]!;
  Object.assign(job, { running: true, progress: 0, of: days, error: null });
  const child = spawn(BIN, ["memsim", "--days", String(days), "--seed", String(seed), "--out", OUT, ...(ai ? ["--ai"] : [])], { env });
  let err = "";
  child.stdout.on("data", (b: Buffer) => {
    for (const line of b.toString().split("\n")) {
      try {
        const p = JSON.parse(line);
        if (typeof p.progress === "number") job.progress = p.progress;
      } catch {}
    }
  });
  child.stderr.on("data", (b: Buffer) => (err += b.toString()));
  child.on("close", (code) => Object.assign(job, { running: false, error: code === 0 ? null : err.trim().slice(0, 300) || `capd memsim exited with ${code}` }));
  return NextResponse.json({ started: true });
}

export async function GET(req: Request) {
  const refused = liveGuard(req);
  if (refused) return refused;
  const file = join(OUT, "run.json");
  const report = !job.running && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  return NextResponse.json({ ...job, report });
}
