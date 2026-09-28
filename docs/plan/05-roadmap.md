# Roadmap

Each phase ends on a gate tested on real hardware or a VM.

| Phase | Name | Gate | Status |
|---|---|---|---|
| 0 | Bootable base | Image builds, boots in VM and laptop, bootc updates and rolls back | **Active** |
| 1 | Brain skeleton: brain-d, llama.cpp service, command bar, hardware check, Reflex v1 | Local answer fully offline | |
| 2 | Eyes and hands: AT-SPI reader, action layer, broker v1, audit log | 3-step task with approvals | |
| 3 | Memory: Vault integration and redaction | | |
| 4 | Cloud + Connections: provider plugins, MCP server and client, onboarding and Connections UI | | |
| 5 | Windows apps: launcher, Wine tuning, one-click VM | | |
| 6 | Alpha release: installer edition detection, security review, testers | | |

Open item: Phase 4 may move before Phase 3 for an early Lite demo.

Phase files: `docs/phases/`.

## Open questions
- OS name (paused)
- Aurora vs kinoite-main
- Exact Premium local model (after Phase 1 benchmarks)
- Muse API availability
- Core license: Apache-2.0 vs GPL (repo currently has Apache-2.0 from the template)
- Team ownership of parts
