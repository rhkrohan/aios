import { NextResponse } from "next/server";
import { fromThisPage, sessionCookie } from "@/lib/server/capd";

export const runtime = "nodejs";

// Hands the SIOS page its live-machine session cookie. Only a same-origin,
// local request gets one; the cookie is HttpOnly, so page scripts never see it.
export async function GET(req: Request) {
  if (!fromThisPage(req) || req.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true }, { headers: { "set-cookie": sessionCookie() } });
}
