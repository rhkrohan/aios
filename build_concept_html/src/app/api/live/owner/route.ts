import { NextResponse } from "next/server";
import { asOwner, capdUp, liveGuard } from "@/lib/server/capd";

export const runtime = "nodejs";

// Things only the owner does on the live machine: their own file actions,
// test data, the outbox, pausing an AI. Each maps to exactly one capd method.
const ACTIONS: Record<string, string> = {
  do: "owner_do",
  undo: "owner_undo",
  packs: "packs",
  load_pack: "load_pack",
  create_file: "create_file",
  outbox: "outbox",
  pause: "pause",
  resume: "resume",
  audit: "audit",
  rules: "rules",
  rule_add: "rule_add",
  rule_remove: "rule_remove",
  memory_list: "memory.list",
  memory_add: "memory.add",
  memory_edit: "memory.edit",
  memory_delete: "memory.delete",
  memory_forget_about: "memory.forget_about",
  memory_unforget: "memory.unforget",
  memory_confirm: "memory.confirm",
  memory_dismiss: "memory.dismiss",
  memory_share: "memory.share",
  iam_get: "iam.get",
  iam_set_roles: "iam.set_roles",
  iam_save_role: "iam.save_role",
  iam_remove_role: "iam.remove_role",
  iam_pair: "iam.pair",
  iam_remove: "iam.remove",
  iam_whatif: "iam.whatif",
};

export async function POST(req: Request) {
  const refused = liveGuard(req);
  if (refused) return refused;
  const { action, ...params } = await req.json();
  const method = ACTIONS[String(action)];
  if (!method) return NextResponse.json({ error: "unknown action" }, { status: 400 });
  // while capd is starting, reads come back empty instead of failing
  if (!(await capdUp())) {
    if (["outbox", "audit", "packs", "rules", "memory_list", "iam_get"].includes(String(action))) return NextResponse.json({ ok: null, starting: true });
    return NextResponse.json({ error: "The live machine isn't running yet." }, { status: 503 });
  }
  try {
    return NextResponse.json({ ok: await asOwner(method, params) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
