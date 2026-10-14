# Tasks

## Active
- [ ] **AI OS layer M1: rename tools (files / apps / settings / network / system) with aliases** - Phase 2, see docs/phases/phase-2.md (M0 done 2026-10-14)
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
- [x] ~~AI OS layer M0: plan, decisions D31 to D38, phase-2 milestones~~ (2026-10-14)
- [x] ~~Generate cosign key pair, add SIGNING_SECRET~~ (2026-09-28)
- [x] ~~Set FROM line to Aurora, rename image to aios, fix ISO config path~~ (2026-09-28)
- [x] ~~First build, signed, public at ghcr.io/rhkrohan/aios:latest~~ (2026-09-28)
- [x] ~~Build ISO (anaconda-iso) via build-disk.yml on ubuntu-24.04 runner~~ (2026-09-28)
- [x] ~~Invite collaborator muhammadrashid4587 (write)~~ (2026-09-28)
- [x] ~~Create repo from ublue-os/image-template~~ (2026-09-28)
