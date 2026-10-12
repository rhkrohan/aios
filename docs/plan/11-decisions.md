# 11. Decisions log

Add new entries at the bottom. Never delete; mark old ones Superseded.
Status: Accepted, Proposed, Superseded.

| ID | Decision | Choice | Why | Rejected | Status |
| --- | --- | --- | --- | --- | --- |
| D1 | Base OS | Fedora Atomic + bootc, FROM Universal Blue KDE (Aurora) | Mature image tooling, rollback, drivers done | Ubuntu, Arch, NixOS | Accepted |
| D2 | Desktop shell | Customized KDE Plasma | Mature Wayland, D-Bus everywhere, scriptable | Custom compositor now | Accepted |
| D3 | Brain language | Rust for brain-d and broker | Safe, fast privileged services | Python, Go | Accepted |
| D4 | Brain shape | brain-d plus separate permission broker | One memory and permission system; credentials out of model process | Many agents direct to apps | Accepted |
| D5 | Local inference | llama.cpp server as systemd service | Broad hardware support, GGUF standard | Ollama dependency | Accepted |
| D6 | Tool protocol | MCP both directions | Standard; external AIs can drive the OS | Custom plugin API | Accepted |
| D7 | How AI sees apps | Adapter ladder: API/MCP, D-Bus, CDP, AT-SPI, screenshots last | Structured, fast, reliable | Screenshot-only computer use | Accepted |
| D8 | Memory | Vault is the context engine | Already built, local-first | New memory system | Accepted |
| D9 | App packaging | Flatpak for user apps, image layers for system parts | Clean updatable base | Layer every app | Accepted |
| D10 | License model | Open source core, paid Premium and business features | Trust for an OS with AI inside | Fully closed | Accepted |
| D11 | Fast decisions | Build Reflex in house, inspired by Jev | Local, fast, bounded failure | Depend on hosted Jev | Accepted |
| D12 | brain-d process type | User service per session; broker is a system service | brain-d needs the user's session and must not exceed user power | brain-d as system service | Accepted |
| D13 | Core strategy | Tunnel-first: make the computer easy for any AI to use; do not compete on model intelligence | Models get better and cheaper on their own; OS access is our moat | Build our own smart model | Accepted |
| D14 | Responsibility split | The OS enforces (memory injection, snapshots, verification, valid tools, loop guard); the model only suggests | Makes small and cheap models reliable | Relying on prompts and model discipline | Accepted |
| D15 | Model strategy | Hybrid and model-agnostic: local for everyday and private, cloud for hard tasks, optional home brain | Private by default, genius when needed | Local-only or cloud-only | Accepted |
| D16 | Tool design | Coarse, typed tools with shared types (Person, File, Event, Message, Window, App, Network) | Fewer steps, fewer errors, cross-service workflows | Many tiny untyped tools | Accepted |
| D17 | Hidden AI desktop | AI-driven GUI work happens in an invisible session | Never fights the user for mouse or focus | Driving the user's visible desktop | Accepted |
| D18 | Fine-tuning | Optional, later, LoRA on our tool catalog once usage data exists | Tools and scaffolding first | Fine-tune up front | Accepted |
| D19 | Intelligence layer for testing | OpenAI API (owner's key, from the shell or `.env.local`) drives the planner and the test agent until the local model and router land | Owner has an OpenAI key, not a Claude key; the model only proposes, so swapping providers changes nothing else (D14, D15) | Waiting for a local model before testing with a real AI | Accepted (2026-10-09) |
| D20 | Permission model | Capability tokens: signed, scoped (principal, tools, paths, expiry, uses, no-egress, budget), attenuable only downward, revocable as a tree; enforced by `capd`, a Rust proof of concept of the broker that guards a real folder | Proves the broker design on real files with a real AI before Phase 1, and grows into the D4 broker | Keep simulating; ACL-only permissions | Accepted (2026-10-09) |
| D21 | Memory model and placement | Long-term memory as records (facts, preferences, people, episodes) owned by the broker (Vault on SIOS): per-AI views by group, Sensitive never to online models, secrets refused, patterns only saved after the owner confirms, privacy setting controls placeholders | Same enforcement as files; mirrors how Linux separates working memory, storage, permissions and logs; owner chose "suggest, then confirm" and per-AI sharing | Memory inside the model process; automatic learning without confirmation; sharing everything with outside AIs | Accepted (2026-10-09) |
| D27 | App styling | Kvantum (Fedora package) with a SIOS theme made from KvGnome, set for everyone; window effects stay stock KDE (no third-party KWin effects) | Breeze can't draw the preview's sidebars and soft selections; Kvantum styles every Qt app from one SVG theme and doesn't touch KWin, so Plasma updates don't break it | Stock Breeze only (closer colours, Breeze shapes); third-party rounded-corner KWin effects | Accepted (2026-10-12) |
| D28 | Login screen | SDDM with a SIOS QML theme instead of Fedora 44's Plasma Login Manager | Plasma Login Manager's screen is compiled in and only its wallpaper can change; SDDM loads a QML theme and falls back to its own if ours fails | Keep Plasma Login Manager with our wallpaper | Accepted (2026-10-12) |
