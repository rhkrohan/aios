# 02. System architecture

## Layers (top to bottom)
1. Interfaces: command bar + voice, external AI apps via MCP, phone and custom UIs.
2. brain-d (the native brain): orchestrator, router, Reflex, context injection, recipes.
3. The tunnel: tool registry + adapters (MCP, D-Bus, browser via CDP, accessibility, shell as last resort), shared types.
4. Guardrails: permission broker (separate process), snapshots, activity timeline.
5. Models: local llama.cpp service, cloud provider plugins, optional home brain.
6. OS services: KDE Plasma shell, AT-SPI, D-Bus, NetworkManager, Wine/Proton, Flatpak.
7. Base: Fedora Atomic image built with bootc, Linux kernel, SELinux, namespaces, Landlock, Btrfs.

## Processes
| Process | Job | Runs as | Talks over |
| --- | --- | --- | --- |
| brain-d | Orchestration, routing, planning, context | User service (per session) | D-Bus, HTTP/MCP, broker socket |
| tunnel adapters | Execute tools against apps and services | Inside brain-d or small helper processes, user level | D-Bus, CDP, AT-SPI, MCP |
| permission broker | Approve actions, hold credentials, snapshots, audit | System service | Locked-down Unix socket |
| model service | Run the local model | System service | Local HTTP |
| AI desktop | Hidden desktop for AI-driven GUI work | User level, headless session | Wayland (nested/headless) |
| shell components | Command bar, Connections, Settings pages, notifications | User session | D-Bus to brain-d |

## Data locations
| Data | Location |
| --- | --- |
| Our binaries and default config | Image (`/usr`), read-only |
| Machine config | `/etc` |
| Model files (GGUF) | `/var/lib/<os>/models` |
| Broker credential store and audit log | `/var/lib/<os>/broker` (root-owned, encrypted) |
| User memory (Vault), recipes, preferences | `~/.local/share/<os>/` |
| Snapshots | Btrfs snapshots managed by broker |

## Channels
- Shell and apps to brain-d: D-Bus.
- brain-d to models and MCP tools: local HTTP / MCP.
- brain-d to broker: Unix socket, request/approve protocol.
- External AIs to the OS: brain-d's MCP server, same permissions as the local assistant.
