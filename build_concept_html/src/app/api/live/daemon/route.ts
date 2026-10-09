import { NextResponse } from "next/server";
import { liveGuard } from "@/lib/server/capd";
import { daemonState, startDaemon, stopDaemon } from "@/lib/server/daemon";

export const runtime = "nodejs";

// Start or stop capd from the SIOS page.
export async function POST(req: Request) {
  const refused = liveGuard(req);
  if (refused) return refused;
  const { action } = await req.json();
  if (action === "start") void startDaemon();
  else if (action === "stop") await stopDaemon();
  else return NextResponse.json({ error: "action must be start or stop" }, { status: 400 });
  return NextResponse.json(daemonState());
}
