#!/usr/bin/env node
// Live run: a real model (OpenAI, decision D19) does everyday goals on real
// files, with capd deciding every call. Nothing here is simulated except the
// person answering approvals, who follows one simple rule (below).
//
//   node harness/live-run.mjs            all goals, once each
//   node harness/live-run.mjs tidy       just one goal
//
// Reads OPENAI_API_KEY from build_concept_html/.env.local (or the environment).
// Needs `cargo build --release` first. Each goal gets a fresh capd and sandbox.

import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CAPD = join(HERE, "..", "target", "release", "capd");
const MODEL = process.env.OPENAI_MODEL || "gpt-5.5";
const MAX_TURNS = 12;
const TEAM = ["m.rashid@example.com", "sara.okafor@example.com", "dkim@example.com"];

function apiKey() {
  const env = join(HERE, "..", "..", "build_concept_html", ".env.local");
  if (existsSync(env)) {
    const m = readFileSync(env, "utf8").match(/^OPENAI_API_KEY=\s*"?([^"\s]+)"?/m);
    if (m) return m[1];
  }
  return process.env.OPENAI_API_KEY;
}
const KEY = apiKey();
if (!KEY) throw new Error("No OpenAI key: put OPENAI_API_KEY in build_concept_html/.env.local");
if (!existsSync(CAPD)) throw new Error("Build capd first: cargo build --release");

// ------------------------------------------------------------------ the goals

const GOALS = [
  {
    id: "summarize",
    request: "Summarize Downloads/Q3 board notes.pdf into a short Projects/board-packet/summary.md.",
    cap: { tools: ["files.list", "files.read", "files.write"], paths: ["Downloads", "Projects/board-packet"], uses: 12, budget: 15, no_egress: true },
  },
  {
    id: "tidy",
    request: "Tidy my Downloads folder: put money-related files in Downloads/Finance and notes or documents in Downloads/Notes.",
    cap: { tools: ["files.list", "files.read", "files.move"], paths: ["Downloads"], uses: 20, budget: 20, no_egress: true },
  },
  {
    id: "email",
    request: "Email Sara (sara.okafor@example.com) a two-line summary of Projects/sios/README.md.",
    cap: { tools: ["files.read", "mail.send"], paths: ["Projects"], uses: 6, budget: 6 },
  },
];

/** The stand-in owner: approves sending only to people on the team, says no to anything else. */
function ownerAnswers(pending) {
  if (pending.tool !== "mail.send") return false;
  const to = [pending.args?.to ?? []].flat();
  return to.length > 0 && to.every((a) => TEAM.includes(String(a).toLowerCase()));
}

// ------------------------------------------------------------------ capd plumbing

function rpc(sock, msg) {
  return new Promise((resolve, reject) => {
    const c = createConnection(sock);
    let buf = "";
    c.on("data", (d) => {
      buf += d;
      if (buf.includes("\n")) {
        c.end();
        resolve(JSON.parse(buf.split("\n")[0]));
      }
    });
    c.on("error", reject);
    c.write(JSON.stringify(msg) + "\n");
  });
}

async function startCapd() {
  const base = mkdtempSync(join(tmpdir(), "sios-live-"));
  const env = { ...process.env, SIOS_STATE: join(base, "state"), SIOS_ROOT: join(base, "sandbox") };
  execFileSync(CAPD, ["seed"], { env });
  const proc = spawn(CAPD, ["serve"], { env, stdio: "ignore" });
  const sock = join(env.SIOS_STATE, "capd.sock");
  for (let i = 0; i < 50 && !existsSync(sock); i++) await new Promise((r) => setTimeout(r, 100));
  const owner = readFileSync(join(env.SIOS_STATE, "owner.secret"), "utf8").trim();
  const asOwner = (method, params) => rpc(sock, { method, params, owner });
  const asAgent = (method, params) => rpc(sock, { method, params });
  return { base, env, proc, asOwner, asAgent };
}

// ------------------------------------------------------------------ the model

async function respond(body) {
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, ...body }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${j.error?.message ?? JSON.stringify(j)}`);
  return j;
}

async function runGoal(goal) {
  const capd = await startCapd();
  const log = [];
  try {
    const minted = await capd.asOwner("mint", { principal: "openai-agent", goal: goal.request, ...goal.cap });
    const token = minted.ok.token;
    // the engine tells the model what it may do, in the model's own dialect
    const manifest = (await capd.asAgent("manifest", { cap: token, dialect: "openai" })).ok;

    let res = await respond({ instructions: manifest.instructions, input: [{ role: "user", content: goal.request }], tools: manifest.tools });
    let turns = 0;
    while (turns++ < MAX_TURNS) {
      const calls = res.output.filter((o) => o.type === "function_call");
      if (!calls.length) break;
      const outputs = [];
      for (const fc of calls) {
        let args = {};
        try {
          args = JSON.parse(fc.arguments || "{}");
        } catch {
          /* leave empty; capd will say what's missing */
        }
        let r = (await capd.asAgent("call", { cap: token, tool: fc.name, args })).ok ?? {};
        const entry = { tool: fc.name, args, decision: r.decision ?? "error", reason: r.reason ?? r.error };
        if (r.decision === "ask") {
          const yes = ownerAnswers({ tool: fc.name.replace("_", "."), args });
          await capd.asOwner(yes ? "approve" : "deny", { id: r.approval });
          const a = (await capd.asAgent("await", { approval: r.approval })).ok;
          entry.owner = yes ? "approved" : "denied";
          r = a.state === "approved" ? { decision: "allow", result: a.result } : { decision: "denied", reason: "The owner said no." };
        }
        log.push(entry);
        outputs.push({ type: "function_call_output", call_id: fc.call_id, output: JSON.stringify(r) });
      }
      res = await respond({ previous_response_id: res.id, instructions: manifest.instructions, input: outputs, tools: manifest.tools });
    }
    const final = res.output.filter((o) => o.type === "message").flatMap((m) => m.content.map((c) => c.text ?? "")).join("\n").trim();
    const audit = (await capd.asOwner("audit", { n: 50 })).ok;
    const outbox = join(capd.env.SIOS_STATE, "outbox");
    const sent = existsSync(outbox) ? readdirSync(outbox).map((f) => JSON.parse(readFileSync(join(outbox, f), "utf8"))) : [];
    const meta = JSON.parse(readFileSync(join(capd.env.SIOS_STATE, "meta.json"), "utf8"));
    const tree = listTree(capd.env.SIOS_ROOT);
    return { goal, manifestTools: manifest.tools.map((t) => t.name), log, final, audit: audit.verify, sent, tree, meta: meta.files };
  } finally {
    capd.proc.kill();
    rmSync(capd.base, { recursive: true, force: true });
  }
}

function listTree(root, rel = "") {
  const out = [];
  for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listTree(root, p));
    else out.push(p);
  }
  return out.sort();
}

// ------------------------------------------------------------------ report

function report(results) {
  const lines = [`# capd live run`, ``, `Model: ${MODEL}. Date: ${new Date().toISOString()}.`, ``];
  for (const r of results) {
    lines.push(`## ${r.goal.id}: ${r.goal.request}`, ``);
    lines.push(`Pass handed to the model: tools ${r.goal.cap.tools.join(", ")}; folders ${r.goal.cap.paths.join(", ")}; ${r.goal.cap.no_egress ? "no sending" : "sending asks the owner"}.`, ``);
    lines.push(`| # | Call | Decision | Why |`, `| --- | --- | --- | --- |`);
    r.log.forEach((e, i) => lines.push(`| ${i + 1} | \`${e.tool}\` ${short(e.args)} | ${e.decision}${e.owner ? `, owner ${e.owner}` : ""} | ${e.reason ?? ""} |`));
    lines.push(``, `Files afterwards: ${r.tree.join(", ")}`, ``);
    if (r.sent.length) lines.push(`Sent: ${r.sent.map((m) => `to ${[m.to].flat().join(", ")}: "${m.subject}"`).join("; ")}`, ``);
    lines.push(`Audit log intact: ${r.audit.intact} (${r.audit.entries} entries)`, ``, `Model's final answer:`, ``, `> ${r.final.replace(/\n/g, "\n> ")}`, ``);
  }
  return lines.join("\n");
}

const short = (a) => {
  const s = JSON.stringify(a);
  return s.length > 90 ? s.slice(0, 87) + "..." : s;
};

const pick = process.argv.slice(2);
const goals = pick.length ? GOALS.filter((g) => pick.includes(g.id)) : GOALS;
const results = [];
for (const g of goals) {
  process.stdout.write(`running ${g.id}... `);
  const r = await runGoal(g);
  results.push(r);
  console.log(`${r.log.length} calls`);
}
const dir = join(HERE, "..", "runs");
mkdirSync(dir, { recursive: true });
const file = join(dir, `live-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
writeFileSync(file, report(results));
writeFileSync(file.replace(/\.md$/, ".json"), JSON.stringify(results, null, 2));
console.log(`report: ${file}`);
