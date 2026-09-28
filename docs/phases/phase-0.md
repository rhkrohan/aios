# Phase 0: Bootable base
Status: Active

## Goal
Our own image boots in a VM and on one laptop, and updates and rolls back atomically. No AI yet.

## Tasks
Setup
- [x] Create repo from ublue-os/image-template
- [x] Generate cosign key pair; add private key to repo secrets
- [x] Set Containerfile FROM line to Aurora (KDE)
- [ ] Set up test VM (virt-manager or GNOME Boxes on an x86_64 Linux host; UTM emulation on the Mac as fallback)
- [ ] Choose test laptop
Build
- [x] First unchanged build; confirm image on ghcr.io
- [ ] Visible change: wallpaper + [OS NAME] placeholder branding
- [ ] Stub systemd user unit for brain-d that only logs "brain-d started"
- [x] Build ISO with bootc-image-builder
- [ ] Set up dev / beta / stable tags (installer `disk_config/iso.toml` currently points at `:latest`)
- [ ] Enforce signature verification on installed machines (ship `cosign.pub` + containers policy in the image)

## Gate
- [ ] Install from ISO in VM; desktop loads; brain-d stub ran
- [ ] Install on laptop; Wi-Fi, GPU, sleep work
- [ ] Push second version; `bootc upgrade`; reboot into it
- [ ] `bootc rollback`; previous version boots

## Learned
- 2026-09-28 (task 1): Repo `rhkrohan/aios` (public) created from the template with `gh repo create --template`. The template's default base is **Bazzite**, not Aurora, so task 3 must change the `FROM` line. `image-template.env` still has placeholders (`image-template`, `alice-and-bob`), and `disk_config/iso-*.toml` points at `ghcr.io/ublue-os/image-template`. Creating the repo triggered a build automatically; it is expected to fail at signing until task 2. Template ships Apache-2.0.
- 2026-09-28: Dev machine is an Apple Silicon Mac (arm64). Builds run on GitHub Actions, so that is fine. Test VMs should run on x86_64 hardware to avoid slow emulation.
- 2026-09-28 (task 2): cosign key pair generated with no password (the GitHub runner cannot type one). `cosign.pub` committed; `cosign.key` is git-ignored, stored as repo secret `SIGNING_SECRET` and backed up by the user. Build before this failed only at "Sign container image"; building, rechunking and pushing to ghcr.io already worked. Signing is half the job: machines must also be told to verify it (policy + `cosign.pub` in the image), still to do.
- 2026-09-28: The `!` prefix only works in the Claude Code prompt. In a normal zsh terminal `!` negates the exit status, so `! cd x && cmd` skips `cmd`.
- 2026-09-28 (task 5): First signed build succeeded (run 36456196070, about 14 min), pushed as `ghcr.io/rhkrohan/image-template:latest` (still Bazzite base, template name). Verified locally with `cosign verify --key cosign.pub`. Every push to main, even docs-only, triggers a full build; consider adding `docs/**`, `*.md` to `paths-ignore` in `build.yml`.
- 2026-09-28: Collaborator `muhammadrashid4587` invited with write access.
- 2026-09-28 (task 3): Base switched to `ghcr.io/ublue-os/aurora:stable` pinned by digest (version 44.20260922.1, Fedora 44). Aurora is published for amd64 only, so ARM VMs on the Mac are not an option; test VM must be x86_64 hardware or slow emulation. Image renamed to `aios` (must match repo name, `build-disk.yml` assumes it). Template bug: `build-disk.yml` expects `disk_config/iso.toml` but the template ships `iso-kde.toml`/`iso-gnome.toml`; renamed KDE one to `iso.toml`, removed GNOME. Docs-only pushes no longer trigger builds.
- 2026-09-28: First Aurora-based build succeeded (run 36460943270): `ghcr.io/rhkrohan/aios:latest` is signed (verified with `cosign verify`) and public (anonymous pull works).
- 2026-09-28 (ISO): First `build-disk.yml` run failed after ~4 min with `mount: /run/osbuild/tree/dev: permission denied` (and many `fchownat() ... Operation not permitted`). Cause: template moved runners to ubuntu-26.04, whose stricter security blocks osbuild's mounts (upstream ublue-os/image-template#269). Fix: disk workflow on `ubuntu-24.04`; main image build stays on 26.04. Retry succeeded in ~15 min (run 36464767862), ISO about 5.2 GB.
- 2026-09-28 (ISO): Template bug: both matrix jobs (qcow2, anaconda-iso) upload an artifact named `artifact` with `overwrite: true`, so the last job wins (this time the ISO). Fix later: name artifacts per disk type.
- 2026-09-28: bootc-image-builder is archived upstream; its successor is `osbuild/image-builder` (see ublue-os/image-template#229). Fine for Phase 0; migration logged in ideas.
