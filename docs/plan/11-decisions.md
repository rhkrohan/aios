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
