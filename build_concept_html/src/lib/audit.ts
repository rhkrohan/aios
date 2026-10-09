// Tamper-evident audit log. Each entry's hash covers the previous entry's hash,
// so editing or deleting any entry breaks every hash after it.
// The real broker would use SHA-256 and sign the head; this preview uses a
// fast 64-bit FNV-1a so it can run synchronously in the browser.

import type { AuditEntry } from "./types";

export const GENESIS = "0000000000000000";

export function chainHash(prev: string, payload: string): string {
  let h1 = 0x811c9dc5,
    h2 = 0x01000193 ^ 0x5bd1e995;
  const s = prev + "|" + payload;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export function payloadOf(e: Omit<AuditEntry, "hash" | "prevHash">): string {
  return JSON.stringify([e.seq, e.at, e.principal, e.goal, e.tool, e.target, e.decision, e.outcome, e.reason]);
}

/** Recompute the chain. Returns the first broken sequence number, or null if intact. */
export function verifyChain(entries: AuditEntry[]): number | null {
  const ordered = [...entries].sort((a, b) => a.seq - b.seq);
  let prev = GENESIS;
  for (const e of ordered) {
    if (e.prevHash !== prev || chainHash(prev, payloadOf(e)) !== e.hash) return e.seq;
    prev = e.hash;
  }
  return null;
}
