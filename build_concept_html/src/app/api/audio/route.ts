import { NextResponse } from "next/server";
import { liveGuard } from "@/lib/server/capd";
import { DEFAULT_VOICE, SOUNDS, narratorVoices, sound, speak } from "@/lib/server/eleven";

export const runtime = "nodejs";

// The demo's audio, made by ElevenLabs on this server (the key never reaches
// the page). GET ?voices lists narrator voices; GET ?sound=name returns one of
// the fixed sounds; POST { text, voice } speaks a line. All cached on disk.

const mp3 = (b: Buffer) => new NextResponse(new Uint8Array(b), { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400" } });
const fail = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });

export async function GET(req: Request) {
  const refused = liveGuard(req);
  if (refused) return refused;
  const q = new URL(req.url).searchParams;
  if (q.has("voices")) return NextResponse.json({ voices: await narratorVoices().catch(() => []), default: DEFAULT_VOICE, sounds: Object.keys(SOUNDS) });
  const name = q.get("sound") ?? "";
  if (!SOUNDS[name]) return NextResponse.json({ error: "no such sound" }, { status: 404 });
  return sound(name).then(mp3, fail);
}

export async function POST(req: Request) {
  const refused = liveGuard(req);
  if (refused) return refused;
  const { text, voice } = await req.json().catch(() => ({}));
  if (typeof text !== "string" || !text.trim() || text.length > 400) return NextResponse.json({ error: "a line of up to 400 characters" }, { status: 400 });
  const v = typeof voice === "string" && /^[A-Za-z0-9]{10,40}$/.test(voice) ? voice : DEFAULT_VOICE;
  return speak(text.trim(), v).then(mp3, fail);
}
