# Architecture

## Five layers
1. **Interfaces**: command bar + voice, external AI apps connecting via MCP, phone and custom UIs.
2. **brain-d, the native brain (Rust)**:
   - Orchestrator: plans and runs tasks.
   - Provider router: local or cloud.
   - Reflex: fast decider (see `03-ai-integration.md`).
   - Context engine: Vault.
   - Action layer: AT-SPI accessibility tree, D-Bus, shell, MCP tools.
3. **Models**: llama.cpp server as its own systemd service (models stored in /var). Cloud provider plugins behind one interface.
4. **OS services**: customized KDE Plasma shell, AT-SPI + D-Bus, Wine/Proton + Windows VM, Flatpak apps.
5. **Base**: Fedora Atomic image built with bootc, FROM a Universal Blue KDE image (Aurora first, kinoite-main as alternative). Updates are atomic and can roll back.

## Permission broker
A separate system service. Every action from any model or interface goes through it. It holds credentials so they never enter the model context or brain-d's memory.

| Level | Rule |
|---|---|
| Read | Allowed, logged |
| Reversible action | Ask the first time per tool, then remember |
| Irreversible action (send email, delete, pay) | Always ask |
| Network egress after reading untrusted content | Always ask (taint tracking) |

## Request flow
1. Request arrives.
2. Orchestrator pulls context from Vault.
3. Router asks Reflex: "can local handle it?"
4. If no: ask the user or apply a standing rule.
5. Redact with Vault, send to cloud.
6. Broker approves the resulting action.
7. Action layer executes.
8. Result returns and memory updates.

## Vault (context engine)
An existing local AI memory layer the user co-built at a hackathon. It captures what the user allows, retrieves only what a task needs, and redacts personal details before cloud calls. It must never capture all keyboard input.

## Process ownership
- brain-d: per-user service (D12, Exploring).
- Broker: system-level service (D4).
- llama.cpp server: its own systemd service (D5).

## Component checklist
Every new component must answer: layer, owning process and user, callers and channel (D-Bus, Unix socket, HTTP/MCP), broker approval needed, data location, offline and crash behavior, update and rollback. See `CLAUDE.md`.
