# 06. Base OS

## Why Fedora
| Need | Why Fedora |
| --- | --- |
| Ship the OS as one image | Fedora bootc/Atomic is the most mature image-based desktop tooling |
| Head start | Universal Blue (Aurora, Bazzite, Bluefin) handles drivers, codecs, NVIDIA |
| New hardware | Fast kernel and driver updates, important for GPUs and NPUs |
| Modern desktop | KDE and GNOME on Wayland close to upstream |
| Security | SELinux on by default; Btrfs snapshots available |
Downsides: ~6-month release cadence (automated rebuilds), less familiar than Ubuntu.
Rejected: Ubuntu (weaker image tooling), Arch (no atomic updates), NixOS (steep learning curve).

## How we customize (Containerfile layers)
| Level | Example | Risk |
| --- | --- | --- |
| 1. Looks | Wallpaper, logo, theme, fonts | None |
| 2. Defaults | Settings, pinned apps, dark mode | Very low |
| 3. Software | Add llama.cpp, Wine; remove unneeded apps | Low |
| 4. Our services | brain-d, broker, model service (systemd units) | Medium, our code |
| 5. Desktop changes | KDE plugins, command bar, Connections, Settings pages | Higher, breaks on KDE updates |
| 6. Kernel | Never | n/a |
Stay at levels 1 to 4 as long as possible.

## Build and release pipeline
1. Repo created from ublue-os/image-template (done).
2. Containerfile: FROM Universal Blue KDE base (Aurora), then our layers.
3. GitHub Actions builds and signs (cosign) the image, pushes to ghcr.io.
4. bootc-image-builder makes ISO / qcow2 / raw images for installs.
5. Machines update with `bootc upgrade` or `bootc switch`, rollback with `bootc rollback`.
6. Nightly builds catch upstream breakage; releases are tagged.

## Channels
- `dev`: every commit (team only)
- `beta`: weekly (testers)
- `stable`: tagged releases
