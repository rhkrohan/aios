"use client";

// Live machine mode: requests go to a real model acting on real files through
// capd, and the task view follows along. Your approvals go back through the
// server; the browser never holds a key, a token or the owner secret.

import { useOS, uid } from "./store";
import type { PolicyCheck, Run, Step } from "./types";

const os = () => useOS.getState();

export const LIVE_PRINCIPAL = "OpenAI (live)";

const CHECK_LABEL: Record<string, string> = {
  token: "Is its pass genuine and current?",
  principal: "Is this AI active?",
  iam: "What do its roles allow?",
  tool: "Is this a real tool?",
  grant: "Does its pass include this tool?",
  slice: "Is this inside its folders?",
  place: "Is this place blocked?",
  uses: "Does the pass have uses left?",
  budget: "Is the goal within its budget?",
  egress: "May it send things out?",
  taint: "Did it read untrusted content?",
  flow: "What data would leave?",
  level: "Does this need your OK?",
};

export function toChecks(raw: unknown): PolicyCheck[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c: { id: string; result: PolicyCheck["result"]; detail: string }) => ({ id: c.id, label: CHECK_LABEL[c.id] ?? c.id, result: c.result, detail: c.detail }));
}

/** "files_read" (as models send it) and "files.read" are the same tool; "files.show" stays as is. */
const canon = (t: string) => (t.includes(".") ? t : t.replace("_", "."));

/** Plain words for a tool call. */
function say(tool: string, a: Record<string, unknown>): string {
  const p = String(a.path ?? "");
  switch (canon(tool)) {
    case "files.list":
      return `Looking in ${p || "the home folder"}`;
    case "files.find":
      return `Finding "${a.query}" in ${p || "the home folder"}`;
    case "files.read":
      return `Reading ${p}`;
    case "files.write":
      return `Writing ${p}`;
    case "files.move":
      return `Moving ${a.from} to ${a.to}`;
    case "files.organize":
      return `Moving ${Array.isArray(a.moves) ? a.moves.length : "several"} files`;
    case "files.trash":
      return `Moving ${p} to the Trash`;
    case "files.copy":
      return `Copying ${a.from} to ${a.to}`;
    case "memory.save":
      return `Remembering: ${String(a.text ?? "").slice(0, 60)}`;
    case "memory.search":
      return `Looking in memory for "${a.query}"`;
    case "memory.forget":
      return "Forgetting a memory";
    case "people.resolve":
      return `Looking up ${a.query}`;
    case "mail.send":
      return `Emailing ${[a.to].flat().join(", ")}`;
    case "apps.open":
      return `Opening ${a.app}`;
    case "files.show":
      return `Showing you ${p}`;
    case "files.preview":
      return `Previewing ${p}`;
    case "system.notify":
      return "Notifying you";
    case "settings.set_theme":
      return `Switching to ${a.theme} mode`;
    case "network.connect_wifi":
      return `Joining ${a.ssid}`;
    case "network.wifi_power":
      return `Turning Wi-Fi ${a.on ? "on" : "off"}`;
    case "network.bluetooth_power":
      return `Turning Bluetooth ${a.on ? "on" : "off"}`;
    case "settings.set_volume":
      return `Setting volume to ${a.level}%`;
    case "settings.set_brightness":
      return `Setting brightness to ${a.level}%`;
    case "settings.dnd":
      return `Turning Do Not Disturb ${a.on ? "on" : "off"}`;
    case "settings.set_wallpaper":
      return `Changing the wallpaper to ${a.name}`;
    case "apps.close":
      return `Closing ${a.app}`;
    case "apps.focus":
      return `Bringing ${a.app} to the front`;
    case "apps.arrange":
      return `Putting ${a.left} and ${a.right} side by side`;
    case "system.lock":
      return "Locking the screen";
    case "system.remind":
      return `Reminder in ${a.minutes} min: ${a.text}`;
    case "apps.install":
      return `Installing ${a.app}`;
    case "apps.remove":
      return `Removing ${a.app}`;
    default:
      return tool;
  }
}

const LEVEL: Record<string, "read" | "reversible" | "irreversible"> = {
  "apps.install": "irreversible",
  "apps.remove": "irreversible",
  "settings.set_volume": "reversible",
  "settings.set_brightness": "reversible",
  "settings.dnd": "reversible",
  "network.wifi_power": "reversible",
  "network.bluetooth_power": "reversible",
  "settings.set_wallpaper": "reversible",
  "system.lock": "reversible",
  "system.remind": "reversible",
  "files.list": "read",
  "files.find": "read",
  "files.read": "read",
  "files.write": "reversible",
  "files.move": "reversible",
  "files.organize": "reversible",
  "files.trash": "reversible",
  "files.copy": "reversible",
  "memory.save": "reversible",
  "memory.forget": "reversible",
  "memory.search": "read",
  "people.resolve": "read",
  "mail.send": "irreversible",
  "settings.set_theme": "reversible",
  "network.connect_wifi": "reversible",
};


let session: Promise<unknown> | null = null;

/** fetch for the live routes: picks up the page's session cookie first. */
export async function liveFetch(url: string, init?: RequestInit): Promise<Response> {
  session ??= fetch("/api/live/session").catch(() => (session = null));
  await session;
  const r = await fetch(url, init);
  if (r.status === 403) {
    // the dev server restarted and has a new secret: get a fresh session once
    session = fetch("/api/live/session");
    await session;
    return fetch(url, init);
  }
  return r;
}

async function post(url: string, body: unknown) {
  const r = await liveFetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) };
}

const ERRORS: Record<string, string> = {
  capd_down: "The live machine couldn't start. Open Settings, Brain to see why.",
  no_key: "No OpenAI key. Put OPENAI_API_KEY in build_concept_html/.env.local and restart pnpm dev.",
};

/** Carry out something capd allowed that happens on screen (on SIOS: D-Bus to KWin, NetworkManager, portals). */
function perform(effect: { type: string; [k: string]: unknown }) {
  const s = os();
  const home = (p: unknown) => (p ? `~/${p}` : "~");
  switch (effect.type) {
    case "open_app":
      s.openApp(effect.app as never);
      break;
    case "show_folder":
      s.openApp("files", { path: home(effect.path) });
      break;
    case "quick_look": {
      const p = String(effect.path ?? "");
      s.openApp("files", { path: home(p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "") });
      break;
    }
    case "notify":
      s.pushToast({ title: String(effect.text ?? ""), tone: "info" });
      break;
    case "set_theme":
      s.setTheme(effect.theme === "dark" ? "dark" : "light");
      break;
    case "connect_wifi":
      s.setWifi(String(effect.ssid ?? ""));
      s.pushToast({ title: `Connected to ${effect.ssid}`, tone: "ok" });
      break;
    case "volume":
      s.setVolume(Number(effect.level));
      break;
    case "brightness":
      s.setBrightness(Number(effect.level));
      break;
    case "dnd":
      s.setDnd(!!effect.on);
      break;
    case "wifi_power":
      s.setWifi(effect.on ? (s.wifi.connected ?? s.wifi.networks.find((n) => n.saved)?.ssid ?? null) : null);
      break;
    case "bluetooth":
      s.setBluetooth(!!effect.on);
      break;
    case "wallpaper":
      s.setWallpaper(effect.name === "lake" ? "lake" : "dusk");
      break;
    case "close_app":
      for (const w of s.windows.filter((w) => w.app === effect.app)) s.closeWindow(w.id);
      break;
    case "focus_app": {
      const w = s.windows.find((x) => x.app === effect.app);
      if (w) s.focusWindow(w.id);
      else s.openApp(effect.app as never);
      break;
    }
    case "side_by_side": {
      // two halves of the screen, below the top bar and above the dock
      const W = typeof window === "undefined" ? 1600 : window.innerWidth;
      const H = typeof window === "undefined" ? 960 : window.innerHeight;
      const half = Math.floor((W - 24) / 2);
      for (const [i, app] of [effect.left, effect.right].entries()) {
        s.openApp(app as never);
        const w = useOS.getState().windows.find((x) => x.app === app);
        if (w) useOS.setState((st) => ({ windows: st.windows.map((x) => (x.id === w.id ? { ...x, x: 8 + i * (half + 8), y: 44, w: half, h: H - 44 - 96, minimized: false } : x)) }));
      }
      break;
    }
    case "lock":
      s.setPower("locked");
      break;
    case "remind": {
      const minutes = Number(effect.minutes);
      const text = String(effect.text ?? "Reminder");
      s.pushToast({ title: `I'll remind you in ${minutes} minute${minutes === 1 ? "" : "s"}`, body: text, tone: "info" });
      setTimeout(() => {
        useOS.getState().pushToast({ title: `Reminder: ${text}`, tone: "info" });
        notify(`Reminder: ${text}`);
      }, minutes * 60_000);
      break;
    }
    case "install":
      s.install(String(effect.app), "1.0.0");
      s.pushToast({ title: `Installed ${effect.app}`, tone: "ok" });
      break;
    case "uninstall":
      s.uninstall(String(effect.app));
      s.pushToast({ title: `Removed ${effect.app}`, tone: "info" });
      break;
  }
}

/** What a "do it yourself" button may do: show you where, never change anything itself. */
export const MANUAL_TOOLS = ["files.show", "apps.open", "files.preview", "apps.focus"];

/** An action the owner takes themselves from a "do it yourself" button. */
export async function doItYourself(tool: string, args: Record<string, unknown>) {
  const t = canon(tool);
  if (!MANUAL_TOOLS.includes(t)) return;
  if (t.startsWith("files.")) {
    const { liveOwner, refreshLive } = await import("./livemirror");
    try {
      // reading is just showing: open it in Files
      if (t === "files.read" || t === "files.list" || t === "files.find") {
        const p = String(args.path ?? "");
        os().openApp("files", { path: p ? `~/${t === "files.read" && p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : p}` : "~" });
        return;
      }
      await liveOwner("do", { tool: t, args });
      refreshLive();
      os().pushToast({ title: "Done", tone: "ok" });
    } catch (e) {
      os().pushToast({ title: "Couldn't do that", body: e instanceof Error ? e.message : String(e), tone: "warn" });
    }
    return;
  }
  const effect: Record<string, { type: string; [k: string]: unknown }> = {
    "apps.open": { type: "open_app", app: args.app },
    "files.show": { type: "show_folder", path: args.path },
    "files.preview": { type: "quick_look", path: args.path },
    "settings.set_theme": { type: "set_theme", theme: args.theme },
    "settings.set_wallpaper": { type: "wallpaper", name: args.name },
    "apps.close": { type: "close_app", app: args.app },
    "apps.focus": { type: "focus_app", app: args.app },
    "apps.arrange": { type: "side_by_side", left: args.left, right: args.right },
    "settings.set_volume": { type: "volume", level: args.level },
    "settings.set_brightness": { type: "brightness", level: args.level },
    "settings.dnd": { type: "dnd", on: args.on },
    "network.wifi_power": { type: "wifi_power", on: args.on },
    "network.bluetooth_power": { type: "bluetooth", on: args.on },
    "network.connect_wifi": { type: "connect_wifi", ssid: args.ssid },
    "system.lock": { type: "lock" },
    "system.remind": { type: "remind", minutes: args.minutes, text: args.text },
    "apps.install": { type: "install", app: args.app },
    "apps.remove": { type: "uninstall", app: args.app },
  };
  if (effect[t]) perform(effect[t]);
  else if (t === "mail.send") os().openApp("mail");
}

/** The conversation the next request belongs to (forgotten after 10 quiet minutes). */
let thread: { id: string; at: number } | null = null;
export function newConversation() {
  thread = null;
}

export async function runLiveMachine(text: string): Promise<string> {
  const runId = uid("run");
  const first: Step = { id: uid("s"), kind: "context", label: "Briefing the brain on this computer", status: "active" };
  os().addRun({ id: runId, request: text, scenarioId: "live-machine", area: "files", status: "running", route: "cloud", steps: [first], startedAt: Date.now(), undoable: false, principal: "owner", tainted: false, plannedBy: "brain-d" } as Run);
  os().setFocusedRun(runId);

  const th = thread && Date.now() - thread.at < 10 * 60_000 ? thread.id : undefined;
  let start = await post("/api/live/run", { request: text, thread: th });
  if (start.json.error === "capd_down") {
    // start the live machine for you, then try once more
    os().updateStep(runId, first.id, { label: "Starting the live machine" });
    await setDaemon("start");
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const st = await liveFetch("/api/live/status").then((r) => r.json()).catch(() => ({}));
      if ((st.capd && st.brain) || st.daemon?.error) break;
    }
    os().updateStep(runId, first.id, { label: "Briefing the brain on this computer" });
    start = await post("/api/live/run", { request: text, thread: th });
  }
  if (!start.ok) {
    os().updateStep(runId, first.id, { status: "blocked", doneLabel: "Couldn't start", detail: ERRORS[start.json.error] ?? start.json.error });
    os().updateRun(runId, (r) => ({ ...r, status: "failed", summary: ERRORS[start.json.error] ?? "The live machine couldn't start this.", endedAt: Date.now() }));
    return runId;
  }
  seen.add(start.json.job);
  if (start.json.thread) thread = { id: start.json.thread, at: Date.now() };
  await follow(runId, first.id, start.json.job, text, "owner");
  return runId;
}

/** Goals already shown, so outside AIs' goals are picked up once. */
const seen = new Set<string>();

/** A goal an outside AI started over MCP: show it and let the owner decide, like any other. */
export async function followExternal(goal: string, request: string, principal: string) {
  if (seen.has(goal)) return;
  seen.add(goal);
  const runId = uid("run");
  const first: Step = { id: uid("s"), kind: "context", label: `${principal} asked SIOS`, status: "active" };
  os().addRun({ id: runId, request, scenarioId: "live-machine", area: "files", status: "running", route: "cloud", steps: [first], startedAt: Date.now(), undoable: false, principal: "owner", tainted: false, plannedBy: principal } as Run);
  os().pushToast({ title: `${principal} wants SIOS to: ${request.slice(0, 80)}`, tone: "info" });
  await follow(runId, first.id, goal, request, principal);
}

async function follow(runId: string, firstId: string, job: string, text: string, principal: string) {
  const who = principal === "owner" ? "SIOS" : principal;
  const add = (s: Omit<Step, "id">) => {
    const step = { ...s, id: uid("s") } as Step;
    os().updateRun(runId, (r) => ({ ...r, steps: [...r.steps, step] }));
    return step.id;
  };
  const end = (status: Run["status"], summary: string) => os().updateRun(runId, (r) => ({ ...r, status, summary, endedAt: Date.now() }));
  const steps = new Map<number, string>();
  let since = 0;
  let goal: string | undefined;

  for (;;) {
    await new Promise((r) => setTimeout(r, 400));
    const r = await liveFetch(`/api/live/run?job=${job}&since=${since}`).then((x) => x.json()).catch(() => ({}));
    since = r.next ?? since;
    for (const e of r.events ?? []) {
      if (e.t === "brief") {
        os().updateStep(runId, firstId, { status: "done", doneLabel: `Briefed on ${e.files} files, labels and people`, ms: e.ms });
      } else if (e.t === "recall") {
        const shown = (e.shown ?? []) as string[];
        const notes = [
          e.privacy === 0 ? "privacy: nothing personal shared" : e.hidden_names ? "names hidden from the model as [PERSON_n]" : "",
          e.held_back ? `${e.held_back} sensitive held back` : "",
        ].filter(Boolean);
        add({
          kind: "context",
          label: "Remembering",
          doneLabel: shown.length ? `Remembered ${shown.length} thing${shown.length === 1 ? "" : "s"}` : "Nothing relevant in memory",
          detail: notes.join(", ") || undefined,
          chips: shown.slice(0, 4).map((t) => (t.length > 60 ? t.slice(0, 57) + "..." : t)),
          status: "done",
        });
      } else if (e.t === "plan") {
        add({
          kind: e.source === "routine" ? "recipe" : "think",
          label: "Planning",
          doneLabel: e.source === "routine" ? "Used a saved routine (no model call)" : e.steps.length === 0 ? "Decided not to act (one model call)" : `Planned ${e.steps.length} step${e.steps.length === 1 ? "" : "s"} in one model call`,
          detail: e.understanding,
          status: "done",
          ms: e.ms,
        });
      } else if (e.t === "replan") {
        add({ kind: "guard", label: "The broker refused part of the plan", doneLabel: "Re-planned once, within the rules", detail: (e.because ?? []).join("; "), status: "done" });
      } else if (e.t === "review" && e.pass?.rule) {
        // the owner's standing rule already covers this pass: capd granted it, no sheet
        for (const s of e.steps ?? []) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(s.args_json || "{}");
          } catch {
            /* shown as is */
          }
          steps.set(s.n, add({ kind: s.kind === "compose" ? "think" : "tool", label: s.kind === "compose" ? `Write text from ${(s.sources ?? []).join(", ")}` : say(s.tool, args), detail: s.why, status: "pending" }));
        }
        add({ kind: "context", label: "Pass", doneLabel: `Started by your standing rule: ${e.pass.rule}`, status: "done" });
      } else if (e.t === "review") {
        // one sheet: the whole plan, the pass it needs, and what will still ask
        for (const s of e.steps ?? []) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(s.args_json || "{}");
          } catch {
            /* shown as is */
          }
          const label = s.kind === "compose" ? `Write text from ${(s.sources ?? []).join(", ")}` : say(s.tool, args);
          steps.set(s.n, add({ kind: s.kind === "compose" ? "think" : "tool", label, detail: s.why, status: "pending" }));
        }
        os().updateRun(runId, (x) => ({ ...x, status: "waiting" }));
        const pass = e.pass ?? {};
        const answer = await os().askApproval({
          id: uid("ap"),
          runId,
          kind: "reversible",
          area: "files",
          title: "Run this plan?",
          request: text,
          principalName: principal === "owner" ? undefined : principal,
          noDuration: true,
          primaryLabel: "Run plan",
          denyLabel: "Don't",
          changes: [{ text: pass.egress ? "Sending still asks you at that step" : "Anywhere outside these paths is refused" }],
          plan: (e.steps ?? []).map((s: { n: number; kind: string; tool: string; args_json: string; sources: string[]; decision: string; reason: string }) => {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(s.args_json || "{}");
            } catch {
              /* shown as is */
            }
            return {
              n: s.n,
              text: s.kind === "compose" ? `Write text from ${s.sources.join(", ")}` : say(s.tool, args),
              note: s.decision === "ask" ? "will ask you" : s.decision === "block" ? s.reason : undefined,
              tone: s.decision === "allow" ? "ok" : s.decision,
            };
          }),
          pass: { tools: pass.tools ?? [], folders: pass.paths ?? [], limits: "15 minutes, only the steps above" },
          // nothing irreversible can become a standing rule
          alwaysLabel: (pass.tools ?? []).some((t: string) => LEVEL[t] === "irreversible") ? undefined : "Always allow plans like this (a standing rule)",
        });
        os().updateRun(runId, (x) => ({ ...x, status: "running" }));
        await post("/api/live/decide", { kind: "pass", id: pass.id, yes: answer !== "deny" });
        if (answer === "always") {
          // the rule covers the same tools in the same folders (a file's folder, not just the file)
          const folders = Array.from(new Set((pass.paths ?? []).map((p: string) => (/\.[a-z0-9]{1,6}$/i.test(p) && p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : p))));
          const r = await post("/api/live/owner", { action: "rule_add", tools: pass.tools, paths: folders, note: text.slice(0, 120) });
          os().pushToast({ title: r.ok ? "Saved as a standing rule" : "Couldn't save the rule", body: r.ok ? `Plans using ${(pass.tools ?? []).join(", ")} in ${folders.join(", ") || "the home"} now start without asking. Change it in Settings, Permissions.` : r.json.error, tone: r.ok ? "ok" : "warn" });
        }
      } else if (e.t === "granted") {
        goal = e.goal;
      } else if (e.t === "ask") {
        const sid = steps.get(e.n);
        if (sid) os().updateStep(runId, sid, { status: "active" });
        os().updateRun(runId, (x) => ({ ...x, status: "waiting" }));
        const checks = toChecks(e.checks);
        const a = e.args as { to?: unknown; subject?: string; body?: string; attach?: string };
        const answer = await os().askApproval({
          id: uid("ap"),
          runId,
          kind: LEVEL[e.tool] === "irreversible" ? "irreversible" : "reversible",
          area: "files",
          title: `${say(e.tool, e.args)}?`,
          request: text,
          principalName: who === "SIOS" ? undefined : who,
          noDuration: true,
          checks,
          tainted: checks.some((c) => c.id === "taint" && c.result === "ask"),
          changes: [
            { text: say(e.tool, e.args), sub: e.reason },
            ...(a.subject ? [{ text: `Subject: ${a.subject}`, sub: String(a.body ?? "").slice(0, 200) }] : []),
            ...(a.attach ? [{ text: `Attaching ${a.attach}` }] : []),
          ],
        });
        os().updateRun(runId, (x) => ({ ...x, status: "running" }));
        await post("/api/live/decide", { kind: "call", id: e.approval, yes: answer !== "deny" });
      } else if (e.t === "step") {
        const sid = steps.get(e.n);
        const ok = e.decision === "allow" && !e.error;
        const patch: Partial<Step> =
          e.kind === "compose"
            ? { status: "done", doneLabel: `Wrote ${e.chars ?? 0} characters`, detail: e.preview, ms: e.ms }
            : {
                status: ok ? "done" : "blocked",
                broker: e.decision === "allow" ? "allowed" : e.decision === "denied" ? "denied" : "blocked",
                detail: ok ? undefined : (e.reason ?? e.error),
                checks: toChecks(e.result?.checks),
                tool: { name: e.tool, adapter: "capd", permission: LEVEL[e.tool] ?? "read", input: e.args ?? {} },
                ms: e.ms,
              };
        if (sid) os().updateStep(runId, sid, patch);
      } else if (e.t === "effect") {
        perform(e.effect);
      } else if (e.t === "question") {
        add({ kind: "think", label: "A question for you", doneLabel: e.text, detail: "Answer in the bar below; it continues this conversation.", status: "done" });
        os().updateRun(runId, (x) => ({ ...x, question: true }));
      } else if (e.t === "undo") {
        const r2 = await post("/api/live/undo", { goal: e.goal });
        add({ kind: "verify", label: "Undo", doneLabel: r2.ok ? `Undid the last goal (${r2.json.undone ?? 0} changes)` : "Couldn't undo it", status: r2.ok ? "done" : "blocked" });
        const prev = os().runs.find((x) => x.liveGoal === e.goal);
        if (prev) os().updateRun(prev.id, (x) => ({ ...x, undone: true, undoable: false }));
      } else if (e.t === "done") {
        const st = e.stats ?? {};
        const calls = `${st.model_calls ?? 0} model call${st.model_calls === 1 ? "" : "s"}`;
        const n = st.steps ?? 0;
        add({
          kind: "verify",
          label: "Done",
          doneLabel: e.failed
            ? `Stopped after ${n} step${n === 1 ? "" : "s"} (${calls}, ${((st.ms ?? 0) / 1000).toFixed(1)}s)`
            : `${calls}, ${n} step${n === 1 ? "" : "s"}, ${((st.ms ?? 0) / 1000).toFixed(1)}s${st.source === "routine" ? ", from a routine" : ""}`,
          status: e.failed ? "blocked" : "done",
        });
        const manual = (e.manual ?? [])
          .filter((m: { tool: string }) => MANUAL_TOOLS.includes(canon(m.tool)))
          .map((m: { label: string; tool: string; args_json: string }) => {
            try {
              return { label: m.label, tool: m.tool, args: JSON.parse(m.args_json || "{}") };
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        os().updateRun(runId, (x) => ({ ...x, undoable: !!goal && !e.failed, liveGoal: goal, manual: manual.length ? manual : undefined }));
        end(e.failed ? "failed" : "done", e.text);
        notify(e.text);
        return;
      } else if (e.t === "error") {
        end("failed", e.message);
        return;
      }
    }
    if (r.over && !(r.events ?? []).length) {
      end("failed", "The goal stopped without finishing.");
      return;
    }
  }
}

function notify(text: string) {
  useOS.setState((s) => ({ notifications: [{ id: uid("note"), title: text.slice(0, 120), tone: "ok" as const, at: Date.now() }, ...s.notifications].slice(0, 30) }));
}

/** Undo everything a live goal changed on the real sandbox. */
export async function undoLiveGoal(runId: string) {
  const run = os().runs.find((r) => r.id === runId);
  if (!run?.liveGoal) return;
  const r = await post("/api/live/undo", { goal: run.liveGoal });
  os().updateRun(runId, (x) => ({ ...x, undone: true, undoable: false }));
  os().pushToast({ title: r.ok ? `Undone on the real machine (${r.json.undone ?? 0} changes)` : "Couldn't undo", body: r.ok ? undefined : r.json.error, tone: r.ok ? "info" : "warn" });
}

/** Start or stop capd from the page. */
export async function setDaemon(action: "start" | "stop") {
  const r = await liveFetch("/api/live/daemon", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
  return r.json();
}

/** Switch between the simulated machine and the live one (starting capd and brain-d if needed). */
export async function switchMachine(live: boolean) {
  os().updateSettings({ liveMachine: live });
  if (!live) return;
  const st = await liveFetch("/api/live/status").then((r) => r.json()).catch(() => ({}));
  if (!(st.capd && st.brain)) await setDaemon("start");
}
