# Tasks

## Active
- [ ] **Practical daily use (doc 20): P-A first (Reflex, first-run, conversations, usage meter, honest mail), then P-B daily driver** - Phase 2 (`docs/plan/20-practical-daily-use.md`)
- [ ] **The machine and the model (doc 19): L0 groundwork, then L1 catalog, L2 terminal, L3 workflows, L4 the ~3-4B SIOS model** - Phase 2 (`docs/plan/19-machine-and-model.md`)
- [ ] **Agents and connectors: A1 to A8 and C1 built; next C2 mail and calendar, then A0 VM checks when the image lands** - Phase 2 (`docs/plan/18-agents-and-connectors.md`)
- [ ] **Daylight everywhere (D85, D87): Settings and Agents built, Terminal and Apps menu done; next Files, Store, Memory, Monitor, Ask bar, Approve** - Phase 2 (`docs/design/`)
- [ ] **Security engine S1: Stop switch and process hardening** - Phase 2 security track (`docs/plan/17-security-engine.md`); next image waits for S9
- [ ] **AI OS layer M4: model gateway in the broker, keys encrypted, Settings > Brain** - Phase 2 (M2, M3 built 2026-10-14; check both on the VM after the next image)
- [ ] **Install ISO in VirtualBox on the Windows PC; confirm desktop loads** - Phase 0 gate
- [ ] **Set up test VM on an x86_64 Linux host (virt-manager or GNOME Boxes), or UTM emulation on the Mac as fallback** - Phase 0, Aurora is amd64 only
- [ ] **Stub brain-d systemd user unit that logs "brain-d started"** - Phase 0
- [ ] **Visible change: wallpaper + [OS NAME] placeholder** - Phase 0 (built 2026-10-12, see `ui/README.md`; needs a VM check)

## Waiting On

## Someday
- [ ] **Pick the OS name** - candidates in docs/plan/ideas.md
- [ ] **Choose test laptop for Phase 0 gate**
- [ ] **List 10 Windows apps for the Phase 5 test list**
- [ ] **Decide core license (Apache-2.0 vs GPL)**

## Done
- [x] ~~Security engine S0: plan, decisions D40 to D55, tasks~~ (2026-10-14)
- [x] ~~AI OS layer M2 (Rust in the image) and M3 (user services, caller identity)~~ (2026-10-14)
- [x] ~~AI OS layer M1: tools renamed with aliases; catalog in docs/plan/16-tool-catalog.md~~ (2026-10-14)
- [x] ~~AI OS layer M0: plan, decisions D31 to D38, phase-2 milestones~~ (2026-10-14)
- [x] ~~Generate cosign key pair, add SIGNING_SECRET~~ (2026-09-28)
- [x] ~~Set FROM line to Aurora, rename image to aios, fix ISO config path~~ (2026-09-28)
- [x] ~~First build, signed, public at ghcr.io/rhkrohan/aios:latest~~ (2026-09-28)
- [x] ~~Build ISO (anaconda-iso) via build-disk.yml on ubuntu-24.04 runner~~ (2026-09-28)
- [x] ~~Invite collaborator muhammadrashid4587 (write)~~ (2026-09-28)
- [x] ~~Create repo from ublue-os/image-template~~ (2026-09-28)
