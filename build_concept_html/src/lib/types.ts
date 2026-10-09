// Shared types for the simulator. Names mirror docs/plan/04-tunnel-and-tools.md
// so the UI speaks the same language as the real tunnel will.

export type Area = "files" | "settings" | "network" | "apps" | "people" | "memory" | "mail" | "system" | "writing";

/** Broker permission levels from docs/plan/05-security.md. */
export type Permission = "read" | "reversible" | "irreversible";

export type FileKind =
  | "folder"
  | "pdf"
  | "image"
  | "doc"
  | "sheet"
  | "slides"
  | "archive"
  | "installer"
  | "code"
  | "text"
  | "audio"
  | "video";

export interface FileItem {
  id: string;
  name: string;
  kind: FileKind;
  size?: string;
  modified: string;
  /** Set briefly after the AI touches a file, so the Files window can highlight it. */
  touchedBy?: string;
  // ---- object metadata (file system redesign) ----
  /** Who made it and how: "you", "assistant", "web", an app name. */
  origin?: { by: string; via?: string; at?: string };
  /** Content from the web, email or unknown sources is untrusted until you say otherwise. */
  trust?: "trusted" | "untrusted";
  labels?: string[];
  /** Goal (run id or GP id) that last changed it. */
  goal?: string;
  versions?: number;
  /** Real change history, newest first. Every AI change appends one entry. */
  history?: FileEvent[];
  /** Set while the item is in the Trash, so it can be put back. */
  trashedFrom?: string;
  /** Imported from your computer: real contents live in lib/blobs.ts under this item's id. */
  imported?: boolean;
  mime?: string;
  /** Lineage: ids of the files this one was made from. Labels and trust flow along it. */
  from?: string[];
}

export interface FileEvent {
  at: number;
  by: string; // "you", "SIOS", an app name
  action: string; // plain words: "Moved from Downloads to Documents/Finance"
  goal?: string;
}

export interface Person {
  name: string;
  email: string;
  role?: string;
  initials: string;
  tone: string;
}

export interface Network {
  ssid: string;
  signal: 1 | 2 | 3 | 4;
  secured: boolean;
  saved: boolean;
}

export interface MailMessage {
  id: string;
  to: Person[];
  subject: string;
  body: string;
  attachment?: string;
  time: string;
}

export type AppId = "files" | "activity" | "settings" | "mail" | "browser" | "terminal" | "store" | "security" | "goals" | "systemmap" | "memory";

export interface Win {
  id: string;
  app: AppId;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  /** App-specific props, e.g. the folder a Files window shows. */
  props?: Record<string, string>;
}

// ---------- Brain runs ----------

export type StepKind = "context" | "reflex" | "recipe" | "route" | "snapshot" | "tool" | "verify" | "think" | "guard" | "delegate";
export type StepStatus = "pending" | "active" | "done" | "blocked" | "skipped";

/** What the broker decided for one step. */
export type BrokerDecision =
  | "allowed" // read level: allowed and logged
  | "remembered" // reversible, already allowed this session
  | "asked-once"
  | "asked-session"
  | "asked-approved" // irreversible or cloud, approved by the human
  | "denied" // the human said no
  | "blocked"; // a rule (Access map, emergency stop) said no, nobody was asked

export interface ToolCall {
  name: string; // area.verb_object
  adapter: string; // e.g. dbus:NetworkManager
  permission: Permission;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  snapshot?: boolean;
}

// ---------- Policy ----------

/** One line of the broker's reasoning. Every decision keeps its full trace. */
export interface PolicyCheck {
  id: string;
  label: string; // plain question, e.g. "Is this part of what you asked?"
  result: "pass" | "ask" | "fail" | "skip";
  detail: string;
}

export type PolicyDecision = "allow" | "ask" | "block";

export interface PolicyVerdict {
  decision: PolicyDecision;
  /** Why it asks, when it asks. */
  askKind?: "reversible" | "irreversible" | "tainted";
  reason: string;
  checks: PolicyCheck[];
  leaseId?: string;
}

/**
 * A lease is a time- and use-bounded permission (v3 doc: "capability leases").
 * "Allow for this session" and "Allow for 1 hour" both create one.
 */
export interface Lease {
  id: string;
  tool: string;
  principal: string;
  kind: "session" | "hour" | "once" | "standing";
  createdAt: number;
  expiresAt: number | null;
  usesLeft: number | null;
  goal: string;
}

export interface AuditEntry {
  id: string;
  seq: number;
  at: number;
  principal: string;
  goal: string;
  tool: string;
  target: string;
  decision: PolicyDecision;
  outcome: "allowed" | "asked-yes" | "asked-no" | "blocked";
  reason: string;
  checks: PolicyCheck[];
  prevHash: string;
  hash: string;
}

export interface Step {
  id: string;
  kind: StepKind;
  label: string; // plain English while running
  doneLabel?: string; // plain English when finished
  detail?: string; // secondary line, plain English
  status: StepStatus;
  tool?: ToolCall;
  broker?: BrokerDecision;
  ms?: number; // how long it took
  chips?: string[]; // small facts, e.g. memories injected
  checks?: PolicyCheck[]; // the broker's trace for this step
}

export type RunStatus = "running" | "waiting" | "done" | "stopped" | "failed";
export type Route = "local" | "cloud";

export interface Run {
  id: string;
  request: string;
  scenarioId: string;
  area: Area;
  status: RunStatus;
  route: Route;
  steps: Step[];
  startedAt: number;
  endedAt?: number;
  summary?: string;
  /** Shown as the main action on the result card. */
  resultAction?: { label: string; app: AppId; props?: Record<string, string> };
  undoable: boolean;
  undone?: boolean;
  /** Live machine: the capd goal id, for undo on the real sandbox. */
  liveGoal?: string;
  /** Live machine: things the owner can do themselves when the AI can't. */
  manual?: { label: string; tool: string; args: Record<string, unknown> }[];
  /** Live machine: the AI asked a question; the next request answers it. */
  question?: boolean;
  irreversibleNote?: string;
  usedRecipe?: boolean;
  savedRecipe?: boolean;
  snapshotId?: string;
  /** Who asked: "owner" for you, or a connected app id. */
  principal: string;
  /** True once the task has read content it shouldn't trust (web, email, unknown files). */
  tainted?: boolean;
  /** Live runs: which provider and model proposed the plan. */
  plannedBy?: string;
  // ---- the "car": delegation, data flow, coordination, budgets ----
  /** Set when this goal was handed down by another goal. */
  parentId?: string;
  /** The slice of authority it was handed. Never more than the parent had. */
  scope?: GoalScope;
  /** Data this goal has read, so the broker can see where it's flowing (lineage). */
  dataFrom?: DataSource[];
  budget?: { cents: number; actions: number };
  spent?: { cents: number; actions: number };
  /** Shown while the goal waits for someone else to finish with a file. */
  waitingOn?: string;
}

export interface GoalScope {
  paths?: string[]; // may only touch these folders
  tools?: string[]; // may only use these tools
  noEgress?: boolean; // may not send anything off the computer
}

export interface DataSource {
  name: string;
  path: string;
  labels: string[];
  untrusted?: boolean;
}

// ---------- Approvals ----------

export type ApprovalKind = "reversible" | "irreversible" | "cloud";
export type ApprovalAnswer = "deny" | "once" | "hour" | "session" | "approve" | "always";

export interface ApprovalChange {
  text: string;
  sub?: string;
}

export type ApprovalPreview =
  | { type: "email"; to: Person[]; subject: string; body: string; attachment?: string }
  | { type: "moves"; groups: { folder: string; files: string[] }[] }
  | { type: "redaction"; original: string; redacted: string; removed: string[] }
  | { type: "setting"; from: string; to: string };

export interface ApprovalRequest {
  id: string;
  runId: string;
  kind: ApprovalKind;
  area: Area;
  title: string;
  request: string;
  changes: ApprovalChange[];
  preview?: ApprovalPreview;
  scope?: string;
  tool?: ToolCall;
  primaryLabel?: string;
  denyLabel?: string;
  /** Who is asking, when it isn't you. */
  principalName?: string;
  /** The task read untrusted content before this. */
  tainted?: boolean;
  checks?: PolicyCheck[];
  /** Data this action would carry out, by source. */
  carries?: DataSource[];
  /** One-time approvals only (the live machine): hide "Allow for 1 hour / Session". */
  noDuration?: boolean;
  /** Offer "always allow plans like this" (a standing rule). */
  alwaysLabel?: string;
  /** A capability pass being handed to an AI: shown as its own block. */
  pass?: { tools: string[]; folders: string[]; limits: string; why?: string };
  /** A whole plan to approve at once, with what the broker said about each step. */
  plan?: { n: number; text: string; note?: string; tone: "ok" | "ask" | "block" }[];
}

export interface Toast {
  id: string;
  title: string;
  body?: string;
  tone: "info" | "ok" | "warn";
  action?: { label: string; app: AppId; props?: Record<string, string> };
  undoRunId?: string;
}
