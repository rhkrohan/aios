# 04. The tunnel and tools

## Principle
The AI never clicks. It calls typed tools. Each app or service gets an adapter that uses the best entrance it offers.

## Adapter ladder (best first)
1. App API or MCP server (Gmail, LinkedIn, GitHub, Slack)
2. D-Bus (KDE apps, media players, NetworkManager, settings, notifications)
3. Browser control via CDP in a dedicated AI browser profile (web apps)
4. Accessibility tree via AT-SPI (press buttons and read fields by name)
5. Last resort: screenshot + synthetic input on the hidden AI desktop (stubborn apps, some Wine apps)

## Hidden AI desktop
When the AI must drive a windowed app, it opens it on an invisible desktop session so it never steals the user's mouse or focus. The user can "peek" at it anytime. Results surface on the real desktop.

## Tool spec v0 (every tool follows this)
```yaml
name: network.connect_wifi
area: network
description: Connect to a Wi-Fi network. Uses saved password if available.
inputs:
  ssid: {type: string, required: true}
  password: {type: secret, required: false}
outputs:
  connected: boolean
  network: Network
permission: reversible
snapshot: false
adapter: dbus:NetworkManager
returns_state: true   # result includes new state, so no separate verify step
```
Rules:
- Names are `area.verb_object`. Inputs strictly typed and validated by code.
- Tools are coarse: one tool per user-level intent where possible (`files.organize`, not many moves).
- Every tool declares permission level and whether a snapshot is required.
- Every changing tool returns the new state.

## Shared types v0
| Type | Key fields |
| --- | --- |
| Person | name, emails, phones, handles (linkedin, github...), relationship tags |
| File | path, name, type, size, modified, tags |
| Event | title, start, end, location, attendees (Person) |
| Message | channel (email, chat...), from, to (Person), subject, body, time |
| Window | id, app, title, workspace, visible |
| App | id, name, installed_via (flatpak, rpm, wine, vm), running |
| Network | ssid, connected, signal, saved |
Adapters map service-specific data into these types, so outputs of one tool plug into inputs of another.

## Tool catalog v0 (first ~30 tools)
| Area | Tools |
| --- | --- |
| system | system.state, system.notify |
| files | files.find, files.read, files.write, files.move, files.organize, files.trash, files.delete |
| settings | settings.get, settings.set_display, settings.set_sound, settings.set_theme |
| network | network.list, network.connect_wifi, network.disconnect |
| apps | apps.list, apps.open, apps.close, apps.read, apps.act |
| people | people.find, people.resolve |
| memory | memory.search, memory.save |
| browser | browser.open, browser.read, browser.act |
| mcp | mcp.list, mcp.call |
| user | user.ask, user.confirm |
| shell | shell.run (last resort, always approval, sandboxed) |

## MCP in both directions
- MCP client: brain-d calls connected services and custom servers added by URL.
- MCP server: brain-d exposes the tool catalog so external AIs (Claude desktop, ChatGPT, custom UIs) can drive the OS under the same broker rules.
- Third-party MCP servers get wrapper adapters: better descriptions and mapping to shared types.
