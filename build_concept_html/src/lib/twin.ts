// Digital-twin simulation for the System Map. Pure and deterministic: the same
// assumptions always give the same result. It compares SIOS (typed tools, the
// permission broker, verification and the loop guard) against a baseline of an
// AI driving a normal desktop through screenshots and clicks.
//
// Everything here is a MODELED ESTIMATE from the assumptions below, not a
// measurement. The point is to see how the design choices move the numbers.

export interface Assumptions {
  goals: number; // how many goals to simulate
  accuracy: number; // chance the model picks a correct single step (0..1)
  toolMs: number; // one typed tool call
  screenStepMs: number; // one screenshot + think + click on a normal desktop
  cloudPct: number; // share of everyday tasks that need the online model (0..1)
  injectionPct: number; // share of web pages carrying a hidden instruction (0..1)
}

export const DEFAULTS: Assumptions = {
  goals: 100,
  accuracy: 0.92,
  toolMs: 180,
  screenStepMs: 3500,
  cloudPct: 0.2,
  injectionPct: 0.1,
};

export type Kind = "everyday" | "mail" | "writing" | "web" | "agent";

export const MIX: { kind: Kind; label: string; weight: number; siosSteps: number; screenSteps: number; irreversible: number; cloudBias: number }[] = [
  { kind: "everyday", label: "Files and settings", weight: 0.45, siosSteps: 3, screenSteps: 14, irreversible: 0, cloudBias: 0.5 },
  { kind: "mail", label: "Mail", weight: 0.2, siosSteps: 5, screenSteps: 22, irreversible: 1, cloudBias: 1 },
  { kind: "writing", label: "Writing and research", weight: 0.15, siosSteps: 4, screenSteps: 18, irreversible: 0, cloudBias: 3 },
  { kind: "web", label: "Web pages", weight: 0.12, siosSteps: 5, screenSteps: 20, irreversible: 1, cloudBias: 1 },
  { kind: "agent", label: "Other AI apps asking", weight: 0.08, siosSteps: 3, screenSteps: 14, irreversible: 0.5, cloudBias: 1 },
];

/** Fixed modelling constants, shown in the UI so nothing is hidden. */
export const CONSTANTS = {
  typedErrorCut: 0.6, // typed tools + schema checks remove this share of step errors
  retryErrorCut: 0.8, // loop guard retry on the stronger model removes this share
  screenPerception: 0.96, // extra success factor lost to misreading the screen
  screenRecover: 0.5, // chance a screen agent notices and recovers from a bad step
  localModelMs: 450,
  cloudModelMs: 1400,
  verifyMs: 150,
  firstTimeAsk: 0.3, // share of everyday goals that hit a first-time "allow?" prompt
  screenshotMb: 0.18, // one screenshot sent to a vision model
  redactedMb: 0.004, // one redacted text request
  injectionFollow: 0.3, // chance a screen agent follows a hidden instruction it reads
};

export interface SideResult {
  successRate: number;
  avgSeconds: number;
  stepsPerGoal: number;
  localShare: number;
  approvalsPerGoal: number;
  injectionsBlocked: number;
  injectionsSucceeded: number;
  cloudMb: number;
  byKind: Record<Kind, number>; // success rate per task type
}

export interface TwinResult {
  sios: SideResult;
  screen: SideResult;
  goals: number;
  injectionsSeen: number;
}

// mulberry32, seeded from the assumptions so a setting always gives the same run
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(a: Assumptions) {
  const s = JSON.stringify(a);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function pickKind(r: number): (typeof MIX)[number] {
  let acc = 0;
  for (const m of MIX) {
    acc += m.weight;
    if (r < acc) return m;
  }
  return MIX[MIX.length - 1];
}

export function simulate(a: Assumptions): TwinResult {
  const rand = rng(seedOf(a));
  const C = CONSTANTS;
  const pSios = 1 - (1 - a.accuracy) * (1 - C.typedErrorCut);
  const pRetry = 1 - (1 - a.accuracy) * (1 - C.retryErrorCut);
  const pScreen = a.accuracy * C.screenPerception;

  const tally = () => ({ ok: 0, ms: 0, steps: 0, local: 0, approvals: 0, blocked: 0, succeeded: 0, mb: 0, kindOk: {} as Record<Kind, number>, kindN: {} as Record<Kind, number> });
  const S = tally();
  const B = tally();
  let injectionsSeen = 0;

  for (let g = 0; g < a.goals; g++) {
    const m = pickKind(rand());
    const injected = m.kind === "web" && rand() < a.injectionPct;
    if (injected) injectionsSeen++;
    for (const t of [S, B]) t.kindN[m.kind] = (t.kindN[m.kind] ?? 0) + 1;

    // ---- SIOS: typed tools, one retry through the loop guard, broker, verify
    const cloud = rand() < Math.min(1, a.cloudPct * m.cloudBias);
    const modelMs = cloud ? C.cloudModelMs : C.localModelMs;
    let ok = true;
    let steps = 0;
    for (let s = 0; s < m.siosSteps; s++) {
      steps++;
      if (rand() < pSios) continue;
      steps++; // loop guard retries on the stronger model
      if (rand() < pRetry) continue;
      ok = false;
      break;
    }
    S.steps += steps + 1; // + the verify step
    S.ms += steps * (a.toolMs + modelMs) + C.verifyMs;
    if (ok) {
      S.ok++;
      S.kindOk[m.kind] = (S.kindOk[m.kind] ?? 0) + 1;
    }
    if (!cloud) S.local++;
    else S.mb += steps * C.redactedMb;
    S.approvals += (rand() < m.irreversible ? 1 : 0) + (m.kind === "everyday" && rand() < C.firstTimeAsk ? 1 : 0);
    if (injected) S.blocked++; // actions that weren't in your request never pass the broker

    // ---- Baseline: screenshots and clicks on a normal desktop
    let bOk = true;
    let bSteps = 0;
    for (let s = 0; s < m.screenSteps; s++) {
      bSteps++;
      if (rand() < pScreen) continue;
      if (rand() < C.screenRecover) {
        bSteps += 2; // notice, go back, try again
        continue;
      }
      bOk = false;
      break;
    }
    B.steps += bSteps;
    B.ms += bSteps * a.screenStepMs;
    B.mb += bSteps * C.screenshotMb;
    if (bOk) {
      B.ok++;
      B.kindOk[m.kind] = (B.kindOk[m.kind] ?? 0) + 1;
    }
    if (injected) {
      if (rand() < C.injectionFollow) B.succeeded++;
      else B.blocked++;
    }
  }

  const finish = (t: ReturnType<typeof tally>): SideResult => ({
    successRate: t.ok / a.goals,
    avgSeconds: t.ms / a.goals / 1000,
    stepsPerGoal: t.steps / a.goals,
    localShare: t.local / a.goals,
    approvalsPerGoal: t.approvals / a.goals,
    injectionsBlocked: t.blocked,
    injectionsSucceeded: t.succeeded,
    cloudMb: t.mb,
    byKind: Object.fromEntries(MIX.map((m) => [m.kind, t.kindN[m.kind] ? (t.kindOk[m.kind] ?? 0) / t.kindN[m.kind] : 0])) as Record<Kind, number>,
  });

  return { sios: finish(S), screen: finish(B), goals: a.goals, injectionsSeen };
}
