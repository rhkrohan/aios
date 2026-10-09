// The machine, as nodes and layers. Facts come from docs/plan/02-architecture.md,
// 03-brain.md, 04-tunnel-and-tools.md and 05-security.md.

export type LayerId = "interfaces" | "brain" | "broker" | "adapters" | "targets" | "models";

export interface MapNode {
  id: string;
  label: string;
  layer: LayerId;
  job: string;
  process: string;
  runsAs: string;
  channel: string;
  data: string;
  offline: string;
}

export const LAYERS: { id: LayerId; label: string; x: number }[] = [
  { id: "interfaces", label: "Interfaces", x: 20 },
  { id: "brain", label: "brain-d", x: 215 },
  { id: "broker", label: "Permission broker", x: 410 },
  { id: "adapters", label: "Tunnel adapters", x: 605 },
  { id: "targets", label: "Apps and services", x: 800 },
];

const shell = { process: "Shell components", runsAs: "You, in your desktop session", channel: "D-Bus to brain-d", data: "Nothing of its own", offline: "Works offline. Requests go to the local model." };
const brain = { process: "brain-d (user service)", runsAs: "You, never root", channel: "D-Bus in, broker socket out, HTTP/MCP to models", data: "~/.local/share/sios/", offline: "Keeps working on the local model. Tasks needing online AI say so." };
const broker = { process: "Permission broker (system service)", runsAs: "Its own system user, separate from brain-d", channel: "Locked-down Unix socket", data: "/var/lib/sios/broker (root-owned, encrypted)", offline: "Fully offline. If it crashes, nothing can act until it restarts: fail closed." };
const adapter = { process: "Inside brain-d or a small helper process", runsAs: "You, sandboxed where it runs untrusted code", channel: "Called only through the broker" };

export const NODES: MapNode[] = [
  // interfaces
  { id: "ask", label: "Ask bar", layer: "interfaces", job: "Where you type or click the orb. Turns your words into a goal.", ...shell },
  { id: "voice", label: "Voice", layer: "interfaces", job: "Push to talk. Speech becomes the same goal as typing.", ...shell },
  { id: "claude", label: "Claude Desktop", layer: "interfaces", job: "An outside AI app driving this computer through brain-d's MCP server, under the same rules.", process: "Separate app", runsAs: "You", channel: "HTTP/MCP to brain-d", data: "Its own app data", offline: "Can't reach its own model offline." },
  { id: "phone", label: "Phone", layer: "interfaces", job: "Ask from your phone on the home network.", process: "Phone app", runsAs: "Paired device", channel: "HTTP/MCP to brain-d", data: "Nothing on this computer", offline: "Needs the home network." },
  // brain-d
  { id: "context", label: "Context + Vault", layer: "brain", job: "Adds what it remembers (people, projects, preferences) to every request, so the model doesn't have to ask.", ...brain, data: "Vault database in your home, encrypted" },
  { id: "reflex", label: "Reflex", layer: "brain", job: "Fast typed decisions: which area, how risky, how hard. Picks from fixed options, never writes text.", ...brain },
  { id: "router", label: "Router", layer: "brain", job: "Chooses the local model or online AI per task. Online always asks first and removes personal details.", ...brain },
  { id: "planner", label: "Planner", layer: "brain", job: "Talks to the chosen model. Output is limited to real tool names and valid inputs.", ...brain },
  { id: "recipes", label: "Recipes", layer: "brain", job: "Saves steps that worked and replays them, skipping big-model planning.", ...brain, data: "Recipe store in your home" },
  { id: "guard", label: "Loop guard", layer: "brain", job: "Same failure twice: stop, escalate to a stronger model, or ask you.", ...brain },
  { id: "checker", label: "Checker", layer: "brain", job: "Confirms the result really happened. Tools return their new state, so most checks are free.", ...brain },
  // broker
  { id: "policy", label: "Policy engine", layer: "broker", job: "Runs every check in order for every action and decides allow, ask or block.", ...broker },
  { id: "trust", label: "Trust levels", layer: "broker", job: "How far each AI is trusted. Earned with tasks that check out, lost on violations.", ...broker },
  { id: "leases", label: "Leases", layer: "broker", job: "Time and use limited permissions: once, one hour, this session.", ...broker },
  { id: "audit", label: "Audit log", layer: "broker", job: "Every decision, chained so any edit is detectable.", ...broker },
  { id: "vault", label: "Sign-in vault", layer: "broker", job: "Holds every password and token. AIs see placeholders; the real secret is swapped in at the edge.", ...broker },
  // adapters
  { id: "builtin", label: "Built-in files", layer: "adapters", job: "Typed file tools: find, read, organize, write. Snapshots before risky changes.", ...adapter, data: "Your files, through the broker", offline: "Fully offline." },
  { id: "dbus", label: "D-Bus", layer: "adapters", job: "Talks to KDE apps, settings and NetworkManager the way the desktop itself does.", ...adapter, data: "None", offline: "Fully offline." },
  { id: "cdp", label: "Browser (CDP)", layer: "adapters", job: "Drives a separate AI browser profile, away from your logins. Everything read is untrusted.", ...adapter, data: "AI browser profile", offline: "Needs internet for web pages." },
  { id: "mcp", label: "MCP", layer: "adapters", job: "Connects installed services from the Store, mapped to SIOS tool names.", ...adapter, data: "Sign-ins stay in the vault", offline: "Online services wait until you're back." },
  { id: "atspi", label: "Accessibility", layer: "adapters", job: "Presses buttons and reads fields by name for apps with no better entrance.", ...adapter, data: "None", offline: "Fully offline." },
  { id: "screen", label: "Screen (last resort)", layer: "adapters", job: "Screenshots and clicks on a hidden AI desktop, only for stubborn apps. Never your visible screen.", ...adapter, data: "Hidden desktop session", offline: "Works offline with the local model." },
  // targets
  { id: "t-files", label: "Files and apps", layer: "targets", job: "Your home folder and desktop apps.", process: "Your apps", runsAs: "You", channel: "Filesystem, D-Bus", data: "Your home folder", offline: "Always available." },
  { id: "t-settings", label: "Settings", layer: "targets", job: "Theme, display, sound: KDE Plasma settings.", process: "Plasma", runsAs: "You", channel: "D-Bus", data: "~/.config", offline: "Always available." },
  { id: "t-network", label: "NetworkManager", layer: "targets", job: "Wi-Fi and network.", process: "System service", runsAs: "System", channel: "D-Bus", data: "/etc/NetworkManager", offline: "Always available." },
  { id: "t-gmail", label: "Gmail", layer: "targets", job: "Mail, through the installed Gmail capability.", process: "Remote service", runsAs: "Your Google account", channel: "MCP over HTTPS", data: "Google's servers", offline: "Waits for internet." },
  { id: "t-github", label: "GitHub", layer: "targets", job: "Repositories and pull requests, through the installed capability.", process: "Remote service", runsAs: "Your GitHub account", channel: "MCP over HTTPS", data: "GitHub's servers", offline: "Waits for internet." },
  { id: "t-web", label: "Web", layer: "targets", job: "Any web page. Treated as data, never as instructions.", process: "Remote", runsAs: "AI browser profile", channel: "HTTPS", data: "Nothing kept", offline: "Unavailable." },
  // models (bottom left)
  { id: "local", label: "Local model", layer: "models", job: "8B instruct model, 4-bit, on llama.cpp. Everyday and private tasks.", process: "Model service (system)", runsAs: "Its own system user", channel: "Local HTTP", data: "/var/lib/sios/models", offline: "Fully offline." },
  { id: "online", label: "Online AI", layer: "models", job: "Claude, ChatGPT or Gemini for hard tasks, with your OK and personal details removed.", process: "Remote service", runsAs: "Your AI account", channel: "HTTPS through brain-d", data: "Only the cleaned-up request", offline: "Unavailable. Falls back to local." },
];

// Layout: node box size and positions inside a 1000 x 560 view box.
export const NODE_W = 160;
export const NODE_H = 32;
const GAP = 9;
const TOP = 66;

export function layout(): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  for (const l of LAYERS) {
    NODES.filter((n) => n.layer === l.id).forEach((n, i) => {
      pos[n.id] = { x: l.x + 10, y: TOP + i * (NODE_H + GAP) };
    });
  }
  // models sit under the interfaces column
  NODES.filter((n) => n.layer === "models").forEach((n, i) => {
    pos[n.id] = { x: LAYERS[0].x + 10, y: 360 + i * (NODE_H + GAP) };
  });
  return pos;
}

/** Static edges drawn faintly so the whole wiring is visible at rest. */
export const EDGES: [string, string][] = [
  ["ask", "context"],
  ["voice", "context"],
  ["claude", "context"],
  ["phone", "context"],
  ["context", "reflex"],
  ["reflex", "router"],
  ["router", "planner"],
  ["router", "local"],
  ["router", "online"],
  ["planner", "policy"],
  ["policy", "builtin"],
  ["policy", "dbus"],
  ["policy", "cdp"],
  ["policy", "mcp"],
  ["policy", "atspi"],
  ["policy", "screen"],
  ["builtin", "t-files"],
  ["dbus", "t-settings"],
  ["dbus", "t-network"],
  ["dbus", "t-files"],
  ["mcp", "t-gmail"],
  ["mcp", "t-github"],
  ["cdp", "t-web"],
];

export function adapterOf(adapter: string): string | null {
  const p = adapter.split(":")[0];
  if (p === "builtin") return "builtin";
  if (p === "dbus") return "dbus";
  if (p === "cdp") return "cdp";
  if (p === "mcp") return "mcp";
  if (p === "atspi") return "atspi";
  if (p === "screen") return "screen";
  return null;
}

export function targetOf(tool: string): string {
  if (tool.startsWith("settings.")) return "t-settings";
  if (tool.startsWith("network.")) return "t-network";
  if (tool.startsWith("gmail.")) return "t-gmail";
  if (tool.startsWith("github.")) return "t-github";
  if (tool.startsWith("browser.")) return "t-web";
  return "t-files";
}
