# Vision

## Core idea
An AI-native desktop OS on top of Linux. The AI "brain" is a core system service, not an app. It runs locally by default, can optionally use cloud AIs (Claude, ChatGPT, Gemini, later Meta's Muse), and the OS should run most Windows apps.

Name: not decided. Use [OS NAME] as a placeholder.

## Pitch
Meta's Muse (launched Sep 8, 2026) gives an agent its own computer in the cloud. We make the user's own computer the agent.

Muse cannot self-host, work offline, use other models, or control local files, terminals and desktop apps. Those are our advantages.

## Editions
One codebase and one image. The installer detects hardware and picks the edition.

| | Premium | Lite |
|---|---|---|
| Hardware | 16 GB RAM, GPU with 8 GB VRAM or modern NPU | 8 GB RAM, any CPU from roughly the last 6 years |
| Brain | Local model (7B to 8B, 4-bit GGUF) | A cloud provider |
| Local model | The brain | ~1B model for offline basics |
| Cloud | Optional | Required for full features |
| Offline | Works fully offline | Basics only |

## Not building (for now)
- Our own kernel
- Our own foundation model
- A custom Wayland compositor
- Kernel-level Windows compatibility (anti-cheat games, kernel drivers)
