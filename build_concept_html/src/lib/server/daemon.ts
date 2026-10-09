// Start and stop the live machine from the SIOS page: capd (the broker) and
// brain-d (the brain), each its own process with its own log. On SIOS these
// are a system service and a user service run by systemd; here the page plays
// systemd. capd never receives the OpenAI key; brain-d does (D19).

import { execFile, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { BRAIN_SOCK, SANDBOX, SOCK, STATE_DIR, brainUp, capdUp } from "./capd";

const run = promisify(execFile);
const AIOS = process.env.AIOS_DIR || join(process.cwd(), "..");
const CARGO = process.env.CARGO || join(homedir(), ".cargo", "bin", "cargo");

interface Svc {
  name: string;
  dir: string;
  bin: string;
  args: string[];
  sock: string;
  up: () => Promise<boolean>;
  env: () => NodeJS.ProcessEnv;
}

const g = globalThis as unknown as { __siosDaemon?: { busy: string | null; error: string | null } };
const state = (g.__siosDaemon ??= { busy: null, error: null });

function baseEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const k of ["HOME", "PATH", "USER", "TMPDIR", "SIOS_STATE", "SIOS_ROOT"]) if (process.env[k]) env[k] = process.env[k]!;
  return env;
}

const SERVICES: Svc[] = [
  { name: "capd", dir: join(AIOS, "capd"), bin: join(AIOS, "capd", "target", "release", "capd"), args: ["serve"], sock: SOCK, up: capdUp, env: baseEnv },
  {
    name: "brain-d",
    dir: join(AIOS, "brain-d"),
    bin: join(AIOS, "brain-d", "target", "release", "brain-d"),
    args: ["serve"],
    sock: BRAIN_SOCK,
    up: brainUp,
    env: () => ({ ...baseEnv(), OPENAI_API_KEY: process.env.OPENAI_API_KEY, ...(process.env.OPENAI_MODEL ? { OPENAI_MODEL: process.env.OPENAI_MODEL } : {}) }),
  },
];

export function daemonState() {
  return { busy: state.busy, error: state.error, sandbox: SANDBOX, logs: STATE_DIR };
}

async function startOne(s: Svc) {
  if (await s.up()) return;
  if (!existsSync(s.bin)) {
    state.busy = `Building ${s.name} (first time, about a minute)`;
    await run(CARGO, ["build", "--release", "--quiet"], { cwd: s.dir, env: baseEnv(), timeout: 10 * 60e3 });
  }
  state.busy = `Starting ${s.name}`;
  const out = openSync(join(STATE_DIR, `${s.name}.log`), "a", 0o600);
  const child = spawn(s.bin, s.args, { env: s.env(), detached: true, stdio: ["ignore", out, out] });
  closeSync(out);
  child.unref();
  if (child.pid) writeFileSync(join(STATE_DIR, `${s.name}.pid`), String(child.pid), { mode: 0o600 });
  for (let i = 0; i < 40 && !(await s.up()); i++) await new Promise((r) => setTimeout(r, 150));
  if (!(await s.up())) throw new Error(`${s.name} didn't start. See ${join(STATE_DIR, `${s.name}.log`)}`);
}

export async function startDaemon(): Promise<void> {
  if (state.busy) return;
  state.error = null;
  try {
    mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
    const capd = SERVICES[0];
    if (!existsSync(SANDBOX)) {
      if (!existsSync(capd.bin)) {
        state.busy = "Building capd (first time, about a minute)";
        await run(CARGO, ["build", "--release", "--quiet"], { cwd: capd.dir, env: baseEnv(), timeout: 10 * 60e3 });
      }
      state.busy = "Setting up the sandbox with demo files";
      await run(capd.bin, ["seed"], { env: baseEnv() });
    }
    for (const s of SERVICES) await startOne(s);
  } catch (e) {
    state.error = e instanceof Error ? e.message.split("\n")[0] : String(e);
  } finally {
    state.busy = null;
  }
}

export async function stopDaemon(): Promise<void> {
  state.error = null;
  for (const s of [...SERVICES].reverse()) {
    const pidFile = join(STATE_DIR, `${s.name}.pid`);
    try {
      const pid = Number(readFileSync(pidFile, "utf8"));
      // only stop it if that process really is ours
      const { stdout } = await run("ps", ["-p", String(pid), "-o", "comm="]);
      if (stdout.trim().endsWith(s.name)) process.kill(pid, "SIGTERM");
    } catch {
      /* not started from here, or already gone */
    }
    rmSync(pidFile, { force: true });
    for (let i = 0; i < 20 && (await s.up()); i++) await new Promise((r) => setTimeout(r, 100));
    if (!(await s.up())) rmSync(s.sock, { force: true });
    else state.error = `${s.name} is still running (it was started from a terminal; stop it there with Ctrl+C)`;
  }
}
