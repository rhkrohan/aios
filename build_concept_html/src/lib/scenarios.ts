import { useOS } from "./store";
import { ORGANIZE_GROUPS, TEAM } from "./seed";
import type {
  AppId,
  ApprovalRequest,
  Area,
  FileItem,
  Route,
  StepKind,
  ToolCall,
} from "./types";
import { BRAND } from "./brand";

type OS = ReturnType<typeof useOS.getState>;

export interface StepSpec {
  kind: StepKind;
  label: string;
  doneLabel?: string;
  detail?: string;
  chips?: string[];
  ms: number;
  tool?: ToolCall;
  /** Approval copy used if the broker decides to ask. */
  approval?: Omit<ApprovalRequest, "id" | "runId" | "kind" | "area" | "request" | "tool">;
  /** Route steps only. */
  routeTo?: Route;
  /** Route steps only: what happens if the user says no to cloud. */
  onDenyLabel?: string;
  /** Runs after the step succeeds. May return an undo function. */
  effect?: () => void | (() => void);
}

export interface Plan {
  steps: StepSpec[];
  summary: string;
  localSummary?: string;
  resultAction?: { label: string; app: AppId; props?: Record<string, string> };
  irreversibleNote?: string;
  /** The task can't run (e.g. a needed capability isn't installed). */
  fail?: boolean;
}

export interface Scenario {
  id: string;
  area: Area;
  title: string;
  example: string;
  hint: string;
  match: (t: string) => boolean;
  build: (ctx: { os: OS; text: string; usedRecipe: boolean }) => Plan;
}

const os = () => useOS.getState();

// ---------- reusable step builders ----------

const reflex = (area: string, areaP: number, risk: number, riskWord: string): StepSpec => ({
  kind: "reflex",
  label: "Understanding the request",
  doneLabel: `${area} task, ${riskWord} risk`,
  chips: [`area: ${area.toLowerCase()} ${areaP.toFixed(2)}`, `risk ${risk.toFixed(2)}`],
  ms: 380,
});

const recipe = (usedRecipe: boolean, name: string): StepSpec => ({
  kind: "recipe",
  label: "Checking saved routines",
  doneLabel: usedRecipe ? `Using your saved routine "${name}"` : "Nothing saved yet, planning it fresh",
  ms: 260,
});

const local = (why: string): StepSpec => ({
  kind: "route",
  label: "Choosing where to think",
  doneLabel: "Handled on this computer",
  detail: why,
  routeTo: "local",
  ms: 300,
});

// ---------- scenarios ----------

export const SCENARIOS: Scenario[] = [
  {
    id: "github-prs",
    area: "apps",
    title: "Check my pull requests",
    example: "Check my open pull requests",
    hint: "Needs GitHub from the Store.",
    match: (t) => /(pull request|\bprs?\b|github|issues)/.test(t),
    build: ({ os: state }) => {
      const gh = state.installed.github;
      if (!gh || gh.disabledTools.includes("github.pr.read")) {
        return {
          fail: true,
          summary: "This needs GitHub. Install it from the Store, then ask again.",
          resultAction: { label: "Get GitHub", app: "store", props: { cap: "github" } },
          steps: [
            reflex("Developer", 0.93, 0.08, "low"),
            {
              kind: "recipe",
              label: "Looking for a tool that can do this",
              doneLabel: "No installed tool can read GitHub",
              detail: "The assistant can only use tools you've installed. It can't make new ones up.",
              ms: 500,
            },
          ],
        };
      }
      return {
        summary: "You have 3 open pull requests. One is waiting for your review: \"Add brain-d stub unit\".",
        resultAction: { label: "Open GitHub", app: "browser" },
        steps: [
          reflex("Developer", 0.95, 0.06, "low"),
          local("Reading your own data, stays private"),
          {
            kind: "tool",
            label: "Reading your pull requests",
            doneLabel: "Found 3 open pull requests",
            ms: 900,
            tool: {
              name: "github.pr.read",
              adapter: "mcp:github",
              permission: "read",
              input: { repo: "rhkrohan/aios", state: "open" },
              output: {
                pull_requests: [
                  { number: 14, title: "Add brain-d stub unit", review: "requested" },
                  { number: 13, title: "Wallpaper and branding", checks: "passing" },
                  { number: 11, title: "Pin Aurora digest", checks: "running" },
                ],
              },
            },
          },
          { kind: "verify", label: "Checking the list is current", doneLabel: "Up to date as of now", ms: 300 },
        ],
      };
    },
  },
  {
    id: "email-team",
    area: "mail",
    title: "Email my team the Q3 notes",
    example: "Email my team the Q3 notes",
    hint: "Uses memory, contacts and Mail. Sending always asks.",
    match: (t) => /\b(e-?mail|mail|send)\b/.test(t),
    build: ({ usedRecipe }) => {
      const subject = "Q3 notes";
      const body = `Hi all,\n\nAttached are the Q3 notes from this week. Main points: Phase 0 image builds and signs, ISO is ready, VM testing is next.\n\nShout if anything looks off.\n\n${BRAND.user}`;
      return {
        summary: "Emailed Muhammad, Sara and Daniel with the Q3 notes attached.",
        resultAction: { label: "Open in Mail", app: "mail" },
        irreversibleNote: "A sent email can't be unsent. Everything else in this task was read-only.",
        steps: [
          {
            kind: "context",
            label: "Checking what I know",
            doneLabel: 'Remembered who "my team" is',
            chips: ['"my team" = 3 people', "Q3 notes in Documents"],
            ms: 600,
          },
          reflex("Mail", 0.96, 0.72, "high"),
          recipe(usedRecipe, "Email my team"),
          local("Short email with personal details, so it stays private"),
          {
            kind: "tool",
            label: "Looking up your team",
            doneLabel: "Your team: Muhammad, Sara and Daniel",
            ms: 420,
            tool: {
              name: "people.resolve",
              adapter: "vault:people",
              permission: "read",
              input: { query: "my team" },
              output: { people: TEAM.map((p) => ({ type: "Person", name: p.name, emails: [p.email] })) },
            },
          },
          {
            kind: "tool",
            label: "Finding the Q3 notes",
            doneLabel: "Found Q3 notes.md in Documents",
            ms: 380,
            tool: {
              name: "files.find",
              adapter: "builtin:files",
              permission: "read",
              input: { query: "Q3 notes", in: "~" },
              output: { files: [{ type: "File", path: "~/Documents/Q3 notes.md", size: "12 KB" }] },
            },
          },
          {
            kind: "think",
            label: "Writing a short email",
            doneLabel: "Draft written",
            detail: "Written on this computer in your usual tone",
            ms: 1100,
          },
          {
            kind: "tool",
            label: "Saving it as a draft",
            doneLabel: "Draft saved in Mail",
            ms: 420,
            tool: {
              name: "gmail.draft",
              adapter: "mcp:gmail",
              permission: "reversible",
              input: { to: TEAM.map((p) => p.email), subject, attach: "~/Documents/Q3 notes.md" },
              output: { draft_id: "r-58321", saved: true },
            },
            approval: {
              title: "Let " + BRAND.name + " save drafts in Mail?",
              changes: [{ text: "Create a draft email", sub: "Nothing is sent. You can delete the draft anytime." }],
            },
          },
          {
            kind: "tool",
            label: "Sending",
            doneLabel: "Sent to 3 people",
            ms: 700,
            tool: {
              name: "gmail.send",
              adapter: "mcp:gmail",
              permission: "irreversible",
              input: { draft_id: "r-58321" },
              output: { sent: true, message_id: "<5f1c.q3@mail>" },
            },
            approval: {
              title: "Send this email to 3 people?",
              changes: [
                { text: "Send from your Gmail account", sub: "Signed in once through Connections. The AI never sees your password." },
                { text: "Attach Q3 notes.md", sub: "12 KB, from Documents" },
              ],
              preview: { type: "email", to: TEAM, subject, body, attachment: "Q3 notes.md" },
              primaryLabel: "Send email",
              denyLabel: "Don't send",
            },
            effect: () => {
              os().addMail({
                id: "m" + Date.now(),
                to: TEAM,
                subject,
                body,
                attachment: "Q3 notes.md",
                time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
              });
            },
          },
          {
            kind: "verify",
            label: "Confirming it left your outbox",
            doneLabel: "Delivered to the mail server",
            ms: 450,
          },
        ],
      };
    },
  },
  {
    id: "clean-downloads",
    area: "files",
    title: "Clean up my Downloads",
    example: "Clean up my Downloads",
    hint: "Moves files into folders. Snapshot first, undo anytime.",
    match: (t) => /(clean|tidy|organi[sz]e|sort)/.test(t) && /download/.test(t),
    build: ({ os: state, usedRecipe }) => {
      const loose = state.fs["~/Downloads"].filter((x) => x.kind !== "folder");
      const groups = ORGANIZE_GROUPS.map((g) => ({
        folder: g.folder,
        files: loose.filter((x) => g.kinds.includes(x.kind)),
      })).filter((g) => g.files.length);
      const count = loose.length;

      if (!count) {
        return {
          summary: "Downloads is already tidy. Nothing to move.",
          steps: [reflex("Files", 0.97, 0.05, "low"), {
            kind: "tool",
            label: "Looking through Downloads",
            doneLabel: "No loose files found",
            ms: 450,
            tool: { name: "files.find", adapter: "builtin:files", permission: "read", input: { in: "~/Downloads", loose: true }, output: { files: [] } },
          }],
        };
      }

      return {
        summary: `Organized ${count} files in Downloads into ${groups.length} folders. Nothing was deleted.`,
        resultAction: { label: "Show in Files", app: "files", props: { path: "~/Downloads" } },
        steps: [
          {
            kind: "context",
            label: "Checking what I know",
            doneLabel: "You like files grouped by type",
            chips: ["prefers folders by type", "never delete without asking"],
            ms: 520,
          },
          reflex("Files", 0.97, 0.31, "medium"),
          recipe(usedRecipe, "Clean up Downloads"),
          local("Everyday file task, stays private"),
          {
            kind: "tool",
            label: "Looking through Downloads",
            doneLabel: `Found ${count} loose files`,
            ms: 500,
            tool: {
              name: "files.find",
              adapter: "builtin:files",
              permission: "read",
              input: { in: "~/Downloads", loose: true },
              output: { count, files: loose.slice(0, 3).map((x) => ({ type: "File", name: x.name })).concat([{ type: "…", name: `+${count - 3} more` }]) },
            },
          },
          {
            kind: "think",
            label: "Planning where each file goes",
            doneLabel: `Planned ${groups.length} folders`,
            ms: 800,
          },
          {
            kind: "tool",
            label: "Moving files into folders",
            doneLabel: `Moved ${count} files into ${groups.length} folders`,
            ms: 1100,
            tool: {
              name: "files.organize",
              adapter: "builtin:files",
              permission: "reversible",
              snapshot: true,
              input: { in: "~/Downloads", by: "type", plan: Object.fromEntries(groups.map((g) => [g.folder, g.files.length])) },
              output: { moved: count, created: groups.map((g) => g.folder), deleted: 0 },
            },
            approval: {
              title: "Organize your Downloads folder?",
              changes: [
                { text: `Move ${count} files into ${groups.length} new folders`, sub: "Nothing is deleted or renamed" },
                { text: "A snapshot is saved first", sub: "One click puts everything back" },
              ],
              preview: { type: "moves", groups: groups.map((g) => ({ folder: g.folder, files: g.files.map((x) => x.name) })) },
              scope: "~/Downloads",
            },
            effect: () => {
              const prev = os().fs;
              const keep = prev["~/Downloads"].filter((x) => x.kind === "folder");
              const next = { ...prev };
              next["~/Downloads"] = [
                ...keep,
                ...groups.map((g) => ({
                  id: "fold_" + g.folder,
                  name: g.folder,
                  kind: "folder" as const,
                  modified: "Just now",
                  touchedBy: BRAND.name,
                })),
              ];
              for (const g of groups) next[`~/Downloads/${g.folder}`] = g.files.map((x) => ({ ...x }));
              os().setFs(next);
              os().openApp("files", { path: "~/Downloads" });
              return () => os().setFs(prev);
            },
          },
          {
            kind: "verify",
            label: "Checking every file landed",
            doneLabel: `All ${count} files accounted for`,
            ms: 480,
          },
        ],
      };
    },
  },
  {
    id: "open-project",
    area: "files",
    title: "Open my project folder",
    example: "Open my project folder",
    hint: "Remembers which project you mean.",
    match: (t) => /(open|show|go to)/.test(t) && /(project|sios|folder)/.test(t),
    build: ({ usedRecipe }) => ({
      summary: "Opened your SIOS project folder in Files.",
      resultAction: { label: "Show window", app: "files", props: { path: "~/Projects/sios" } },
      steps: [
        {
          kind: "context",
          label: "Checking what I know",
          doneLabel: "Your main project is SIOS",
          chips: ["active project: SIOS", "opened 2 hours ago"],
          ms: 560,
        },
        reflex("Files", 0.94, 0.06, "low"),
        recipe(usedRecipe, "Open project folder"),
        local("Everyday task, stays private"),
        {
          kind: "tool",
          label: "Finding the folder",
          doneLabel: "Found ~/Projects/sios",
          ms: 420,
          tool: {
            name: "files.find",
            adapter: "builtin:files",
            permission: "read",
            input: { query: "project folder", hint: "SIOS" },
            output: { file: { type: "File", path: "~/Projects/sios", kind: "folder", items: 6 } },
          },
        },
        {
          kind: "tool",
          label: "Opening it in Files",
          doneLabel: "Opened in Files",
          ms: 480,
          tool: {
            name: "apps.open",
            adapter: "dbus:org.kde.dolphin",
            permission: "reversible",
            input: { app: "org.kde.dolphin", target: "~/Projects/sios" },
            output: { window: { type: "Window", app: "Files", title: "sios", visible: true } },
          },
          approval: {
            title: `Let ${BRAND.name} open apps for you?`,
            changes: [{ text: "Open Files at ~/Projects/sios", sub: "Opens a window on your desktop. Nothing inside changes." }],
          },
          effect: () => {
            os().openApp("files", { path: "~/Projects/sios" });
            return () => {
              const w = os().windows.find((x) => x.app === "files");
              if (w) os().closeWindow(w.id);
            };
          },
        },
        {
          kind: "verify",
          label: "Checking the window is open",
          doneLabel: "Confirmed: Files is showing sios",
          ms: 380,
        },
      ],
    }),
  },
  {
    id: "theme",
    area: "settings",
    title: "Turn on dark mode",
    example: "Turn on dark mode",
    hint: "Changes a setting. Asks the first time.",
    match: (t) => /(dark|light)\s*(mode|theme)?|theme/.test(t),
    build: ({ os: state, text }) => {
      const target = /light/.test(text) ? "light" : "dark";
      const word = target === "dark" ? "Dark" : "Light";
      if (state.theme === target) {
        return {
          summary: `${word} mode is already on.`,
          steps: [reflex("Settings", 0.98, 0.04, "low"), {
            kind: "tool",
            label: "Reading the current theme",
            doneLabel: `Already ${word.toLowerCase()}`,
            ms: 300,
            tool: { name: "settings.get", adapter: "dbus:org.kde.PlasmaShell", permission: "read", input: { key: "theme" }, output: { theme: target } },
          }],
        };
      }
      return {
        summary: `Switched to ${word.toLowerCase()} mode.`,
        steps: [
          reflex("Settings", 0.98, 0.08, "low"),
          local("Settings change, stays on this computer"),
          {
            kind: "tool",
            label: `Switching to ${word.toLowerCase()} mode`,
            doneLabel: `${word} mode on`,
            ms: 520,
            tool: {
              name: "settings.set_theme",
              adapter: "dbus:org.kde.PlasmaShell",
              permission: "reversible",
              input: { theme: target === "dark" ? "Breeze Dark" : "Breeze" },
              output: { theme: target, applied: true },
            },
            approval: {
              title: `Let ${BRAND.name} change your settings?`,
              changes: [{ text: `Switch the desktop to ${word.toLowerCase()} mode`, sub: "Applies to every app that follows the system theme" }],
              preview: { type: "setting", from: state.theme === "dark" ? "Dark" : "Light", to: word },
            },
            effect: () => {
              const prev = os().theme;
              os().setTheme(target);
              return () => os().setTheme(prev);
            },
          },
          {
            kind: "verify",
            label: "Checking it applied",
            doneLabel: "The setting reported its new value",
            detail: "This tool returns the new state, so no extra check is needed",
            ms: 200,
          },
        ],
      };
    },
  },
  {
    id: "wifi",
    area: "network",
    title: "Connect to Home-5G",
    example: "Connect to Home-5G",
    hint: "Uses the saved password. The AI never sees it.",
    match: (t) => /(wi-?fi|network|internet|connect|home-?5g)/.test(t),
    build: ({ os: state, text }) => {
      const net = state.wifi.networks.find((n) => text.includes(n.ssid.toLowerCase())) ?? state.wifi.networks[0];
      if (state.wifi.connected === net.ssid) {
        return { summary: `Already connected to ${net.ssid}.`, steps: [reflex("Network", 0.95, 0.05, "low")] };
      }
      return {
        summary: `Connected to ${net.ssid}.`,
        steps: [
          {
            kind: "context",
            label: "Checking what I know",
            doneLabel: `${net.ssid} is a saved network`,
            chips: ["password kept by the system", "home network"],
            ms: 420,
          },
          reflex("Network", 0.95, 0.12, "low"),
          local("Works offline too"),
          {
            kind: "tool",
            label: "Scanning for networks",
            doneLabel: `${net.ssid} is in range, strong signal`,
            ms: 700,
            tool: {
              name: "network.list",
              adapter: "dbus:NetworkManager",
              permission: "read",
              input: {},
              output: { networks: state.wifi.networks.map((n) => ({ type: "Network", ssid: n.ssid, signal: n.signal, saved: n.saved })) },
            },
          },
          {
            kind: "tool",
            label: `Connecting to ${net.ssid}`,
            doneLabel: `Connected to ${net.ssid}`,
            detail: "The password was filled in by the system. The AI only saw a placeholder.",
            ms: 900,
            tool: {
              name: "network.connect_wifi",
              adapter: "dbus:NetworkManager",
              permission: "reversible",
              input: { ssid: net.ssid, password: `‹secret:wifi/${net.ssid}›` },
              output: { connected: true, network: { type: "Network", ssid: net.ssid, signal: net.signal } },
            },
            approval: {
              title: `Let ${BRAND.name} change your network?`,
              changes: [
                { text: `Switch Wi-Fi from ${state.wifi.connected ?? "nothing"} to ${net.ssid}`, sub: "Uses the saved password. The AI never sees it." },
              ],
            },
            effect: () => {
              const prev = os().wifi.connected;
              os().setWifi(net.ssid);
              return () => os().setWifi(prev);
            },
          },
          {
            kind: "verify",
            label: "Checking the connection",
            doneLabel: "Online, the network reported back",
            detail: "This tool returns the new state, so no extra check is needed",
            ms: 220,
          },
        ],
      };
    },
  },
  {
    id: "project-update",
    area: "writing",
    title: "Write a project update from my notes",
    example: "Write a project update from this week's notes",
    hint: "Harder task. Asks before using online AI.",
    match: (t) => /(write|summar|update|report)/.test(t),
    build: ({ os: state, usedRecipe }) => {
      const ai = state.settings.onlineAi ?? "online AI";
      return {
        summary: `Wrote "Project update.md" with ${ai} and saved it to Documents.`,
        localSummary: 'Wrote a shorter "Project update.md" on this computer and saved it to Documents.',
        resultAction: { label: "Show in Files", app: "files", props: { path: "~/Documents" } },
        steps: [
          {
            kind: "context",
            label: "Checking what I know",
            doneLabel: "Found this week's notes and your writing style",
            chips: ["2 notes from this week", "style: short and direct"],
            ms: 560,
          },
          reflex("Writing", 0.88, 0.22, "low"),
          recipe(usedRecipe, "Weekly project update"),
          {
            kind: "tool",
            label: "Reading your weekly notes",
            doneLabel: "Read 2 notes",
            ms: 450,
            tool: {
              name: "files.read",
              adapter: "builtin:files",
              permission: "read",
              input: { paths: ["~/Documents/Weekly notes, Oct 6.md", "~/Documents/Q3 notes.md"] },
              output: { files: 2, words: 1840 },
            },
          },
          {
            kind: "route",
            label: "Choosing where to think",
            doneLabel: `Using your online AI (${ai})`,
            detail: "Long writing works better online. Personal details are removed first.",
            onDenyLabel: "Staying on this computer",
            routeTo: "cloud",
            ms: 420,
            approval: {
              title: `Use ${ai} for this task?`,
              changes: [
                { text: "Send a cleaned-up copy of 2 notes", sub: "Names, emails and amounts are swapped for placeholders" },
                { text: "Names are put back on this computer", sub: `${ai} never sees who is involved` },
              ],
              preview: {
                type: "redaction",
                original:
                  "Met with Muhammad Rashid on the ISO build. Sara (sara.okafor@example.com) will mock the approval screen. Lease renewal is $1,450/mo.",
                redacted:
                  "Met with [PERSON_1] on the ISO build. [PERSON_2] ([EMAIL_1]) will mock the approval screen. [REMOVED: personal finance]",
                removed: ["2 names", "1 email", "1 amount"],
              },
              primaryLabel: `Use ${ai}`,
              denyLabel: "Keep it on this computer",
            },
          },
          {
            kind: "think",
            label: "Writing the update",
            doneLabel: "Draft written, names put back locally",
            ms: 1500,
          },
          {
            kind: "tool",
            label: 'Saving "Project update.md"',
            doneLabel: "Saved to Documents",
            ms: 420,
            tool: {
              name: "files.write",
              adapter: "builtin:files",
              permission: "reversible",
              input: { path: "~/Documents/Project update.md", bytes: 3120 },
              output: { file: { type: "File", path: "~/Documents/Project update.md", size: "3 KB" } },
            },
            approval: {
              title: `Let ${BRAND.name} create files for you?`,
              changes: [{ text: 'Create "Project update.md" in Documents', sub: "A new file. Nothing existing is changed." }],
              scope: "~/Documents",
            },
            effect: () => {
              const prev = os().fs;
              const file: FileItem = { id: "f_update", name: "Project update.md", kind: "text", size: "3 KB", modified: "Just now", touchedBy: BRAND.name };
              os().setFs({ ...prev, "~/Documents": [file, ...prev["~/Documents"].filter((x) => x.id !== "f_update")] });
              os().openApp("files", { path: "~/Documents" });
              return () => os().setFs(prev);
            },
          },
          {
            kind: "verify",
            label: "Checking the file",
            doneLabel: "File saved and readable",
            ms: 320,
          },
        ],
      };
    },
  },
];

export function matchScenario(text: string): Scenario | null {
  const t = text.toLowerCase();
  return SCENARIOS.find((s) => s.match(t)) ?? null;
}

/** Order shown in the command bar. */
export const SUGGESTED = ["open-project", "clean-downloads", "email-team", "theme", "wifi", "project-update", "github-prs"]
  .map((id) => SCENARIOS.find((s) => s.id === id)!);
