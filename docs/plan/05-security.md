# 05. Security and trust

## Principle
AI can act freely only because every action is gated, reversible where possible, and visible.

## Permission broker
Separate system service. brain-d cannot bypass it.
| Level | Examples | Rule |
| --- | --- | --- |
| Read | Read a file, list windows, search memory | Allowed, logged |
| Reversible | Open app, move file, change setting, write draft | Ask first time per tool per session, then remember (user can set standing rules) |
| Irreversible | Send, post, delete, pay, shell | Always ask |
| Egress after untrusted input | Network call after reading web pages, emails or unknown files | Always ask (taint tracking) |

## Credentials
- Stored only in the broker (encrypted, root-owned).
- Model and brain-d receive surrogate handles; the broker swaps in real secrets at the boundary.
- "Connect once": one sign-in per service, usable by any AI through the broker.

## Prompt injection defense
- Content from web, email, files and MCP results is data, never instructions (enforced by how it is placed in context and by taint tracking).
- Reflex and tools only choose from predefined options; the model cannot invent actions.
- Irreversible actions always need a human.

## Undo
- Broker snapshots (Btrfs) before irreversible file changes, automatically.
- Deletes go to trash by default; true delete needs explicit approval.
- Each timeline entry offers "undo" where possible.

## Activity timeline
Readable log of every AI action: who asked, which model, which tools, what changed, approvals. Searchable, exportable.

## Isolation
- brain-d runs as the user, never root.
- Adapters that run untrusted code (browser, shell, Wine) run sandboxed (namespaces, Landlock, SELinux).
- Hidden AI desktop is a separate session.

## Threat model (short)
| Threat | Defense |
| --- | --- |
| Malicious web page or email instructs the AI | Taint tracking, approvals, data-not-instructions |
| Malicious MCP server | Wrapper adapters, per-server permissions, egress control |
| Model makes a destructive mistake | Approvals, snapshots, trash-first, undo |
| Stolen credentials via model output | Credentials never in model context |
| Malicious external AI connected via MCP | Same broker rules as local assistant, per-client permissions |
