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

export type AppId = "files" | "activity" | "settings" | "mail" | "browser" | "terminal" | "store" | "security";

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

export type StepKind = "context" | "reflex" | "recipe" | "route" | "snapshot" | "tool" | "verify" | "think";
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
  irreversibleNote?: string;
  usedRecipe?: boolean;
  savedRecipe?: boolean;
  snapshotId?: string;
}

// ---------- Approvals ----------

export type ApprovalKind = "reversible" | "irreversible" | "cloud";
export type ApprovalAnswer = "deny" | "once" | "session" | "approve";

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
}

export interface Toast {
  id: string;
  title: string;
  body?: string;
  tone: "info" | "ok" | "warn";
  action?: { label: string; app: AppId; props?: Record<string, string> };
  undoRunId?: string;
}
