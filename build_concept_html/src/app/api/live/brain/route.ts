import { NextResponse } from "next/server";
import { brain, brainUp, liveGuard } from "@/lib/server/capd";

export const runtime = "nodejs";

// The shell's other conversations with brain-d: reporting the system's live
// state (on SIOS brain-d reads it from D-Bus), and managing watchers.
const ACTIONS: Record<string, string> = {
  state: "state.update",
  watch_list: "watch.list",
  watch_add: "watch.add",
  watch_remove: "watch.remove",
};

export async function POST(req: Request) {
  const refused = liveGuard(req);
  if (refused) return refused;
  const { action, ...params } = await req.json();
  const method = ACTIONS[String(action)];
  if (!method) return NextResponse.json({ error: "unknown action" }, { status: 400 });
  if (!(await brainUp())) return NextResponse.json({ ok: null, starting: true });
  try {
    return NextResponse.json({ ok: await brain(method, params) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
