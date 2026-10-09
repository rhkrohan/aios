"use client";

// The AI pet: a visible body for the assistant. It doesn't decide anything;
// it follows what the engine is doing and goes to where the work happens.

import { create } from "zustand";

export type PetMood = "idle" | "flying" | "working" | "waiting" | "happy" | "sleeping" | "sad";

export interface PetLine {
  from: "you" | "pet";
  text: string;
}

interface PetState {
  visible: boolean;
  x: number;
  y: number;
  mood: PetMood;
  bubble: string | null;
  carrying: string | null; // a file kind being carried
  chatOpen: boolean;
  chat: PetLine[];
  /** Set while the user drags it, so the follower doesn't fight the drag. */
  held: boolean;
  setVisible: (v: boolean) => void;
  goTo: (x: number, y: number) => void;
  setMood: (m: PetMood) => void;
  say: (text: string | null) => void;
  carry: (kind: string | null) => void;
  setChatOpen: (open: boolean) => void;
  addLine: (l: PetLine) => void;
  setHeld: (h: boolean) => void;
}

export const usePet = create<PetState>((set, get) => ({
  visible: true,
  x: 0,
  y: 0,
  mood: "idle",
  bubble: null,
  carrying: null,
  chatOpen: false,
  chat: [{ from: "pet", text: "Hi! I'm your SIOS buddy. Tell me what you need and I'll go do it." }],
  held: false,
  setVisible: (v) => set({ visible: v, chatOpen: v ? get().chatOpen : false }),
  goTo: (x, y) => set({ x, y }),
  setMood: (m) => set({ mood: m }),
  say: (text) => set({ bubble: text }),
  carry: (kind) => set({ carrying: kind }),
  setChatOpen: (open) => set({ chatOpen: open }),
  addLine: (l) => set({ chat: [...get().chat, l].slice(-30) }),
  setHeld: (h) => set({ held: h }),
}));

/** Where the pet rests when nothing is happening: bottom right, above the dock line. */
export function homeSpot() {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  return { x: window.innerWidth - 120, y: window.innerHeight - 190 };
}
