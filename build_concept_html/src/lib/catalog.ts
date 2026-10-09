// The Store catalog. Mirrors what the v3 design doc says SIOS adds on top of
// MCP registry metadata: publisher trust, risk class, data access, execution
// type, auth type, and a mapping into SIOS tool names.

export type Trust = "official" | "verified" | "community" | "unknown";
export type Execution = "remote" | "sandbox";
export type Auth = "oauth" | "apikey" | "none";
export type Risk = "read" | "write" | "communication" | "financial" | "system";

export interface CapTool {
  name: string; // SIOS tool name, area.verb_object
  plain: string; // what it does, in plain words
  permission: "read" | "reversible" | "irreversible";
}

export interface Capability {
  id: string;
  name: string;
  tagline: string;
  description: string;
  publisher: string;
  trust: Trust;
  category: Category;
  execution: Execution;
  auth: Auth;
  risks: Risk[];
  dataLeaves: string; // what can leave this computer
  tools: CapTool[];
  color: [string, string];
  glyph: string; // monogram, used when there's no logo
  /** Key into BrandLogos.LOGOS, when a real mark is available. */
  logo?: import("@/components/icons/BrandLogos").LogoKey;
  /** Logo on a dark tile instead of white. */
  logoDark?: boolean;
  installs: string;
  rating: number;
  version: string;
  featured?: boolean;
  /** Present when an update is available. */
  update?: { version: string; notes: string };
}

export type Category = "Developer" | "Communication" | "Productivity" | "Files & storage" | "Finance" | "Smart home";

export const CATEGORIES: Category[] = ["Productivity", "Communication", "Developer", "Files & storage", "Finance", "Smart home"];

export const CATALOG: Capability[] = [
  {
    id: "github",
    logo: "github",
    logoDark: true,
    name: "GitHub",
    tagline: "Repositories, issues and pull requests",
    description:
      "Lets the assistant read your repositories, check issues and pull requests, and open new issues when you ask. Merges and pushes are not included.",
    publisher: "GitHub",
    trust: "official",
    category: "Developer",
    execution: "remote",
    auth: "oauth",
    risks: ["read", "write"],
    dataLeaves: "Only the repository data a task asks for, sent to GitHub.",
    tools: [
      { name: "github.repo.read", plain: "Read repositories you can access", permission: "read" },
      { name: "github.issue.read", plain: "Read issues", permission: "read" },
      { name: "github.pr.read", plain: "Read pull requests and their checks", permission: "read" },
      { name: "github.issue.create", plain: "Open new issues", permission: "irreversible" },
    ],
    color: ["#3a4049", "#14171b"],
    glyph: "GH",
    installs: "1.2M",
    rating: 4.8,
    version: "2.4.0",
    featured: true,
  },
  {
    id: "gcal",
    logo: "gcal",
    name: "Google Calendar",
    tagline: "Your schedule, availability and invites",
    description: "Read your calendar, find free time, and create events. Inviting other people always asks first.",
    publisher: "Google",
    trust: "official",
    category: "Productivity",
    execution: "remote",
    auth: "oauth",
    risks: ["read", "write", "communication"],
    dataLeaves: "Event details for the task, sent to Google.",
    tools: [
      { name: "calendar.events.read", plain: "See your events", permission: "read" },
      { name: "calendar.free_time.find", plain: "Find free time", permission: "read" },
      { name: "calendar.event.create", plain: "Add events to your calendar", permission: "reversible" },
      { name: "calendar.invite.send", plain: "Send invites to other people", permission: "irreversible" },
    ],
    color: ["#5aa2ff", "#2f6fe0"],
    glyph: "31",
    installs: "980K",
    rating: 4.7,
    version: "1.9.2",
    featured: true,
  },
  {
    id: "slack",
    name: "Slack",
    tagline: "Channels, threads and messages",
    description: "Catch up on channels, summarize threads, and draft replies. Sending a message always asks.",
    publisher: "Slack Technologies",
    trust: "official",
    category: "Communication",
    execution: "remote",
    auth: "oauth",
    risks: ["read", "communication"],
    dataLeaves: "Messages you ask about, sent to Slack.",
    tools: [
      { name: "slack.channels.read", plain: "Read channels you're in", permission: "read" },
      { name: "slack.thread.summarize", plain: "Summarize a thread", permission: "read" },
      { name: "slack.message.draft", plain: "Draft a reply", permission: "reversible" },
      { name: "slack.message.send", plain: "Send messages", permission: "irreversible" },
    ],
    color: ["#7a4b8c", "#4a1f5c"],
    glyph: "#",
    installs: "860K",
    rating: 4.6,
    version: "3.1.0",
    update: { version: "3.2.0", notes: "Adds thread summaries for huddles. No new permissions." },
  },
  {
    id: "notion",
    logo: "notion",
    name: "Notion",
    tagline: "Pages, databases and notes",
    description: "Search your workspace, read pages, and create new ones. Editing existing pages asks the first time.",
    publisher: "Notion Labs",
    trust: "verified",
    category: "Productivity",
    execution: "remote",
    auth: "oauth",
    risks: ["read", "write"],
    dataLeaves: "Page content for the task, sent to Notion.",
    tools: [
      { name: "notion.search", plain: "Search your workspace", permission: "read" },
      { name: "notion.page.read", plain: "Read pages", permission: "read" },
      { name: "notion.page.create", plain: "Create pages", permission: "reversible" },
    ],
    color: ["#ffffff", "#e6e6e6"],
    glyph: "N",
    installs: "640K",
    rating: 4.6,
    version: "1.4.1",
  },
  {
    id: "gmail",
    logo: "gmail",
    name: "Gmail",
    tagline: "Read, draft and send email",
    description: "Read threads, draft replies and send email. Sending always asks, with a full preview.",
    publisher: "Google",
    trust: "official",
    category: "Communication",
    execution: "remote",
    auth: "oauth",
    risks: ["read", "communication"],
    dataLeaves: "Emails the task needs, sent to Google.",
    tools: [
      { name: "gmail.thread.read", plain: "Read email", permission: "read" },
      { name: "gmail.draft", plain: "Write drafts", permission: "reversible" },
      { name: "gmail.send", plain: "Send email", permission: "irreversible" },
    ],
    color: ["#ff7a6b", "#d93f31"],
    glyph: "M",
    installs: "1.5M",
    rating: 4.7,
    version: "2.0.3",
  },
  {
    id: "drive",
    logo: "drive",
    name: "Google Drive",
    tagline: "Find and organize cloud files",
    description: "Search Drive, read documents, and move files into folders. Deleting is not included.",
    publisher: "Google",
    trust: "official",
    category: "Files & storage",
    execution: "remote",
    auth: "oauth",
    risks: ["read", "write"],
    dataLeaves: "File names and contents for the task, sent to Google.",
    tools: [
      { name: "drive.files.find", plain: "Search your Drive", permission: "read" },
      { name: "drive.file.read", plain: "Read documents", permission: "read" },
      { name: "drive.files.organize", plain: "Move files into folders", permission: "reversible" },
    ],
    color: ["#42c08a", "#1f8f5f"],
    glyph: "D",
    installs: "1.1M",
    rating: 4.5,
    version: "1.7.0",
  },
  {
    id: "linear",
    logo: "linear",
    name: "Linear",
    tagline: "Issues, cycles and projects",
    description: "Read and triage issues, and create new ones from notes or bug reports.",
    publisher: "Linear",
    trust: "verified",
    category: "Developer",
    execution: "remote",
    auth: "oauth",
    risks: ["read", "write"],
    dataLeaves: "Issue details for the task, sent to Linear.",
    tools: [
      { name: "linear.issues.read", plain: "Read issues", permission: "read" },
      { name: "linear.issue.create", plain: "Create issues", permission: "reversible" },
    ],
    color: ["#7b7ff5", "#4f52d1"],
    glyph: "L",
    installs: "210K",
    rating: 4.8,
    version: "0.9.4",
  },
  {
    id: "budget",
    name: "Budget Book",
    tagline: "Track spending from bank exports",
    description: "Reads CSV exports from your bank, sorts spending into categories, and answers questions. Runs entirely on this computer.",
    publisher: "openledger (community)",
    trust: "community",
    category: "Finance",
    execution: "sandbox",
    auth: "none",
    risks: ["read", "financial"],
    dataLeaves: "Nothing. Runs in a sandbox with no network access.",
    tools: [
      { name: "budget.statements.read", plain: "Read bank exports you choose", permission: "read" },
      { name: "budget.report.create", plain: "Write a spending report", permission: "reversible" },
    ],
    color: ["#f2b33d", "#c98316"],
    glyph: "$",
    installs: "18K",
    rating: 4.4,
    version: "0.5.2",
  },
  {
    id: "homeassistant",
    logo: "homeassistant",
    name: "Home Assistant",
    tagline: "Lights, thermostat and scenes",
    description: "Control devices on your home network. Unlocking doors is never included.",
    publisher: "Home Assistant",
    trust: "verified",
    category: "Smart home",
    execution: "sandbox",
    auth: "apikey",
    risks: ["read", "system"],
    dataLeaves: "Nothing leaves your home network.",
    tools: [
      { name: "home.devices.read", plain: "See device states", permission: "read" },
      { name: "home.scene.set", plain: "Turn scenes and lights on or off", permission: "reversible" },
    ],
    color: ["#4cc0f0", "#1886c2"],
    glyph: "H",
    installs: "92K",
    rating: 4.7,
    version: "2.1.0",
  },
];

export const TRUST_LABEL: Record<Trust, string> = {
  official: "Official",
  verified: "Verified publisher",
  community: "Community",
  unknown: "Unknown publisher",
};

export const RISK_LABEL: Record<Risk, string> = {
  read: "Reads data",
  write: "Makes changes",
  communication: "Contacts people",
  financial: "Financial data",
  system: "Controls devices",
};

/** Built in, always installed. Shown in the Installed tab. */
export const BUILT_IN = [
  { name: "Files", tools: 7, note: "files.find, files.organize and more" },
  { name: "Settings", tools: 4, note: "theme, display, sound" },
  { name: "Network", tools: 3, note: "Wi-Fi via NetworkManager" },
  { name: "Apps", tools: 5, note: "open, close, read, act" },
  { name: "Memory", tools: 2, note: "Vault search and save" },
];
