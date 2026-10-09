// The tools a live model may propose. This is the "tunnel" catalog for the
// preview. The model only sees names, descriptions and argument names; the
// permission level and adapter come from HERE, never from the model. That is
// the "model suggests, OS enforces" rule (docs/plan/11-decisions.md D14).

import type { Area, Permission } from "./types";

export interface LiveTool {
  name: string;
  area: Area;
  permission: Permission;
  adapter: string;
  description: string;
  args: string[];
  /** Reads content that can't be trusted (web, email, unknown files). */
  taints?: boolean;
}

export const LIVE_TOOLS: LiveTool[] = [
  { name: "files.find", area: "files", permission: "read", adapter: "builtin:files", description: "Find files by name OR by meaning: a label (Work, Personal, Finance, Sensitive), 'from the web', 'changed by AI', or 'recent'. Optional folder like ~/Downloads.", args: ["in", "query"] },
  { name: "files.read", area: "files", permission: "read", adapter: "builtin:files", description: "Read a file's contents.", args: ["path"] },
  { name: "files.organize", area: "files", permission: "reversible", adapter: "builtin:files", description: "Sort every loose file in a folder into subfolders by type (Documents, Images, Installers, Archives, Media).", args: ["in"] },
  { name: "files.move", area: "files", permission: "reversible", adapter: "builtin:files", description: "Move one file (by exact name) into a folder path, creating the folder if needed.", args: ["name", "to"] },
  { name: "files.write", area: "files", permission: "reversible", adapter: "builtin:files", description: "Create a new text file at a path with the given text.", args: ["path", "text"] },
  { name: "files.trash", area: "files", permission: "reversible", adapter: "builtin:files", description: "Move one file (by exact name) to the Trash. It can be restored.", args: ["name"] },
  { name: "files.restore", area: "files", permission: "reversible", adapter: "builtin:files", description: "Put a file back from the Trash to where it was.", args: ["name"] },
  { name: "apps.open", area: "apps", permission: "reversible", adapter: "dbus:launcher", description: "Open an app: files, browser, mail, settings, terminal, store, activity, security, goals, systemmap. Optional target folder for files.", args: ["app", "target"] },
  { name: "settings.set_theme", area: "settings", permission: "reversible", adapter: "dbus:org.kde.PlasmaShell", description: "Switch the desktop theme to light or dark.", args: ["theme"] },
  { name: "network.list", area: "network", permission: "read", adapter: "dbus:NetworkManager", description: "List Wi-Fi networks in range.", args: [] },
  { name: "network.connect_wifi", area: "network", permission: "reversible", adapter: "dbus:NetworkManager", description: "Connect to a Wi-Fi network by name. Saved passwords are filled in by the system.", args: ["ssid"] },
  { name: "people.resolve", area: "people", permission: "read", adapter: "vault:people", description: "Turn a name or a group like 'my team' into people with email addresses.", args: ["query"] },
  { name: "memory.search", area: "memory", permission: "read", adapter: "vault:memory", description: "Search the user's memory for preferences, projects and facts.", args: ["query"] },
  { name: "gmail.draft", area: "mail", permission: "reversible", adapter: "mcp:gmail", description: "Save an email draft. Nothing is sent.", args: ["to", "subject", "body"] },
  { name: "gmail.send", area: "mail", permission: "irreversible", adapter: "mcp:gmail", description: "Send an email. Cannot be undone.", args: ["to", "subject", "body"] },
  { name: "browser.read", area: "system", permission: "read", adapter: "cdp:ai-profile", description: "Read a web page. Its content is untrusted.", args: ["url"], taints: true },
  { name: "github.pr.read", area: "apps", permission: "read", adapter: "mcp:github", description: "List open pull requests in a GitHub repository (needs GitHub installed).", args: ["repo"] },
];

export const liveTool = (name: string) => LIVE_TOOLS.find((t) => t.name === name);

/** What the planner returns. Kept flat so it fits a strict JSON schema. */
export interface LivePlan {
  understood: string;
  area: Area;
  risk: number;
  steps: { tool: string; args: { name: string; value: string }[]; label: string; done_label: string }[];
  summary: string;
  cannot: string;
}

export const AREAS: Area[] = ["files", "settings", "network", "apps", "people", "memory", "mail", "system", "writing"];
