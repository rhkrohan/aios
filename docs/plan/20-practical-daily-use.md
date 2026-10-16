# 20. Practical daily use: the biggest gaps and the order to close them

Status: Approved (2026-10-16, owner: "start implement"). Decisions D95 to D99 (proposed) in `11-decisions.md`. Milestones P-A to P-D in `docs/phases/phase-2.md`.

## Why
A gap audit of the code and a research survey of shipping AI systems (Copilot+ PCs, Apple Intelligence, Gemini, Raycast, Warp, Claude Code, agent browsers, Linux attempts) agree on what makes an AI computer practical and loved:
- boring commands must be instant and never get worse (Microsoft's Settings agent answers in under 500 ms on a tiny local model; Gemini lost trust by breaking timers);
- approvals must be rare and meaningful (people approve about 93% of prompts without reading them, Anthropic);
- users want to find and answer across their stuff, write, and do developer chores, with sources;
- memory must be visible and opt-in (96% of ChatGPT memories were written without the user asking);
- cost must be visible and predictable; local first.

Speed targets (NN/g, Google, Mu): a simple command under 0.5 s; first output of a local answer under 1 s; a multi-step plan shown within about 2 s; long work in the background with progress and Stop.

## The 10 gaps, ranked
1. Every request needs a cloud call: slow, and nothing works offline. Fix: Reflex (common commands matched in code, no model).
2. No first-run setup. Fix: a 5-minute welcome (AI and key with a test, privacy, Claude Code sign-in, GitHub, bring my files).
3. Too many approvals. Fix: one approval per plan with a lease; terminal changes inside a project folder snapshot it first, so they're undoable and ask once per plan.
4. Mail is simulated and says "sent". Fix now: say "saved to the outbox"; then real mail and calendar (C2, IMAP/SMTP and CalDAV first).
5. Multi-step work is slow and brittle. Fix: plan v2 (doc 19, L3).
6. The Ask bar forgets the conversation and shows plain text only. Fix: conversations saved; safe formatting of SIOS's own answers; streaming.
7. No "what did SIOS do and why". Fix: an Activity timeline per goal (plan, why, approvals, Undo) and an undo receipt after each action.
8. It doesn't learn the user. Fix: recipes (L3), memory by meaning, suggestions ranked by what the owner accepts, at quiet moments.
9. Cost is a call count only. Fix: tokens and estimated cost shown, small jobs on a cheaper model, a cap and a fallback provider.
10. Daily basics missing (clipboard, screenshots, media, battery, notes, processes). Fix: L1 waves, then typed git and podman tools.

## Milestones
- **P-A Fast, honest and usable on day one (first).** Gaps 1, 2, 6, 9 and the honest mail message. User notices: fresh install to a first useful result in under 5 minutes; "dark mode" in under 0.5 s with no network; follow-ups survive reopening the bar; Settings shows today's tokens and cost.
- **P-B Daily driver.** Gaps 4, 7, 10, and the snapshot half of 3.
- **P-C Fast multi-step work.** Gaps 5, 3, 8 (doc 19 L3).
- **P-D Adapts and stays local.** The SIOS model by default (L4), memory by meaning, learned suggestions, encrypted backup and restore, translation support.

## Quick wins (P-A, a day or less each)
Honest mail message; live system state for the planner; conversations kept; a "Connect an AI" button on the dead end and default models for every preset; a token and cost meter; a cheaper model for small calls; Reflex v0; routine keys that ignore filler words.

## Traps to avoid
AI pushed into everything; making simple commands worse; remembering silently; approval fatigue; slow screen-clicking agents and unpredictable metered cost.
