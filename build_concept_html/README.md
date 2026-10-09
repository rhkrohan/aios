# SIOS Preview

A clickable, production-quality mock of the desktop, so you can feel how the system will work before the real backend exists.
Nothing here talks to a real OS or model. Every flow is scripted.

## Run it
```
pnpm install
pnpm dev        # http://localhost:3000
```
Press ⌘K (or Ctrl+K / Ctrl+Space) to ask SIOS something.

## What it shows
| Flow | What it demonstrates |
| --- | --- |
| Open my project folder | Memory injection, first-time approval, verify step |
| Clean up my Downloads | Coarse tool (`files.organize`), snapshot first, live Files window, undo |
| Email my team the Q3 notes | `people.resolve` from memory, standing rule for drafts, irreversible send always asks |
| Turn on dark mode | Settings tool that returns its new state (no separate verify) |
| Connect to Home-5G | Credential handle: the AI only sees a placeholder |
| Write a project update | Router picks cloud, asks with a redaction preview; saying no falls back to local |

Running the same task twice uses the saved routine (recipe).
"Allow for this session" is remembered by the broker; see the brain pill menu or Settings > Permissions.

## Where things live
```
src/lib/scenarios.ts   scripted tasks (steps, tool calls, approval copy, effects)
src/lib/engine.ts      simulated brain-d: runs steps and applies the broker rules
src/lib/store.ts       simulated machine state (files, Wi-Fi, theme, windows, runs)
src/lib/brand.ts       product name placeholder
src/components/        shell (top bar, dock, windows), command bar, approval sheet, apps
reference/             earlier static design document (v3)
```
Add a new task by adding a scenario in `scenarios.ts`. Tool names follow `docs/plan/04-tunnel-and-tools.md`.
