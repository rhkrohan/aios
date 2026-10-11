"use client";

import { create } from "zustand";
import { BASE_INBOX, initialFs, NETWORKS } from "./seed";
import { GENESIS, chainHash, payloadOf } from "./audit";
import { SEED_TRUST, type TrustRecord } from "./trust";
import { SEED_IAM, type IAM, type Role } from "./iam";
import type {
  AuditEntry,
  Lease,
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
  files: { title: "Files", w: 1120, h: 640 },
  activity: { title: "Activity", w: 760, h: 600 },
  settings: { title: "Settings", w: 860, h: 580 },
  mail: { title: "Mail", w: 860, h: 560 },
  browser: { title: "Browser", w: 900, h: 600 },
  store: { title: "Store", w: 1040, h: 660 },
  security: { title: "Security Center", w: 1060, h: 680 },
  goals: { title: "Goals", w: 1100, h: 680 },
  systemmap: { title: "System Map", w: 1180, h: 700 },
  memory: { title: "Memory", w: 1160, h: 760 },
  team: { title: "Team", w: 940, h: 660 },
  compare: { title: "Compare", w: 900, h: 560 },
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
  /** Send requests that match no scripted demo to the live planner. */
  liveAi: boolean;
  /** Send every request to the live planner, even scripted ones. */
  liveAll: boolean;
  /** Requests go to a real model on real files, through capd. */
  liveMachine: boolean;
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
  addTodo: (t: Omit<Todo, "id" | "done">) => void;
  inbox: import("./types").InboxMessage[];
  addInbox: (m: import("./types").InboxMessage) => void;
  suggestionDismissed: boolean;
  installed: Record<string, Installed>;
  /** Servers added by URL. Not in the catalog, unknown publisher. */
  customCaps: import("./catalog").Capability[];
  notifications: NotificationItem[];
  schedules: Record<string, string | null>;
  setupOpen: boolean;
  dnd: boolean;
  volume: number;
  brightness: number;
  bluetooth: boolean;
  setVolume: (v: number) => void;
  setBrightness: (v: number) => void;
  setBluetooth: (on: boolean) => void;
  power: Power;
  /** After shutting down, boot into the lock screen instead of the desktop. */
  bootTo: "on" | "locked";
  /** Emergency stop: no AI may act until the owner resumes. */
  aiPaused: boolean;
  /** Default rule per place, from the Security Center access map. */
  scopeRules: Record<string, ScopeRule>;
  leases: Lease[];
  audit: AuditEntry[];
  /** Live machine: capd's own verdict on its log (null when simulated). */
  liveIntact: boolean | null;
  pausedPrincipals: string[];
  /** Connected AI apps and the areas each may use. */
  connectedApps: Record<string, { since: string; areas: string[] }>;
  trust: Record<string, TrustRecord>;
  /** Who each AI is and what its roles allow (lib/iam.ts). */
  iam: IAM;
  /** Goals the user stopped from the Goals app; the engine checks before each step. */
  cancelledRuns: string[];
  wifi: { connected: string | null; networks: Network[] };
  fs: Record<string, FileItem[]>;
  mail: MailMessage[];
  settings: Settings;

  // shell
  windows: Win[];
  zTop: number;
  commandOpen: boolean;
  /** The search launcher (apps, files, settings, actions). */
  launcherOpen: boolean;
  focusedRunId: string | null;

  // brain
  runs: Run[];
  approval: PendingApproval | null;
  /** Approvals waiting behind the current one (several goals can ask at once). */
  approvalQueue: PendingApproval[];
  /** Who is using a file right now. Agents wait their turn (coordination). */
  locks: Record<string, { holder: string; since: number }>;
  /** Files you dropped on the orb: the next request is about them. */
  askFiles: { id: string; dir: string; name: string }[];
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
  setLauncherOpen: (open: boolean) => void;
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
  addLease: (l: Omit<Lease, "id" | "createdAt">) => Lease;
  revokeLease: (id: string) => void;
  consumeLease: (id: string) => void;
  appendAudit: (e: Omit<AuditEntry, "id" | "seq" | "at" | "prevHash" | "hash">) => void;
  togglePrincipal: (id: string) => void;
  setConnectedApp: (id: string, v: { since: string; areas: string[] } | null) => void;
  adjustTrust: (principal: string, delta: number, why: string) => void;
  cancelRun: (id: string) => void;
  setTrustOverride: (principal: string, level: number | null) => void;
  setIdentityRoles: (id: string, roles: string[]) => void;
  saveRole: (role: Role) => void;
  removeRole: (id: string) => void;
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
  lock: (path: string, holder: string) => void;
  setAskFiles: (files: { id: string; dir: string; name: string }[]) => void;
  unlock: (path: string) => void;
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
  inbox: BASE_INBOX,
  installed: {
    gmail: { version: "2.0.3", account: "rohan@example.com", disabledTools: [], installedAt: Date.now() - 86400e3 * 9 },
    slack: { version: "3.1.0", account: "sios-team.slack.com", disabledTools: [], installedAt: Date.now() - 86400e3 * 4 },
  },
  customCaps: [],
  notifications: [],
  schedules: {},
  setupOpen: false,
  dnd: false,
  volume: 45,
  brightness: 72,
  bluetooth: true,
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
  leases: [],
  audit: [],
  liveIntact: null,
  pausedPrincipals: [],
  connectedApps: { "claude-desktop": { since: "Connected 3 days ago", areas: ["Files", "Settings"] } },
  trust: SEED_TRUST,
  iam: SEED_IAM,
  cancelledRuns: [],
  wifi: { connected: "Drexel-Guest", networks: NETWORKS },
  fs: initialFs(),
  mail: [],
  settings: { privacy: 1, askBeforeCloud: true, offlineFallback: true, onlineAi: "Claude", showDetails: false, liveAi: true, liveAll: false, liveMachine: false },

  windows: [],
  zTop: 10,
  commandOpen: false,
  launcherOpen: false,
  focusedRunId: null,

  runs: [],
  approval: null,
  approvalQueue: [],
  locks: {},
  askFiles: [],
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
  setCommandOpen: (open) => set({ commandOpen: open, launcherOpen: open ? false : get().launcherOpen }),
  setLauncherOpen: (open) => set({ launcherOpen: open, commandOpen: open ? false : get().commandOpen }),
  setFocusedRun: (id) => set({ focusedRunId: id }),

  setTheme: (t) => set({ theme: t }),
  setWallpaper: (w) => set({ wallpaper: w }),
  addTodo: (t) => set({ todos: [...get().todos, { ...t, id: uid("todo"), done: false }] }),
  addInbox: (m) => set({ inbox: [m, ...get().inbox.filter((x) => x.id !== m.id)] }),
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
  setVolume: (v) => set({ volume: Math.max(0, Math.min(100, Math.round(v))) }),
  setBrightness: (v) => set({ brightness: Math.max(0, Math.min(100, Math.round(v))) }),
  setBluetooth: (on) => set({ bluetooth: on }),
  setPower: (p, bootTo) => set({ power: p, ...(bootTo ? { bootTo } : {}) }),
  setAiPaused: (on) => set({ aiPaused: on }),
  setScopeRule: (path, rule) => set({ scopeRules: { ...get().scopeRules, [path]: rule } }),
  addLease: (l) => {
    const lease: Lease = { ...l, id: uid("lease"), createdAt: Date.now() };
    set({ leases: [lease, ...get().leases] });
    return lease;
  },
  revokeLease: (id) => {
    const lease = get().leases.find((l) => l.id === id);
    const leases = get().leases.filter((l) => l.id !== id);
    const stillSession = lease && leases.some((l) => l.tool === lease.tool && l.kind === "session");
    set({ leases, grants: lease && !stillSession ? get().grants.filter((g) => g !== lease.tool) : get().grants });
  },
  consumeLease: (id) =>
    set({
      leases: get()
        .leases.map((l) => (l.id === id && l.usesLeft !== null ? { ...l, usesLeft: l.usesLeft - 1 } : l))
        .filter((l) => l.usesLeft === null || l.usesLeft > 0),
    }),
  appendAudit: (e) => {
    const log = get().audit;
    const prevHash = log[0]?.hash ?? GENESIS;
    const base = { ...e, id: uid("aud"), seq: (log[0]?.seq ?? 0) + 1, at: Date.now() };
    const hash = chainHash(prevHash, payloadOf(base));
    set({ audit: [{ ...base, prevHash, hash }, ...log] });
  },
  togglePrincipal: (id) => {
    const p = get().pausedPrincipals;
    set({ pausedPrincipals: p.includes(id) ? p.filter((x) => x !== id) : [...p, id] });
  },
  cancelRun: (id) => {
    const st = get();
    // a goal waiting on an approval is answered "no" so it can stop cleanly
    if (st.approval?.request.runId === id) st.answerApproval("deny");
    set({ cancelledRuns: Array.from(new Set([...get().cancelledRuns, id])) });
  },
  adjustTrust: (principal, delta, why) => {
    if (principal === "owner") return;
    const cur = get().trust[principal] ?? { score: 10, override: null, history: [] };
    const score = Math.max(0, Math.min(100, cur.score + delta));
    set({ trust: { ...get().trust, [principal]: { ...cur, score, history: [{ at: Date.now(), delta, why }, ...cur.history].slice(0, 20) } } });
  },
  setTrustOverride: (principal, level) => {
    const cur = get().trust[principal] ?? { score: 10, override: null, history: [] };
    set({ trust: { ...get().trust, [principal]: { ...cur, override: level } } });
  },
  setIdentityRoles: (id, roles) => {
    const iam = get().iam;
    set({ iam: { ...iam, identities: iam.identities.map((i) => (i.id === id ? { ...i, roles } : i)) } });
  },
  saveRole: (role) => {
    const iam = get().iam;
    const has = iam.roles.some((r) => r.id === role.id);
    set({ iam: { ...iam, roles: has ? iam.roles.map((r) => (r.id === role.id ? role : r)) : [...iam.roles, role] } });
  },
  removeRole: (id) => {
    const iam = get().iam;
    if (iam.roles.find((r) => r.id === id)?.global) return;
    set({ iam: { roles: iam.roles.filter((r) => r.id !== id), identities: iam.identities.map((i) => ({ ...i, roles: i.roles.filter((r) => r !== id) })) } });
  },
  setConnectedApp: (id, v) => {
    const next = { ...get().connectedApps };
    if (v) next[id] = v;
    else delete next[id];
    set({ connectedApps: next });
  },
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
      const pending = { request, resolve };
      if (get().approval) set({ approvalQueue: [...get().approvalQueue, pending] });
      else set({ approval: pending });
    }),
  answerApproval: (a) => {
    const p = get().approval;
    if (!p) return;
    const [next, ...rest] = get().approvalQueue;
    set({ approval: next ?? null, approvalQueue: rest });
    p.resolve(a);
  },
  setAskFiles: (files) => set({ askFiles: files }),
  lock: (path, holder) => set({ locks: { ...get().locks, [path]: { holder, since: Date.now() } } }),
  unlock: (path) => {
    const next = { ...get().locks };
    delete next[path];
    set({ locks: next });
  },
  grant: (tool) => set({ grants: Array.from(new Set([...get().grants, tool])) }),
  revokeGrants: () => set({ grants: [], leases: get().leases.filter((l) => l.kind === "standing") }),
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

/**
 * Data-only snapshot of the starting machine, taken once at load. The guided
 * demo resets to it so every run looks the same.
 */
const INITIAL = Object.fromEntries(Object.entries(useOS.getState()).filter(([, v]) => typeof v !== "function")) as Partial<OSState>;

export function resetMachine() {
  useOS.setState({
    ...INITIAL,
    fs: initialFs(),
    power: "on",
    windows: [],
    toasts: [],
    notifications: [],
    approval: null,
    approvalQueue: [],
    locks: {},
    commandOpen: false,
    focusedRunId: null,
  });
}


/** The run the brain pill should reflect: anything waiting first, then running. */
export function selectBrainState(s: OSState): "idle" | "working" | "waiting" | "paused" {
  if (s.aiPaused) return "paused";
  if (s.approval || s.runs.some((r) => r.status === "waiting")) return "waiting";
  if (s.runs.some((r) => r.status === "running")) return "working";
  return "idle";
}

// QA hook: open the app with ?debug to inspect the machine from the console.
if (typeof window !== "undefined" && window.location.search.includes("debug")) (window as unknown as { __os: typeof useOS }).__os = useOS;
