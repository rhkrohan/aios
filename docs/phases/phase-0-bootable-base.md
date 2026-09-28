# Phase 0: Bootable base (ACTIVE)

Goal: our own image builds, boots in a VM and on a laptop, and bootc updates and rolls back.

## Tasks
### Setup
- [x] 1. Create repo from `ublue-os/image-template` and clone it
- [x] 2. Generate cosign key and add it as repo secret `SIGNING_SECRET` (builds fail at signing without it)
- [ ] 3. Set the `FROM` line (Aurora first) and fill in `image-template.env`
- [ ] 4. Set up a test VM and pick a test laptop

### Build
- [x] 5. First unchanged build pushed to ghcr.io by GitHub Actions
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
- 2026-09-28 (task 2): cosign key pair generated with no password (the GitHub runner cannot type one). `cosign.pub` committed; `cosign.key` is git-ignored, stored as repo secret `SIGNING_SECRET` and backed up by the user. Build before this failed only at "Sign container image"; building, rechunking and pushing to ghcr.io already worked. Signing is half the job: machines must also be told to verify it (policy + `cosign.pub` in the image), still to do.
- 2026-09-28: The `!` prefix only works in the Claude Code prompt. In a normal zsh terminal `!` negates the exit status, so `! cd x && cmd` skips `cmd`.
- 2026-09-28 (task 5): First signed build succeeded (run 36456196070, about 14 min), pushed as `ghcr.io/rhkrohan/image-template:latest` (still Bazzite base, template name). Verified locally with `cosign verify --key cosign.pub`. Every push to main, even docs-only, triggers a full build; consider adding `docs/**`, `*.md` to `paths-ignore` in `build.yml`.
- 2026-09-28: Collaborator `muhammadrashid4587` invited with write access.
