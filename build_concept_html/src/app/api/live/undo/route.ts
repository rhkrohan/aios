import { NextResponse } from "next/server";
import { asOwner, liveGuard } from "@/lib/server/capd";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const refused = liveGuard(req);
  if (refused) return refused;
  const { goal } = await req.json();
  if (typeof goal !== "string" || !/^[0-9a-f]+$/.test(goal)) return NextResponse.json({ error: "bad goal" }, { status: 400 });
  try {
    return NextResponse.json(await asOwner("undo", { goal }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
