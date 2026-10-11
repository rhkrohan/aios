"use client";

// Security Center pages built on agent IAM (lib/iam.ts, proposed D22):
// Identities, Roles, What if, plus the Overview's "needs attention" and
// protection lists. Everything here reads and writes the same state the
// broker checks (policy.ts), so what you see is what is enforced.

import clsx from "clsx";
import { AlertTriangle, Ban, BadgeCheck, Bot, Check, Eye, FlaskConical, Hand, Info, KeyRound, Lock, Pause, Play, Plus, ShieldCheck, Smartphone, Trash2, User, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { runRequest } from "@/lib/engine";
import { describeStatement, findings, rolesOf, type Identity, type IdentityKind, type Mode, type Role, type Statement } from "@/lib/iam";
import { evaluate, principalName } from "@/lib/policy";
import { TRUST_LEVELS, levelFromScore, trustLevelOf } from "@/lib/trust";
import { useOS, uid } from "@/lib/store";
import { liveOwner } from "@/lib/livemirror";
import { toChecks } from "@/lib/livemachine";
import type { Permission, PolicyVerdict } from "@/lib/types";
import { LogoTile } from "../icons/BrandLogos";
import { StringOrb } from "../icons/StringOrb";
import { CheckTrace } from "../command/StepRow";
import { Button, Chip, timeAgo, type Tone } from "../ui";

export type IamPage = "overview" | "identities" | "roles" | "whatif" | "access" | "leases" | "vault" | "decisions";

export function H({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-[22px] font-semibold tracking-[-0.01em]">{title}</h2>
      <p className="text-[13.5px] text-fg-2 mt-0.5 max-w-[620px]">{sub}</p>
    </div>
  );
}

const KIND: Record<IdentityKind, { label: string; tone: Tone }> = {
  owner: { label: "Owner", tone: "ok" },
  assistant: { label: "Assistant", tone: "ai" },
  app: { label: "Connected app", tone: "neutral" },
  device: { label: "Device", tone: "neutral" },
  helper: { label: "Helper", tone: "ai" },
};

function Avatar({ who, size = 40 }: { who: Identity; size?: number }) {
  if (who.kind === "owner")
    return (
      <span className="rounded-full grid place-items-center text-white shrink-0 bg-[#2f3540]" style={{ width: size, height: size }}>
        <User size={size * 0.45} />
      </span>
    );
  if (who.kind === "assistant" || who.kind === "helper")
    return (
      <span className="grid place-items-center shrink-0" style={{ width: size, height: size }}>
        <StringOrb size={size} strands={12} />
      </span>
    );
  if (who.id === "claude-desktop") return <LogoTile logo="claude" size={size} />;
  const Icon = who.kind === "device" ? Smartphone : Bot;
  return (
    <span className="rounded-full grid place-items-center text-white shrink-0 bg-[#59616b]" style={{ width: size, height: size }}>
      <Icon size={size * 0.45} />
    </span>
  );
}

// ------------------------------------------------------------------ trust (moved from SecurityApp)

const LEVEL_TONE = ["bg-danger", "bg-warn", "bg-accent", "bg-ok", "bg-fg"];

export function TrustMeter({ level }: { level: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`Trust level ${level} of 4`}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={clsx("h-1.5 w-4 rounded-full", i < level ? LEVEL_TONE[level] : "bg-surface-3")} />
      ))}
    </span>
  );
}

function TrustBlock({ principal }: { principal: string }) {
  const trust = useOS((s) => s.trust);
  const setOverride = useOS((s) => s.setTrustOverride);
  const rec = trust[principal];
  const level = trustLevelOf(trust, principal);
  const auto = rec ? levelFromScore(rec.score) : 0;
  return (
    <div>
      <div className="flex items-center gap-2 text-[12.5px]">
        <TrustMeter level={level} />
        <span className="font-semibold">{TRUST_LEVELS[level].name}</span>
        <span className="text-fg-3">score {rec?.score ?? 0}</span>
        <select
          value={rec?.override ?? "auto"}
          onChange={(e) => setOverride(principal, e.target.value === "auto" ? null : Number(e.target.value))}
          className="ml-auto h-7 px-1.5 rounded-md bg-surface-2 border border-line text-[12px] outline-none"
          aria-label="Trust override"
        >
          <option value="auto">Earned ({TRUST_LEVELS[auto].name})</option>
          {[0, 1, 2, 3].map((l) => (
            <option key={l} value={l}>
              Set to {TRUST_LEVELS[l].name}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-1 text-[12px] text-fg-2">{TRUST_LEVELS[level].can}</div>
      {rec && (
        <ul className="mt-2 grid gap-0.5">
          {rec.history.slice(0, 3).map((h, i) => (
            <li key={i} className="flex gap-2 text-[11.5px]">
              <span className={clsx("w-8 text-right tabular-nums font-semibold", h.delta >= 0 ? "text-ok" : "text-danger")}>
                {h.delta >= 0 ? "+" : ""}
                {h.delta}
              </span>
              <span className="text-fg-2 flex-1 truncate">{h.why}</span>
              <span className="text-fg-3">{timeAgo(h.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ overview pieces

/** What deserves a look right now, worked out from the real state. */
export function Attention({ go }: { go: (p: IamPage) => void }) {
  const iam = useOS((s) => s.iam);
  const pending = useOS((s) => (s.approval ? 1 : 0) + s.approvalQueue.length);
  const paused = useOS((s) => s.pausedPrincipals);
  const standing = useOS((s) => s.standingRules);
  const leases = useOS((s) => s.leases.length);
  const items: { icon: LucideIcon; tone: "warn" | "info"; text: string; go?: IamPage }[] = [];
  if (pending) items.push({ icon: Hand, tone: "warn", text: `${pending} ${pending === 1 ? "action is" : "actions are"} waiting for your OK` });
  for (const f of findings(iam)) items.push({ icon: f.level === "warn" ? AlertTriangle : Info, tone: f.level, text: f.text, go: "identities" });
  if (paused.length) items.push({ icon: Pause, tone: "info", text: `Paused: ${paused.map(principalName).join(", ")}`, go: "identities" });
  if (standing.length) items.push({ icon: Check, tone: "info", text: `${standing.length} standing ${standing.length === 1 ? "rule skips" : "rules skip"} asking: ${standing.join(", ")}`, go: "leases" });
  if (leases) items.push({ icon: KeyRound, tone: "info", text: `${leases} temporary ${leases === 1 ? "permission is" : "permissions are"} active`, go: "leases" });
  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="text-[14px] font-semibold mb-2.5">Needs attention</div>
      {items.length ? (
        <ul className="grid gap-1.5">
          {items.map((it, i) => (
            <li key={i}>
              <button
                onClick={() => it.go && go(it.go)}
                disabled={!it.go}
                className="w-full flex items-center gap-2.5 text-left text-[13px] rounded-lg px-1 py-0.5 enabled:hover:bg-surface-2"
              >
                <span className={clsx("size-6 rounded-full grid place-items-center shrink-0", it.tone === "warn" ? "bg-warn-soft text-warn" : "bg-surface-3 text-fg-2")}>
                  <it.icon size={13} />
                </span>
                <span className="flex-1">{it.text}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-2 text-[13px] text-fg-2">
          <span className="size-6 rounded-full grid place-items-center bg-ok-soft text-ok">
            <Check size={13} />
          </span>
          Nothing needs you right now.
        </div>
      )}
    </div>
  );
}

/** What is protecting you, from the real settings rather than a fixed list. */
export function Protection() {
  const scopeRules = useOS((s) => s.scopeRules);
  const installed = useOS((s) => Object.keys(s.installed).length);
  const iam = useOS((s) => s.iam);
  const denies = iam.roles.filter((r) => r.global).flatMap((r) => r.statements.filter((s) => s.effect === "deny"));
  // a place both blocked on the Access map and denied by a global role is said once
  const blocked = Object.entries(scopeRules)
    .filter(([k, r]) => r === "block" && k.startsWith("~") && !denies.some((d) => d.places.includes(k)))
    .map(([k]) => k.split("/").pop());
  const rows: [LucideIcon, string][] = [
    [ShieldCheck, "Permission broker runs on its own; no AI can skip it"],
    [Lock, "Anything that can't be undone always asks"],
    [KeyRound, `${installed} sign-ins held by the broker, none in AI memory`],
    ...(blocked.length ? [[Ban, `Blocked for every AI: ${blocked.join(", ")}`] as [LucideIcon, string]] : []),
    ...denies.map((d) => [Ban, d.note] as [LucideIcon, string]),
  ];
  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="text-[14px] font-semibold mb-2.5">Protection</div>
      <ul className="grid gap-2 text-[13px]">
        {rows.map(([I, t]) => (
          <li key={t} className="flex items-center gap-2.5">
            <span className="size-6 rounded-full bg-ok-soft text-ok grid place-items-center shrink-0">
              <I size={13} />
            </span>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ identities

export function Identities({ go }: { go: (p: IamPage, props?: Record<string, string>) => void }) {
  const iam = useOS((s) => s.iam);
  const [sel, setSel] = useState(iam.identities.find((i) => i.kind !== "owner")?.id ?? "owner");
  const paused = useOS((s) => s.pausedPrincipals);
  const live = useOS((s) => s.settings.liveMachine);
  const who = iam.identities.find((i) => i.id === sel) ?? iam.identities[0];
  return (
    <>
      <H title="Identities" sub="Every AI that can act here has its own identity, proof of who it is, and roles. The broker checks all three on every action." />
      <div className="grid grid-cols-[250px_1fr] gap-4 items-start">
        <div className="grid gap-2">
        <ul className="rounded-2xl border border-line p-1.5 grid gap-0.5">
          {iam.identities.map((i) => (
            <li key={i.id}>
              <button
                onClick={() => setSel(i.id)}
                className={clsx("w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-left", sel === i.id ? "bg-ai-soft" : "hover:bg-surface-2", paused.includes(i.id) && "opacity-60")}
              >
                <Avatar who={i} size={32} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-semibold truncate">{i.kind === "owner" ? "You" : i.name}</span>
                  <span className="block text-[11.5px] text-fg-2 truncate">
                    {i.kind === "owner" ? "and the assistant acting for you" : paused.includes(i.id) ? "Paused" : `${i.roles.length} ${i.roles.length === 1 ? "role" : "roles"}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {live && <PairApp onPaired={setSel} />}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={who.id} className="min-w-0" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
            <IdentityDetail who={who} go={go} />
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}

function IdentityDetail({ who, go }: { who: Identity; go: (p: IamPage, props?: Record<string, string>) => void }) {
  const iam = useOS((s) => s.iam);
  const paused = useOS((s) => s.pausedPrincipals.includes(who.id));
  const toggle = useOS((s) => s.togglePrincipal);
  const setRoles = useOS((s) => s.setIdentityRoles);
  const live = useOS((s) => s.settings.liveMachine);
  // on the live machine, being known to capd is what counts; in the sim, the Connections page
  const connected = useOS((s) => live || !!s.connectedApps[who.id]);
  const unpaired = who.id.startsWith("unpaired:");
  const audit = useOS((s) => s.audit);
  const mine = audit.filter((e) => e.principal === who.id).slice(0, 5);
  const owner = who.kind === "owner";
  const statements = rolesOf(iam, who.id).flatMap((r) => r.statements.map((s) => ({ r, s })));
  const can = statements.filter(({ s }) => s.effect === "allow" && s.mode === "auto");
  const asks = statements.filter(({ s }) => s.effect === "allow" && s.mode === "ask");
  const never = statements.filter(({ s }) => s.effect === "deny");

  return (
    <div className={clsx("rounded-2xl border border-line", paused && "border-danger/40")}>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 p-4 border-b border-line">
        <Avatar who={who} size={44} />
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2">
            <span className="text-[17px] font-semibold">{owner ? "You" : who.name}</span>
            <Chip tone={KIND[who.kind].tone}>{KIND[who.kind].label}</Chip>
            {paused && <Chip tone="danger">Paused</Chip>}
            {!owner && !connected && <Chip tone="warn">Not connected</Chip>}
          </div>
          <div className="text-[12px] text-fg-3 font-mono">{who.id}</div>
          {!owner && !connected && <div className="mt-0.5 text-[12px] text-fg-2">Not connected right now, so the broker blocks it whatever its roles say. Connect it in Settings.</div>}
        </div>
        {!owner && (
          <div className="flex gap-1.5">
            {connected && !live && (
              <Button size="sm" onClick={() => void runRequest(useOS.getState().theme === "dark" ? "Turn on light mode" : "Turn on dark mode", { principal: who.id })}>
                Test a request
              </Button>
            )}
            <Button size="sm" onClick={() => go("whatif", { who: who.id })}>
              <FlaskConical size={13} /> What if
            </Button>
            <Button size="sm" variant={paused ? "primary" : "ghost"} onClick={() => toggle(who.id)}>
              {paused ? <Play size={13} /> : <Pause size={13} />} {paused ? "Resume" : "Pause"}
            </Button>
          </div>
        )}
      </div>

      <dl className="grid grid-cols-3 gap-3 p-4 border-b border-line text-[12.5px]">
        <div>
          <dt className="text-fg-3 font-semibold text-[11.5px]">Proved by</dt>
          <dd className={clsx("mt-0.5", who.proof.startsWith("None") && "text-warn font-medium")}>{who.proof}</dd>
        </div>
        <div>
          <dt className="text-fg-3 font-semibold text-[11.5px]">Added by</dt>
          <dd className="mt-0.5">{who.createdBy}</dd>
        </div>
        <div>
          <dt className="text-fg-3 font-semibold text-[11.5px]">Since</dt>
          <dd className="mt-0.5">{timeAgo(who.since)}</dd>
        </div>
      </dl>

      {owner ? (
        <div className="p-4 text-[13px] text-fg-2 leading-6">
          Roles limit AIs, not you. When the SIOS assistant works on your request it acts as you, so it is still bound by the Access map, it asks before changes you
          haven&apos;t allowed, and anything that can&apos;t be undone always asks.
        </div>
      ) : (
        <>
          <section className="p-4 border-b border-line">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[13.5px] font-semibold">Roles</h3>
              <button onClick={() => go("roles")} className="text-[12px] text-fg-2 hover:text-fg">
                Edit roles
              </button>
            </div>
            {unpaired && (
              <div className="mb-2.5 flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2 text-[12.5px]">
                <AlertTriangle size={14} className="text-warn shrink-0 mt-0.5" />
                <span>
                  This app only told SIOS its name, and anything can claim a name. Pair it (left) to give it roles; the broker refuses roles for an unpaired app.
                </span>
              </div>
            )}
            <div className={clsx("flex flex-wrap gap-1.5", unpaired && "opacity-50 pointer-events-none")}>
              {iam.roles
                .filter((r) => !r.global)
                .map((r) => {
                  const on = who.roles.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => setRoles(who.id, on ? who.roles.filter((x) => x !== r.id) : [...who.roles, r.id])}
                      className={clsx(
                        "h-7 px-2.5 rounded-full text-[12.5px] border flex items-center gap-1.5 transition-colors",
                        on ? "bg-accent text-white border-accent" : "border-line-strong text-fg-2 hover:text-fg",
                      )}
                      title={r.about}
                    >
                      {on ? <Check size={12} /> : <Plus size={12} />} {r.name}
                    </button>
                  );
                })}
              <span className="h-7 px-2.5 rounded-full text-[12.5px] bg-surface-3 text-fg-2 flex items-center gap-1.5" title="Applies to every AI">
                <Lock size={11} /> Every AI
              </span>
            </div>
          </section>

          <section className="p-4 border-b border-line grid grid-cols-3 gap-3">
            <Effective title="On its own" tone="ok" icon={Check} items={can} empty="Nothing" foot="Unless the Access map says ask" />
            <Effective title="Asks you first" tone="accent" icon={Hand} items={asks} empty="Nothing" />
            <Effective title="Never" tone="danger" icon={Ban} items={never} empty="Nothing extra" />
          </section>

          <section className="p-4 border-b border-line">
            <h3 className="text-[13.5px] font-semibold mb-2">Trust</h3>
            <TrustBlock principal={who.id} />
          </section>
        </>
      )}

      <section className="p-4">
        <h3 className="text-[13.5px] font-semibold mb-2">Recent decisions</h3>
        {mine.length ? (
          <ul className="grid gap-1">
            {mine.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-[12.5px]">
                <Chip tone={e.outcome === "blocked" ? "danger" : e.outcome === "asked-no" ? "warn" : e.outcome === "allowed" ? "ok" : "accent"} className="w-[76px] justify-center">
                  {e.outcome === "blocked" ? "Blocked" : e.outcome === "asked-no" ? "Said no" : e.outcome === "allowed" ? "Allowed" : "Asked"}
                </Chip>
                <span className="font-mono text-[11.5px]">{e.tool}</span>
                <span className="flex-1 truncate text-fg-2">{e.target}</span>
                <span className="text-fg-3">{timeAgo(e.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-[12.5px] text-fg-3">Nothing yet.</div>
        )}
      </section>
    </div>
  );
}

function Effective({ title, tone, icon: Icon, items, empty, foot }: { title: string; tone: "ok" | "accent" | "danger"; icon: LucideIcon; items: { r: Role; s: Statement }[]; empty: string; foot?: string }) {
  return (
    <div>
      <div className={clsx("flex items-center gap-1.5 text-[12px] font-semibold mb-1.5", tone === "ok" ? "text-ok" : tone === "accent" ? "text-accent" : "text-danger")}>
        <Icon size={13} /> {title}
      </div>
      {items.length ? (
        <ul className="grid gap-1">
          {items.map(({ r, s }) => (
            <li key={r.id + s.id} className="text-[12.5px] leading-[1.35]">
              {s.note}
              <span className="block text-[11px] text-fg-3">{r.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-[12.5px] text-fg-3">{empty}</div>
      )}
      {foot && items.length > 0 && <div className="mt-1.5 text-[11px] text-fg-3">{foot}</div>}
    </div>
  );
}

/** Pair an outside app: the token it carries proves who it is from then on. Shown once. */
function PairApp({ onPaired }: { onPaired: (id: string) => void }) {
  const [name, setName] = useState("");
  const [got, setGot] = useState<{ id: string; token: string } | null>(null);
  const [err, setErr] = useState("");
  const pair = async () => {
    setErr("");
    try {
      const r = await liveOwner("iam_pair", { name: name.trim(), roles: ["reader"] });
      setGot(r);
      onPaired(r.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  if (got)
    return (
      <div className="rounded-2xl border border-ok/40 bg-ok-soft/40 p-3 text-[12px] grid gap-1.5">
        <div className="font-semibold text-[13px]">Paired {got.id}</div>
        <div className="text-fg-2">Put this in the app&apos;s MCP settings. It is shown once; SIOS keeps only a fingerprint.</div>
        <code className="block rounded-lg bg-surface p-2 font-mono text-[11px] break-all select-all">SIOS_PAIR_TOKEN={got.token}</code>
        <div className="text-fg-2">It starts as a Reader. Give it more on the right.</div>
        <Button size="sm" variant="ghost" onClick={() => (setGot(null), setName(""))}>
          Done
        </Button>
      </div>
    );
  return (
    <div className="rounded-2xl border border-line p-3 grid gap-2">
      <div className="text-[13px] font-semibold">Pair an app</div>
      <input
        aria-label="App name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Claude Desktop"
        className="h-8 px-2.5 rounded-lg bg-surface-2 border border-line text-[13px] outline-none focus:border-accent"
      />
      <Button size="sm" variant="primary" onClick={pair} disabled={!name.trim()}>
        <KeyRound size={13} /> Pair
      </Button>
      {err && <div className="text-[12px] text-danger">{err}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ roles

/** Actions people think in, mapped to tool patterns. */
/** Actions people think in, mapped to tool patterns: the sim's names, and capd's on the live machine. */
const ACTIONS: { label: string; tools: string[]; live: string[]; risk: Permission }[] = [
  { label: "look at and search files", tools: ["files.read", "files.find", "files.list"], live: ["fs.read", "fs.find", "fs.list"], risk: "read" },
  { label: "move and organize files", tools: ["files.move", "files.organize"], live: ["fs.move", "fs.organize", "fs.mkdir"], risk: "reversible" },
  { label: "write and edit files", tools: ["files.write"], live: ["fs.write", "fs.copy"], risk: "reversible" },
  { label: "put files in the Trash", tools: ["files.trash"], live: ["fs.trash", "fs.restore"], risk: "reversible" },
  { label: "write email drafts", tools: ["gmail.draft"], live: [], risk: "reversible" },
  { label: "send email", tools: ["gmail.send"], live: ["mail.send"], risk: "irreversible" },
  { label: "send Slack messages", tools: ["slack.message.send"], live: [], risk: "irreversible" },
  { label: "submit web forms", tools: ["forms.submit"], live: [], risk: "irreversible" },
  { label: "change settings", tools: ["settings.*"], live: ["ui.*", "sys.*"], risk: "reversible" },
  { label: "change Wi-Fi", tools: ["network.*"], live: ["net.*"], risk: "reversible" },
  { label: "search memory", tools: ["memory.search"], live: ["memory.search", "people.resolve"], risk: "read" },
  { label: "do anything", tools: ["*"], live: ["*"], risk: "irreversible" },
];
const PLACES = ["anywhere", "~/Downloads", "~/Projects", "~/Documents", "~/Pictures", "~/Documents/Taxes 2025"];
const HOW = ["can do it on its own", "can do it, but asks first", "can never do it"];
const WHEN = ["at any time", "only before reading outside content", "only after reading outside content"];
const placeLabel = (p: string) => (p === "anywhere" ? "anywhere" : `in ${p.replace("~/", "")}`);

function Pick({ value, options, onChange, label }: { value: number; options: string[]; onChange: (i: number) => void; label: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="mx-1 my-0.5 h-8 px-2.5 rounded-lg bg-ai-soft text-ai-ink font-semibold border border-ai-line outline-none cursor-pointer text-[13.5px]"
    >
      {options.map((o, i) => (
        <option key={o} value={i}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function Roles() {
  const iam = useOS((s) => s.iam);
  const saveRole = useOS((s) => s.saveRole);
  const removeRole = useOS((s) => s.removeRole);
  const pushToast = useOS((s) => s.pushToast);
  const [sel, setSel] = useState(iam.roles[0]?.id);
  const role = iam.roles.find((r) => r.id === sel) ?? iam.roles[0];
  const holders = iam.identities.filter((i) => role.global ? i.kind !== "owner" : i.roles.includes(role.id));

  const [act, setAct] = useState(0);
  const [place, setPlace] = useState(0);
  const [how, setHow] = useState(0);
  const [when, setWhen] = useState(0);
  const live = useOS((s) => s.settings.liveMachine);
  const actions = live ? ACTIONS.filter((x) => x.live.length) : ACTIONS;
  const a = actions[Math.min(act, actions.length - 1)];
  const permanent = a.risk === "irreversible" && how === 0;

  const addStatement = () => {
    const effect = how === 2 ? "deny" : "allow";
    const mode: Mode = how === 1 ? "ask" : "auto";
    const note = `${how === 2 ? "Never " : how === 1 ? "Ask, then " : ""}${a.label}${PLACES[place] === "anywhere" ? "" : " " + placeLabel(PLACES[place])}${when ? `, ${WHEN[when]}` : ""}`;
    const s: Statement = {
      id: uid("st"),
      effect,
      tools: live ? a.live : a.tools,
      places: PLACES[place] === "anywhere" ? [] : [PLACES[place]],
      mode,
      note: note.charAt(0).toUpperCase() + note.slice(1),
      ...(when ? { when: { tainted: when === 2 } } : {}),
    };
    saveRole({ ...role, statements: [...role.statements, s] });
    pushToast({ title: `Added to ${role.name}`, body: s.note + ".", tone: "ok" });
  };
  const removeStatement = (id: string) => saveRole({ ...role, statements: role.statements.filter((s) => s.id !== id) });
  const newRole = () => {
    const r: Role = { id: uid("role"), name: "New role", about: "Describe what this role is for.", statements: [] };
    saveRole(r);
    setSel(r.id);
  };

  return (
    <>
      <H title="Roles" sub="A role is a set of statements: what an AI can do on its own, what asks you first, and what it can never do. A Never always beats a Can." />
      <div className="grid grid-cols-[220px_1fr] gap-4 items-start">
        <div className="grid gap-1.5">
          <ul className="rounded-2xl border border-line p-1.5 grid gap-0.5">
            {iam.roles.map((r) => (
              <li key={r.id}>
                <button onClick={() => setSel(r.id)} className={clsx("w-full text-left px-2.5 py-2 rounded-xl", role.id === r.id ? "bg-ai-soft" : "hover:bg-surface-2")}>
                  <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                    {r.global ? <Lock size={12} className="text-fg-3" /> : <BadgeCheck size={13} className="text-accent" />}
                    {r.name}
                  </span>
                  <span className="block text-[11.5px] text-fg-2">
                    {r.statements.length} {r.statements.length === 1 ? "statement" : "statements"}
                    {r.global ? ", applies to every AI" : `, ${iam.identities.filter((i) => i.roles.includes(r.id)).length} using it`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Button onClick={newRole}>
            <Plus size={14} /> New role
          </Button>
        </div>

        <div className="rounded-2xl border border-line min-w-0">
          <div className="p-4 border-b border-line">
            <div className="flex items-center gap-2">
              <input
                aria-label="Role name"
                value={role.name}
                onChange={(e) => saveRole({ ...role, name: e.target.value })}
                disabled={role.global}
                className="flex-1 bg-transparent text-[17px] font-semibold outline-none rounded-md px-1 -mx-1 enabled:hover:bg-surface-2 enabled:focus:bg-surface-2"
              />
              {!role.global && (
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => removeRole(role.id)}>
                  <Trash2 size={13} /> Delete role
                </Button>
              )}
            </div>
            <input
              aria-label="What this role is for"
              value={role.about}
              onChange={(e) => saveRole({ ...role, about: e.target.value })}
              className="w-full mt-0.5 bg-transparent text-[13px] text-fg-2 outline-none rounded-md px-1 -mx-1 hover:bg-surface-2 focus:bg-surface-2"
            />
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px] text-fg-2">
              {role.global ? "Applies to:" : "Held by:"}
              {holders.length ? holders.map((h) => <Chip key={h.id}>{h.name}</Chip>) : <span className="text-fg-3">nobody yet; give it to an AI in Identities</span>}
            </div>
          </div>

          <ul className="divide-y divide-line">
            {role.statements.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className={clsx(
                    "size-7 rounded-full grid place-items-center shrink-0",
                    s.effect === "deny" ? "bg-danger-soft text-danger" : s.mode === "ask" ? "bg-accent-soft text-accent" : "bg-ok-soft text-ok",
                  )}
                >
                  {s.effect === "deny" ? <Ban size={13} /> : s.mode === "ask" ? <Hand size={13} /> : <Check size={13} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px]">{s.note}</span>
                  <span className="block text-[11.5px] text-fg-3 font-mono truncate">{describeStatement(s)}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => removeStatement(s.id)} aria-label={`Remove ${s.note}`}>
                  Remove
                </Button>
              </li>
            ))}
            {!role.statements.length && <li className="px-4 py-3 text-[13px] text-fg-3">No statements yet, so this role allows nothing.</li>}
          </ul>

          <div className="p-4 border-t border-line bg-surface-2/50 rounded-b-2xl">
            <div className="text-[12px] font-semibold text-fg-3 mb-1">Add a statement</div>
            <div className="text-[14px] leading-[2.4]">
              An AI with this role
              <Pick label="How" value={how} options={HOW} onChange={setHow} />
              <Pick label="Action" value={Math.min(act, actions.length - 1)} options={actions.map((x) => x.label)} onChange={setAct} />
              <Pick label="Where" value={place} options={PLACES.map(placeLabel)} onChange={setPlace} />
              <Pick label="When" value={when} options={WHEN} onChange={setWhen} />
            </div>
            <div className="mt-2 flex items-center gap-3">
              {permanent ? (
                <span className="flex items-center gap-1.5 text-[12.5px] text-warn font-medium">
                  <Eye size={14} /> This can&apos;t be undone, so it will still ask every time.
                </span>
              ) : (
                <span className="text-[12.5px] text-fg-3">The broker enforces this. No AI can change it.</span>
              )}
              <span className="flex-1" />
              <Button variant="primary" onClick={addStatement}>
                <Plus size={14} /> Add
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ what if

const TRY: { label: string; tool: string; risk: Permission; input?: Record<string, unknown>; live?: { tool: string; args: (place: string) => Record<string, unknown> } }[] = [
  { label: "Read a file", tool: "files.read", risk: "read", live: { tool: "fs.read", args: (p) => ({ path: `${p}/x.txt` }) } },
  { label: "Search files", tool: "files.find", risk: "read", live: { tool: "fs.find", args: (p) => ({ path: p, query: "x" }) } },
  { label: "Move a file", tool: "files.move", risk: "reversible", live: { tool: "fs.move", args: (p) => ({ from: `${p}/x.txt`, to: `${p}/y.txt` }) } },
  { label: "Write a file", tool: "files.write", risk: "reversible", live: { tool: "fs.write", args: (p) => ({ path: `${p}/x.txt`, text: "x" }) } },
  { label: "Put a file in the Trash", tool: "files.trash", risk: "reversible", live: { tool: "fs.trash", args: (p) => ({ path: `${p}/x.txt` }) } },
  { label: "Change the theme", tool: "settings.set_theme", risk: "reversible", input: { theme: "dark" }, live: { tool: "ui.set_theme", args: () => ({ theme: "dark" }) } },
  { label: "Join a Wi-Fi network", tool: "network.connect_wifi", risk: "reversible", input: { ssid: "Cafe" }, live: { tool: "net.connect_wifi", args: () => ({ ssid: "Cafe" }) } },
  { label: "Write an email draft", tool: "gmail.draft", risk: "reversible", input: { to: "sara@example.com" } },
  { label: "Send an email", tool: "gmail.send", risk: "irreversible", input: { to: "sara@example.com" }, live: { tool: "mail.send", args: () => ({ to: ["sara@example.com"], subject: "Hi", body: "Hi" }) } },
  { label: "Search memory", tool: "memory.search", risk: "read", input: { query: "accountant" }, live: { tool: "memory.search", args: () => ({ query: "accountant" }) } },
];
const TRY_PLACES = ["~/Downloads", "~/Projects", "~/Documents", "~/Documents/Taxes 2025", "~/Pictures"];

const VERDICT: Record<PolicyVerdict["decision"], { label: string; tone: Tone; cls: string }> = {
  allow: { label: "Allowed", tone: "ok", cls: "bg-ok text-white" },
  ask: { label: "Asks you", tone: "accent", cls: "bg-accent text-white" },
  block: { label: "Blocked", tone: "danger", cls: "bg-danger text-white" },
};

export function WhatIf({ who: initialWho }: { who?: string }) {
  const state = useOS();
  const live = state.settings.liveMachine;
  const tries = live ? TRY.filter((x) => x.live) : TRY;
  const [who, setWho] = useState(initialWho ?? state.iam.identities.find((i) => i.kind !== "owner")?.id ?? "owner");
  const [act, setAct] = useState(2);
  const [place, setPlace] = useState(0);
  const [tainted, setTainted] = useState(false);
  const t = tries[Math.min(act, tries.length - 1)];
  const usesPlace = t.tool.startsWith("files.");
  // on the live machine capd answers (iam.whatif): nothing runs, nothing is logged
  const [liveV, setLiveV] = useState<Record<string, PolicyVerdict>>({});
  const ids = state.iam.identities.map((i) => i.id).join(",");
  useEffect(() => {
    if (!live || !t.live) return;
    let on = true;
    const spec = t.live;
    const where = TRY_PLACES[place].replace("~/", "");
    void Promise.all(
      ids.split(",").map(async (id) => {
        try {
          const r = await liveOwner("iam_whatif", { principal: id, tool: spec.tool, args: spec.args(where), tainted });
          return [id, { decision: r.decision, reason: r.reason, checks: toChecks(r.checks) } as PolicyVerdict] as const;
        } catch (e) {
          return [id, { decision: "block", reason: e instanceof Error ? e.message : String(e), checks: [] } as PolicyVerdict] as const;
        }
      }),
    ).then((rows) => on && setLiveV(Object.fromEntries(rows)));
    return () => {
      on = false;
    };
  }, [live, t, place, tainted, ids]);
  const verdictFor = (principal: string): PolicyVerdict =>
    live ? (liveV[principal] ?? { decision: "ask", reason: "Asking the broker…", checks: [] }) :
    evaluate(state, {
      principal,
      tool: { name: t.tool, adapter: "what-if", permission: t.risk, input: usesPlace ? { path: TRY_PLACES[place] } : (t.input ?? {}) },
      goal: "What if",
      fromUser: true,
      tainted,
    });
  const v = verdictFor(who);
  const iamCheck = v.checks.find((c) => c.id === "iam");

  return (
    <>
      <H
        title="What if"
        sub={`Ask the broker what it would decide, without anything happening. Same checks, same order, nothing run and nothing logged.${live ? " Answered by capd on the live machine." : ""}`}
      />
      <div className="rounded-2xl border border-line p-4">
        <div className="text-[14px] leading-[2.4]">
          What if
          <select
            aria-label="Who"
            value={who}
            onChange={(e) => setWho(e.target.value)}
            className="mx-1 my-0.5 h-8 px-2.5 rounded-lg bg-ai-soft text-ai-ink font-semibold border border-ai-line outline-none cursor-pointer text-[13.5px]"
          >
            {state.iam.identities.map((i) => (
              <option key={i.id} value={i.id}>
                {i.kind === "owner" ? "you" : i.name}
              </option>
            ))}
          </select>
          tried to
          <Pick label="Action" value={Math.min(act, tries.length - 1)} options={tries.map((x) => x.label.toLowerCase())} onChange={setAct} />
          {usesPlace && (
            <>
              in
              <Pick label="Where" value={place} options={TRY_PLACES.map((p) => p.replace("~/", ""))} onChange={setPlace} />
            </>
          )}
          <label className="inline-flex items-center gap-1.5 ml-1 text-[13px] text-fg-2 cursor-pointer">
            <input type="checkbox" checked={tainted} onChange={(e) => setTainted(e.target.checked)} className="accent-[var(--accent)]" />
            after reading a web page
          </label>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-line">
        <div className="flex items-center gap-3 p-4 border-b border-line">
          <span className={clsx("h-8 px-3.5 rounded-full grid place-items-center text-[13.5px] font-semibold", VERDICT[v.decision].cls)}>{VERDICT[v.decision].label}</span>
          <span className="flex-1 text-[13.5px]">{v.reason}</span>
        </div>
        {iamCheck && (
          <div className="px-4 py-2.5 border-b border-line flex items-center gap-2 text-[12.5px]">
            <BadgeCheck size={14} className="text-accent shrink-0" />
            <span className="text-fg-2">Roles:</span> {iamCheck.detail}
          </div>
        )}
        <CheckTrace checks={v.checks} />
      </div>

      <h3 className="mt-6 mb-2 text-[14px] font-semibold">The same action, for everyone</h3>
      <ul className="rounded-2xl border border-line divide-y divide-line">
        {state.iam.identities.map((i) => {
          const x = verdictFor(i.id);
          return (
            <li key={i.id}>
              <button onClick={() => setWho(i.id)} className={clsx("w-full flex items-center gap-3 px-4 py-2 text-left", i.id === who ? "bg-ai-soft/60" : "hover:bg-surface-2")}>
                <Avatar who={i} size={26} />
                <span className="w-36 text-[13px] font-medium truncate">{i.kind === "owner" ? "You" : i.name}</span>
                <Chip tone={VERDICT[x.decision].tone} className="w-[84px] justify-center">
                  {VERDICT[x.decision].label}
                </Chip>
                <span className="flex-1 truncate text-[12.5px] text-fg-2">{x.reason}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
