# 10. Roadmap

Each phase ends on a gate tested on a VM or real hardware. A phase starts only after the previous gate passes. Dates set after Phase 0 shows real build speed.

| Phase | Name | Builds | Gate |
| --- | --- | --- | --- |
| 0 | Bootable base | Image FROM Aurora, CI build and signing, ISO, stub brain-d unit | Boots in VM and on a laptop; update and rollback work |
| 1 | Brain core | brain-d (user service), llama.cpp service, router (local + one cloud), Reflex v1, command bar, hardware check | Command bar answers locally with networking off; routes a hard request to cloud with consent |
| 2 | Tunnel v1 + broker | Tool spec v0, shared types v0, adapters for system, files, settings, network, apps (D-Bus/AT-SPI); broker v1 with approvals, auto snapshots, activity timeline | "Connect to Wi-Fi, dim the screen, organize Downloads" by voice or command bar, with approvals and working undo |
| 3 | Memory + people | Vault integration, automatic context injection, people.resolve, redaction | "Email my team" resolves real people from memory; redaction verified on a cloud request |
| 4 | Connections | MCP client and server, service wrappers, browser adapter (CDP), hidden AI desktop, recipes, onboarding and Connections UI | Cross-service task (LinkedIn comments to Gmail thank-yous) works; Claude desktop drives the OS via MCP under broker rules |
| 5 | Windows apps | Launcher, tuned Wine/Proton, one-click VM tier | Every app on the test list opens from a double-click |
| 6 | Alpha | Installer edition detection, security review, UX polish, tester program | Outside testers use it as their daily OS for two weeks |

## Tracks after Phase 2
- Tunnel growth: add adapters and shared-type mappings continuously.
- Recipes: grow the library from real use.
- Model upgrades: swap in better local models as they appear.
