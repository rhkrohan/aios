"use client";

// The demo's sound: the narrator (ElevenLabs, through /api/audio), short sound
// effects for what happens on screen, and a music bed per act that dips while
// the narrator talks. Everything is fetched once and kept as blob URLs.

import { liveFetch } from "./livemachine";
import { useOS } from "./store";
import { useTeam } from "./team";

const VOICE_KEY = "sios-demo-voice";
let voice: string | null = (() => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(VOICE_KEY);
  } catch {
    return null;
  }
})();

const voices = new Map<string, Promise<string | null>>();
const sounds = new Map<string, Promise<string | null>>();
let muted = false;
let paused = false;
const playing = new Set<HTMLAudioElement>();

const MUSIC_VOL = 0.2;
const DUCKED = 0.07;
let bed: HTMLAudioElement | null = null;
let talking = 0;

export const currentVoice = () => voice;
export function setVoice(id: string) {
  voice = id;
  try {
    localStorage.setItem(VOICE_KEY, id);
  } catch {
    /* private window */
  }
}

const blobUrl = (r: Response) => (r.ok && r.headers.get("content-type")?.includes("audio") ? r.blob().then((b) => URL.createObjectURL(b)) : null);

/** Fetch a clip, trying again once; a failure is never remembered, so the next play tries afresh. */
function load(map: Map<string, Promise<string | null>>, key: string, get: () => Promise<Response>): Promise<string | null> {
  const hit = map.get(key);
  if (hit) return hit;
  const attempt = () => get().then(blobUrl).catch(() => null);
  const p = attempt()
    .then((u) => u ?? new Promise<string | null>((ok) => setTimeout(() => ok(attempt()), 1200)))
    .then((u) => {
      if (!u) map.delete(key);
      return u;
    });
  map.set(key, p);
  return p;
}

function voiceUrl(text: string): Promise<string | null> {
  return load(voices, `${voice ?? "default"}|${text}`, () => liveFetch("/api/audio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, voice }) }));
}

function soundUrl(name: string): Promise<string | null> {
  return load(sounds, name, () => liveFetch(`/api/audio?sound=${encodeURIComponent(name)}`));
}

/** Fetch the lines and sounds ahead of time, a few at once. Resolves when all are in (or failed). */
export async function prepare(lines: string[], names: string[], onProgress?: (done: number, of: number) => void) {
  const jobs = [...names.map((n) => () => soundUrl(n)), ...lines.map((l) => () => voiceUrl(l))];
  let done = 0;
  const run = async () => {
    while (jobs.length) {
      await jobs.shift()!();
      onProgress?.(++done, done + jobs.length);
    }
  };
  await Promise.all([run(), run()]);
}

/** QA: with ?debug, every clip that starts (or fails to) is logged on window.__audioLog. */
function logPlay(kind: string, name: string, p: Promise<void>) {
  if (typeof window === "undefined" || !window.location.search.includes("debug")) return;
  const w = window as unknown as { __audioLog?: string[] };
  w.__audioLog ??= [];
  p.then(
    () => w.__audioLog!.push(`${kind}:${name}`),
    (e) => w.__audioLog!.push(`FAIL ${kind}:${name} ${String(e).slice(0, 60)}`),
  );
}

function track(a: HTMLAudioElement) {
  playing.add(a);
  a.addEventListener("ended", () => playing.delete(a));
}

/** Speak a line. Resolves when it has been said; false if there's no voice (no key, offline). */
export async function speak(text: string): Promise<boolean> {
  if (muted || !text) return false;
  const url = await voiceUrl(text);
  if (!url) return false;
  const a = new Audio(url);
  a.volume = 1;
  track(a);
  talking++;
  duck();
  try {
    if (paused) await new Promise<void>((r) => setTimeout(r, 0));
    const started = a.play();
    logPlay("voice", text.slice(0, 24), started);
    await started;
    await new Promise<void>((resolve) => {
      a.addEventListener("ended", () => resolve());
      a.addEventListener("error", () => resolve());
    });
    return true;
  } catch {
    return false;
  } finally {
    talking--;
    duck();
    playing.delete(a);
  }
}

/** A one-shot sound effect. */
export async function sfx(name: string, volume = 0.55) {
  if (muted || paused) return;
  const url = await soundUrl(name);
  if (!url) return;
  const a = new Audio(url);
  a.volume = volume;
  track(a);
  const started = a.play();
  logPlay("sfx", name, started);
  void started.catch(() => {});
}

function fade(a: HTMLAudioElement, to: number, ms: number, then?: () => void) {
  const from = a.volume;
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) requestAnimationFrame(step);
    else then?.();
  };
  requestAnimationFrame(step);
}

function duck() {
  if (bed) fade(bed, talking > 0 ? DUCKED : MUSIC_VOL, 400);
}

/** Crossfade to an act's music bed (null for silence). */
export async function music(name: string | null) {
  const old = bed;
  bed = null;
  if (old) fade(old, 0, 1200, () => old.pause());
  if (!name || muted) return;
  const url = await soundUrl(name);
  if (!url || bed) return;
  const a = new Audio(url);
  a.loop = true;
  a.volume = 0;
  bed = a;
  if (!paused) {
    const started = a.play();
    logPlay("music", name, started);
    void started.catch(() => {});
  }
  fade(a, talking > 0 ? DUCKED : MUSIC_VOL, 1500);
}

export function setPaused(p: boolean) {
  paused = p;
  for (const a of [...playing, ...(bed ? [bed] : [])]) {
    if (p) a.pause();
    else void a.play().catch(() => {});
  }
}

export function setMuted(m: boolean) {
  muted = m;
  if (m) stopAll();
}

export function stopAll() {
  for (const a of playing) a.pause();
  playing.clear();
  if (bed) bed.pause();
  bed = null;
  talking = 0;
}

/** Sounds for what happens on screen while the demo runs. Returns a function that stops listening. */
export function listen(): () => void {
  let prev = useOS.getState();
  const unOS = useOS.subscribe((s) => {
    const p = prev;
    prev = s;
    if (s.windows.length > p.windows.length) void sfx("whoosh", 0.35);
    if (s.approval && !p.approval) void sfx("ask", 0.6);
    if (s.mail.length > p.mail.length) void sfx("send", 0.55);
    if (s.todos.length > p.todos.length) void sfx("drop", 0.45);
    const blocked = (x: typeof s) => x.runs.reduce((n, r) => n + r.steps.filter((st) => st.status === "blocked").length, 0);
    if (blocked(s) > blocked(p)) void sfx("block", 0.6);
    const done = (x: typeof s) => x.runs.filter((r) => !r.parentId && r.status === "done").length;
    if (done(s) > done(p)) void sfx("done", 0.5);
    if (s.fs !== p.fs) {
      const made = (x: typeof s) => Object.entries(x.fs).reduce((n, [, items]) => n + items.filter((i) => i.touchedBy && i.kind !== "folder").length, 0);
      if (made(s) > made(p)) void sfx("drop", 0.4);
    }
  });
  let helpers = useTeam.getState().helpers.length;
  const unTeam = useTeam.subscribe((t) => {
    if (t.helpers.length > helpers) void sfx("pet", 0.6);
    helpers = t.helpers.length;
  });
  return () => {
    unOS();
    unTeam();
  };
}
