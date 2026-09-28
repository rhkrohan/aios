# Windows compatibility

| Tier | How | Needs | Editions |
|---|---|---|---|
| 1 | Wine/Proton | No Windows | Both |
| 2 | Background Windows VM, single app windows over RDP (WinApps-style). For Microsoft 365, Adobe | User's Windows license, 64 GB+ disk | Premium only |
| 3 | Not supported: kernel anti-cheat, kernel drivers | | |

## What we build
- A launcher that picks the tier for each app.
- One-click Windows VM setup.
