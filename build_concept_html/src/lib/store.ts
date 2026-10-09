"use client";

import { create } from "zustand";
import { initialFs, NETWORKS } from "./seed";
import type {
  AppId,
  ApprovalAnswer,
  ApprovalRequest,
  FileItem,
  MailMessage,
  Network,
  Run,
  Step,
  Toast,
  Win,
} from "./types";

const APP_DEFAULTS: Record<AppId, { title: string; w: number; h: number }> = {
  files: { title: "Files", w: 820, h: 520 },
  activity: { title: "Activity", w: 760, h: 600 },
  settings: { title: "Settings", w: 860, h: 580 },
  mail: { title: "Mail", w: 860, h: 560 },
  browser: { title: "Browser", w: 900, h: 600 },
  store: { title: "Store", w: 1040, h: 660 },
  security: { title: "Security Center", w: 1060, h: 680 },
  terminal: { title: "Terminal", w: 680, h: 420 },
};

export interface PendingApproval {
  request: ApprovalRequest;
  resolve: (a: ApprovalAnswer) => void;
}

export interface Settings {
  /** 0 nothing personal, 1 only what the task needs, 2 full context */
  privacy: 0 | 1 | 2;
  askBeforeCloud: boolean;
  offlineFallback: boolean;
  onlineAi: "Claude" | "ChatGPT" | "Gemini" | null;
  showDetails: boolean;
}

export interface Installed {
  version: string;
  account?: string;
  disabledTools: string[];
  installedAt: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  body?: string;
  tone: Toast["tone"];
  at: number;
}

export type Power = "off" | "booting" | "locked" | "on" | "sleeping" | "shutting";
export type ScopeRule = "allow" | "ask" | "block";

export type WallpaperId = "dusk" | "lake" | "tunnel";
export interface Todo {
  id: string;
  text: string;
  time?: string;
  done: boolean;
}

interface OSState {
  // simulated machine
  theme: "light" | "dark";
  wallpaper: WallpaperId;
  todos: Todo[];
  suggestionDismissed: boolean;
  installed: Record<string, Installed>;
  /** Servers added by URL. Not in the catalog, unknown publisher. */
  customCaps: import("./catalog").Capability[];
  notifications: NotificationItem[];
  schedules: Record<string, string | null>;
  setupOpen: boolean;
  dnd: boolean;
  power: Power;
  /** After shutting down, boot into the lock screen instead of the desktop. */
  bootTo: "on" | "locked";
  /** Emergency stop: no AI may act until the owner resumes. */
  aiPaused: boolean;
  /** Default rule per place, from the Security Center access map. */
  scopeRules: Record<string, ScopeRule>;
  wifi: { connected: string | null; networks: Network[] };
  fs: Record<string, FileItem[]>;
  mail: MailMessage[];
  settings: Settings;

  // shell
  windows: Win[];
  zTop: number;
  commandOpen: boolean;
  focusedRunId: string | null;

  // brain
  runs: Run[];
  approval: PendingApproval | null;
  grants: string[];
  /** Standing rules the user set: tools that never need to ask. */
  standingRules: string[];
  recipes: string[];
  toasts: Toast[];

  // shell actions
  openApp: (app: AppId, props?: Record<string, string>) => void;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  setWindowProps: (id: string, props: Record<string, string>) => void;
  setCommandOpen: (open: boolean) => void;
  setFocusedRun: (id: string | null) => void;

  // machine actions
  setTheme: (t: "light" | "dark") => void;
  setWallpaper: (w: WallpaperId) => void;
  toggleTodo: (id: string) => void;
  dismissSuggestion: () => void;
  install: (id: string, version: string, account?: string) => void;
  uninstall: (id: string) => void;
  addCustomCap: (c: import("./catalog").Capability) => void;
  updateCap: (id: string, version: string) => void;
  toggleTool: (id: string, tool: string) => void;
  clearNotifications: () => void;
  setSchedule: (recipe: string, when: string | null) => void;
  setSetupOpen: (open: boolean) => void;
  setDnd: (on: boolean) => void;
  setPower: (p: Power, bootTo?: "on" | "locked") => void;
  setAiPaused: (on: boolean) => void;
  setScopeRule: (path: string, rule: ScopeRule) => void;
  setFs: (fs: Record<string, FileItem[]>) => void;
  setWifi: (ssid: string | null) => void;
  addMail: (m: MailMessage) => void;
  updateSettings: (s: Partial<Settings>) => void;

  // brain actions
  addRun: (r: Run) => void;
  updateRun: (id: string, fn: (r: Run) => Run) => void;
  updateStep: (runId: string, stepId: string, patch: Partial<Step>) => void;
  askApproval: (req: ApprovalRequest) => Promise<ApprovalAnswer>;
  answerApproval: (a: ApprovalAnswer) => void;
  grant: (tool: string) => void;
  revokeGrants: () => void;
  removeStandingRule: (tool: string) => void;
  saveRecipe: (scenarioId: string) => void;

  pushToast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
}

let idc = 0;
export const uid = (p = "id") => `${p}_${Date.now().toString(36)}_${(++idc).toString(36)}`;

export const useOS = create<OSState>((set, get) => ({
  theme: "light",
  wallpaper: "dusk",
  todos: [
    { id: "t1", text: "Review the approval screen draft", time: "10:00 AM", done: true },
    { id: "t2", text: "Design sync with Sara", time: "2:00 PM", done: false },
    { id: "t3", text: "Test the ISO in a VM", done: false },
  ],
  suggestionDismissed: false,
  installed: {
    gmail: { version: "2.0.3", account: "rohan@example.com", disabledTools: [], installedAt: Date.now() - 86400e3 * 9 },
    slack: { version: "3.1.0", account: "sios-team.slack.com", disabledTools: [], installedAt: Date.now() - 86400e3 * 4 },
  },
  customCaps: [],
  notifications: [],
  schedules: {},
  setupOpen: false,
  dnd: false,
  power: "booting",
  bootTo: "on",
  aiPaused: false,
  scopeRules: {
    "~/Documents": "ask",
    "~/Downloads": "ask",
    "~/Projects": "ask",
    "~/Pictures": "ask",
    "~/Documents/Taxes 2025": "block",
    "mail.send": "ask",
    "network": "allow",
    "settings": "ask",
  },
  wifi: { connected: "Drexel-Guest", networks: NETWORKS },
  fs: initialFs(),
  mail: [],
  settings: { privacy: 1, askBeforeCloud: true, offlineFallback: true, onlineAi: "Claude", showDetails: false },

  windows: [],
  zTop: 10,
  commandOpen: false,
  focusedRunId: null,

  runs: [],
  approval: null,
  grants: [],
  standingRules: ["gmail.draft"],
  recipes: [],
  toasts: [],

  openApp: (app, props) => {
    const { windows, zTop } = get();
    const existing = windows.find((w) => w.app === app);
    const z = zTop + 1;
    if (existing) {
      set({
        zTop: z,
        windows: windows.map((w) =>
          w.id === existing.id ? { ...w, z, minimized: false, props: props ? { ...w.props, ...props } : w.props } : w,
        ),
      });
      return;
    }
    const d = APP_DEFAULTS[app];
    const vw = typeof window === "undefined" ? 1440 : window.innerWidth;
    const vh = typeof window === "undefined" ? 900 : window.innerHeight;
    const w = Math.min(d.w, vw - 48);
    const h = Math.min(d.h, vh - 210);
    const offset = (windows.length % 5) * 28;
    set({
      zTop: z,
      windows: [
        ...windows,
        {
          id: uid("win"),
          app,
          title: d.title,
          w,
          h,
          x: Math.max(16, Math.round((vw - w) / 2) + offset - 40),
          y: Math.max(52, Math.round((vh - 190 - h) / 2) + 34 + offset),
          z,
          minimized: false,
          props,
        },
      ],
    });
  },
  closeWindow: (id) => set({ windows: get().windows.filter((w) => w.id !== id) }),
  focusWindow: (id) => {
    const z = get().zTop + 1;
    set({ zTop: z, windows: get().windows.map((w) => (w.id === id ? { ...w, z, minimized: false } : w)) });
  },
  minimizeWindow: (id) => set({ windows: get().windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)) }),
  moveWindow: (id, x, y) => set({ windows: get().windows.map((w) => (w.id === id ? { ...w, x, y } : w)) }),
  setWindowProps: (id, props) =>
    set({ windows: get().windows.map((w) => (w.id === id ? { ...w, props: { ...w.props, ...props } } : w)) }),
  setCommandOpen: (open) => set({ commandOpen: open }),
  setFocusedRun: (id) => set({ focusedRunId: id }),

  setTheme: (t) => set({ theme: t }),
  setWallpaper: (w) => set({ wallpaper: w }),
  toggleTodo: (id) => set({ todos: get().todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }),
  dismissSuggestion: () => set({ suggestionDismissed: true }),
  install: (id, version, account) =>
    set({ installed: { ...get().installed, [id]: { version, account, disabledTools: [], installedAt: Date.now() } } }),
  uninstall: (id) => {
    const next = { ...get().installed };
    delete next[id];
    set({ installed: next });
  },
  addCustomCap: (c) => set({ customCaps: [...get().customCaps.filter((x) => x.id !== c.id), c] }),
  updateCap: (id, version) => set({ installed: { ...get().installed, [id]: { ...get().installed[id], version } } }),
  toggleTool: (id, tool) => {
    const cur = get().installed[id];
    if (!cur) return;
    const off = cur.disabledTools.includes(tool) ? cur.disabledTools.filter((t) => t !== tool) : [...cur.disabledTools, tool];
    set({ installed: { ...get().installed, [id]: { ...cur, disabledTools: off } } });
  },
  clearNotifications: () => set({ notifications: [] }),
  setSchedule: (recipe, when) => set({ schedules: { ...get().schedules, [recipe]: when } }),
  setSetupOpen: (open) => set({ setupOpen: open }),
  setDnd: (on) => set({ dnd: on }),
  setPower: (p, bootTo) => set({ power: p, ...(bootTo ? { bootTo } : {}) }),
  setAiPaused: (on) => set({ aiPaused: on }),
  setScopeRule: (path, rule) => set({ scopeRules: { ...get().scopeRules, [path]: rule } }),
  setFs: (fs) => set({ fs }),
  setWifi: (ssid) => set({ wifi: { ...get().wifi, connected: ssid } }),
  addMail: (m) => set({ mail: [m, ...get().mail] }),
  updateSettings: (s) => set({ settings: { ...get().settings, ...s } }),

  addRun: (r) => set({ runs: [r, ...get().runs] }),
  updateRun: (id, fn) => set({ runs: get().runs.map((r) => (r.id === id ? fn(r) : r)) }),
  updateStep: (runId, stepId, patch) =>
    set({
      runs: get().runs.map((r) =>
        r.id === runId ? { ...r, steps: r.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)) } : r,
      ),
    }),
  askApproval: (request) =>
    new Promise<ApprovalAnswer>((resolve) => {
      set({ approval: { request, resolve } });
    }),
  answerApproval: (a) => {
    const p = get().approval;
    if (!p) return;
    set({ approval: null });
    p.resolve(a);
  },
  grant: (tool) => set({ grants: Array.from(new Set([...get().grants, tool])) }),
  revokeGrants: () => set({ grants: [] }),
  removeStandingRule: (tool) => set({ standingRules: get().standingRules.filter((t) => t !== tool) }),
  saveRecipe: (id) => set({ recipes: Array.from(new Set([...get().recipes, id])) }),

  pushToast: (t) => {
    const id = uid("toast");
    const note = { id, title: t.title, body: t.body, tone: t.tone, at: Date.now() };
    set({ notifications: [note, ...get().notifications].slice(0, 30) });
    if (get().dnd) return;
    set({ toasts: [...get().toasts, { ...t, id }].slice(-4) });
    setTimeout(() => get().dismissToast(id), 6500);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

/** The run the brain pill should reflect: anything waiting first, then running. */
export function selectBrainState(s: OSState): "idle" | "working" | "waiting" | "paused" {
  if (s.aiPaused) return "paused";
  if (s.approval || s.runs.some((r) => r.status === "waiting")) return "waiting";
  if (s.runs.some((r) => r.status === "running")) return "working";
  return "idle";
}
