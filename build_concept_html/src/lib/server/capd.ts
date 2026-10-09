// Server-only bridge to capd, the real capability daemon (~/AIOS/capd).
// The owner secret is read here, on the server, and never sent to the browser.

import { createConnection } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";

export const STATE_DIR = process.env.SIOS_STATE || join(homedir(), ".sios");
export const SANDBOX = process.env.SIOS_ROOT || join(homedir(), "SIOS-sandbox");
export const SOCK = join(STATE_DIR, "capd.sock");

/** Is capd actually answering? (A leftover socket file from a stopped capd doesn't count.) */
export async function capdUp(): Promise<boolean> {
  if (!existsSync(SOCK)) return false;
  try {
    await rpc({ method: "status", params: {} }, 1500);
    return true;
  } catch {
    return false;
  }
}

function ownerSecret(): string {
  return readFileSync(join(STATE_DIR, "owner.secret"), "utf8").trim();
}

export const BRAIN_SOCK = join(STATE_DIR, "brain.sock");

export function rpc(msg: Record<string, unknown>, timeoutMs = 15000, sock = SOCK): Promise<{ ok?: Record<string, unknown> & Record<string, never>; error?: string }> {
  return new Promise((resolve, reject) => {
    const c = createConnection(sock);
    let buf = "";
    const timer = setTimeout(() => {
      c.destroy();
      reject(new Error("capd didn't answer in time"));
    }, timeoutMs);
    c.on("data", (d) => {
      buf += d;
      const nl = buf.indexOf("\n");
      if (nl >= 0) {
        clearTimeout(timer);
        c.end();
        try {
          resolve(JSON.parse(buf.slice(0, nl)));
        } catch (e) {
          reject(e);
        }
      }
    });
    c.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    c.write(JSON.stringify(msg) + "\n");
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export async function asOwner(method: string, params: Record<string, unknown> = {}): Promise<Any> {
  const r = await rpc({ method, params, owner: ownerSecret() });
  if (r.error) throw new Error(r.error);
  return r.ok;
}

/** brain-d, the SIOS brain (its own socket; never given the owner secret). */
export async function brain(method: string, params: Record<string, unknown> = {}): Promise<Any> {
  const r = await rpc({ method, params }, 15000, BRAIN_SOCK);
  if (r.error) throw new Error(r.error);
  return r.ok;
}

export async function brainUp(): Promise<boolean> {
  if (!existsSync(BRAIN_SOCK)) return false;
  try {
    await rpc({ method: "status", params: {} }, 1500, BRAIN_SOCK);
    return true;
  } catch {
    return false;
  }
}

export async function asAgent(method: string, params: Record<string, unknown> = {}): Promise<Any> {
  const r = await rpc({ method, params });
  if (r.error) throw new Error(r.error);
  return r.ok;
}

/** Hosts that mean "this computer". Anything else (including a rebinding domain) is refused. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function localHost(h: string | null): boolean {
  if (!h) return false;
  try {
    return LOCAL_HOSTS.has(new URL(`http://${h}`).hostname);
  } catch {
    return false;
  }
}

/**
 * Only the SIOS page, served from this computer, may use the live machine.
 * The Host must be localhost (so a DNS-rebinding domain pointed at 127.0.0.1
 * is refused), and a browser request must come from that same local origin.
 * Requests without an Origin are same-origin GETs or non-browser clients on
 * this machine.
 */
export function fromThisPage(req: Request): boolean {
  const host = req.headers.get("host");
  if (!localHost(host)) return false;
  const origin = req.headers.get("origin");
  if (!origin) return req.method === "GET";
  try {
    const o = new URL(origin);
    return LOCAL_HOSTS.has(o.hostname) && o.host === host;
  } catch {
    return false;
  }
}

// A per-process secret the SIOS page receives in an HttpOnly, SameSite=Strict
// cookie. Every live route requires it, so neither another web page nor a
// request with forged headers can drive the live machine.
const g = globalThis as unknown as { __siosLiveSecret?: string };
const SECRET = (g.__siosLiveSecret ??= randomBytes(32).toString("hex"));
export const LIVE_COOKIE = "sios_live";

export function sessionCookie(): string {
  return `${LIVE_COOKIE}=${SECRET}; HttpOnly; SameSite=Strict; Path=/api/live`;
}

function hasSession(req: Request): boolean {
  const m = (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${LIVE_COOKIE}=([0-9a-f]+)`));
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Null if the request may use the live machine, otherwise the refusal to send. */
export function liveGuard(req: Request): Response | null {
  if (!fromThisPage(req) || !hasSession(req)) return Response.json({ error: "forbidden" }, { status: 403 });
  return null;
}
