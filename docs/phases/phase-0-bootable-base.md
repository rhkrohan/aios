# Phase 0: Bootable base (ACTIVE)

Goal: our own image builds, boots in a VM and on a laptop, and bootc updates and rolls back.

## Tasks
### Setup
- [x] 1. Create repo from `ublue-os/image-template` and clone it
- [ ] 2. Generate cosign key and add it as repo secret `SIGNING_SECRET` (builds fail at signing without it)
- [ ] 3. Set the `FROM` line (Aurora first) and fill in `image-template.env`
- [ ] 4. Set up a test VM and pick a test laptop

### Build
- [ ] 5. First unchanged build pushed to ghcr.io by GitHub Actions
- [ ] 6. One visible change (wallpaper, name placeholder)
- [ ] 7. Stub brain-d systemd unit that only logs "brain-d started"
- [ ] 8. Build an ISO with bootc-image-builder

## Gate
- [ ] Install in VM: desktop loads, brain-d stub ran
- [ ] Install on laptop: Wi-Fi, GPU, sleep work
- [ ] Push a second version and update into it
- [ ] Roll back and confirm it boots

## Learned
- 2026-09-28 (task 1): Repo `rhkrohan/aios` (public) created from the template with `gh repo create --template`. The template's default base is **Bazzite**, not Aurora, so task 3 must change the `FROM` line. `image-template.env` still has placeholders (`image-template`, `alice-and-bob`), and `disk_config/iso-*.toml` points at `ghcr.io/ublue-os/image-template`. Creating the repo triggered a build automatically; it is expected to fail at signing until task 2. Template ships Apache-2.0.
- 2026-09-28: Dev machine is an Apple Silicon Mac (arm64). Builds run on GitHub Actions, so that is fine. Test VMs should run on x86_64 hardware to avoid slow emulation.
