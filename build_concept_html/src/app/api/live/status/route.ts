import { NextResponse } from "next/server";
import { daemonState } from "@/lib/server/daemon";
import { SANDBOX, asOwner, brainUp, capdUp, liveGuard } from "@/lib/server/capd";

export const runtime = "nodejs";

// Is the real machine reachable? Used by Settings and the Live sandbox view.
export async function GET(req: Request) {
  const refused = liveGuard(req);
  if (refused) return refused;
  const brainOk = await brainUp();
  if (!(await capdUp())) return NextResponse.json({ up: false, brain: brainOk, sandbox: SANDBOX, key: !!process.env.OPENAI_API_KEY, daemon: daemonState() });
  try {
    const s = await asOwner("status");
    const audit = await asOwner("audit", { n: 30 });
    return NextResponse.json({ up: brainOk, capd: true, brain: brainOk, sandbox: SANDBOX, key: !!process.env.OPENAI_API_KEY, paused: s.paused, audit, daemon: daemonState() });
  } catch (e) {
    return NextResponse.json({ up: false, sandbox: SANDBOX, key: !!process.env.OPENAI_API_KEY, error: e instanceof Error ? e.message : String(e) });
  }
}
