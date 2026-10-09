"use client";

// The pet team's state on screen: helpers as brain-d reports them, plus which
// reports have been shown, so each finished run is announced once.

import { create } from "zustand";

export interface HelperRun {
  goal: string;
  at: number;
  text: string;
  failed: boolean;
}
export interface Helper {
  id: string;
  name: string;
  color: string;
  kind: "watch" | "every" | "once";
  folder: string;
  every_min: number;
  request: string;
  active: boolean;
  created: number;
  last_run: number;
  runs: HelperRun[];
  hidden: boolean;
  brain: string;
}

/** The AIs an agent can run on. Only connected ones can be picked; the rest are slots for later (D15). */
export const BRAINS: { id: string; label: string; note: string; connected: boolean }[] = [
  { id: "openai", label: "OpenAI", note: "Connected", connected: true },
  { id: "claude", label: "Claude", note: "Coming soon", connected: false },
  { id: "muse", label: "Muse", note: "Coming soon", connected: false },
  { id: "local", label: "Local model", note: "Coming soon: runs on this computer", connected: false },
];
export interface HelperStatus {
  helper: Helper;
  state: "idle" | "working" | "waiting" | "done" | "paused";
  goal?: string | null;
}

interface Team {
  helpers: HelperStatus[];
  /** helper id -> how many runs we've already announced */
  announced: Record<string, number>;
  /** a helper hopping over to the leader with news */
  reporting: { id: string; text: string } | null;
  open: string | null; // report card open for this helper
  creating: boolean;
  /** Where you dragged each helper (kept in this browser). */
  spots: Record<string, { x: number; y: number }>;
  set: (p: Partial<Team>) => void;
  moveTo: (id: string, x: number, y: number) => void;
}

const SPOTS_KEY = "sios-helper-spots";
function loadSpots(): Record<string, { x: number; y: number }> {
  try {
    return JSON.parse(localStorage.getItem(SPOTS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export const useTeam = create<Team>((set, get) => ({
  helpers: [],
  announced: {},
  reporting: null,
  open: null,
  creating: false,
  spots: typeof window === "undefined" ? {} : loadSpots(),
  set: (p) => set(p),
  moveTo: (id, x, y) => {
    const spots = { ...get().spots, [id]: { x, y } };
    set({ spots });
    try {
      localStorage.setItem(SPOTS_KEY, JSON.stringify(spots));
    } catch {
      /* private window: it just won't be remembered */
    }
  },
}));

export const HELPER_NAMES = ["Pip", "Momo", "Bean", "Tofu", "Mochi", "Nori", "Kiwi", "Pebble", "Biscuit", "Dot", "Sprout", "Juniper"];
