"use client";

// The simulated brain-d. It plays a scenario's steps in the order from
// docs/plan/03-brain.md, and applies the broker rules from 05-security.md for real:
//   read          -> allowed and logged
//   reversible    -> ask the first time per tool per session, then remembered
//   irreversible  -> always ask
//   cloud route   -> ask (unless the user turned that off), with redaction preview
// Nothing here talks to a real backend.

import { matchScenario, type StepSpec } from "./scenarios";
import { uid, useOS } from "./store";
import type { ApprovalAnswer, BrokerDecision, Run, Step } from "./types";

const SPEED = 1;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms * SPEED));
const os = () => useOS.getState();

/** Undo functions live outside the store: they are closures, not data. */
const undoRegistry = new Map<string, (() => void)[]>();

function toStep(spec: StepSpec, i: number): Step {
  return {
    id: `s${i}`,
    kind: spec.kind,
    label: spec.label,
    doneLabel: spec.doneLabel,
    detail: spec.detail,
    chips: spec.chips,
    tool: spec.tool,
    status: "pending",
  };
}

export async function runRequest(text: string): Promise<string> {
  const trimmed = text.trim();
  if (os().aiPaused) {
    os().pushToast({ title: "The assistant is paused", body: "You stopped all AI activity. Resume it in the Security Center.", tone: "warn" });
    return "";
  }
  const scenario = matchScenario(trimmed);
  const runId = uid("run");

  if (!scenario) {
    await runFallback(runId, trimmed);
    return runId;
  }

  const usedRecipe = os().recipes.includes(scenario.id);
  const plan = scenario.build({ os: os(), text: trimmed.toLowerCase(), usedRecipe });
  // A saved recipe skips context lookup and planning: faster, no big-model planning.
  const specs = usedRecipe ? plan.steps.filter((s) => !(s.kind === "think" && s.label.startsWith("Planning"))) : plan.steps;

  const run: Run = {
    id: runId,
    request: trimmed,
    scenarioId: scenario.id,
    area: scenario.area,
    status: "running",
    route: "local",
    steps: specs.map(toStep),
    startedAt: Date.now(),
    undoable: false,
    usedRecipe,
    irreversibleNote: plan.irreversibleNote,
    resultAction: plan.resultAction,
  };
  os().addRun(run);
  os().setFocusedRun(runId);

  const undos: (() => void)[] = [];
  let wentLocalInstead = false;

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const step = run.steps[i];
    if (os().aiPaused) {
      finish(runId, "stopped", undos, "Stopped by the emergency stop. Nothing else was changed.");
      return runId;
    }
    const t0 = Date.now();
    os().updateStep(runId, step.id, { status: "active" });

    // ---- route: maybe ask before using the cloud ----
    if (spec.kind === "route" && spec.routeTo === "cloud") {
      let useCloud = true;
      if (os().settings.askBeforeCloud && spec.approval) {
        await sleep(spec.ms);
        const answer = await ask(runId, spec, "cloud");
        useCloud = answer !== "deny";
      }
      if (useCloud) {
        os().updateRun(runId, (r) => ({ ...r, route: "cloud" }));
        os().updateStep(runId, step.id, { status: "done", broker: "asked-approved", ms: Date.now() - t0 });
      } else {
        wentLocalInstead = true;
        os().updateStep(runId, step.id, {
          status: "done",
          broker: "denied",
          doneLabel: spec.onDenyLabel ?? "Staying on this computer",
          detail: "You chose to keep this private. The result may be shorter.",
          ms: Date.now() - t0,
        });
      }
      continue;
    }

    // ---- tool: the broker decides ----
    let decision: BrokerDecision | undefined;
    if (spec.tool && scopeRuleFor(spec.tool.input) === "block") {
      os().updateStep(runId, step.id, {
        status: "blocked",
        broker: "blocked",
        doneLabel: "Blocked by your Access map",
        detail: "This place is blocked for every AI in the Security Center.",
        ms: Date.now() - t0,
      });
      finish(runId, "stopped", undos, "Stopped. That place is blocked in your Access map, so nothing was changed.");
      return runId;
    }
    if (spec.tool) {
      decision = await brokerDecide(runId, spec);
      if (decision === "denied") {
        os().updateStep(runId, step.id, { status: "blocked", broker: "denied", doneLabel: "You said no", ms: Date.now() - t0 });
        finish(runId, "stopped", undos, "Stopped. Nothing else was changed.");
        return runId;
      }
      os().updateStep(runId, step.id, { status: "active", broker: decision });
      if (spec.tool.snapshot) {
        const snap = "snap-" + Math.random().toString(16).slice(2, 6);
        os().updateRun(runId, (r) => ({ ...r, snapshotId: snap }));
        os().updateStep(runId, step.id, { detail: `Snapshot ${snap} saved by the system before any change` });
        await sleep(350);
      }
    }

    await sleep(spec.ms);

    if (spec.effect) {
      const undo = spec.effect();
      if (undo) undos.push(undo);
    }
    os().updateStep(runId, step.id, { status: "done", broker: decision, ms: Date.now() - t0 });
  }

  const summary = wentLocalInstead && plan.localSummary ? plan.localSummary : plan.summary;
  if (plan.fail) {
    finish(runId, "failed", [], summary);
    return runId;
  }
  finish(runId, "done", undos, summary);
  if (!usedRecipe && undos.length + specs.filter((s) => s.tool).length > 1) {
    os().saveRecipe(scenario.id);
    os().updateRun(runId, (r) => ({ ...r, savedRecipe: true }));
  }
  return runId;
}

/** The Access map rule for the place a tool touches: longest matching path wins. */
function scopeRuleFor(input: Record<string, unknown>) {
  const target = [input.path, input.in, input.target, ...(Array.isArray(input.paths) ? input.paths : [])].find((v) => typeof v === "string") as string | undefined;
  if (!target) return undefined;
  const rules = os().scopeRules;
  const key = Object.keys(rules)
    .filter((k) => k.startsWith("~") && (target === k || target.startsWith(k + "/")))
    .sort((a, b) => b.length - a.length)[0];
  return key ? rules[key] : undefined;
}

async function brokerDecide(runId: string, spec: StepSpec): Promise<BrokerDecision> {
  const tool = spec.tool!;
  const s = os();
  if (tool.permission === "read") return "allowed";
  if (tool.permission === "reversible") {
    if (s.standingRules.includes(tool.name) || s.grants.includes(tool.name) || scopeRuleFor(tool.input) === "allow") return "remembered";
    const a = await ask(runId, spec, "reversible");
    if (a === "deny") return "denied";
    if (a === "session") {
      os().grant(tool.name);
      return "asked-session";
    }
    return "asked-once";
  }
  const a = await ask(runId, spec, "irreversible");
  return a === "deny" ? "denied" : "asked-approved";
}

async function ask(runId: string, spec: StepSpec, kind: "reversible" | "irreversible" | "cloud"): Promise<ApprovalAnswer> {
  const run = os().runs.find((r) => r.id === runId)!;
  os().updateRun(runId, (r) => ({ ...r, status: "waiting" }));
  const answer = await os().askApproval({
    id: uid("ap"),
    runId,
    kind,
    area: run.area,
    request: run.request,
    tool: spec.tool,
    title: spec.approval?.title ?? "Allow this action?",
    changes: spec.approval?.changes ?? [{ text: spec.label }],
    preview: spec.approval?.preview,
    scope: spec.approval?.scope,
    primaryLabel: spec.approval?.primaryLabel,
    denyLabel: spec.approval?.denyLabel,
  });
  os().updateRun(runId, (r) => ({ ...r, status: "running" }));
  return answer;
}

function finish(runId: string, status: Run["status"], undos: (() => void)[], summary: string) {
  if (undos.length) undoRegistry.set(runId, undos);
  os().updateRun(runId, (r) => ({ ...r, status, summary, endedAt: Date.now(), undoable: undos.length > 0 }));
  const s = os();
  const run = s.runs.find((r) => r.id === runId)!;
  // Tell the user if they are not already watching this run.
  if (!s.commandOpen || s.focusedRunId !== runId) {
    s.pushToast({
      title: status === "done" ? summary : status === "stopped" ? "Task stopped" : "Couldn't finish",
      body: status === "done" ? undefined : summary,
      tone: status === "done" ? "ok" : "warn",
      action: run.resultAction,
      undoRunId: undos.length ? runId : undefined,
    });
  }
}

export function undoRun(runId: string) {
  const undos = undoRegistry.get(runId);
  if (!undos) return;
  [...undos].reverse().forEach((u) => u());
  undoRegistry.delete(runId);
  os().updateRun(runId, (r) => ({ ...r, undone: true, undoable: false }));
  const run = os().runs.find((r) => r.id === runId);
  os().pushToast({ title: "Undone", body: run ? `"${run.request}" was reversed.` : undefined, tone: "info" });
}

async function runFallback(runId: string, text: string) {
  const run: Run = {
    id: runId,
    request: text,
    scenarioId: "unknown",
    area: "system",
    status: "running",
    route: "local",
    startedAt: Date.now(),
    undoable: false,
    steps: [
      { id: "s0", kind: "context", label: "Checking what I know", doneLabel: "Nothing relevant in memory", status: "pending" },
      {
        id: "s1",
        kind: "reflex",
        label: "Understanding the request",
        doneLabel: "No matching tools in this preview",
        chips: ["area: unknown 0.31"],
        status: "pending",
      },
    ],
  };
  os().addRun(run);
  os().setFocusedRun(runId);
  for (const st of run.steps) {
    os().updateStep(runId, st.id, { status: "active" });
    await sleep(500);
    os().updateStep(runId, st.id, { status: "done", ms: 500 });
  }
  finish(runId, "failed", [], "This preview only knows a few tasks yet. Try one of the suggestions.");
}
