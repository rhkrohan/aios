// ElevenLabs for the demo: the narrator's voice, sound effects and music beds.
// The key stays on the server. Every clip is made once and kept on disk
// (.cache/audio in this project, git-ignored), so replaying the demo costs nothing. Only fixed sounds
// from SOUNDS can be generated, so the page can't spend credits on anything else.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const API = "https://api.elevenlabs.io";
const DIR = join(process.cwd(), ".cache", "audio");

/** The key from .env.local first (it's the one you edit), then the environment. */
export function elevenKey(): string | null {
  try {
    const line = readFileSync(join(process.cwd(), ".env.local"), "utf8")
      .split("\n")
      .find((l) => l.startsWith("ELEVENLABS_API_KEY="));
    const v = line?.slice("ELEVENLABS_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
    if (v) return v;
  } catch {
    /* no .env.local */
  }
  return process.env.ELEVENLABS_API_KEY || null;
}

function cached(name: string, make: () => Promise<Buffer>): Promise<Buffer> {
  mkdirSync(DIR, { recursive: true });
  const file = join(DIR, name);
  if (existsSync(file)) return Promise.resolve(readFileSync(file));
  return make().then((b) => {
    writeFileSync(file, b);
    return b;
  });
}

// The free plan allows two requests at a time: queue the rest, and retry when told to slow down.
let inFlight = 0;
const waiting: (() => void)[] = [];
async function slot<T>(f: () => Promise<T>): Promise<T> {
  if (inFlight >= 2) await new Promise<void>((r) => waiting.push(r));
  inFlight++;
  try {
    return await f();
  } finally {
    inFlight--;
    waiting.shift()?.();
  }
}

async function post(path: string, body: unknown): Promise<Buffer> {
  const key = elevenKey();
  if (!key) throw new Error("no ElevenLabs key in .env.local");
  for (let attempt = 0; ; attempt++) {
    const r = await slot(() => fetch(API + path, { method: "POST", headers: { "xi-api-key": key, "content-type": "application/json" }, body: JSON.stringify(body) }));
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (r.status === 429 && attempt < 5) {
      await new Promise((ok) => setTimeout(ok, 800 * (attempt + 1)));
      continue;
    }
    throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------- voices

export interface DemoVoice {
  id: string;
  name: string;
  about: string;
  preview?: string;
}

/** Voices that suit a calm, friendly narrator: English, conversational or storytelling, not characters or hype. */
export async function narratorVoices(): Promise<DemoVoice[]> {
  const key = elevenKey();
  if (!key) return [];
  const r = await fetch(`${API}/v1/voices`, { headers: { "xi-api-key": key } });
  if (!r.ok) return [];
  const d = (await r.json()) as { voices: { voice_id: string; name: string; category: string; preview_url?: string; labels?: Record<string, string> }[] };
  const good = ["conversational", "narrative_story", "informative_educational", "entertainment_tv", "advertisement"];
  return d.voices
    .filter((v) => (v.labels?.language ?? "en") === "en" && good.includes(v.labels?.use_case ?? "") && !/(toy|kawaii|sassy|warrior|trickster|hyped)/i.test(v.name + (v.labels?.descriptive ?? "")))
    .map((v) => {
      const [name, ...rest] = v.name.split(" - ");
      return { id: v.voice_id, name: name.trim(), about: [rest.join(" - "), v.labels?.accent].filter(Boolean).join(", "), preview: v.preview_url };
    });
}

/** Sarah first: mature and reassuring, right for everyday people. */
export const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL";

export function speak(text: string, voice: string): Promise<Buffer> {
  const model = "eleven_multilingual_v2";
  const id = createHash("sha256").update(`${voice}|${model}|${text}`).digest("hex").slice(0, 24);
  return cached(`voice-${id}.mp3`, () =>
    post(`/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
      text,
      model_id: model,
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
    }),
  );
}

// ---------------------------------------------------------------- sounds and music

/** Every sound the demo uses. Music beds are seamless loops; the rest are one-shots. */
export const SOUNDS: Record<string, { prompt: string; seconds: number; loop?: boolean }> = {
  // one-shots
  click: { prompt: "a single soft, muted UI click, like a quiet trackpad tap, clean, very short", seconds: 0.5 },
  type: { prompt: "light quick typing on a quiet laptop keyboard, a short burst of soft keystrokes, clean, no room noise", seconds: 2 },
  whoosh: { prompt: "a soft airy whoosh of a window sliding open on a computer, gentle, modern UI", seconds: 0.8 },
  ask: { prompt: "a gentle two-note notification ping asking for attention, warm, glassy, friendly, modern UI", seconds: 1 },
  done: { prompt: "a soft bright success chime, two rising warm notes, clean and minimal, modern UI", seconds: 1.2 },
  block: { prompt: "a low muted denied sound, a soft wooden thunk with a short descending tone, firm but not harsh, UI alert", seconds: 1 },
  send: { prompt: "a quick paper-plane swoosh, an email being sent, light and airy, modern UI", seconds: 1 },
  drop: { prompt: "a soft papery pop of a file landing in a folder, short and satisfying, UI", seconds: 0.6 },
  pet: { prompt: "a tiny cute happy chirp of a small friendly robot, two quick playful notes", seconds: 0.8 },
  card: { prompt: "a soft cinematic shimmer swell, airy chimes rising then fading, transition between scenes", seconds: 2.2 },
  plane: { prompt: "an airport terminal announcement chime, three soft descending bell tones, ding dong ding, clean, no voice", seconds: 2 },
  paper: { prompt: "pages of a paper document being flipped and slid across a desk, soft rustle, close and clean", seconds: 1.5 },
  shuffle: { prompt: "a stack of paper receipts being shuffled and tapped neatly into a pile on a desk, satisfying, clean", seconds: 2 },
  total: { prompt: "a soft pleasant cash register ding with a gentle coin sparkle, modern and minimal, not loud", seconds: 1.2 },
  stamp: { prompt: "a firm satisfying rubber stamp thump on paper, approved, short and clean", seconds: 0.8 },
  finale: { prompt: "a warm uplifting short musical flourish, soft piano and strings resolving to a major chord, gentle ending", seconds: 4 },
  // music beds, one per act
  "bed-monday": { prompt: "calm warm lo-fi morning piano and soft pad, slow, peaceful start of the day, instrumental, seamless loop", seconds: 18, loop: true },
  "bed-trip": { prompt: "light bright travel music, soft plucked guitar and gentle percussion, hopeful and moving, instrumental, seamless loop", seconds: 18, loop: true },
  "bed-lease": { prompt: "thoughtful calm music, soft felt piano and warm bass, curious and careful mood, instrumental, seamless loop", seconds: 18, loop: true },
  "bed-job": { prompt: "hopeful modern ambient electronic music, soft synth arpeggio and light beat, focused and optimistic, instrumental, seamless loop", seconds: 18, loop: true },
  "bed-taxes": { prompt: "steady focused minimal music, soft marimba and light clock-like rhythm, organized and calm, instrumental, seamless loop", seconds: 18, loop: true },
};

export function sound(name: string): Promise<Buffer> {
  const s = SOUNDS[name];
  if (!s) return Promise.reject(new Error("no such sound"));
  return cached(`sfx-${name}.mp3`, () => post("/v1/sound-generation", { text: s.prompt, duration_seconds: s.seconds, prompt_influence: 0.55, ...(s.loop ? { loop: true } : {}) }));
}
