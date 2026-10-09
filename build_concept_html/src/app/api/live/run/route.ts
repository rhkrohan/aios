import { NextResponse } from "next/server";
import { brain, brainUp, capdUp, liveGuard } from "@/lib/server/capd";

export const runtime = "nodejs";

// Hand a request to brain-d.
export async function POST(req: Request) {
  const refused = liveGuard(req);
  if (refused) return refused;
  if (!(await capdUp()) || !(await brainUp())) return NextResponse.json({ error: "capd_down" }, { status: 503 });
  const { request, thread } = await req.json();
  if (typeof request !== "string" || !request.trim()) return NextResponse.json({ error: "empty" }, { status: 400 });
  try {
    const r = await brain("goal.start", { request: request.trim().slice(0, 2000), thread: typeof thread === "string" ? thread : undefined });
    return NextResponse.json({ job: r.goal, thread: r.thread });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** A goal's events since `since`, so the page can follow along. */
export async function GET(req: Request) {
  const refused = liveGuard(req);
  if (refused) return refused;
  const u = new URL(req.url);
  try {
    const r = await brain("goal.events", { goal: u.searchParams.get("job") ?? "", since: Number(u.searchParams.get("since") ?? 0) });
    return NextResponse.json({ events: r.events, next: r.next, over: r.over });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 404 });
  }
}
