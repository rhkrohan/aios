# 07. Windows app compatibility

| Tier | How | Good for | Cost |
| --- | --- | --- | --- |
| 1. Wine / Proton | Translation layer, no Windows needed | Most games, utilities, older apps | None |
| 2. Windows VM | Real Windows in a background VM, single app windows over RDP (WinApps approach) | Microsoft 365, Adobe CC, Visual Studio, business tools | User's Windows license, 64 GB+ disk, extra RAM (Premium only) |
| 3. Not supported | | Kernel anti-cheat games, kernel drivers | |

## What we build
- Launcher that picks the tier: known-good list; unknown apps try Wine, then offer VM.
- One-click VM setup in Settings.
- AI access: Wine apps via screenshot fallback on the hidden AI desktop; VM apps via Windows UI Automation inside the guest (later).
