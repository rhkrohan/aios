import { NextResponse } from "next/server";
import { brainUp, capdUp, liveGuard } from "@/lib/server/capd";
import { CASE_LIST, runStress, stressJob } from "@/lib/server/stress";

export const runtime = "nodejs";

// The confusion test: start it, and follow its results.
export async function POST(req: Request) {
  const refused = liveGuard(req);
  if (refused) return refused;
  if (!(await capdUp()) || !(await brainUp())) return NextResponse.json({ error: "Start the live machine first." }, { status: 503 });
  const { only } = await req.json().catch(() => ({}));
  void runStress(Array.isArray(only) ? only : undefined);
  return NextResponse.json({ started: true });
}

export async function GET(req: Request) {
  const refused = liveGuard(req);
  if (refused) return refused;
  return NextResponse.json({ cases: CASE_LIST, ...stressJob() });
}
