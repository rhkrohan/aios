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
}
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
  set: (p: Partial<Team>) => void;
}

export const useTeam = create<Team>((set) => ({
  helpers: [],
  announced: {},
  reporting: null,
  open: null,
  creating: false,
  set: (p) => set(p),
}));

export const HELPER_NAMES = ["Pip", "Momo", "Bean", "Tofu", "Mochi", "Nori", "Kiwi", "Pebble", "Biscuit", "Dot", "Sprout", "Juniper"];
