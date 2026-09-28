# TASKS

Active phase: **Phase 0, Bootable base**. Details and learned notes: `docs/phases/phase-0-bootable-base.md`.

## Setup
- [x] 1. Create repo from `ublue-os/image-template` (`rhkrohan/aios`, public) and clone it
- [x] 2. Generate cosign key pair and add the private key as repo secret `SIGNING_SECRET`
- [ ] 3. Set the `FROM` line to Aurora (template default is Bazzite) and fill in `image-template.env`
- [ ] 4. Set up a test VM (x86_64 host) and pick a test laptop

## Build
- [ ] 5. First unchanged build pushed to ghcr.io by GitHub Actions (signed)
- [ ] 6. One visible change (wallpaper, [OS NAME] placeholder)
- [ ] 7. Stub brain-d systemd unit that only logs "brain-d started"
- [ ] 8. Build an ISO with bootc-image-builder (via `build-disk.yml`)

## Gate
- [ ] 9. Install in VM: desktop loads, brain-d stub ran
- [ ] 10. Install on laptop: Wi-Fi, GPU, sleep work
- [ ] 11. Push a second version and update into it (`bootc upgrade`)
- [ ] 12. Roll back (`bootc rollback`) and confirm it boots
