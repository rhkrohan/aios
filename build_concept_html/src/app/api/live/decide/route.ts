import { NextResponse } from "next/server";
import { asOwner, liveGuard } from "@/lib/server/capd";

export const runtime = "nodejs";

// Your decisions go straight from the approval sheet to capd, as the owner.
// brain-d is never in this path (on SIOS: the trusted approval agent, like polkit).
export async function POST(req: Request) {
  const refused = liveGuard(req);
  if (refused) return refused;
  const { kind, id, yes } = await req.json();
  if (typeof id !== "string" || !/^[0-9a-f]+$/.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  try {
    if (kind === "pass") return NextResponse.json(await asOwner(yes === true ? "grant" : "revoke", { id }));
    if (kind === "call") return NextResponse.json(await asOwner(yes === true ? "approve" : "deny", { id }));
    return NextResponse.json({ error: "kind must be pass or call" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
