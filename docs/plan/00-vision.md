# 00. Vision and scope

## One line
The computer any AI can use: a Linux desktop OS where AI works through a safe, fast "tunnel" to your apps, files and services, while you keep using the desktop normally.

## The picture
- Surface (humans): windows, mouse, keyboard. Nothing changes for the user.
- Tunnel (AI): typed tools that reach the same apps and services directly. No clicking, no screenshots.
- Results surface in the human world: the file appears, the email is sent, a notification explains what happened.

## Pitch
Meta's Muse gives an agent its own computer in the cloud. We make your own computer the agent, for any AI you choose.
Private by default, genius when you need it.

## Who it is for
1. First: technical early adopters and students who want AI that actually operates their machine.
2. Next: people leaving Windows who want a modern, AI-first desktop.
3. Later: small businesses that want safe, auditable AI automation.

## Editions (one codebase, one image, installer picks by hardware)
| Edition | Hardware floor | Default brain | Offline |
| --- | --- | --- | --- |
| Premium | 16 GB RAM, GPU with 8 GB VRAM or modern NPU, SSD | Local model for everyday tasks, cloud for hard ones | Full for everyday tasks |
| Lite | 8 GB RAM, CPU from roughly the last 6 years, SSD | Cloud model, tiny local model for routing and basics | Basic commands only |

## What success looks like
- A user connects an AI and a few services in under 5 minutes.
- Everyday requests ("connect to Wi-Fi", "clean my Downloads", "email my team") just work.
- Every AI action is visible, approvable and undoable.
- A new, better model makes the OS better with zero changes on our side.

## Non-goals (for now)
- Our own kernel or kernel modules
- Our own foundation model
- A custom Wayland compositor in year one
- Kernel-level Windows compatibility (anti-cheat games, drivers)
- Mobile OS
