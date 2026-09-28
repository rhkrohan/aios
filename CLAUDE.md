# [OS NAME]: AI-native desktop OS

A Linux-based desktop OS built so any AI can use the computer safely and easily.
Humans use the normal desktop. AI uses "the tunnel": typed tools that reach apps, files, settings and services directly, without clicking.

## Start of every session
1. Read `TASKS.md`.
2. Read the active phase file in `docs/phases/` (see Status line in each).
3. Before choosing any tool, library or approach, check `docs/plan/11-decisions.md`.
4. Unfamiliar term? Check `docs/plan/glossary.md`.

## How we work
- Small, verifiable steps. One task at a time.
- Before writing code, show a short plan and wait for approval.
- Explain commands and files in plain English. The owner is new to Linux internals.
- After each task: tick it in `TASKS.md` and the phase file, add notes under "Learned".
- A phase is done only when every Gate item passes on a VM or real hardware.
- New ideas go to `docs/plan/ideas.md` first. Never straight into code.
- Every plan change: one dated line in `docs/plan/changelog.md`, own commit prefixed `plan:`.
- End of session: give a 10-line status summary for the planning chat.
- No em dashes in docs or replies.
- Big design decisions happen in the owner's separate planning chat; plan updates pasted from it are merged here as above.
- The owner's machine is an Apple Silicon Mac (arm64). Images build on GitHub Actions. Aurora is amd64 only, so test VMs need an x86_64 host (or slow emulation).

## Core design rules (never break these)
1. The OS enforces, the model suggests. Memory lookup, snapshots, verification, permissions and valid tool names are enforced by code, never left to the model.
2. The tunnel is the product. Tools are typed, coarse-grained and connected by shared types.
3. Any model can drive. Local small model for everyday/private work, cloud for hard tasks, chosen by the router.
4. Every action goes through the permission broker. No shortcuts.
5. Credentials never enter model context or brain-d memory.
6. Never modify the kernel. Never write to `/usr` at runtime.
7. Never capture global keystrokes or the raw screen. Use accessibility (AT-SPI) and portals.
8. Data locations: binaries in the image (`/usr`), config `/etc`, models `/var`, user data and memory in the user's home.

## Checklist for every new component
Which layer? Which process and user owns it? Who can call it, over what channel (D-Bus, Unix socket, HTTP/MCP)? Does it need broker approval? Where does its data live? What happens offline or on crash? How does it update and roll back?

## Plan map
docs/plan/00-vision.md            product, editions, non-goals
docs/plan/01-strategy.md          why tunnel-first, competition, moat
docs/plan/02-architecture.md      layers, processes, IPC, data locations
docs/plan/03-brain.md             orchestration, router, Reflex, planner, recipes
docs/plan/04-tunnel-and-tools.md  tool spec, adapters, shared types, catalog v0
docs/plan/05-security.md          broker, permissions, credentials, undo, audit
docs/plan/06-base-os.md           Fedora, bootc, image build, customization
docs/plan/07-windows-compat.md    Wine/Proton and VM tiers
docs/plan/08-ux.md                screens and UX principles
docs/plan/09-memory.md            Vault as context engine
docs/plan/10-roadmap.md           phases, tracks, gates
docs/plan/11-decisions.md         decisions log
docs/plan/12-risks.md             risks and open questions
docs/plan/ideas.md                backlog
docs/plan/glossary.md             plain-English terms
docs/plan/changelog.md            plan history
docs/phases/phase-N.md            tasks and gates per phase

## Repo layout (image build)
Containerfile                     image recipe; FROM line picks the base (Aurora, pinned by digest)
build_files/build.sh              runs inside the image at build time
system_files/                     copied into the image as-is (etc/, usr/)
image-template.env                image name (aios), owner (rhkrohan), description
Justfile                          shortcut commands (just build, just build-iso, ...)
.github/workflows/build.yml       builds, pushes to ghcr.io/rhkrohan/aios, signs with cosign (SIGNING_SECRET); skips docs-only pushes
.github/workflows/build-disk.yml  builds ISO and qcow2 from the pushed image (manual run)
disk_config/                      installer (iso.toml) and disk image (disk.toml) settings
cosign.pub                        public signing key (cosign.key is git-ignored, never commit it)
