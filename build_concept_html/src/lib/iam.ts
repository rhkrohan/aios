// Agent IAM (proposed D22, docs/plan/14-design-decisions.md): who each AI is,
// and what its roles let it do. A role is a list of statements; a statement
// allows or denies some tools in some places, under some conditions, and an
// allow either runs on its own ("auto") or asks you first ("ask").
//
// Order: an explicit deny wins; then any allow that fits; nothing that fits
// means no. Your own requests ("owner") aren't limited by roles. Actions that
// can't be undone still always ask, whatever a role says (policy.ts, step 8).
// Same shape as capd's iam.json, so the sim and the live machine agree.

import type { Permission } from "./types";

export type Effect = "allow" | "deny";
export type Mode = "auto" | "ask";

export interface Statement {
  id: string;
  effect: Effect;
  /** Tool names; "*" matches any run of characters ("files.*", "*.read"). */
  tools: string[];
  /** Places it covers ("~/Projects"). Empty: anywhere. */
  places: string[];
  /** For allow: run on its own, or ask first. */
  mode: Mode;
  when?: {
    /** Only for actions at most this risky. */
    maxRisk?: Permission;
    /** Only after the task read untrusted content (true) or only before (false). */
    tainted?: boolean;
  };
  /** The statement in plain words, as you'd say it. */
  note: string;
}

export interface Role {
  id: string;
  name: string;
  about: string;
  statements: Statement[];
  /** Applies to every AI, not assigned. */
  global?: boolean;
}

export type IdentityKind = "owner" | "assistant" | "app" | "device" | "helper";

export interface Identity {
  /** Stable id: the principal the broker sees. */
  id: string;
  name: string;
  kind: IdentityKind;
  /** How it proved who it is. */
  proof: string;
  /** Who added it. */
  createdBy: string;
  roles: string[];
  since: number;
}

export interface IAM {
  identities: Identity[];
  roles: Role[];
}

const RISK: Record<Permission, number> = { read: 0, reversible: 1, irreversible: 2 };

const st = (id: string, effect: Effect, tools: string[], places: string[], mode: Mode, note: string, when?: Statement["when"]): Statement => ({
  id,
  effect,
  tools,
  places,
  mode,
  note,
  ...(when ? { when } : {}),
});

export const SEED_ROLES: Role[] = [
  {
    id: "everyone",
    name: "Every AI",
    about: "Applies to every AI that isn't you. Denies here beat any allow.",
    global: true,
    statements: [
      st("e1", "deny", ["*"], ["~/Documents/Taxes 2025"], "auto", "Never touch Taxes 2025"),
      st("e2", "deny", ["*.send", "forms.submit", "calendar.invite.send"], [], "auto", "Never send anything after reading untrusted content", { tainted: true }),
    ],
  },
  {
    id: "reader",
    name: "Reader",
    about: "Can look and search. Changes nothing.",
    statements: [st("r1", "allow", ["*.read", "*.find", "*.search", "*.get", "*.list", "people.resolve"], [], "auto", "Look at and search anything not denied", { maxRisk: "read" })],
  },
  {
    id: "organizer",
    name: "Organizer",
    about: "Tidies files in your working folders. Everything it does can be undone.",
    statements: [st("o1", "allow", ["files.move", "files.organize", "files.write", "files.trash", "files.restore"], ["~/Downloads", "~/Projects"], "auto", "Move and tidy files in Downloads and Projects", { maxRisk: "reversible" })],
  },
  {
    id: "drafter",
    name: "Drafter",
    about: "Writes drafts for you. Sending always comes back to you.",
    statements: [
      st("d1", "allow", ["*.draft"], [], "auto", "Write drafts"),
      st("d2", "allow", ["gmail.send", "slack.message.send"], [], "ask", "Send, after you say yes"),
    ],
  },
  {
    id: "settings",
    name: "Settings helper",
    about: "Can change look and network settings, asking each time.",
    statements: [st("s1", "allow", ["settings.*", "network.*", "apps.open"], [], "ask", "Change settings, asking first")],
  },
];

const DAY = 86400e3;
export const SEED_IDENTITIES: Identity[] = [
  { id: "owner", name: "You", kind: "owner", proof: "Signed in at this computer", createdBy: "Setup", roles: [], since: Date.now() - 30 * DAY },
  { id: "claude-desktop", name: "Claude Desktop", kind: "app", proof: "Pairing code you approved", createdBy: "You", roles: ["reader", "organizer", "settings"], since: Date.now() - 3 * DAY },
  { id: "chatgpt", name: "ChatGPT", kind: "app", proof: "Pairing code you approved", createdBy: "You", roles: ["reader"], since: Date.now() - DAY },
  { id: "phone", name: "Your phone", kind: "device", proof: "Paired in person", createdBy: "You", roles: ["reader", "drafter"], since: Date.now() - 5 * DAY },
  { id: "custom", name: "Custom app", kind: "app", proof: "None: added by URL, unknown publisher", createdBy: "You", roles: [], since: Date.now() - 3600e3 },
];

export const SEED_IAM: IAM = { identities: SEED_IDENTITIES, roles: SEED_ROLES };

// ---------------------------------------------------------------- matching

const globCache = new Map<string, RegExp>();
export function toolMatches(pattern: string, tool: string) {
  let re = globCache.get(pattern);
  if (!re) {
    re = new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    globCache.set(pattern, re);
  }
  return re.test(tool);
}

export const inPlace = (target: string, place: string) => target === place || target.startsWith(place + "/");

/** Does this statement cover this action? Returns why not, or null if it does. */
function miss(s: Statement, a: Action): string | null {
  if (!s.tools.some((t) => toolMatches(t, a.tool))) return "tool";
  if (s.places.length) {
    // an action with no place can't be shown to be inside one
    if (!a.places.length || !a.places.every((p) => s.places.some((pl) => inPlace(p, pl)))) return "place";
  }
  if (s.when?.maxRisk && RISK[a.risk] > RISK[s.when.maxRisk]) return "risk";
  if (s.when?.tainted !== undefined && s.when.tainted !== a.tainted) return "taint";
  return null;
}

export interface Action {
  tool: string;
  risk: Permission;
  /** Places it touches, as "~/..." paths. */
  places: string[];
  tainted: boolean;
}

export interface IamResult {
  result: "pass" | "ask" | "fail";
  detail: string;
  /** The statement that decided it, if any. */
  by?: { role: string; statement: string; note: string; effect: Effect; mode: Mode };
}

const by = (r: Role, s: Statement) => ({ role: r.name, statement: s.id, note: s.note, effect: s.effect, mode: s.mode });

/** The roles that apply to someone: their own, plus every global one. */
export function rolesOf(iam: IAM, principal: string): Role[] {
  const me = iam.identities.find((i) => i.id === principal);
  return iam.roles.filter((r) => r.global || me?.roles.includes(r.id));
}

export function decide(iam: IAM, principal: string, a: Action): IamResult {
  if (principal === "owner") return { result: "pass", detail: "You asked for this yourself. Roles limit AIs, not you." };
  const me = iam.identities.find((i) => i.id === principal);
  if (!me) return { result: "fail", detail: `${principal} isn't a registered identity, so it can't do anything.` };
  const roles = rolesOf(iam, principal);
  for (const r of roles)
    for (const s of r.statements)
      if (s.effect === "deny" && !miss(s, a)) return { result: "fail", detail: `Denied by "${s.note}" (${r.name}).`, by: by(r, s) };
  let ask: IamResult | null = null;
  for (const r of roles)
    for (const s of r.statements) {
      if (s.effect !== "allow" || miss(s, a)) continue;
      if (s.mode === "auto") return { result: "pass", detail: `Allowed by "${s.note}" (${r.name}).`, by: by(r, s) };
      ask ??= { result: "ask", detail: `"${s.note}" (${r.name}) allows this, but asks you first.`, by: by(r, s) };
    }
  if (ask) return ask;
  const names = roles.filter((r) => !r.global).map((r) => r.name);
  return { result: "fail", detail: names.length ? `None of its roles (${names.join(", ")}) allow ${a.tool}${a.places.length ? ` in ${a.places.join(" and ")}` : ""}.` : `${me.name} has no roles yet, so it can't do anything.` };
}

// ---------------------------------------------------------------- plain words

export function describeStatement(s: Statement): string {
  const where = s.places.length ? ` in ${s.places.map((p) => p.replace("~/", "")).join(", ")}` : "";
  const cond = [s.when?.maxRisk === "read" ? "only looking" : s.when?.maxRisk === "reversible" ? "only things that can be undone" : "", s.when?.tainted === true ? "after reading untrusted content" : s.when?.tainted === false ? "before reading untrusted content" : ""]
    .filter(Boolean)
    .join(", ");
  const verb = s.effect === "deny" ? "Never" : s.mode === "ask" ? "Ask, then" : "Can";
  return `${verb} ${s.tools.join(", ")}${where}${cond ? ` (${cond})` : ""}`;
}

/** Things worth your attention in how AIs are set up. */
export function findings(iam: IAM): { level: "warn" | "info"; text: string; who?: string }[] {
  const out: { level: "warn" | "info"; text: string; who?: string }[] = [];
  for (const i of iam.identities) {
    if (i.kind === "owner") continue;
    const own = iam.roles.filter((r) => i.roles.includes(r.id));
    const broad = own.flatMap((r) => r.statements.map((s) => ({ r, s }))).find(({ s }) => s.effect === "allow" && s.mode === "auto" && s.tools.includes("*") && !s.places.length && s.when?.maxRisk !== "read");
    if (broad) out.push({ level: "warn", who: i.id, text: `${i.name} can change anything without asking (${broad.r.name}).` });
    if (i.proof.startsWith("None")) out.push({ level: "warn", who: i.id, text: `${i.name} never proved who it is.` });
    if (!own.length) out.push({ level: "info", who: i.id, text: `${i.name} has no roles, so it can't do anything yet.` });
  }
  return out;
}
