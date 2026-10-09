import { NextResponse } from "next/server";
import { brain, liveGuard } from "@/lib/server/capd";

export const runtime = "nodejs";

// Goals brain-d is working on, including ones outside AIs started over MCP.
export async function GET(req: Request) {
  const refused = liveGuard(req);
  if (refused) return refused;
  try {
    return NextResponse.json({ goals: await brain("goals.recent") });
  } catch {
    return NextResponse.json({ goals: [] });
  }
}
