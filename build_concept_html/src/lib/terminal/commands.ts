"use client";

// The SIOS shell. A small command registry over the simulated machine. Every
// command prints lines made of coloured segments; file commands go through
// lib/fileops so they are stamped into each file's history and undoable, and
// `sios ask` goes through the real engine and permission broker.

import { verifyChain } from "@/lib/audit";
import { rel } from "@/lib/liveops";
import { liveOwner, refreshLive } from "@/lib/livemirror";
import { getBlob } from "@/lib/blobs";
import { BRAND } from "@/lib/brand";
import { runRequest } from "@/lib/engine";
import { childPath, kindOf, moveItems, newFolder, rename, trashItems } from "@/lib/fileops";
import { liveTool } from "@/lib/livetools";
import { labelsAt, searchObjects } from "@/lib/objects";
import { evaluate, leaseValid, principalName } from "@/lib/policy";
import { useOS } from "@/lib/store";
import { TRUST_LEVELS, trustLevelOf } from "@/lib/trust";
import type { FileItem, PolicyCheck, Run, Step, ToolCall } from "@/lib/types";
import { historyOf, originShort, originText, summaryOf } from "@/components/files/model";

export type Tone = "out" | "dim" | "ok" | "warn" | "err" | "dir" | "accent" | "bold";
export interface Seg {
  text: string;
  tone?: Tone;
}
export type Line = Seg[];

export interface Ctx {
  cwd: string;
  setCwd: (p: string) => void;
  print: (line: Line | string) => void;
  clear: () => void;
  close: () => void;
  history: string[];
  /** Set by long-running commands; Ctrl+C calls it to stop following. */
  onCancel: (fn: (() => void) | null) => void;
}

type Cmd = { help: string; run: (args: string[], ctx: Ctx) => void | Promise<void> };

const os = () => useOS.getState();
const s = (text: string, tone?: Tone): Seg => ({ text, tone });

// ---------------------------------------------------------------- paths

/** Resolve a path against the working directory. "~" is home; "/" maps to home too. */
export function resolve(cwd: string, arg?: string): string {
  if (!arg || arg === "~") return "~";
  let raw = arg.replace(/\/+$/, "") || "/";
  if (raw === "/" || raw.startsWith("/home/")) raw = "~" + raw.replace(/^\/home\/[^/]+/, "").replace(/^\/$/, "");
  else if (raw.startsWith("/")) raw = "~" + raw;
  const parts = raw.startsWith("~") ? raw.split("/").slice(1) : [...cwd.split("/").slice(1), ...raw.split("/")];
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return ["~", ...out].join("/");
}

const parentOf = (p: string) => (p === "~" ? "~" : p.slice(0, p.lastIndexOf("/")) || "~");
const baseOf = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const isDir = (p: string) => os().fs[p] !== undefined;

function itemAt(p: string): { dir: string; item: FileItem } | null {
  if (p === "~") return null;
  const dir = parentOf(p);
  const item = os().fs[dir]?.find((i) => i.name === baseOf(p));
  return item ? { dir, item } : null;
}

/** Split a command line into words, keeping "quoted strings" together. */
export function tokenize(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

const pad = (t: string, n: number) => (t.length >= n ? t.slice(0, n - 1) + " " : t + " ".repeat(n - t.length));

function nameSeg(item: FileItem): Seg {
  if (item.kind === "folder") return s(item.name + "/", "dir");
  if (item.trust === "untrusted") return s(item.name, "warn");
  return s(item.name);
}

// ---------------------------------------------------------------- sios ask streaming

const BROKER: Record<string, string> = {
  allowed: "read only",
  remembered: "already allowed",
  "asked-once": "you allowed once",
  "asked-session": "you allowed",
  "asked-approved": "you approved",
  denied: "you said no",
  blocked: "blocked by a rule",
};

function stepLine(step: Step): Line {
  const label = step.status === "active" ? step.label : step.doneLabel ?? step.label;
  const mark = step.status === "active" ? s("  ... ", "dim") : step.status === "blocked" ? s("  x   ", "err") : s("  ok  ", "ok");
  const line: Line = [mark, s(label, step.status === "blocked" ? "err" : step.status === "active" ? "dim" : "out")];
  if (step.tool && step.status !== "active") line.push(s(`  ${step.tool.name}`, "accent"));
  if (step.broker && step.status !== "active") line.push(s(`  [${BROKER[step.broker] ?? step.broker}]`, step.broker === "denied" || step.broker === "blocked" ? "err" : "dim"));
  return line;
}

async function follow(text: string, ctx: Ctx) {
  if (os().aiPaused) {
    ctx.print([s("All AI is paused. Run ", "warn"), s("sios resume", "bold"), s(" first.", "warn")]);
    return;
  }
  const before = os().runs.find((r) => !r.parentId)?.id;
  ctx.print([s("asking ", "dim"), s(BRAND.name, "accent"), s(`: "${text}"`, "dim")]);
  let runId: string | null = null;
  const seen = new Map<string, string>();
  let waitingShown = false;
  let done = false;

  await new Promise<void>((resolveDone) => {
    const finish = () => {
      unsub();
      ctx.onCancel(null);
      resolveDone();
    };
    const check = (run: Run | undefined) => {
      if (!run || done) return;
      for (const st of run.steps) {
        if (st.status === "pending") continue;
        const key = `${st.status}|${st.broker ?? ""}`;
        if (seen.get(st.id) === key) continue;
        // skip printing the "active" line again if we already printed a final one
        if (st.status === "active" && seen.has(st.id)) continue;
        seen.set(st.id, key);
        ctx.print(stepLine(st));
      }
      if (run.status === "waiting" && !waitingShown) {
        waitingShown = true;
        ctx.print([s("  ?   ", "accent"), s("Waiting for your OK in the approval dialog", "accent")]);
      }
      if (run.status !== "waiting") waitingShown = false;
      if (["done", "stopped", "failed"].includes(run.status)) {
        done = true; // printing updates the store, which calls us again
        const tone: Tone = run.status === "done" ? "ok" : run.status === "stopped" ? "warn" : "err";
        ctx.print([s(run.status === "done" ? "done: " : run.status === "stopped" ? "stopped: " : "failed: ", tone), s(run.summary ?? "", "out")]);
        if (run.undoable) ctx.print([s("  undo it from Activity, or run ", "dim"), s("sios goals", "bold")]);
        finish();
      }
    };
    const unsub = useOS.subscribe((st) => {
      if (!runId) {
        const top = st.runs.find((r) => !r.parentId);
        if (top && top.id !== before) runId = top.id;
      }
      if (runId) check(st.runs.find((r) => r.id === runId));
    });
    ctx.onCancel(() => {
      ctx.print([s("^C ", "dim"), s("stopped following. The task keeps running; see ", "dim"), s("sios goals", "bold")]);
      finish();
    });
    void runRequest(text).then((id) => {
      if (!id) {
        ctx.print([s("The assistant didn't start this task.", "warn")]);
        finish();
        return;
      }
      runId = id;
      check(os().runs.find((r) => r.id === id));
      finish();
    });
  });
}

// ---------------------------------------------------------------- commands

const CHECK_MARK: Record<PolicyCheck["result"], Seg> = {
  pass: s("  pass ", "ok"),
  ask: s("  ask  ", "accent"),
  fail: s("  fail ", "err"),
  skip: s("  skip ", "dim"),
};

function tree(dir: string, prefix: string, depth: number, ctx: Ctx) {
  const items = os().fs[dir] ?? [];
  items.forEach((it, i) => {
    const last = i === items.length - 1;
    ctx.print([s(prefix + (last ? "└── " : "├── "), "dim"), nameSeg(it)]);
    if (it.kind === "folder" && depth < 3) tree(childPath(dir, it.name), prefix + (last ? "    " : "│   "), depth + 1, ctx);
  });
}

const sios: Record<string, Cmd> = {
  ask: {
    help: 'sios ask "<request>"  Run a task through the assistant and broker',
    run: async (args, ctx) => {
      const text = args.join(" ").trim();
      if (!text) return ctx.print([s('usage: sios ask "clean up my Downloads"', "warn")]);
      await follow(text, ctx);
    },
  },
  goals: {
    help: "sios goals  List goal processes",
    run: (_a, ctx) => {
      const runs = os().runs;
      if (!runs.length) return ctx.print([s("No goals yet. Try ", "dim"), s('sios ask "clean up my Downloads"', "bold")]);
      ctx.print([s(pad("GOAL", 10) + pad("STATE", 10) + pad("BY", 18) + "REQUEST", "dim")]);
      runs.forEach((r, i) => {
        const tone: Tone = r.status === "done" ? "ok" : r.status === "running" || r.status === "waiting" ? "accent" : "warn";
        ctx.print([
          s(pad(`GP-${String(runs.length - i).padStart(4, "0")}`, 10)),
          s(pad(r.undone ? "undone" : r.status, 10), tone),
          s(pad(r.principal === "owner" ? "you" : principalName(r.principal), 18), "dim"),
          s(r.request),
        ]);
      });
    },
  },
  audit: {
    help: "sios audit [tail|verify]  Show or verify the tamper-evident log",
    run: (args, ctx) => {
      const log = os().audit;
      if (args[0] === "verify") {
        // live: capd verified its own log on disk
        if (os().settings.liveMachine) {
          const ok = os().liveIntact;
          return ctx.print([s(ok === null ? "capd hasn't reported yet" : ok ? `intact: capd verified every entry in its log on disk (${log.length} shown)` : "BROKEN: capd says its log on disk was changed", ok === false ? "err" : "ok")]);
        }
        const bad = verifyChain(log);
        if (!log.length) return ctx.print([s("The log is empty.", "dim")]);
        return bad === null
          ? ctx.print([s(`intact: all ${log.length} entries check out. head ${log[0].hash.slice(0, 12)}`, "ok")])
          : ctx.print([s(`BROKEN at entry #${bad}: it no longer matches its fingerprint`, "err")]);
      }
      if (!log.length) return ctx.print([s("No decisions logged yet.", "dim")]);
      log.slice(0, 10).forEach((e) => {
        const tone: Tone = e.outcome === "blocked" || e.outcome === "asked-no" ? "err" : e.outcome === "asked-yes" ? "accent" : "ok";
        ctx.print([s(pad(`#${e.seq}`, 6), "dim"), s(pad(e.outcome, 11), tone), s(pad(e.tool, 22), "accent"), s(pad(e.target || "-", 30)), s(e.hash.slice(0, 10), "dim")]);
      });
    },
  },
  trust: {
    help: "sios trust  Trust level of every agent",
    run: (_a, ctx) => {
      const trust = os().trust;
      const ids = ["owner", ...Object.keys(trust)];
      ids.forEach((id) => {
        const level = trustLevelOf(trust, id);
        const bar = "█".repeat(level) + "░".repeat(4 - level);
        ctx.print([
          s(pad(id === "owner" ? "you" : principalName(id), 18)),
          s(bar + " ", level >= 3 ? "ok" : level === 2 ? "accent" : level === 1 ? "warn" : "err"),
          s(pad(TRUST_LEVELS[level].name, 10), "bold"),
          s(id === "owner" ? "" : `score ${trust[id]?.score ?? 0}${trust[id]?.override !== null && trust[id]?.override !== undefined ? " (set by you)" : ""}`, "dim"),
        ]);
      });
    },
  },
  leases: {
    help: "sios leases  Active permissions and time left",
    run: (_a, ctx) => {
      const now = Date.now();
      const live = os().leases.filter((l) => leaseValid(l, now));
      if (!live.length) return ctx.print([s("No active leases. Approvals with \"1 hour\" or \"Session\" create them.", "dim")]);
      live.forEach((l) => {
        const left = l.expiresAt ? `${Math.max(0, Math.round((l.expiresAt - now) / 60000))} min left` : l.usesLeft !== null ? `${l.usesLeft} use left` : "until logout";
        ctx.print([s(pad(l.tool, 22), "accent"), s(pad(principalName(l.principal), 18)), s(pad(l.kind, 10), "dim"), s(left, "ok")]);
      });
    },
  },
  explain: {
    help: "sios explain <tool> [path]  Show how the broker would decide",
    run: (args, ctx) => {
      const name = args[0];
      if (!name) return ctx.print([s("usage: sios explain files.move ~/Downloads/lease-agreement.pdf", "warn")]);
      const def = liveTool(name);
      const target = args[1] ? resolve(ctx.cwd, args[1]) : undefined;
      const tool: ToolCall = {
        name,
        adapter: def?.adapter ?? "none",
        permission: def?.permission ?? "reversible",
        input: target ? (isDir(target) ? { in: target } : { path: target }) : {},
      };
      const v = evaluate(os(), { principal: "owner", tool, goal: "explain", fromUser: true, tainted: false });
      ctx.print([s(`${name}`, "accent"), s(`  ${tool.permission}`, "dim"), s(target ? `  ${target}` : "", "dim")]);
      v.checks.forEach((c) => ctx.print([CHECK_MARK[c.result], s(c.label + " ", "bold"), s(c.detail, "dim")]));
      const tone: Tone = v.decision === "allow" ? "ok" : v.decision === "ask" ? "accent" : "err";
      ctx.print([s("decision: ", "dim"), s(v.decision.toUpperCase(), tone), s(`  ${v.reason}`, "dim")]);
    },
  },
  stop: {
    help: "sios stop  Pause all AI (emergency stop)",
    run: (_a, ctx) => {
      os().setAiPaused(true);
      os().revokeGrants();
      ctx.print([s("All AI paused. Session permissions reset. ", "warn"), s("sios resume", "bold"), s(" to continue.", "warn")]);
    },
  },
  resume: {
    help: "sios resume  Let AI act again",
    run: (_a, ctx) => {
      os().setAiPaused(false);
      ctx.print([s("AI resumed.", "ok")]);
    },
  },
  whoami: {
    help: "sios whoami  Who the broker thinks you are",
    run: (_a, ctx) => {
      ctx.print([s("principal ", "dim"), s("owner", "bold"), s("  (", "dim"), s(BRAND.user), s(")  trust ", "dim"), s("Owner (level 4)", "ok")]);
    },
  },
};

export const COMMANDS: Record<string, Cmd> = {
  help: {
    help: "help  List commands",
    run: (_a, ctx) => {
      ctx.print([s("Files", "bold")]);
      ["pwd", "ls", "cd", "cat", "mkdir", "touch", "mv", "rm", "tree", "find", "info"].forEach((c) => ctx.print([s("  " + COMMANDS[c].help, "out")]));
      ctx.print([s("SIOS", "bold")]);
      Object.values(sios).forEach((c) => ctx.print([s("  " + c.help, "out")]));
      ctx.print([s("System", "bold")]);
      ctx.print([s("  systemctl --user status brain-d, uname -a, neofetch, history, echo, date, whoami, clear, exit", "out")]);
      ctx.print([s("Tips: Tab completes names, Up/Down walks history, Ctrl+L clears, Ctrl+C cancels.", "dim")]);
    },
  },
  pwd: { help: "pwd  Print the current folder", run: (_a, ctx) => ctx.print([s(ctx.cwd)]) },
  ls: {
    help: "ls [-l] [path]  List a folder",
    run: (args, ctx) => {
      const long = args.includes("-l") || args.includes("-la") || args.includes("-al");
      const target = resolve(ctx.cwd, args.find((a) => !a.startsWith("-")));
      if (!isDir(target)) {
        const hit = itemAt(target);
        if (hit) return ctx.print([nameSeg(hit.item)]);
        return ctx.print([s(`ls: ${target}: no such folder`, "err")]);
      }
      const items = os().fs[target] ?? [];
      if (!items.length) return;
      if (!long) {
        const line: Line = [];
        items.forEach((it, i) => {
          if (i) line.push(s("  "));
          line.push(nameSeg(it));
        });
        return ctx.print(line);
      }
      items.forEach((it) => {
        const size = it.kind === "folder" ? `${os().fs[childPath(target, it.name)]?.length ?? 0} items` : it.size ?? "-";
        ctx.print([
          s(it.kind === "folder" ? "d " : it.trust === "untrusted" ? "! " : "- ", it.trust === "untrusted" ? "warn" : "dim"),
          s(pad(size, 10), "dim"),
          s(pad(it.modified, 12), "dim"),
          s(pad(it.kind === "folder" && !it.origin ? "" : originShort(it), 8), it.trust === "untrusted" ? "warn" : "dim"),
          nameSeg(it),
          s(it.labels?.length ? `  [${it.labels.join(", ")}]` : "", "accent"),
        ]);
      });
    },
  },
  cd: {
    help: "cd [path]  Change folder",
    run: (args, ctx) => {
      const target = resolve(ctx.cwd, args[0]);
      if (!isDir(target)) return ctx.print([s(`cd: ${args[0]}: no such folder`, "err")]);
      ctx.setCwd(target);
    },
  },
  cat: {
    help: "cat <file>  Show a file",
    run: (args, ctx) => {
      if (!args[0]) return ctx.print([s("usage: cat <file>", "warn")]);
      const hit = itemAt(resolve(ctx.cwd, args[0]));
      if (!hit) return ctx.print([s(`cat: ${args[0]}: no such file`, "err")]);
      if (hit.item.kind === "folder") return ctx.print([s(`cat: ${args[0]}: is a folder`, "err")]);
      if (hit.item.trust === "untrusted") ctx.print([s("(untrusted content, shown as data)", "warn")]);
      const blob = hit.item.imported ? getBlob(hit.item.id) : undefined;
      if (blob?.text !== undefined) {
        blob.text.split("\n").slice(0, 300).forEach((l) => ctx.print([s(l)]));
        return;
      }
      const summary = summaryOf(hit.item);
      ctx.print([s(summary ?? `(${hit.item.kind} file, ${hit.item.size ?? "unknown size"}; no text preview)`, summary ? "out" : "dim")]);
    },
  },
  mkdir: {
    help: "mkdir <name>  Make a folder",
    run: (args, ctx) => {
      if (!args[0]) return ctx.print([s("usage: mkdir <name>", "warn")]);
      const target = resolve(ctx.cwd, args[0]);
      const dir = parentOf(target);
      const name = baseOf(target);
      if (!isDir(dir)) return ctx.print([s(`mkdir: ${dir}: no such folder`, "err")]);
      if (os().fs[dir].some((i) => i.name === name)) return ctx.print([s(`mkdir: ${name}: already exists`, "err")]);
      const id = newFolder(dir);
      rename(dir, id, name);
    },
  },
  touch: {
    help: "touch <name>  Make an empty file",
    run: (args, ctx) => {
      if (!args[0]) return ctx.print([s("usage: touch <name>", "warn")]);
      const target = resolve(ctx.cwd, args[0]);
      const dir = parentOf(target);
      const name = baseOf(target);
      const fs = os().fs;
      if (!isDir(dir)) return ctx.print([s(`touch: ${dir}: no such folder`, "err")]);
      if (fs[dir].some((i) => i.name === name)) return;
      if (os().settings.liveMachine) {
        void liveOwner("do", { tool: "fs.write", args: { path: [rel(dir), name].filter(Boolean).join("/"), text: "" } }).then(() => refreshLive());
        return;
      }
      const item: FileItem = {
        id: "t_" + Math.random().toString(36).slice(2, 9),
        name,
        kind: kindOf(name),
        size: "0 B",
        modified: "Just now",
        origin: { by: "you", via: "terminal" },
        trust: "trusted",
        versions: 1,
        history: [{ at: Date.now(), by: "you", action: "Created in the terminal" }],
      };
      os().setFs({ ...fs, [dir]: [...fs[dir], item] });
    },
  },
  mv: {
    help: "mv <file> <folder|new-name>  Move or rename",
    run: (args, ctx) => {
      if (args.length < 2) return ctx.print([s("usage: mv <file> <folder>", "warn")]);
      const hit = itemAt(resolve(ctx.cwd, args[0]));
      if (!hit) return ctx.print([s(`mv: ${args[0]}: no such file`, "err")]);
      const dst = resolve(ctx.cwd, args[1]);
      if (isDir(dst)) {
        moveItems(hit.dir, [hit.item.id], dst);
        return ctx.print([s(`moved ${hit.item.name} to ${dst}`, "dim")]);
      }
      if (parentOf(dst) === hit.dir) {
        rename(hit.dir, hit.item.id, baseOf(dst));
        return ctx.print([s(`renamed to ${baseOf(dst)}`, "dim")]);
      }
      ctx.print([s(`mv: ${args[1]}: no such folder`, "err")]);
    },
  },
  rm: {
    help: "rm [-r] <file>  Move to Trash",
    run: (args, ctx) => {
      const recursive = args.includes("-r") || args.includes("-rf");
      const name = args.find((a) => !a.startsWith("-"));
      if (!name) return ctx.print([s("usage: rm <file>", "warn")]);
      const hit = itemAt(resolve(ctx.cwd, name));
      if (!hit) return ctx.print([s(`rm: ${name}: no such file`, "err")]);
      if (hit.item.kind === "folder" && !recursive) return ctx.print([s(`rm: ${name}: is a folder (use rm -r)`, "err")]);
      trashItems(hit.dir, [hit.item.id]);
      ctx.print([s(`moved ${hit.item.name} to Trash. Nothing is deleted for good from here.`, "dim")]);
    },
  },
  tree: {
    help: "tree [path]  Show folders as a tree",
    run: (args, ctx) => {
      const target = resolve(ctx.cwd, args[0]);
      if (!isDir(target)) return ctx.print([s(`tree: ${target}: no such folder`, "err")]);
      ctx.print([s(target, "dir")]);
      tree(target, "", 1, ctx);
    },
  },
  find: {
    help: 'find <query>  Search by name or meaning ("finance", "from the web")',
    run: (args, ctx) => {
      const q = args.join(" ");
      if (!q) return ctx.print([s("usage: find finance", "warn")]);
      const hits = searchObjects(os().fs, q);
      if (!hits.length) return ctx.print([s("No matches.", "dim")]);
      hits.slice(0, 40).forEach(({ dir, item }) =>
        ctx.print([s(childPath(dir, ""), "dim"), nameSeg(item), s(item.labels?.length ? `  [${item.labels.join(", ")}]` : "", "accent")]),
      );
    },
  },
  info: {
    help: "info <file>  Origin, trust, labels and history",
    run: (args, ctx) => {
      if (!args[0]) return ctx.print([s("usage: info <file>", "warn")]);
      const p = resolve(ctx.cwd, args[0]);
      const hit = itemAt(p);
      if (!hit) return ctx.print([s(`info: ${args[0]}: no such file`, "err")]);
      const it = hit.item;
      ctx.print([s(pad("name", 10), "dim"), nameSeg(it)]);
      ctx.print([s(pad("kind", 10), "dim"), s(`${it.kind}${it.size ? `, ${it.size}` : ""}`)]);
      ctx.print([s(pad("origin", 10), "dim"), s(originText(it))]);
      ctx.print([s(pad("trust", 10), "dim"), s(it.trust ?? "trusted", it.trust === "untrusted" ? "warn" : "ok")]);
      const labels = labelsAt(os().fs, p);
      ctx.print([s(pad("labels", 10), "dim"), s(labels.length ? labels.join(", ") : "none", labels.includes("Sensitive") ? "err" : "accent")]);
      ctx.print([s(pad("history", 10), "dim")]);
      historyOf(it).forEach((h) => ctx.print([s("  " + pad(h.when, 14), "dim"), s(h.title, h.ai ? "accent" : "out")]));
    },
  },
  sios: {
    help: "sios <ask|goals|audit|trust|leases|explain|stop|resume|whoami>",
    run: async (args, ctx) => {
      const sub = sios[args[0] ?? ""];
      if (!sub) {
        ctx.print([s("usage: ", "dim"), s("sios <command>", "bold")]);
        Object.values(sios).forEach((c) => ctx.print([s("  " + c.help)]));
        return;
      }
      await sub.run(args.slice(1), ctx);
    },
  },
  systemctl: {
    help: "systemctl --user status brain-d",
    run: (args, ctx) => {
      const unit = args.find((a) => !a.startsWith("-") && a !== "status") ?? "brain-d";
      if (!/brain-d|broker/.test(unit)) return ctx.print([s(`Unit ${unit}.service could not be found.`, "err")]);
      const st = os();
      const live = st.runs.filter((r) => r.status === "running" || r.status === "waiting").length;
      const isBroker = unit.includes("broker");
      ctx.print([s("● ", st.aiPaused ? "warn" : "ok"), s(`${unit}.service - ${isBroker ? "SIOS permission broker" : `${BRAND.name} brain`}`, "bold")]);
      ctx.print([s("     Loaded: ", "dim"), s(`loaded (/usr/lib/systemd/${isBroker ? "system" : "user"}/${unit}.service; enabled)`)]);
      ctx.print([s("     Active: ", "dim"), s(st.aiPaused ? "active (paused by owner)" : "active (running)", st.aiPaused ? "warn" : "ok"), s(" since boot", "dim")]);
      ctx.print([s("      Goals: ", "dim"), s(`${st.runs.length} this session, ${live} running`)]);
      ctx.print([s("  Decisions: ", "dim"), s(`${st.audit.length} logged, chain ${verifyChain(st.audit) === null ? "intact" : "BROKEN"}`)]);
      ctx.print([s("     Leases: ", "dim"), s(`${st.leases.filter((l) => leaseValid(l)).length} active`)]);
      ctx.print([s("   Runs as: ", "dim"), s(isBroker ? "root (locked down, Unix socket only)" : `${BRAND.user.toLowerCase()} (never root)`)]);
    },
  },
  uname: {
    help: "uname -a",
    run: (_a, ctx) => ctx.print([s(`Linux ${BRAND.device} 6.16.8-200.fc43.x86_64 #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux (${BRAND.name} preview, Fedora Atomic)`)]),
  },
  neofetch: {
    help: "neofetch",
    run: (_a, ctx) => {
      const st = os();
      const art = [
        "    _________    ",
        "   /  _____  \\   ",
        "  /  /  _  \\  \\  ",
        " |  |  / \\  |  | ",
        " |  |  | o  |  | ",
        " |  |  |    |  | ",
        " |__|__|____|__| ",
        "                 ",
      ];
      const info: Line[] = [
        [s(`${BRAND.user.toLowerCase()}@${BRAND.device}`, "ok")],
        [s("-------------------", "dim")],
        [s("OS: ", "accent"), s(`${BRAND.name} preview (Fedora Atomic 43, bootc)`)],
        [s("Kernel: ", "accent"), s("6.16.8-200.fc43.x86_64")],
        [s("Shell: ", "accent"), s("sios-sh 0.1")],
        [s("Desktop: ", "accent"), s("KDE Plasma, SIOS shell")],
        [s("Brain: ", "accent"), s(`brain-d, ${st.settings.onlineAi ?? "local only"} for hard tasks`)],
        [s("Broker: ", "accent"), s(st.aiPaused ? "paused" : "running", st.aiPaused ? "warn" : "ok"), s(`, ${st.audit.length} decisions`)],
      ];
      art.forEach((a, i) => ctx.print([s(a, "accent"), ...(info[i] ?? [])]));
    },
  },
  history: {
    help: "history",
    run: (_a, ctx) => ctx.history.forEach((h, i) => ctx.print([s(String(i + 1).padStart(4) + "  ", "dim"), s(h)])),
  },
  echo: { help: "echo <text>", run: (args, ctx) => ctx.print([s(args.join(" "))]) },
  date: { help: "date", run: (_a, ctx) => ctx.print([s(new Date().toString())]) },
  whoami: { help: "whoami", run: (_a, ctx) => ctx.print([s(BRAND.user.toLowerCase())]) },
  clear: { help: "clear", run: (_a, ctx) => ctx.clear() },
  exit: { help: "exit", run: (_a, ctx) => ctx.close() },
};

/** Names in a folder that start with a prefix, for Tab completion. */
export function completions(cwd: string, partial: string): string[] {
  const slash = partial.lastIndexOf("/");
  const dirPart = slash >= 0 ? partial.slice(0, slash + 1) : "";
  const prefix = slash >= 0 ? partial.slice(slash + 1) : partial;
  const dir = dirPart ? resolve(cwd, dirPart) : cwd;
  return (os().fs[dir] ?? [])
    .filter((i) => i.name.toLowerCase().startsWith(prefix.toLowerCase()))
    .map((i) => dirPart + (i.name.includes(" ") ? `"${i.name}"` : i.name) + (i.kind === "folder" ? "/" : ""));
}
