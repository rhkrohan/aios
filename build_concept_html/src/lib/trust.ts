// Trust levels for AI agents. Trust is earned (tasks that finish and verify)
// and lost (trying things it isn't allowed to, being told no). The owner can
// override it. The broker reads it as one of its checks (lib/policy.ts).

export interface TrustLevel {
  level: 0 | 1 | 2 | 3 | 4;
  name: string;
  can: string;
}

export const TRUST_LEVELS: TrustLevel[] = [
  { level: 0, name: "Unknown", can: "Asks even to look. Can't change or send anything." },
  { level: 1, name: "Limited", can: "Can look. Every change asks, every time. Can't send anything out." },
  { level: 2, name: "Standard", can: "Can look. Changes ask the first time. Sending always asks." },
  { level: 3, name: "Trusted", can: "Can make reversible changes on its own where you allow. Sending always asks." },
  { level: 4, name: "Owner", can: "You. Everything, including these rules." },
];

export const LEVEL_AT = [0, 15, 40, 80]; // score needed for levels 0..3

export interface TrustRecord {
  score: number; // 0..100
  override: number | null;
  history: { at: number; delta: number; why: string }[];
}

export function levelFromScore(score: number): 0 | 1 | 2 | 3 {
  if (score >= LEVEL_AT[3]) return 3;
  if (score >= LEVEL_AT[2]) return 2;
  if (score >= LEVEL_AT[1]) return 1;
  return 0;
}

export function trustLevelOf(trust: Record<string, TrustRecord>, principal: string): TrustLevel["level"] {
  if (principal === "owner") return 4;
  const t = trust[principal];
  if (!t) return 0;
  return (t.override ?? levelFromScore(t.score)) as TrustLevel["level"];
}

export const SEED_TRUST: Record<string, TrustRecord> = {
  "claude-desktop": {
    score: 52,
    override: null,
    history: [
      { at: Date.now() - 3 * 86400e3, delta: 30, why: "You connected it with a pairing code" },
      { at: Date.now() - 2 * 86400e3, delta: 12, why: "6 tasks finished and checked out" },
      { at: Date.now() - 86400e3, delta: 10, why: "Stayed inside its areas for 3 days" },
    ],
  },
  chatgpt: { score: 20, override: null, history: [{ at: Date.now() - 86400e3, delta: 20, why: "New connection starts at Limited" }] },
  phone: { score: 45, override: null, history: [{ at: Date.now() - 5 * 86400e3, delta: 45, why: "Your own device, paired in person" }] },
  custom: { score: 5, override: null, history: [{ at: Date.now() - 3600e3, delta: 5, why: "Unknown app, starts with almost no trust" }] },
};
