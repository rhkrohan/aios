# 16. Tool catalog: the system abstractions

Status: Living document. It lists the typed tools any AI uses to work this computer, as built in `capd/src/tools.rs` (D36 names, 2026-10-14). Update it whenever a tool is added, renamed or made real.

Every tool goes through the broker (capd). Before running anything, the broker checks:
- the pass (which tools, which folders, expiry, uses, budget);
- the arguments, against the tool's schema;
- blocked places;
- the AI's roles (IAM);
- whether anything leaves the computer.

Hidden folders and files (names starting with ".", such as `.ssh` or `.config`) can never be named by any AI; the Trash is the one exception. The AI never touches D-Bus, files or the network itself. The same list goes to every AI in its own format: OpenAI, Anthropic and MCP (`capd/src/manifest.rs`). An AI only ever sees the tools its pass allows.

## How to read the tables

**Risk** is fixed by code, never by the model.
- **Read**: allowed without asking.
- **Change**: can be undone. Settings changes by SIOS's own assistant just happen (D57); file changes show the plan first, unless a pass or standing rule covers them.
- Reads by SIOS's own assistant just happen too (D57).
- **Always asks**: can't be undone. The owner says yes every time, and no rule can pre-approve it.

**Status** says how far each tool has got.
- **Real**: does the job today on real files or real data.
- **Shell**: on the Mac preview the broker returns an `effect` that the page carries out. On the image, the tools marked (M6) are real adapters since 2026-10-14; the ones marked (M9) answer "isn't connected on this computer yet" until then.
- **Not yet**: the name is reserved and the broker refuses the call until the adapter lands.

**Wire name**: tools travel as `area_verb` (for example `settings_set_volume`), because models only accept letters, digits, `_` and `-`.

## files: the owner's files

| Tool | Arguments | Risk | Status | What it does | On the SIOS image |
| --- | --- | --- | --- | --- | --- |
| `files.list` | path | Read | Real | Lists a folder: names, kinds, sizes, labels. Hidden files, links and blocked places are left out | Same, over the home folder |
| `files.find` | path, query | Read | Real | Finds files by what they are: name, label, and the words inside text files and PDFs, with related words ("invoice" also finds bills, receipts, "amount due"). Best 30 first, each with which search word matched; never a line from inside. Files labelled Sensitive or Finance match by name and label only, and so does every file for a caller that may not read files (only SIOS's own assistant, the owner, or an AI whose pass allows files.read match the words inside). `path` "" is the whole home | Same; the words are kept in a local index (`index.json` in capd's state, by size and change time). PDFs are read by `pdftotext` in a sandbox (its own user, network and mount namespaces with empty /run, /tmp, /var and /home, so no socket is reachable; Landlock read-only /usr and /etc; no writes; 512 MB, 4 s, 256 KB) from a file the broker opened itself (no links, checked after opening). Word and LibreOffice files by name for now |
| `files.read` | path | Read | Real | Reads up to 64 KB of text. Untrusted files come back marked as data, never instructions | Same |
| `files.write` | path, text | Change | Real | Creates or replaces a text file; the old version is kept for undo | Same; Btrfs snapshots later |
| `files.move` | from, to | Change | Real | Moves or renames. A `to` ending in `/` means "into this folder" (created if missing) | Same |
| `files.copy` | from, to | Change | Real | Copies a file exactly; the copy keeps the original's labels and trust | Same |
| `files.organize` | moves: [{from, to}] | Change | Real | 1 to 200 moves in one step, all or nothing | Same |
| `files.mkdir` | path | Change | Real | Creates a folder | Same |
| `files.trash` | path | Change | Real | Moves to the Trash | The freedesktop Trash, shared with SIOS Files and Dolphin (M9) |
| `files.restore` | path | Change | Real | Puts something back from the Trash where it came from | Same (M9) |
| `files.delete` | path | Always asks | Real | Deletes for good, and only from the Trash | Same |
| `files.show` | path | Read | Shell | Opens a folder for the owner in Files (folders only) | `kioclient exec` on the folder, which opens SIOS Files (M6) |
| `files.preview` | path | Read | Shell | Shows the owner where a file is: opens its folder in Files. The file itself is never opened, so a launcher or script an AI wrote can't run | `kioclient exec` on the parent folder (M6) |

## apps: programs and windows

| Tool | Arguments | Risk | Status | What it does | On the SIOS image |
| --- | --- | --- | --- | --- | --- |
| `apps.list` | none | Read | Real (A3) | Lists open apps and their windows | KWin script through capd's `org.sios.Capd1` endpoint, nonce-checked (seen on the VM) |
| `apps.open` | app | Read | Shell | Opens one of: files, browser, mail, settings, terminal, store, security, goals, activity | `kstart --application` with the app's desktop id (M6) |
| `apps.focus` | app | Read | Real (A3) | Brings an app's window to the front | KWin script; never SIOS's own windows |
| `apps.close` | app | Change | Real (A3) | Closes an app's window; unsaved work in it can be lost | KWin script; never SIOS's own windows |
| `apps.arrange` | left, right | Read | Real (A3) | Puts two apps side by side | KWin script (seen on the VM: Konsole and Dolphin); never SIOS's own windows |
| `apps.install` | app | Always asks | Real (A3) | Installs an app from Flathub | `flatpak install --user` as a background job with a done notification; a Flathub id or a common short name (slack, vlc, zoom...) |
| `apps.remove` | app | Always asks | Real (A3) | Removes an installed app | `flatpak uninstall --user`, background job |

## settings: how the computer looks and sounds

| Tool | Arguments | Risk | Status | What it does | On the SIOS image |
| --- | --- | --- | --- | --- | --- |
| `settings.set_volume` | level 0 to 100 | Change | Shell | Sound volume | `wpctl set-volume @DEFAULT_AUDIO_SINK@` (M6) |
| `settings.set_brightness` | level 0 to 100 | Change | Shell | Screen brightness | D-Bus `org.kde.ScreenBrightness` (M6). Fails cleanly when there's no adjustable screen |
| `settings.set_theme` | theme: light or dark | Change | Shell | Light or dark desktop | `plasma-apply-lookandfeel` with the SIOS looks (M6) |
| `settings.set_wallpaper` | name: dusk or lake | Change | Shell | Wallpaper | `plasma-apply-wallpaperimage` (M6) |
| `settings.dnd` | on: true or false | Change | Real (A3) | Do Not Disturb | `kwriteconfig6 --notify` on plasmanotifyrc `DoNotDisturb/Until` (applied live, seen on the VM) |

## network: connections

| Tool | Arguments | Risk | Status | What it does | On the SIOS image |
| --- | --- | --- | --- | --- | --- |
| `network.list` | none | Read | Not yet | Connections and nearby Wi-Fi networks | `nmcli` (M6) |
| `network.connect_wifi` | ssid | Change | Shell | Joins a Wi-Fi network. Passwords are never a model argument | `nmcli device wifi connect` (M6) |
| `network.wifi_power` | on: true or false | Change | Shell | Wi-Fi on or off | `nmcli radio wifi` (M6) |
| `network.bluetooth_power` | on: true or false | Change | Real (A3) | Bluetooth on or off | BlueZ `Adapter1.Powered` with busctl; says plainly when there's no Bluetooth |

## system: the session

| Tool | Arguments | Risk | Status | What it does | On the SIOS image |
| --- | --- | --- | --- | --- | --- |
| `system.state` | none | Read | Not yet | The computer right now: volume, brightness, theme, network, battery, Do Not Disturb, the focused app | Collected from the adapters above (M6) |
| `system.notify` | text | Read | Shell | A short notification for the owner | `org.freedesktop.Notifications` (M6) |
| `system.lock` | none | Change | Shell | Locks the screen | `org.freedesktop.ScreenSaver.Lock` (M6) |
| `system.remind` | minutes 1 to 1440, text | Change | Real (A3) | Reminds the owner later | A `systemd-run --user` timer that sends a notification; undo cancels the timer (seen on the VM) |

## mail: sending

| Tool | Arguments | Risk | Status | What it does | On the SIOS image |
| --- | --- | --- | --- | --- | --- |
| `mail.send` | to [ ], subject, body, attach (optional) | Always asks, sends data out | Real (outbox) | The only tool that sends anything off the computer. It asks again, naming the data, if the goal read untrusted or Finance/Sensitive files. Today it writes to the outbox folder; nothing leaves | Mail adapter (Gmail or IMAP) owned by the broker; credentials stay in the broker |

## memory and people (Vault)

| Tool | Arguments | Risk | Status | What it does | On the SIOS image |
| --- | --- | --- | --- | --- | --- |
| `memory.search` | query | Read | Real | Searches what the owner asked SIOS to remember. Each AI only sees the groups shared with it | Vault, encrypted |
| `memory.save` | text, kind (fact, preference, person), group (People, Habits, Work, Personal, Finance) | Change | Real | Remembers something the owner said. Passwords and keys are refused | Same |
| `memory.forget` | id | Change | Real | Forgets one memory (undo brings it back) | Same |
| `people.resolve` | query | Read | Real | Turns "Sara" or "my accountant" into people with emails | Same, plus contacts |

## Goal-level tools for outside AIs (MCP)

These are served by `brain-d mcp`. Any connected AI can use them; SIOS's own planner does the work, and the owner approves the pass.

| Tool | What it does |
| --- | --- |
| `sios_do` | Hand SIOS a whole goal in plain words |
| `sios_goal_status` | How a goal is going |
| `sios_briefing` | What's on the computer (names and labels only, never contents) |
| `sios_recall` | Ask SIOS's memory |

From M8, a **paired** AI also gets every tool above directly, in MCP format, limited by its roles. It also gets `sios_approval_status`, to follow an approval that's waiting for the owner. Unpaired AIs keep only the goal-level tools.

## Old names (until M8)

Names from before the rename are still accepted. The broker maps them in calls, passes, standing rules and saved roles (`tools::ALIASES`).

| Old | New |
| --- | --- |
| `fs.*` | `files.*` |
| `ui.show_folder`, `ui.quick_look` | `files.show`, `files.preview` |
| `ui.open_app`, `ui.focus_app`, `ui.close_app`, `ui.side_by_side` | `apps.open`, `apps.focus`, `apps.close`, `apps.arrange` |
| `store.install`, `store.remove` | `apps.install`, `apps.remove` |
| `ui.set_theme`, `ui.set_wallpaper`, `sys.set_volume`, `sys.set_brightness`, `sys.dnd` | `settings.*` (same verbs) |
| `net.connect_wifi`, `net.wifi`, `net.bluetooth` | `network.connect_wifi`, `network.wifi_power`, `network.bluetooth_power` |
| `ui.notify`, `sys.lock`, `sys.remind` | `system.notify`, `system.lock`, `system.remind` |

## Still to come (from catalog v0 in 04)

These are planned but not built, each through the broker like everything above:
- `people.find`
- `apps.read` and `apps.act` (AT-SPI)
- `browser.open`, `browser.read`, `browser.act`
- `mcp.list` and `mcp.call` (outside MCP servers)
- `user.ask` and `user.confirm`
- `settings.get` and `settings.set_display`
- `network.disconnect`
- `shell.run` (last resort, always asks, sandboxed)
