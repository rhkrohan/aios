# CLAUDE.md

Guidance for Claude Code working in this repo.

## Project
[OS NAME] (placeholder, repo `rhkrohan/aios`) is an AI-native desktop OS built on Linux. The AI "brain" (brain-d) is a core system service, not an app. It runs locally by default, can optionally use cloud AIs, and the OS should run most Windows apps.

Full plan: `docs/plan/`. Current work: `TASKS.md` and the active phase file in `docs/phases/`.

Active phase: **Phase 0, Bootable base** (`docs/phases/phase-0-bootable-base.md`).

## Working with the user
- CS undergrad, new to Linux internals. Explain every command, file and concept in plain English, with simple analogies where helpful.
- Small, verifiable steps. One task at a time.
- Before writing code or running commands that change things, show a short plan and wait for approval.
- Concise and direct replies. No em dashes.
- The user's machine is an Apple Silicon Mac (arm64). Image builds run on GitHub Actions. Test VMs should run on x86_64 hardware.

## Hard rules
- Never modify the kernel or write kernel modules.
- Never write to /usr at runtime (it comes from the image, read-only). Config in /etc, models in /var, user memory in the user's home. Adding files under `system_files/usr` at build time is fine.
- Never capture global keystrokes or the screen directly. Use AT-SPI and permission portals.
- Every brain action goes through the permission broker.
- For every new component, answer the component checklist below before building it.

## Component checklist
1. Which layer (see `docs/plan/01-architecture.md`)?
2. Which process and which user owns it?
3. Who can call it, and over what channel (D-Bus, Unix socket, HTTP/MCP)?
4. Does it need broker approval?
5. Where does its data live?
6. What happens offline or on crash?
7. How does it update and roll back?

## Repo layout
- `Containerfile`: the image recipe (`FROM` line picks the base image).
- `build_files/build.sh`: runs inside the image at build time.
- `system_files/`: copied into the image as-is (`etc/`, `usr/`).
- `image-template.env`: image name, owner, description.
- `Justfile`: shortcut commands (`just build`, `just build-iso`, ...).
- `.github/workflows/build.yml`: builds, pushes to ghcr.io, signs with cosign (`SIGNING_SECRET`).
- `.github/workflows/build-disk.yml`: builds installer ISOs/disk images.
- `disk_config/`: installer and disk image settings.
- `docs/plan/`, `docs/phases/`, `TASKS.md`: the plan.

## Maintaining the plan
- The repo is the single source of truth. Plan lives in `docs/plan/`, phase work in `docs/phases/`.
- After each task: tick it in `TASKS.md`, update the active phase file, add a "Learned" note.
- New ideas go to `docs/plan/ideas.md` first (Exploring, Accepted, Parked).
- Decisions go to `docs/plan/02-decisions.md`. Never delete entries; mark them Superseded and link the replacement.
- Every plan change: one dated line in `docs/plan/changelog.md`, and its own git commit starting with `plan:`.
- Big design decisions happen in the user's separate planning chat. Plan updates pasted from it are applied as above.
- End of each session: give a 10-line status summary the user can paste back into the planning chat.
