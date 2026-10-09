// The permission broker's decision function. Pure: same state + request, same
// verdict. Every check is recorded so any decision can be explained later.
//
// Order matters. The first failing check blocks; otherwise any "ask" asks;
// otherwise the action is allowed. Mirrors docs/plan/05-security.md and the
// v3 design doc's "live authority decision".

import { BRAND } from "./brand";
import { CATALOG } from "./catalog";
import type { useOS } from "./store";
import { labelsAt, lookup } from "./objects";
import { TRUST_LEVELS, trustLevelOf } from "./trust";
import type { DataSource, GoalScope, Lease, PolicyCheck, PolicyVerdict, ToolCall } from "./types";

type OS = ReturnType<typeof useOS.getState>;

// ---------------------------------------------------------------- principals

export const PRINCIPALS: Record<string, { name: string; kind: "owner" | "app" }> = {
  owner: { name: `You (${BRAND.user})`, kind: "owner" },
  "claude-desktop": { name: "Claude Desktop", kind: "app" },
  chatgpt: { name: "ChatGPT", kind: "app" },
  phone: { name: "Your phone", kind: "app" },
  custom: { name: "Custom app", kind: "app" },
};

export const principalName = (id: string) => PRINCIPALS[id]?.name ?? id;

// ---------------------------------------------------------------- tool facts

const BUILT_IN_PREFIXES = ["files.", "apps.", "settings.", "network.", "people.", "memory.", "browser.", "user.", "system.", "goal."];

export function areaOfTool(name: string): string {
  if (name.startsWith("files.") || name.startsWith("memory.") || name.startsWith("people.")) return "Files";
  if (name.startsWith("apps.")) return "Apps";
  if (name.startsWith("gmail.") || name.startsWith("mail.")) return "Mail";
  if (name.startsWith("settings.")) return "Settings";
  if (name.startsWith("network.")) return "Network";
  if (name.startsWith("browser.")) return "Web";
  return "Services";
}

/** Sends something off this computer. After untrusted input, these always ask. */
export function isEgress(tool: ToolCall) {
  if (tool.permission === "read") return false;
  return /^(gmail\.|slack\.|calendar\.invite|browser\.act|github\.issue\.create|linear\.|notion\.|drive\.|mcp\.)/.test(tool.name);
}

function capabilityFor(tool: string) {
  return CATALOG.find((c) => c.tools.some((t) => t.name === tool));
}

export function targetOf(input: Record<string, unknown>): string {
  const v = [input.path, input.in, input.target, input.to, input.url, input.ssid, input.repo, ...(Array.isArray(input.paths) ? input.paths : [])].find(
    (x) => typeof x === "string" || Array.isArray(x),
  );
  if (Array.isArray(v)) return v.join(", ");
  return typeof v === "string" ? v : "";
}

function scopeRuleFor(state: OS, target: string) {
  if (!target.startsWith("~")) return undefined;
  const key = Object.keys(state.scopeRules)
    .filter((k) => k.startsWith("~") && (target === k || target.startsWith(k + "/")))
    .sort((a, b) => b.length - a.length)[0];
  return key ? { key, rule: state.scopeRules[key] } : undefined;
}

export function leaseValid(l: Lease, now = Date.now()) {
  return (l.expiresAt === null || l.expiresAt > now) && (l.usesLeft === null || l.usesLeft > 0);
}

// ---------------------------------------------------------------- evaluate

export interface PolicyInput {
  principal: string;
  tool: ToolCall;
  goal: string;
  /** False when the model proposed it after reading content, not because you asked. */
  fromUser: boolean;
  tainted: boolean;
  /** Delegated goals: the slice of authority they were handed. */
  scope?: GoalScope;
  /** Data this goal has already read (lineage). */
  dataFrom?: DataSource[];
  budget?: { cents: number; actions: number };
  spent?: { cents: number; actions: number };
}

const FLOW_LABELS = ["Sensitive", "Finance"];

export function evaluate(state: OS, req: PolicyInput): PolicyVerdict {
  const checks: PolicyCheck[] = [];
  let failed = false;
  const add = (c: Omit<PolicyCheck, "result"> & { result: PolicyCheck["result"] }) => {
    if (failed) c = { ...c, result: "skip", detail: "Not checked, an earlier check already blocked this." };
    if (c.result === "fail") failed = true;
    checks.push(c);
  };
  const who = PRINCIPALS[req.principal] ?? { name: req.principal, kind: "app" as const };
  const target = targetOf(req.tool.input);

  // 1. emergency stop
  add({
    id: "stop",
    label: "Is AI allowed to act right now?",
    result: state.aiPaused ? "fail" : "pass",
    detail: state.aiPaused ? "You pressed Stop all AI." : "No emergency stop is on.",
  });

  // 2. the requester
  const paused = state.pausedPrincipals.includes(req.principal);
  add({
    id: "principal",
    label: `Is ${who.name} active?`,
    result: paused ? "fail" : "pass",
    detail: paused ? `You paused ${who.name} in the Security Center.` : who.kind === "owner" ? "You asked for this yourself." : "Connected and not paused.",
  });

  // 2b. trust level: what this requester may even attempt
  const level = trustLevelOf(state.trust, req.principal);
  const lvl = TRUST_LEVELS[level];
  const egressNow = isEgress(req.tool);
  let trustResult: PolicyCheck["result"] = "pass";
  let trustDetail = `${lvl.name} (level ${level}). ${lvl.can}`;
  if (level === 0 && req.tool.permission !== "read") {
    trustResult = "fail";
    trustDetail = `${who.name} is at Unknown trust, so it can't change anything.`;
  } else if (level < 2 && (req.tool.permission === "irreversible" || egressNow)) {
    trustResult = "fail";
    trustDetail = `${who.name} is at ${lvl.name} trust. Sending or deleting needs Standard or higher.`;
  } else if (level === 0) {
    trustResult = "ask";
    trustDetail = `${who.name} is at Unknown trust, so it asks even to look.`;
  } else if (level === 1 && req.tool.permission === "reversible") {
    trustResult = "ask";
    trustDetail = `${who.name} is at Limited trust, so every change asks, every time.`;
  }
  add({ id: "trust", label: `How much is ${who.name} trusted?`, result: trustResult, detail: trustDetail });

  // 3. the tool must exist and be enabled. The model can't invent tools.
  const cap = capabilityFor(req.tool.name);
  const builtIn = BUILT_IN_PREFIXES.some((p) => req.tool.name.startsWith(p));
  const inst = cap ? state.installed[cap.id] : undefined;
  const toolOk = builtIn || (inst && !inst.disabledTools.includes(req.tool.name));
  add({
    id: "tool",
    label: "Is this a real, enabled tool?",
    result: toolOk ? "pass" : "fail",
    detail: toolOk
      ? builtIn
        ? `${req.tool.name} is built in.`
        : `${req.tool.name} comes from ${cap!.name}, which you installed.`
      : cap
        ? inst
          ? `You turned ${req.tool.name} off in the Store.`
          : `${cap.name} isn't installed.`
        : `${req.tool.name} doesn't exist. The AI can only pick from real tools.`,
  });

  // 4. the goal: actions must come from your request, not from content the task read
  add({
    id: "goal",
    label: "Is this part of what you asked?",
    result: req.fromUser ? "pass" : "fail",
    detail: req.fromUser
      ? `It serves "${req.goal}".`
      : "It came from text inside something the task read, not from you. Content is data, never instructions.",
  });

  // 5. what this requester may touch
  if (who.kind === "app") {
    const area = areaOfTool(req.tool.name);
    const areas = state.connectedApps[req.principal]?.areas ?? [];
    const ok = areas.includes(area);
    add({
      id: "area",
      label: `Can ${who.name} use ${area}?`,
      result: ok ? "pass" : "fail",
      detail: ok ? `You allowed ${who.name} to use ${area}.` : `${who.name} can only use ${areas.join(", ") || "nothing"}. Change it in Connected AI apps.`,
    });
  }

  // 6. the place: the Access map, plus the file's own labels (files are objects)
  // Check both the object being acted on (a file by name or path) and the destination.
  const srcArg = typeof req.tool.input.name === "string" ? req.tool.input.name : typeof req.tool.input.path === "string" ? req.tool.input.path : "";
  const src = srcArg ? lookup(state.fs, srcArg) : null;
  const srcPath = src ? `${src.dir}/${src.item.name}` : "";
  const placeTarget = srcPath || target;
  const srcScope = srcPath ? scopeRuleFor(state, srcPath) : undefined;
  const dstScope = target ? scopeRuleFor(state, target) : undefined;
  const scope = srcScope?.rule === "block" ? srcScope : dstScope?.rule === "block" ? dstScope : srcScope ?? dstScope;
  const sensitive =
    req.tool.name.startsWith("files.") &&
    ((!!srcPath && labelsAt(state.fs, srcPath).includes("Sensitive")) || (!!target && labelsAt(state.fs, target).includes("Sensitive")));
  let placeResult: PolicyCheck["result"] = "pass";
  let placeDetail = !scope
    ? "No rule for this place."
    : scope.rule === "block"
      ? `${scope.key} is blocked for every AI.`
      : scope.rule === "allow"
        ? `Changes in ${scope.key} are allowed without asking.`
        : `Changes in ${scope.key} ask first.`;
  if (scope?.rule === "block") placeResult = "fail";
  else if (sensitive && who.kind === "app") {
    placeResult = "fail";
    placeDetail = "This file is labeled Sensitive. Sensitive files are hidden from connected AI apps.";
  } else if (sensitive && req.tool.permission !== "read") {
    placeResult = "ask";
    placeDetail = "This file is labeled Sensitive, so any change asks you, even if you allowed this tool before.";
  } else if (sensitive) placeDetail = "This file is labeled Sensitive. Looking is allowed for your own assistant, and logged.";
  add({
    id: "place",
    label: placeTarget ? `What does your Access map say about ${placeTarget}?` : "Does the Access map cover this?",
    result: placeResult,
    detail: placeDetail,
  });

  // 6b. delegation: a handed-down goal stays inside its slice
  if (req.scope) {
    const sc = req.scope;
    const toolOut = sc.tools && !sc.tools.includes(req.tool.name);
    const paths = [placeTarget, target].filter(Boolean);
    const pathOut = sc.paths && paths.some((p) => !sc.paths!.some((root) => p === root || p.startsWith(root + "/")));
    const egressOut = sc.noEgress && isEgress(req.tool);
    add({
      id: "scope",
      label: "Is this inside what it was handed?",
      result: toolOut || pathOut || egressOut ? "fail" : "pass",
      detail: toolOut
        ? `It was only handed ${sc.tools!.join(", ")}.`
        : pathOut
          ? `It was only handed ${sc.paths!.join(", ")}. ${paths[0]} is outside that.`
          : egressOut
            ? "It was handed this job without permission to send anything out."
            : `Inside its slice: ${[sc.paths?.join(", "), sc.tools?.join(", ")].filter(Boolean).join("; ")}.`,
    });
  } else {
    add({ id: "scope", label: "Is this inside what it was handed?", result: "pass", detail: "Not a handed-down goal, so it has its requester's full permissions." });
  }

  // 7. taint: sending anything out after reading untrusted content always asks
  const egress = isEgress(req.tool);
  add({
    id: "taint",
    label: "Did this task read content it shouldn't trust?",
    result: req.tainted && egress ? "ask" : "pass",
    detail: !req.tainted
      ? "No. Nothing from the web, email or unknown files was read."
      : egress
        ? "Yes, and this sends data out. It always asks after reading untrusted content."
        : "Yes, but this doesn't send anything out.",
  });

  // 7b. data flow: what data would this carry off the computer?
  const sensitiveData = (req.dataFrom ?? []).filter((d) => d.labels.some((l) => FLOW_LABELS.includes(l)));
  const flowOut = egress && sensitiveData.length > 0;
  add({
    id: "flow",
    label: "What data would leave this computer?",
    result: flowOut ? (who.kind === "app" ? "fail" : "ask") : "pass",
    detail: !egress
      ? "Nothing leaves this computer."
      : !sensitiveData.length
        ? "Nothing labeled Sensitive or Finance."
        : `It carries data from ${sensitiveData.map((d) => `${d.name} (${d.labels.filter((l) => FLOW_LABELS.includes(l)).join(", ")})`).join(", ")}.${who.kind === "app" ? " Connected apps can't send that out." : " You decide if that may leave."}`,
  });

  // 7c. budget: goals can't spend without limit
  if (req.budget) {
    const sp = req.spent ?? { cents: 0, actions: 0 };
    const over = sp.actions >= req.budget.actions || sp.cents >= req.budget.cents;
    add({
      id: "budget",
      label: "Is the goal within its budget?",
      result: over ? "ask" : "pass",
      detail: over
        ? `Over budget: ${sp.actions} of ${req.budget.actions} actions, ${sp.cents} of ${req.budget.cents} cents. Going further needs your OK.`
        : `${sp.actions} of ${req.budget.actions} actions and ${sp.cents} of ${req.budget.cents} cents used.`,
    });
  } else add({ id: "budget", label: "Is the goal within its budget?", result: "pass", detail: "No budget set for this goal." });

  // 8. permission level, leases, standing rules
  const now = Date.now();
  const lease = state.leases.find((l) => l.tool === req.tool.name && l.principal === req.principal && leaseValid(l, now));
  const standing = state.standingRules.includes(req.tool.name) && req.principal === "owner";
  let levelResult: PolicyCheck["result"] = "pass";
  let levelDetail = "";
  if (req.tool.permission === "read") levelDetail = "Just looking. Always allowed and logged.";
  else if (req.tool.permission === "irreversible") {
    levelResult = "ask";
    levelDetail = "Can't be undone, so it always asks. No rule can change that.";
  } else if (level === 1) {
    levelResult = "ask";
    levelDetail = "Limited trust: permissions don't carry over, so it asks again.";
  } else if (lease) levelDetail = lease.kind === "hour" ? "You allowed this for an hour." : lease.kind === "session" ? "You allowed this for this session." : "You allowed this.";
  else if (standing) levelDetail = "Your standing rule allows this.";
  else if (scope?.rule === "allow") levelDetail = "Your Access map allows changes here.";
  else if (level === 3 && scope?.rule !== "ask") levelDetail = `${who.name} is Trusted, so reversible changes don't need to ask here.`;
  else {
    levelResult = "ask";
    levelDetail = "A change, and you haven't allowed it yet this session.";
  }
  add({ id: "level", label: "Does this need your OK?", result: levelResult, detail: levelDetail });

  const fail = checks.find((c) => c.result === "fail");
  if (fail) return { decision: "block", reason: fail.detail, checks };
  const asks = checks.filter((c) => c.result === "ask");
  if (asks.length) {
    const askKind = req.tool.permission === "irreversible" ? "irreversible" : asks.some((c) => c.id === "taint") ? "tainted" : "reversible";
    return { decision: "ask", askKind, reason: asks[asks.length - 1].detail, checks };
  }
  return { decision: "allow", reason: checks[checks.length - 1].detail, checks, leaseId: lease?.id };
}
