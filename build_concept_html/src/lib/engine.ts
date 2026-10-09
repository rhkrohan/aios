"use client";

// The simulated brain-d. It plays a scenario's steps in the order from
// docs/plan/03-brain.md. Every tool call goes through the permission broker
// (lib/policy.ts), which decides allow / ask / block with a full trace; each
// decision is written to the tamper-evident audit log (lib/audit.ts).
// Nothing here talks to a real backend.

import { SCENARIOS, matchScenario, type Plan, type StepSpec } from "./scenarios";
import { execute, plannerState } from "./executors";
import { liveTool, type LivePlan } from "./livetools";
import { runLiveMachine, undoLiveGoal } from "./livemachine";
import { deriveFrom, lookup } from "./objects";
import { uid, useOS } from "./store";
import { evaluate, principalName, targetOf } from "./policy";
import type { ApprovalAnswer, BrokerDecision, DataSource, FileItem, GoalScope, PolicyVerdict, Run, Step } from "./types";

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

export interface RunOptions {
  principal?: string;
  /** Run a specific scenario instead of matching the text. */
  scenarioId?: string;
  /** Delegation: the parent goal, and the slice of authority handed down. */
  parentId?: string;
  scope?: GoalScope;
  budget?: { cents: number; actions: number };
  /** Files the request is about (dropped on the orb). Paths. */
  files?: string[];
}

export async function runRequest(text: string, opts: RunOptions = {}): Promise<string> {
  const trimmed = text.trim();
  const principal = opts.principal ?? "owner";
  if (os().aiPaused) {
    os().pushToast({ title: "The assistant is paused", body: "You stopped all AI activity. Resume it in the Security Center.", tone: "warn" });
    return "";
  }
  // Live machine: your own requests go to the real model on real files, through capd.
  if (os().settings.liveMachine && !opts.scenarioId && !opts.parentId && principal === "owner") return runLiveMachine(trimmed);
  const scenario = opts.scenarioId ? (SCENARIOS.find((s) => s.id === opts.scenarioId) ?? null) : matchScenario(trimmed);
  const runId = uid("run");

  if (!scenario || os().settings.liveAll) {
    if (os().settings.liveAi) return runLive(runId, trimmed, principal, opts.files);
    await runFallback(runId, trimmed, principal);
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
    principal,
    tainted: false,
    parentId: opts.parentId,
    scope: opts.scope,
    budget: opts.budget ?? scenario.budget,
    spent: { cents: 0, actions: 0 },
    dataFrom: [],
  };
  os().addRun(run);
  if (!opts.parentId) os().setFocusedRun(runId);

  return executeSteps(run, specs, plan, { principal, trimmed, usedRecipe, scenarioId: scenario.id });
}

interface ExecCtx {
  principal: string;
  trimmed: string;
  usedRecipe: boolean;
  scenarioId: string | null;
}

/** The shared step loop: every step of every goal, scripted or live, passes through here and the broker. */
async function executeSteps(run: Run, specs: StepSpec[], plan: Plan, ctx: ExecCtx): Promise<string> {
  const runId = run.id;
  const { principal, trimmed, usedRecipe } = ctx;
  const offset = run.steps.length - specs.length;
  const undos: (() => void)[] = [];
  let wentLocalInstead = false;

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const step = run.steps[offset + i];
    if (os().aiPaused) {
      finish(runId, "stopped", undos, "Stopped by the emergency stop. Nothing else was changed.");
      return runId;
    }
    if (os().cancelledRuns.includes(runId)) {
      finish(runId, "stopped", undos, "Stopped by you in Goals. Nothing else was changed.");
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
        os().updateRun(runId, (r) => ({ ...r, route: "cloud", spent: { cents: (r.spent?.cents ?? 0) + 18, actions: r.spent?.actions ?? 0 } }));
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

    // ---- tool: the permission broker decides (lib/policy.ts) ----
    let decision: BrokerDecision | undefined;
    if (spec.tool) {
      // Coordination: if someone else is using the file, wait for them.
      const lockPath = fileTargetPath(spec.tool.input);
      const held = lockPath ? os().locks[lockPath] : undefined;
      if (lockPath && held && held.holder !== principal) {
        os().updateRun(runId, (r) => ({ ...r, waitingOn: `${held.holder} is using ${lockPath.split("/").pop()}` }));
        os().updateStep(runId, step.id, { detail: `Waiting its turn: ${held.holder} is using ${lockPath.split("/").pop()}.` });
        let waited = 0;
        while (os().locks[lockPath] && waited < 60000) {
          await sleep(200);
          waited += 200;
        }
        os().updateRun(runId, (r) => ({ ...r, waitingOn: undefined }));
        os().updateStep(runId, step.id, { detail: `Waited ${(waited / 1000).toFixed(1)}s for the file to be free.` });
      }
      const cur = os().runs.find((r) => r.id === runId)!;
      const input = {
        principal,
        tool: spec.tool,
        goal: trimmed,
        fromUser: spec.fromUser !== false,
        tainted: !!cur.tainted,
        scope: cur.scope,
        dataFrom: cur.dataFrom,
        budget: cur.budget,
        spent: cur.spent,
      };
      const verdict = evaluate(os(), input);
      const audit = (outcome: "allowed" | "asked-yes" | "asked-no" | "blocked", reason = verdict.reason) =>
        os().appendAudit({
          principal,
          goal: trimmed,
          tool: spec.tool!.name,
          target: targetOf(spec.tool!.input) || trimmed,
          decision: verdict.decision,
          outcome,
          reason,
          checks: verdict.checks,
        });
      os().updateStep(runId, step.id, { checks: verdict.checks });

      if (verdict.decision === "block") {
        audit("blocked");
        if (principal !== "owner") {
          const failed = verdict.checks.find((c) => c.result === "fail");
          if (failed && ["area", "goal", "tool", "place", "scope", "flow"].includes(failed.id)) os().adjustTrust(principal, -10, `Tried ${spec.tool.name}: ${failed.detail}`);
        }
        await sleep(Math.min(spec.ms, 500));
        os().updateStep(runId, step.id, {
          status: "blocked",
          broker: "blocked",
          doneLabel: spec.blockedLabel ?? "Blocked",
          detail: verdict.reason,
          ms: Date.now() - t0,
        });
        // An action the task invented from content is dropped; the task carries on.
        if (spec.fromUser === false || spec.optional) continue;
        finish(runId, "stopped", undos, `Stopped. ${verdict.reason} Nothing was changed.`);
        return runId;
      }

      if (verdict.decision === "ask") {
        const kind = verdict.askKind === "reversible" ? "reversible" : "irreversible";
        const answer = await ask(runId, spec, kind, verdict);
        if (answer === "deny") {
          audit("asked-no", "You said no.");
          // stopping a goal from the Goals app isn't the agent's fault, so it costs no trust
          if (principal !== "owner" && !os().cancelledRuns.includes(runId)) os().adjustTrust(principal, -3, `You said no to ${spec.tool.name}`);
          os().updateStep(runId, step.id, { status: "blocked", broker: "denied", doneLabel: "You said no", ms: Date.now() - t0 });
          finish(runId, "stopped", undos, "Stopped. Nothing else was changed.");
          return runId;
        }
        audit("asked-yes", answer === "approve" ? "You approved it." : "You allowed it.");
        if (answer === "session") {
          os().grant(spec.tool.name);
          os().addLease({ tool: spec.tool.name, principal, kind: "session", expiresAt: null, usesLeft: null, goal: trimmed });
          decision = "asked-session";
        } else if (answer === "hour") {
          os().addLease({ tool: spec.tool.name, principal, kind: "hour", expiresAt: Date.now() + 3600e3, usesLeft: null, goal: trimmed });
          decision = "asked-session";
        } else decision = answer === "approve" ? "asked-approved" : "asked-once";
      } else {
        audit("allowed");
        if (verdict.leaseId) os().consumeLease(verdict.leaseId);
        decision = spec.tool.permission === "read" ? "allowed" : "remembered";
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

    // Delegation: start the sub-goal and wait for it. Its data lineage flows back up.
    if (spec.runChild) {
      const childId = await spec.runChild(runId);
      const child = os().runs.find((r) => r.id === childId);
      if (child) {
        os().updateRun(runId, (r) => ({
          ...r,
          dataFrom: mergeData(r.dataFrom, child.dataFrom),
          tainted: r.tainted || child.tainted,
          spent: { cents: (r.spent?.cents ?? 0) + (child.spent?.cents ?? 0), actions: (r.spent?.actions ?? 0) + (child.spent?.actions ?? 0) },
        }));
        if (child.status !== "done") {
          // A sub-goal that didn't finish stops the whole goal: nothing downstream runs on missing inputs.
          os().updateStep(runId, step.id, { status: "blocked", broker: "blocked", doneLabel: "A sub-goal didn't finish", detail: child.summary, ms: Date.now() - t0 });
          finish(runId, "stopped", undos, `Stopped: a sub-goal didn't finish. ${child.summary ?? ""}`);
          return runId;
        }
        os().updateStep(runId, step.id, { detail: child.summary });
      }
    }

    if (spec.liveExec) {
      const r = spec.liveExec();
      if (r.fail) {
        os().updateStep(runId, step.id, { status: "blocked", broker: decision, doneLabel: "Couldn't do this step", detail: r.fail, ms: Date.now() - t0 });
        finish(runId, "failed", undos, `Stopped partway: ${r.fail}. Steps already done can be undone.`);
        return runId;
      }
      if (r.undo) undos.push(r.undo);
      if (spec.tool) os().updateStep(runId, step.id, { tool: { ...spec.tool, output: r.output } });
    }
    if (spec.effect) {
      const undo = spec.effect();
      if (undo) undos.push(undo);
    }
    if (spec.taints) os().updateRun(runId, (r) => ({ ...r, tainted: true }));
    // Lineage: remember every file this goal read, with its labels.
    if (spec.tool && spec.tool.permission === "read" && spec.tool.name.startsWith("files.read")) {
      const paths = [spec.tool.input.path, spec.tool.input.name, ...(Array.isArray(spec.tool.input.paths) ? spec.tool.input.paths : [])].filter((x): x is string => typeof x === "string");
      const sources: DataSource[] = [];
      for (const p of paths) {
        const hit = lookup(os().fs, p);
        if (hit) sources.push({ name: hit.item.name, path: `${hit.dir}/${hit.item.name}`, labels: hit.item.labels ?? [], untrusted: hit.item.trust === "untrusted" });
      }
      if (sources.length) os().updateRun(runId, (r) => ({ ...r, dataFrom: mergeData(r.dataFrom, sources) }));
    }
    // Lineage: a file this goal writes is made from what the goal read, unless the step said otherwise.
    if (spec.tool?.name === "files.write") {
      const hit = lookup(os().fs, String(spec.tool.input.path ?? spec.tool.input.name ?? ""));
      const read = os().runs.find((r) => r.id === runId)?.dataFrom ?? [];
      if (hit && !hit.item.from?.length && read.length) {
        const sources = read.map((d) => lookup(os().fs, d.path)?.item).filter((x): x is FileItem => !!x);
        os().setFs(deriveFrom(os().fs, hit.dir, hit.item.id, sources));
      }
    }
    // Spend: every action that ran counts; thinking with an online model costs a little.
    if (spec.tool) os().updateRun(runId, (r) => ({ ...r, spent: { cents: r.spent?.cents ?? 0, actions: (r.spent?.actions ?? 0) + 1 } }));
    if (spec.kind === "think" && os().runs.find((r) => r.id === runId)?.route === "cloud")
      os().updateRun(runId, (r) => ({ ...r, spent: { cents: (r.spent?.cents ?? 0) + 9, actions: r.spent?.actions ?? 0 } }));
    // Files are objects: opening an untrusted file (web download, email attachment) taints the task too.
    if (spec.tool?.name === "files.read") {
      const hit = lookup(os().fs, String(spec.tool.input.path ?? spec.tool.input.name ?? ""));
      if (hit?.item.trust === "untrusted") {
        os().updateRun(runId, (r) => ({ ...r, tainted: true }));
        os().updateStep(runId, step.id, { detail: `${hit.item.name} came from ${hit.item.origin?.by === "email" ? "an email" : "the web"}, so this task is now marked as having read untrusted content.` });
      }
    }
    os().updateStep(runId, step.id, { status: "done", broker: decision, ms: Date.now() - t0 });
  }

  const summary = wentLocalInstead && plan.localSummary ? plan.localSummary : plan.summary;
  if (plan.fail) {
    finish(runId, "failed", [], summary);
    return runId;
  }
  finish(runId, "done", undos, summary);
  if (principal !== "owner") os().adjustTrust(principal, 4, `Finished "${trimmed}" and it checked out`);
  if (ctx.scenarioId && !usedRecipe && !SCENARIOS.find((s) => s.id === ctx.scenarioId)?.noRecipe && undos.length + specs.filter((s) => s.tool).length > 1) {
    os().saveRecipe(ctx.scenarioId);
    os().updateRun(runId, (r) => ({ ...r, savedRecipe: true }));
  }
  return runId;
}

async function ask(runId: string, spec: StepSpec, kind: "reversible" | "irreversible" | "cloud", verdict?: PolicyVerdict): Promise<ApprovalAnswer> {
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
    principalName: run.principal !== "owner" ? principalName(run.principal) : undefined,
    tainted: verdict?.askKind === "tainted" || (!!run.tainted && verdict?.checks.some((c) => c.id === "taint" && c.result === "ask")),
    checks: verdict?.checks,
    carries:
      verdict?.checks.some((c) => c.id === "flow" && c.result !== "pass")
        ? (run.dataFrom ?? []).filter((d) => d.labels.some((l) => l === "Sensitive" || l === "Finance"))
        : undefined,
  });
  os().updateRun(runId, (r) => ({ ...r, status: "running" }));
  return answer;
}

function finish(runId: string, status: Run["status"], undos: (() => void)[], summary: string) {
  if (undos.length) undoRegistry.set(runId, undos);
  os().updateRun(runId, (r) => ({ ...r, status, summary, endedAt: Date.now(), undoable: undos.length > 0 }));
  const s = os();
  const run = s.runs.find((r) => r.id === runId)!;
  // Sub-goals report through their parent goal.
  if (run.parentId) return;
  // The task pill shows the latest run's result, so only pop a toast for older
  // or background runs. Everything still lands in the notification history.
  if (s.runs.find((r) => !r.parentId)?.id === runId) {
    useOS.setState({
      notifications: [{ id: uid("note"), title: status === "done" ? summary : status === "stopped" ? "Task stopped" : "Couldn't finish", body: status === "done" ? undefined : summary, tone: (status === "done" ? "ok" : "warn") as "ok" | "warn", at: Date.now() }, ...s.notifications].slice(0, 30),
    });
  } else if (!s.commandOpen || s.focusedRunId !== runId) {
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
  if (os().runs.find((r) => r.id === runId)?.liveGoal) {
    void undoLiveGoal(runId);
    return;
  }
  // undo the sub-goals too, newest first
  for (const child of os().runs.filter((r) => r.parentId === runId)) {
    const cu = undoRegistry.get(child.id);
    if (cu) [...cu].reverse().forEach((u) => u());
    undoRegistry.delete(child.id);
  }
  const undos = undoRegistry.get(runId);
  if (!undos) return;
  [...undos].reverse().forEach((u) => u());
  undoRegistry.delete(runId);
  os().updateRun(runId, (r) => ({ ...r, undone: true, undoable: false }));
  const run = os().runs.find((r) => r.id === runId);
  os().pushToast({ title: "Undone", body: run ? `"${run.request}" was reversed.` : undefined, tone: "info" });
}

async function runFallback(runId: string, text: string, principal: string) {
  const run: Run = {
    id: runId,
    request: text,
    scenarioId: "unknown",
    area: "system",
    status: "running",
    route: "local",
    startedAt: Date.now(),
    undoable: false,
    principal,
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

// ---------------------------------------------------------------- live planning

const LIVE_ERRORS: Record<string, string> = {
  not_configured: "Live AI isn't connected yet. Add an OpenAI or Claude key to .env.local and restart (see HOW-SIOS-WORKS.md).",
  bad_key: "The AI key was rejected. Check the key in .env.local.",
  rate_limited: "The AI provider is busy. Try again in a moment.",
  refused: "The model declined this request.",
};

async function runLive(runId: string, text: string, principal: string, files: string[] = []): Promise<string> {
  const planning: Step[] = [
    { id: "p0", kind: "context", label: "Checking what I know", doneLabel: "Shared a safe summary of this computer with the planner", detail: "File names, theme, Wi-Fi and installed services. No file contents, no passwords.", status: "active" },
    { id: "p1", kind: "think", label: "Asking the AI for a plan", doneLabel: "Got a plan", status: "pending" },
  ];
  const run: Run = { id: runId, request: text, scenarioId: "live", area: "system", status: "running", route: "cloud", steps: planning, startedAt: Date.now(), undoable: false, principal, tainted: false };
  os().addRun(run);
  os().setFocusedRun(runId);
  await sleep(400);
  os().updateStep(runId, "p0", { status: "done", ms: 400 });
  os().updateStep(runId, "p1", { status: "active" });
  const t0 = Date.now();

  let plan: LivePlan | null = null;
  let who = "";
  try {
    const res = await fetch("/api/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request: files.length ? `${text}\n\nThe files this is about: ${files.join(", ")}` : text, state: plannerState() }) });
    const data = await res.json();
    if (data.plan) {
      plan = data.plan as LivePlan;
      who = `${data.provider} (${data.model})`;
      os().updateRun(runId, (r) => ({ ...r, plannedBy: who }));
    } else {
      os().updateStep(runId, "p1", { status: "blocked", doneLabel: "No plan", detail: LIVE_ERRORS[data.error] ?? data.message ?? "The planner failed.", ms: Date.now() - t0 });
      finish(runId, "failed", [], LIVE_ERRORS[data.error] ?? `The planner failed: ${data.message ?? data.error}`);
      return runId;
    }
  } catch {
    finish(runId, "failed", [], "Couldn't reach the planner. Is the app running with `pnpm dev`?");
    return runId;
  }

  os().updateStep(runId, "p1", {
    status: "done",
    doneLabel: plan.steps.length ? `${who} proposed ${plan.steps.length} ${plan.steps.length === 1 ? "step" : "steps"}` : `${who} found no way to do this`,
    detail: plan.understood,
    chips: [`area: ${plan.area}`, `risk ${plan.risk.toFixed(2)}`, "the broker checks every step"],
    ms: Date.now() - t0,
  });
  if (!plan.steps.length) {
    finish(runId, "failed", [], plan.cannot || "The available tools can't do this yet.");
    return runId;
  }

  // Turn the proposal into steps. Permission and adapter come from OUR registry,
  // never from the model. Unknown tools get no executor; the broker blocks them.
  const specs: StepSpec[] = plan.steps.map((st) => {
    const def = liveTool(st.tool);
    const args = Object.fromEntries(st.args.map((a) => [a.name, a.value]));
    const permission = def?.permission ?? "reversible";
    return {
      kind: "tool",
      label: st.label,
      doneLabel: st.done_label,
      ms: 600,
      taints: def?.taints,
      tool: { name: st.tool, adapter: def?.adapter ?? "none", permission, input: args },
      approval: {
        title: permission === "irreversible" ? "Allow this? It can't be undone." : `Let ${principal === "owner" ? "SIOS" : "this app"} do this?`,
        changes: [{ text: st.label, sub: `${st.tool}(${st.args.map((a) => `${a.name}: ${a.value}`).join(", ")})` }],
        primaryLabel: permission === "irreversible" ? "Allow" : undefined,
      },
      liveExec: () => execute(st.tool, args, text),
    };
  });
  const verify: StepSpec = { kind: "verify", label: "Checking it worked", doneLabel: "Every step reported back", ms: 300 };
  const all = [...specs, verify];
  os().updateRun(runId, (r) => ({ ...r, area: plan!.area, steps: [...r.steps, ...all.map((sp, i) => ({ ...toStep(sp, i), id: `l${i}` }))] }));
  const current = os().runs.find((r) => r.id === runId)!;
  return executeSteps(current, all, { steps: all, summary: plan.summary }, { principal, trimmed: text, usedRecipe: false, scenarioId: null });
}

// ---------------------------------------------------------------- helpers for the car

function fileTargetPath(input: Record<string, unknown>): string | null {
  const arg = [input.path, input.name].find((x) => typeof x === "string") as string | undefined;
  if (!arg) return null;
  const hit = lookup(os().fs, arg);
  return hit ? `${hit.dir}/${hit.item.name}` : null;
}

function mergeData(a: DataSource[] = [], b: DataSource[] = []): DataSource[] {
  const out = [...a];
  for (const d of b) if (!out.some((x) => x.path === d.path)) out.push(d);
  return out;
}
