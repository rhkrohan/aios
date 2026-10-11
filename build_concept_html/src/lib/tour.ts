"use client";

// Auto mode: a person uses the system while you watch. A visible cursor types
// requests and clicks real buttons; the real engine and broker do the work.
// No text to read: a tiny chapter tag and the live X-ray panel show what's
// happening inside.

import { create } from "zustand";
import { music, setMuted, setPaused, sfx, speak, stopAll } from "./demoAudio";
import { playEveryday } from "./everydayTour";
import { resetMachine, useOS } from "./store";

export type TourKind = "everyday" | "how-it-works";
export const CHAPTERS = ["Ask", "Broker", "Undo", "Hidden trap", "Other AIs", "On record", "One big goal", "The machine"];
export const EVERYDAY_CHAPTERS = ["Monday", "A trip", "The lease", "A job", "Taxes", "Your week"];
export const chaptersFor = (k: TourKind) => (k === "everyday" ? EVERYDAY_CHAPTERS : CHAPTERS);

interface TourState {
  active: boolean;
  /** everyday: four real chores, captions and a voice. how-it-works: the architecture tour. */
  kind: TourKind;
  paused: boolean;
  finished: boolean;
  chapter: number;
  cursor: { x: number; y: number; visible: boolean };
  clicks: number;
  /** The line on screen (and spoken, when sound is on). */
  caption: string;
  sound: boolean;
  /** The inside view (brain, broker, tunnel). Open by default only in the technical tour. */
  xray: boolean;
  /** Getting the voice and sounds ready before the first act. */
  preparing: { done: number; of: number } | null;
  startedAt: number;
  start: (kind?: TourKind) => void;
  stop: () => void;
  togglePause: () => void;
  set: (p: Partial<Pick<TourState, "sound" | "xray">>) => void;
}

let runToken = 0;

export const useTour = create<TourState>((set, get) => ({
  active: false,
  paused: false,
  finished: false,
  chapter: 0,
  kind: "everyday",
  cursor: { x: 0, y: 0, visible: false },
  clicks: 0,
  caption: "",
  sound: true,
  xray: false,
  preparing: null,
  startedAt: 0,
  start: (kind = get().kind) => {
    runToken++;
    hush();
    const x = typeof window !== "undefined" ? window.innerWidth / 2 : 0;
    const y = typeof window !== "undefined" ? window.innerHeight / 2 : 0;
    set({ active: true, kind, paused: false, finished: false, chapter: 0, caption: "", preparing: null, xray: kind === "how-it-works", startedAt: Date.now(), cursor: { x, y, visible: true } });
    if (kind === "everyday") void playEveryday(runToken, KIT).catch((e) => !(e instanceof Cancelled) && console.error(e));
    else void play(runToken);
  },
  stop: () => {
    runToken++;
    hush();
    set({ active: false, paused: false, finished: false, caption: "", preparing: null, cursor: { ...get().cursor, visible: false } });
  },
  togglePause: () => {
    const paused = !get().paused;
    setPaused(paused);
    set({ paused });
  },
  set: (p) => {
    if (p.sound !== undefined) setMuted(!p.sound);
    set(p);
  },
}));

// ---------------------------------------------------------------- voice and sound (lib/demoAudio.ts)

function hush() {
  stopAll();
}

/** Show a caption and have the narrator say it (or what's given to say). Waits until it's been said, or read. */
async function say(token: number, caption: string, voice = caption) {
  guard(token);
  useTour.setState({ caption });
  const reading = Math.max(1800, voice.split(/\s+/).length * 340);
  const spoke = tour().sound && voice ? await speak(voice) : false;
  guard(token);
  if (spoke) await wait(token, 250);
  else await wait(token, reading);
}

/** Show a caption and start saying it, without waiting: the action carries on underneath. */
function caption(token: number, text: string) {
  void say(token, text).catch(() => {});
}

/** A new act: a shimmer, and its own music fading in. */
async function scene(token: number, bed: string | null, ms = 1400) {
  guard(token);
  if (tour().sound) {
    void sfx("card", 0.45);
    void music(bed);
  }
  await wait(token, ms);
}

// ---------------------------------------------------------------- helpers

class Cancelled extends Error {}
const os = () => useOS.getState();
const tour = () => useTour.getState();

function guard(token: number) {
  if (token !== runToken) throw new Cancelled();
}

async function wait(token: number, ms: number) {
  let left = ms;
  while (left > 0) {
    guard(token);
    await new Promise((r) => setTimeout(r, 50));
    if (!tour().paused) left -= 50;
  }
}

async function until(token: number, cond: () => boolean, timeout = 30000) {
  let t = 0;
  while (!cond()) {
    guard(token);
    await new Promise((r) => setTimeout(r, 100));
    if (!tour().paused) t += 100;
    if (t > timeout) return false;
  }
  return true;
}

type Target = string | (() => Element | null | undefined);

function resolve(t: Target): Element | null {
  if (typeof t === "function") return t() ?? null;
  return document.querySelector(t);
}

/** A button with this exact text, optionally inside a container. */
const btn = (text: string, within?: string) => () => {
  const root = within ? document.querySelector(within) : document;
  return Array.from(root?.querySelectorAll("button") ?? []).find((b) => b.textContent?.trim() === text) ?? null;
};

/** Glide the cursor to an element, sending real mousemove events along the way (so the dock magnifies). */
async function moveTo(token: number, target: Target, ms = 650) {
  let el = resolve(target);
  let t = 0;
  while (!el && t < 6000) {
    await wait(token, 100);
    t += 100;
    el = resolve(target);
  }
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const from = tour().cursor;
  const to = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  const steps = Math.max(8, Math.round(ms / 25));
  for (let i = 1; i <= steps; i++) {
    guard(token);
    const k = i / steps;
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // ease in-out
    const x = from.x + (to.x - from.x) * e;
    const y = from.y + (to.y - from.y) * e;
    useTour.setState({ cursor: { x, y, visible: true } });
    document.elementFromPoint(x, y)?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: x, clientY: y }));
    await wait(token, ms / steps);
  }
  return el;
}

async function click(token: number, target: Target, ms?: number) {
  const el = await moveTo(token, target, ms);
  if (!el) return;
  await wait(token, 180);
  useTour.setState({ clicks: tour().clicks + 1 });
  if (tour().sound) void sfx("click", 0.4);
  (el as HTMLElement).click();
  await wait(token, 250);
}

/** Type into the ask box like a person, then press Enter. */
async function type(token: number, text: string) {
  await until(token, () => !!document.querySelector('input[aria-label="Request"]'), 5000);
  const input = document.querySelector('input[aria-label="Request"]') as HTMLInputElement | null;
  if (!input) return;
  await moveTo(token, () => input, 400);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  if (tour().sound) void sfx("type", 0.35);
  for (let i = 1; i <= text.length; i++) {
    guard(token);
    setter.call(input, text.slice(0, i));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(token, 38);
  }
  await wait(token, 350);
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}

async function ask(token: number, text: string) {
  if (!os().commandOpen) await click(token, '[aria-label="Ask SIOS"][aria-expanded]');
  os().setFocusedRun(null);
  await wait(token, 350);
  await type(token, text);
}

async function approve(token: number, label: string) {
  await until(token, () => !!os().approval);
  await wait(token, 1500); // let the X-ray show the broker's checks
  const dlg = '[role="alertdialog"]';
  if (["Once", "1 hour", "Session"].includes(label)) {
    if (label !== "Once") await click(token, btn(label, dlg));
    await click(token, btn("Allow", dlg));
  } else await click(token, btn(label, dlg));
}

const lastRun = () => os().runs.find((r) => !r.parentId);
const ended = () => {
  const r = lastRun();
  return !!r && ["done", "stopped", "failed"].includes(r.status);
};

const chapter = (n: number) => useTour.setState({ chapter: n });
const closePanel = () => os().setCommandOpen(false);

/** What the other tours are made of (lib/everydayTour.ts). */
const finish = () => useTour.setState({ finished: true, caption: "", cursor: { ...tour().cursor, visible: false } });
export const KIT = { wait, until, moveTo, click, type, ask, approve, btn, ended, lastRun, chapter, closePanel, say, caption, scene, guard, finish, store: useTour };
export type TourKit = typeof KIT;

// ---------------------------------------------------------------- the choreography

async function play(token: number) {
  try {
    resetMachine();
    os().updateSettings({ showDetails: false });
    await wait(token, 700);

    // Ask: sweep the bar, then ask
    chapter(0);
    await moveTo(token, '[aria-label="Files"]', 700);
    await moveTo(token, '[aria-label="Settings"]', 1300);
    await ask(token, "Clean up my Downloads");

    // Broker: it stops and asks; approve
    await until(token, () => !!os().approval);
    chapter(1);
    await approve(token, "Session");
    await until(token, ended);
    await wait(token, 1400);

    // Undo: watch the folders appear, then undo from the Files window
    chapter(2);
    closePanel();
    await wait(token, 1200);
    await click(token, btn("Undo", '[aria-label="Files"][role="dialog"]'));
    await wait(token, 1600);

    // Hidden trap: the page tries to sneak in an order
    chapter(3);
    useOS.setState({ windows: [] });
    await ask(token, "Summarize this article and send it to Sara");
    await until(token, () => os().windows.some((w) => w.app === "browser"));
    await wait(token, 600);
    closePanel();
    await moveTo(token, () => Array.from(document.querySelectorAll('[aria-label="Browser"] span')).find((s) => s.textContent?.startsWith("Hidden text")), 800);
    await wait(token, 1800);
    await approve(token, "Send email");
    await until(token, ended);
    await wait(token, 1200);

    // Other AIs: Claude Desktop asks, then gets paused and blocked
    chapter(4);
    closePanel();
    useOS.setState({ windows: [] });
    await click(token, '[aria-label="SIOS menu"]');
    await click(token, btn("Security Center"));
    await wait(token, 500);
    await click(token, btn("Who can act", '[aria-label="Security Center"]'));
    await wait(token, 500);
    await click(token, btn("Test a request", '[aria-label="Security Center"]'));
    await approve(token, "Once");
    await until(token, ended);
    await wait(token, 900);
    closePanel();
    const claudeRow = () => Array.from(document.querySelectorAll('[aria-label="Security Center"] li')).find((li) => li.textContent?.includes("Claude Desktop"));
    const rowBtn = (text: string) => () => Array.from(claudeRow()?.querySelectorAll("button") ?? []).find((b) => b.textContent?.trim() === text);
    await click(token, rowBtn("Pause"));
    await wait(token, 500);
    await click(token, btn("Test a request", '[aria-label="Security Center"]'));
    await until(token, ended);
    await wait(token, 2200);
    closePanel();
    await click(token, rowBtn("Resume"));

    // On record: verify, tamper, verify, restore
    chapter(5);
    await click(token, btn("Decisions", '[aria-label="Security Center"]'));
    await wait(token, 500);
    await click(token, btn("Verify log"));
    await wait(token, 1300);
    await click(token, btn("Try tampering"));
    await wait(token, 600);
    await click(token, btn("Verify log"));
    await wait(token, 1800);
    await click(token, btn("Restore"));
    await wait(token, 600);

    // One big goal: several agents, a lock, a trap, an overreach, data that remembers where it came from
    chapter(6);
    useOS.setState({ windows: [] });
    await ask(token, "Prepare the Q3 board packet and send it to the team");
    await approve(token, "1 hour");
    closePanel();
    await approve(token, "Use online AI");
    closePanel();
    await approve(token, "Send packet");
    await until(token, ended);
    await wait(token, 900);
    closePanel();
    // follow the packet's thread: where every piece of it came from, and where it went
    os().openApp("files", { path: "view:threads" });
    await wait(token, 1200);
    await click(token, '[role="button"][aria-label="Q3 board packet.md"]');
    await wait(token, 3200);

    // The machine: watch a request travel, then the simulation
    chapter(7);
    useOS.setState({ windows: [] });
    await click(token, btn("Apps"));
    await click(token, btn("System Map"));
    await wait(token, 600);
    await ask(token, "Open my project folder");
    await approve(token, "Once");
    await until(token, ended);
    closePanel();
    const map = os().windows.find((w) => w.app === "systemmap");
    if (map) os().focusWindow(map.id);
    await wait(token, 900);
    await click(token, () => Array.from(document.querySelectorAll('[aria-label="System Map"] button')).find((b) => b.textContent?.trim() === "Simulate"));
    await wait(token, 900);
    // nudge a slider down and back up, so the comparison visibly reacts
    const s = document.querySelectorAll('[aria-label="System Map"] input[type="range"]')[1] as HTMLInputElement | undefined;
    if (s) {
      await moveTo(token, () => s, 600);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      const start = Number(s.value);
      const step = Number(s.step) || 1;
      for (const d of [-2, -4, -6, -4, -2, 0]) {
        setter.call(s, String(start + d * step));
        s.dispatchEvent(new Event("input", { bubbles: true }));
        await wait(token, 450);
      }
    }
    await wait(token, 1500);

    useTour.setState({ finished: true, cursor: { ...tour().cursor, visible: false } });
  } catch (e) {
    if (!(e instanceof Cancelled)) throw e;
  }
}

// QA hook: ?debug exposes the tour too.
if (typeof window !== "undefined" && window.location.search.includes("debug")) (window as unknown as { __tour: typeof useTour }).__tour = useTour;
