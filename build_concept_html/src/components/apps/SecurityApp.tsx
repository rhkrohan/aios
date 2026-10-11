"use client";

// Security Center. Follows the v3 design doc: principals with roles, a scope
// tree, live authority decisions, a permission builder, and revocation.
// Plain words on the surface; tool names and roles one level down.

import clsx from "clsx";
import {
  Ban,
  Bot,
  Check,
  ChevronRight,
  Cloud,
  Cpu,
  Eye,
  FileClock,
  FolderTree,
  KeyRound,
  Link2,
  ListChecks,
  Lock,
  Mail,
  OctagonX,
  Pause,
  Play,
  Plus,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  User,
  Users,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { BRAND } from "@/lib/brand";
import { verifyChain } from "@/lib/audit";
import { CATALOG } from "@/lib/catalog";
import { runRequest } from "@/lib/engine";
import { leaseValid, principalName } from "@/lib/policy";
import { TRUST_LEVELS, levelFromScore, trustLevelOf } from "@/lib/trust";
import { useOS, type ScopeRule } from "@/lib/store";
import type { AuditEntry, PolicyCheck, Win } from "@/lib/types";
import { FolderIcon } from "../icons/Icons";
import { StringOrb } from "../icons/StringOrb";
import { Button, Chip, timeAgo, type Tone } from "../ui";
import { LogoTile } from "../icons/BrandLogos";
import { CapTile } from "./StoreApp";
import { CheckTrace } from "../command/StepRow";

type Page = "overview" | "who" | "access" | "leases" | "vault" | "decisions" | "rules";

const PAGES: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: ShieldCheck },
  { id: "who", label: "Who can act", icon: Users },
  { id: "access", label: "Access map", icon: FolderTree },
  { id: "leases", label: "Active permissions", icon: Timer },
  { id: "vault", label: "Sign-ins", icon: KeyRound },
  { id: "decisions", label: "Decisions", icon: FileClock },
  { id: "rules", label: "Rules", icon: SlidersHorizontal },
];

export function SecurityApp({ win }: { win: Win }) {
  const page = (win.props?.page as Page) ?? "overview";
  const setProps = useOS((s) => s.setWindowProps);
  const paused = useOS((s) => s.aiPaused);
  return (
    <div className="h-full flex">
      <aside className="w-52 shrink-0 border-r border-line bg-surface-2/70 p-2.5 flex flex-col gap-0.5">
        {PAGES.map((p) => (
          <button
            key={p.id}
            onClick={() => setProps(win.id, { page: p.id })}
            className={clsx(
              "flex items-center gap-2.5 px-2.5 h-9 rounded-[10px] text-[13.5px] text-left",
              page === p.id ? "bg-surface font-semibold shadow-[0_1px_2px_rgba(0,0,0,.06),0_0_0_1px_var(--line)]" : "text-fg-2 hover:bg-surface-3 hover:text-fg",
            )}
          >
            <p.icon size={16} strokeWidth={1.8} className={page === p.id ? "text-ok" : undefined} />
            {p.label}
          </button>
        ))}
        <div className="mt-auto rounded-xl border border-line bg-surface p-3 text-[12px] leading-[1.45] text-fg-2">
          <div className="flex items-center gap-1.5 font-semibold text-fg mb-1">
            <span className={clsx("size-2 rounded-full", paused ? "bg-danger" : "bg-ok")} />
            {paused ? "AI is paused" : "Broker running"}
          </div>
          Every action from every AI passes through the permission broker. It runs separately from the AI, so the AI can&apos;t skip it.
        </div>
      </aside>
      <div className="flex-1 min-w-0 overflow-auto scroll-thin bg-surface">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={page} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="p-6 max-w-[860px]">
            {page === "overview" && <Overview go={(p) => setProps(win.id, { page: p })} />}
            {page === "who" && <Who />}
            {page === "access" && <Access />}
            {page === "leases" && <Leases />}
            {page === "vault" && <Vault />}
            {page === "decisions" && <Decisions />}
            {page === "rules" && <Rules />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function H({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-[22px] font-semibold tracking-[-0.01em]">{title}</h2>
      <p className="text-[13.5px] text-fg-2 mt-0.5 max-w-[620px]">{sub}</p>
    </div>
  );
}

// ------------------------------------------------------------------ decisions data

type Verdict = "allowed" | "asked" | "denied" | "blocked";
interface Decision {
  id: string;
  at: number;
  who: string;
  action: string;
  tool: string;
  target: string;
  verdict: Verdict;
  why: string;
  checks?: PolicyCheck[];
  hash?: string;
  seq?: number;
}

const VERDICT: Record<Verdict, { label: string; tone: Tone }> = {
  allowed: { label: "Allowed", tone: "ok" },
  asked: { label: "Asked you", tone: "accent" },
  denied: { label: "You said no", tone: "warn" },
  blocked: { label: "Blocked", tone: "danger" },
};

function useDecisions(): Decision[] {
  const audit = useOS((s) => s.audit);
  return useMemo(() => {
    const live: Decision[] = audit.map((e) => ({
      id: e.id,
      at: e.at,
      who: principalName(e.principal),
      action: e.outcome === "blocked" ? `Tried ${e.tool}` : e.tool,
      tool: e.tool,
      target: e.target,
      verdict: e.outcome === "blocked" ? "blocked" : e.outcome === "asked-no" ? "denied" : e.outcome === "asked-yes" ? "asked" : "allowed",
      why: e.reason,
      checks: e.checks,
      hash: e.hash,
      seq: e.seq,
    }));
    return live;
  }, [audit]);
}

// ------------------------------------------------------------------ overview

function Overview({ go }: { go: (p: Page) => void }) {
  const decisions = useDecisions();
  const paused = useOS((s) => s.aiPaused);
  const grants = useOS((s) => s.grants);
  const installed = useOS((s) => s.installed);
  const [confirm, setConfirm] = useState(false);
  const count = (v: Verdict) => decisions.filter((d) => d.verdict === v).length;

  return (
    <>
      <section
        className={clsx(
          "relative overflow-hidden rounded-[22px] p-6 text-white",
          paused ? "bg-[linear-gradient(120deg,#5a1f1f,#9a3a3a)]" : "bg-[linear-gradient(120deg,#0f3d33,#1f8a66_60%,#3fb68d)]",
        )}
      >
        <div className="absolute -right-12 -top-16 size-72 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center gap-5">
          <span className="size-16 rounded-2xl bg-white/15 grid place-items-center ring-1 ring-white/25">
            {paused ? <Pause size={30} /> : <ShieldCheck size={32} />}
          </span>
          <div className="flex-1">
            <div className="text-[24px] font-semibold tracking-[-0.01em]">{paused ? "All AI is paused" : "You're protected"}</div>
            <div className="text-[14px] text-white/80">
              {paused
                ? "No AI can act until you resume. Session permissions were reset."
                : `${decisions.length} decisions today. ${count("blocked")} blocked, ${count("asked")} asked you first.`}
            </div>
          </div>
          {paused ? (
            <button
              onClick={() => useOS.getState().setAiPaused(false)}
              className="h-10 px-4 rounded-full bg-white text-[#5a1f1f] text-[14px] font-semibold flex items-center gap-1.5 hover:bg-white/90"
            >
              <Play size={14} fill="currentColor" /> Resume AI
            </button>
          ) : (
            <button
              onClick={() => setConfirm(true)}
              className="h-10 px-4 rounded-full bg-white/15 ring-1 ring-white/35 text-[14px] font-semibold flex items-center gap-1.5 hover:bg-white/25"
            >
              <OctagonX size={15} /> Stop all AI
            </button>
          )}
        </div>
      </section>

      <div className="mt-4 grid grid-cols-4 gap-2.5">
        {(
          [
            ["Allowed", count("allowed"), "ok"],
            ["Asked you", count("asked"), "accent"],
            ["Blocked", count("blocked"), "danger"],
            ["Allowed this session", grants.length, "neutral"],
          ] as const
        ).map(([label, n, tone]) => (
          <div key={label} className="rounded-2xl border border-line p-3.5">
            <div
              className={clsx(
                "text-[26px] font-semibold tabular-nums leading-none",
                tone === "ok" && "text-ok",
                tone === "accent" && "text-accent",
                tone === "danger" && "text-danger",
              )}
            >
              {n}
            </div>
            <div className="mt-1.5 text-[12.5px] text-fg-2">{label}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line p-4">
          <div className="text-[14px] font-semibold mb-2.5">Protection</div>
          <ul className="grid gap-2 text-[13px]">
            {[
              [ShieldCheck, "Permission broker is running on its own"],
              [KeyRound, `${Object.keys(installed).length} sign-ins locked in the broker, none in AI memory`],
              [FileClock, "Snapshots before risky file changes"],
              [Lock, "Taxes 2025 is blocked for every AI"],
            ].map(([Icon, t]) => {
              const I = Icon as LucideIcon;
              return (
                <li key={t as string} className="flex items-center gap-2.5">
                  <span className="size-6 rounded-full bg-ok-soft text-ok grid place-items-center shrink-0">
                    <I size={13} />
                  </span>
                  {t as string}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="rounded-2xl border border-line p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[14px] font-semibold">Latest decisions</div>
            <button onClick={() => go("decisions")} className="text-[12.5px] text-fg-2 hover:text-fg">
              See all
            </button>
          </div>
          <ul className="grid gap-1">
            {decisions.slice(0, 4).map((d) => (
              <li key={d.id} className="flex items-center gap-2.5 text-[13px] py-1">
                <Chip tone={VERDICT[d.verdict].tone} className="w-[78px] justify-center">
                  {VERDICT[d.verdict].label}
                </Chip>
                <span className="flex-1 truncate">{d.action}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <AnimatePresence>{confirm && <StopConfirm onClose={() => setConfirm(false)} />}</AnimatePresence>
    </>
  );
}

function StopConfirm({ onClose }: { onClose: () => void }) {
  const running = useOS((s) => s.runs.filter((r) => r.status === "running" || r.status === "waiting").length);
  const stop = () => {
    const st = useOS.getState();
    if (st.approval) st.answerApproval("deny");
    st.revokeGrants();
    st.setAiPaused(true);
    st.pushToast({ title: "All AI stopped", body: "Nothing can act until you resume. Session permissions were reset.", tone: "warn" });
    onClose();
  };
  return (
    <motion.div className="fixed inset-0 z-[985] grid place-items-center p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-[#0b1220]/40 backdrop-blur-[3px]" onClick={onClose} />
      <motion.div
        initial={{ y: 12, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 8, scale: 0.98 }}
        className="relative w-full max-w-[420px] rounded-[22px] bg-surface shadow-pop p-6"
      >
        <span className="size-12 rounded-2xl bg-danger-soft text-danger grid place-items-center">
          <OctagonX size={22} />
        </span>
        <div className="mt-3 text-[19px] font-semibold">Stop all AI right now?</div>
        <ul className="mt-3 grid gap-1.5 text-[13px] text-fg-2">
          <li className="flex gap-2">
            <Check size={14} className="text-fg shrink-0 mt-0.5" /> {running ? `${running} running task stops before its next step` : "No task is running right now"}
          </li>
          <li className="flex gap-2">
            <Check size={14} className="text-fg shrink-0 mt-0.5" /> Every &ldquo;allowed this session&rdquo; permission is reset
          </li>
          <li className="flex gap-2">
            <Check size={14} className="text-fg shrink-0 mt-0.5" /> Connected AI apps can&apos;t act until you resume
          </li>
          <li className="flex gap-2">
            <Check size={14} className="text-fg shrink-0 mt-0.5" /> Undo still works for anything already done
          </li>
        </ul>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={stop}>
            Stop all AI
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------------ who can act

const ROLES: Record<string, { tone: Tone; can: string; cannot: string }> = {
  Owner: { tone: "ok", can: "Everything, including changing these rules", cannot: "Nothing is off limits" },
  Assistant: { tone: "accent", can: "Plan tasks and suggest steps", cannot: "Act without the broker, or see passwords" },
  "Online AI": { tone: "accent", can: "Help with hard tasks you approve", cannot: "See names, files or memory you haven't cleared" },
  "Connected app": { tone: "neutral", can: "Use the areas you picked", cannot: "Go beyond those areas or skip approvals" },
  Service: { tone: "neutral", can: "Provide the tools it declared", cannot: "Add new tools without an update you approve" },
  Checker: { tone: "ok", can: "Confirm a task really worked", cannot: "Change anything" },
  Broker: { tone: "ok", can: "Approve, block and hold sign-ins", cannot: "Be bypassed by any AI" },
};

function Who() {
  const installed = useOS((s) => s.installed);
  const custom = useOS((s) => s.customCaps);
  const onlineAi = useOS((s) => s.settings.onlineAi);
  const uninstall = useOS((s) => s.uninstall);
  const paused = useOS((s) => s.pausedPrincipals);
  const toggle = useOS((s) => s.togglePrincipal);
  const apps = useOS((s) => s.connectedApps);
  const caps = [...CATALOG, ...custom].filter((c) => installed[c.id]);

  type Row = { id: string; name: string; role: keyof typeof ROLES; detail: string; tile: React.ReactNode; last: string; removable?: () => void; test?: () => void };
  const rows: Row[] = [
    { id: "owner", name: BRAND.user, role: "Owner", detail: "You, at this computer", tile: <Round icon={User} bg="#2f3540" />, last: "Now" },
    {
      id: "assistant",
      name: `${BRAND.name} assistant`,
      role: "Assistant",
      detail: "Thinks on this computer, acts only through the broker",
      tile: (
        <span className="size-10 grid place-items-center">
          <StringOrb size={40} strands={14} />
        </span>
      ),
      last: "Today",
    },
    ...(onlineAi
      ? [{ id: "online", name: onlineAi, role: "Online AI" as const, detail: "Only for hard tasks you approve", tile: <LogoTile logo={onlineAi === "Gemini" ? "gemini" : "claude"} size={40} />, last: "Today" }]
      : []),
    ...Object.entries(apps).map(([id, a]) => ({
      id,
      name: principalName(id),
      role: "Connected app" as const,
      detail: `Can use ${a.areas.join(", ") || "nothing"}`,
      tile: id === "claude-desktop" ? <LogoTile logo="claude" size={40} /> : <Round icon={Bot} bg="#59616b" />,
      last: a.since.replace("Connected ", ""),
      test: () => {
        // a settings change always needs a decision, whatever state the machine is in
        void runRequest(useOS.getState().theme === "dark" ? "Turn on light mode" : "Turn on dark mode", { principal: id });
      },
    })),
    ...caps.map((c) => ({
      id: c.id,
      name: c.name,
      role: "Service" as const,
      detail: `${c.tools.length - installed[c.id].disabledTools.length} tools${installed[c.id].account ? `, signed in as ${installed[c.id].account}` : ""}`,
      tile: <CapTile cap={c} size={40} />,
      last: timeAgo(installed[c.id].installedAt),
      removable: () => uninstall(c.id),
    })),
    { id: "verifier", name: "Checker", role: "Checker", detail: "Confirms each task did what it said", tile: <Round icon={ListChecks} bg="#1f8a66" />, last: "Always on" },
    { id: "broker", name: "Permission broker", role: "Broker", detail: "Runs separately, holds every sign-in", tile: <Round icon={ShieldCheck} bg="#1f8a66" />, last: "Always on" },
  ];

  return (
    <>
      <H title="Who can act" sub="Everything that can do something on this computer has its own identity and role. Pausing one is enforced by the broker, not just hidden." />
      <ul className="rounded-2xl border border-line divide-y divide-line">
        {rows.map((r) => {
          const off = paused.includes(r.id);
          const fixed = r.role === "Owner" || r.role === "Checker" || r.role === "Broker";
          return (
            <li key={r.id} className={clsx("flex items-center gap-3.5 px-4 py-3", off && "opacity-60")}>
              {r.tile}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold truncate">{r.name}</span>
                  <Chip tone={ROLES[r.role].tone}>{r.role}</Chip>
                  {off && <Chip tone="danger">Paused</Chip>}
                </div>
                <div className="text-[12.5px] text-fg-2 truncate">{r.detail}</div>
                {r.role === "Connected app" && <TrustInline principal={r.id} />}
              </div>
              <span className="text-[12px] text-fg-3 w-24 text-right">{r.last}</span>
              {!fixed ? (
                <div className="flex gap-1">
                  {r.test && (
                    <Button size="sm" onClick={r.test}>
                      Test a request
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => toggle(r.id)}>
                    {off ? "Resume" : "Pause"}
                  </Button>
                  {r.removable && (
                    <Button size="sm" variant="ghost" className="text-danger" onClick={r.removable}>
                      Remove
                    </Button>
                  )}
                </div>
              ) : (
                <span className="w-[120px] text-right text-[12px] text-fg-3">Always on</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2.5 text-[12.5px] text-fg-3">
        &ldquo;Test a request&rdquo; makes the connected app ask to change the theme, so you can watch the broker check who it is and what it may use.
      </p>

      <TrustLadder />

      <h3 className="mt-7 mb-2.5 text-[15px] font-semibold">What each role means</h3>
      <div className="grid grid-cols-2 gap-2.5">
        {Object.entries(ROLES).map(([name, r]) => (
          <div key={name} className="rounded-2xl border border-line p-3.5">
            <Chip tone={r.tone}>{name}</Chip>
            <div className="mt-2 text-[12.5px] leading-5">
              <span className="text-ok font-medium">Can:</span> {r.can}
            </div>
            <div className="text-[12.5px] leading-5">
              <span className="text-danger font-medium">Can&apos;t:</span> {r.cannot}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ trust

const LEVEL_TONE = ["bg-danger", "bg-warn", "bg-accent", "bg-ok", "bg-fg"];

function TrustMeter({ level }: { level: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`Trust level ${level} of 4`}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={clsx("h-1.5 w-4 rounded-full", i < level ? LEVEL_TONE[level] : "bg-surface-3")} />
      ))}
    </span>
  );
}

function TrustInline({ principal }: { principal: string }) {
  const trust = useOS((s) => s.trust);
  const setOverride = useOS((s) => s.setTrustOverride);
  const [open, setOpen] = useState(false);
  const rec = trust[principal];
  const level = trustLevelOf(trust, principal);
  const auto = rec ? levelFromScore(rec.score) : 0;
  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2 text-[12px]">
        <TrustMeter level={level} />
        <span className="font-semibold">{TRUST_LEVELS[level].name}</span>
        <span className="text-fg-3">score {rec?.score ?? 0}</span>
        <select
          value={rec?.override ?? "auto"}
          onChange={(e) => setOverride(principal, e.target.value === "auto" ? null : Number(e.target.value))}
          className="ml-1 h-6 px-1.5 rounded-md bg-surface-2 border border-line text-[11.5px] outline-none"
          aria-label="Trust override"
        >
          <option value="auto">Earned ({TRUST_LEVELS[auto].name})</option>
          {[0, 1, 2, 3].map((l) => (
            <option key={l} value={l}>
              Set to {TRUST_LEVELS[l].name}
            </option>
          ))}
        </select>
        <button onClick={() => setOpen(!open)} className="text-fg-2 hover:text-fg underline-offset-2 hover:underline">
          {open ? "Hide why" : "Why?"}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && rec && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-1.5 grid gap-0.5">
            {rec.history.slice(0, 6).map((h, i) => (
              <li key={i} className="flex gap-2 text-[11.5px]">
                <span className={clsx("w-8 text-right tabular-nums font-semibold", h.delta >= 0 ? "text-ok" : "text-danger")}>
                  {h.delta >= 0 ? "+" : ""}
                  {h.delta}
                </span>
                <span className="text-fg-2 flex-1 truncate">{h.why}</span>
                <span className="text-fg-3">{timeAgo(h.at)}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The five levels, with every agent placed on its rung. */
function TrustLadder() {
  const trust = useOS((s) => s.trust);
  const apps = useOS((s) => s.connectedApps);
  const agents = ["owner", ...Object.keys(apps)];
  return (
    <>
      <h3 className="mt-7 mb-1 text-[15px] font-semibold">Trust levels</h3>
      <p className="mb-3 text-[12.5px] text-fg-2 max-w-[640px]">
        Trust is earned: tasks that finish and check out raise it, trying things it isn&apos;t allowed to lowers it. The broker reads it before every action, and you can
        override it anytime.
      </p>
      <div className="grid grid-cols-5 gap-2">
        {TRUST_LEVELS.map((l) => {
          const here = agents.filter((a) => trustLevelOf(trust, a) === l.level);
          return (
            <div key={l.level} className={clsx("rounded-2xl border p-3 flex flex-col", here.length ? "border-line-strong bg-surface" : "border-line bg-surface-2/50")}>
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold">{l.name}</span>
                <TrustMeter level={l.level} />
              </div>
              <div className="mt-1.5 text-[11.5px] text-fg-2 leading-[1.4] flex-1">{l.can}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {here.map((a) => (
                  <Chip key={a} tone={a === "owner" ? "ok" : "accent"}>
                    {a === "owner" ? "You" : principalName(a)}
                  </Chip>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Round({ icon: Icon, bg }: { icon: LucideIcon; bg: string }) {
  return (
    <span className="size-10 rounded-full grid place-items-center text-white shrink-0" style={{ background: bg }}>
      <Icon size={18} />
    </span>
  );
}

// ------------------------------------------------------------------ access map

interface Node {
  key: string;
  label: string;
  icon: React.ReactNode;
  children?: Node[];
  who: string;
}

const TREE: Node[] = [
  {
    key: "~",
    label: "Home",
    icon: <FolderIcon size={22} emblem="home" />,
    who: "The assistant and Claude Desktop",
    children: [
      {
        key: "~/Documents",
        label: "Documents",
        icon: <FolderIcon size={22} emblem="documents" color="violet" />,
        who: "The assistant and Claude Desktop",
        children: [{ key: "~/Documents/Taxes 2025", label: "Taxes 2025", icon: <FolderIcon size={22} emblem="taxes" color="rose" />, who: "Nobody" }],
      },
      { key: "~/Downloads", label: "Downloads", icon: <FolderIcon size={22} emblem="downloads" color="teal" />, who: "The assistant" },
      { key: "~/Projects", label: "Projects", icon: <FolderIcon size={22} emblem="projects" />, who: "The assistant, GitHub" },
      { key: "~/Pictures", label: "Pictures", icon: <FolderIcon size={22} emblem="pictures" color="amber" />, who: "The assistant" },
    ],
  },
  { key: "mail.send", label: "Sending email", icon: <Ico icon={Mail} />, who: "The assistant, through Gmail" },
  { key: "network", label: "Wi-Fi and network", icon: <Ico icon={Wifi} />, who: "The assistant" },
  { key: "settings", label: "System settings", icon: <Ico icon={Settings2} />, who: "The assistant and Claude Desktop" },
];

function Ico({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="size-[22px] rounded-md grid place-items-center bg-surface-3 text-fg-2">
      <Icon size={13} />
    </span>
  );
}

const RULE_UI: Record<ScopeRule, { label: string; on: string }> = {
  allow: { label: "Allow", on: "bg-ok text-white" },
  ask: { label: "Ask", on: "bg-accent text-white" },
  block: { label: "Block", on: "bg-danger text-white" },
};

function Access() {
  const rules = useOS((s) => s.scopeRules);
  const setRule = useOS((s) => s.setScopeRule);
  const [openKeys, setOpenKeys] = useState<string[]>(["~", "~/Documents"]);
  const [sel, setSel] = useState<Node>(TREE[0].children![0]);

  const row = (n: Node, depth: number): React.ReactNode => {
    const open = openKeys.includes(n.key);
    const rule = rules[n.key];
    return (
      <div key={n.key}>
        <div
          onClick={() => setSel(n)}
          className={clsx("flex items-center gap-2 h-11 pr-3 rounded-xl cursor-pointer", sel.key === n.key ? "bg-ai-soft" : "hover:bg-surface-2")}
          style={{ paddingLeft: 8 + depth * 22 }}
        >
          {n.children ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenKeys((k) => (open ? k.filter((x) => x !== n.key) : [...k, n.key]));
              }}
              className="size-5 grid place-items-center text-fg-3"
              aria-label={open ? "Collapse" : "Expand"}
            >
              <ChevronRight size={14} className={clsx("transition-transform", open && "rotate-90")} />
            </button>
          ) : (
            <span className="w-5" />
          )}
          {n.icon}
          <span className="flex-1 text-[13.5px] font-medium">{n.label}</span>
          {rule ? (
            <div className="flex rounded-lg bg-surface-3 p-0.5" onClick={(e) => e.stopPropagation()}>
              {(Object.keys(RULE_UI) as ScopeRule[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRule(n.key, r)}
                  className={clsx("h-6.5 px-2.5 rounded-md text-[12px] font-medium transition-colors", rule === r ? RULE_UI[r].on : "text-fg-2 hover:text-fg")}
                >
                  {RULE_UI[r].label}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-[12px] text-fg-3">Per folder</span>
          )}
        </div>
        {n.children && open && n.children.map((c) => row(c, depth + 1))}
      </div>
    );
  };

  const selRule = rules[sel.key];
  return (
    <>
      <H title="Access map" sub="What AI can reach, place by place. Block always wins. Just looking is allowed everywhere that isn't blocked, and always logged." />
      <div className="grid grid-cols-[1fr_260px] gap-4">
        <div className="rounded-2xl border border-line p-1.5">{TREE.map((n) => row(n, 0))}</div>
        <div className="rounded-2xl border border-line p-4 h-fit">
          <div className="flex items-center gap-2.5">
            {sel.icon}
            <span className="text-[15px] font-semibold">{sel.label}</span>
          </div>
          {selRule && (
            <div className="mt-3">
              <Chip tone={selRule === "allow" ? "ok" : selRule === "ask" ? "accent" : "danger"} icon={selRule === "block" ? Ban : selRule === "ask" ? Eye : Check}>
                {selRule === "allow" ? "Changes allowed" : selRule === "ask" ? "Changes ask first" : "Blocked for every AI"}
              </Chip>
            </div>
          )}
          <div className="mt-4 text-[12px] font-semibold text-fg-3">Who can reach it</div>
          <div className="mt-1 text-[13px]">{selRule === "block" ? "Nobody" : sel.who}</div>
          <div className="mt-4 text-[12px] font-semibold text-fg-3">What that means</div>
          <div className="mt-1 text-[12.5px] text-fg-2 leading-5">
            {selRule === "block"
              ? "No AI can open, list or change anything here. Not even read-only."
              : selRule === "ask"
                ? "AI can look. Anything that changes something here asks you first."
                : "AI can look and make reversible changes. Deleting still asks."}
          </div>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ decisions

function Decisions() {
  const all = useDecisions();
  const audit = useOS((s) => s.audit);
  const [filter, setFilter] = useState<Verdict | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [check, setCheck] = useState<null | { ok: boolean; at?: number; n: number }>(null);
  const [tampered, setTampered] = useState<AuditEntry[] | null>(null);
  const list = filter === "all" ? all : all.filter((d) => d.verdict === filter);

  const live = useOS((s) => s.settings.liveMachine);
  const verify = () => {
    // live: capd verifies the real log on disk; this list is what it reported
    if (useOS.getState().settings.liveMachine) {
      const ok = useOS.getState().liveIntact !== false;
      setCheck({ ok, n: useOS.getState().audit.length });
      return;
    }
    const bad = verifyChain(useOS.getState().audit);
    setCheck({ ok: bad === null, at: bad ?? undefined, n: useOS.getState().audit.length });
  };
  const tamper = () => {
    const log = useOS.getState().audit;
    if (log.length < 2) return;
    setTampered(log);
    const victim = log[Math.floor(log.length / 2)];
    // edit one entry without re-hashing, like an attacker covering their tracks
    useOS.setState({ audit: log.map((e) => (e.id === victim.id ? { ...e, outcome: "allowed", reason: "Nothing to see here." } : e)) });
    setCheck(null);
  };
  const restore = () => {
    if (tampered) useOS.setState({ audit: tampered });
    setTampered(null);
    setCheck(null);
  };

  return (
    <>
      <H title="Decisions" sub="Every time something tried to act: what the broker decided, and every check it ran. The log is chained, so changing any entry breaks the chain." />

      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line p-3.5">
        <span className={clsx("size-9 rounded-xl grid place-items-center", check ? (check.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger") : "bg-surface-3 text-fg-2")}>
          {check && !check.ok ? <ShieldAlert size={17} /> : <Link2 size={17} />}
        </span>
        <div className="flex-1 min-w-0 text-[13px]">
          {!check && (
            <>
              <div className="font-semibold">Tamper-evident log</div>
              <div className="text-fg-2">{audit.length} entries, each linked to the one before it.</div>
            </>
          )}
          {check?.ok && (
            <>
              <div className="font-semibold text-ok">Log is intact</div>
              <div className="text-fg-2">All {check.n} entries check out. Head {audit[0]?.hash.slice(0, 12) ?? "empty"}.</div>
            </>
          )}
          {check && !check.ok && (
            <>
              <div className="font-semibold text-danger">Log was changed at entry #{check.at}</div>
              <div className="text-fg-2">That entry no longer matches its fingerprint, so every entry after it is suspect.</div>
            </>
          )}
        </div>
        <Button size="sm" onClick={verify} disabled={!audit.length}>
          Verify log
        </Button>
        {tampered ? (
          <Button size="sm" variant="ghost" onClick={restore}>
            Restore
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={tamper} disabled={audit.length < 2 || live}>
            Try tampering
          </Button>
        )}
      </div>

      <div className="flex gap-1 mb-3">
        {(["all", "allowed", "asked", "denied", "blocked"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx("h-8 px-3.5 rounded-full text-[13px]", filter === f ? "bg-fg text-surface font-semibold" : "text-fg-2 hover:bg-surface-3")}
          >
            {f === "all" ? "All" : VERDICT[f].label}
          </button>
        ))}
      </div>
      <ul className="rounded-2xl border border-line divide-y divide-line">
        {list.map((d) => (
          <li key={d.id}>
            <button onClick={() => setOpen(open === d.id ? null : d.id)} className="w-full grid grid-cols-[92px_1fr_auto_16px] gap-3 px-4 py-3 items-start text-left hover:bg-surface-2/60">
              <Chip tone={VERDICT[d.verdict].tone} className="justify-center mt-0.5">
                {VERDICT[d.verdict].label}
              </Chip>
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium">{d.action}</div>
                <div className="text-[12.5px] text-fg-2">{d.why}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-[11.5px] text-fg-3">
                  <span className="flex items-center gap-1">
                    <Bot size={11} /> {d.who}
                  </span>
                  <span className="font-mono">{d.tool}</span>
                  <span className="truncate max-w-[260px]">{d.target}</span>
                  {d.seq === undefined && <span className="italic">sample</span>}
                </div>
              </div>
              <span className="text-[12px] text-fg-3 whitespace-nowrap">{timeAgo(d.at)}</span>
              <ChevronRight size={14} className={clsx("mt-1 text-fg-3 transition-transform", open === d.id && "rotate-90")} />
            </button>
            <AnimatePresence initial={false}>
              {open === d.id && (
                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                  <div className="mx-4 mb-3 rounded-xl border border-line bg-surface-2">
                    {d.checks ? <CheckTrace checks={d.checks} /> : <div className="px-3 py-2.5 text-[12px] text-fg-3">Sample entry, no trace recorded.</div>}
                    {d.hash && (
                      <div className="px-3 py-2 border-t border-line font-mono text-[11px] text-fg-3">
                        #{d.seq} fingerprint {d.hash}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        ))}
        {!list.length && <li className="py-10 text-center text-[13px] text-fg-3">Nothing here yet</li>}
      </ul>
    </>
  );
}

// ------------------------------------------------------------------ active permissions (leases)

const subscribeSecond = (cb: () => void) => {
  const t = setInterval(cb, 1000);
  return () => clearInterval(t);
};

function left(ms: number) {
  const m = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function Leases() {
  const leases = useOS((s) => s.leases);
  const standing = useOS((s) => s.standingRules);
  const revoke = useOS((s) => s.revokeLease);
  const revokeAll = useOS((s) => s.revokeGrants);
  const removeRule = useOS((s) => s.removeStandingRule);
  const now = useSyncExternalStore(subscribeSecond, () => Math.floor(Date.now() / 1000) * 1000, () => 0);
  // before the first tick (server render) treat everything as live
  const live = now ? leases.filter((l) => leaseValid(l, now)) : leases;

  return (
    <>
      <H title="Active permissions" sub="Every permission is a lease: it covers one tool, for one requester, and ends on its own. Revoke any of them now." />
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[14px] font-semibold">Temporary</span>
        {live.length > 0 && (
          <Button size="sm" variant="ghost" onClick={revokeAll}>
            Revoke all
          </Button>
        )}
      </div>
      <ul className="rounded-2xl border border-line divide-y divide-line">
        {live.map((l) => {
          const pct = l.expiresAt && now ? Math.max(0, (l.expiresAt - now) / (l.expiresAt - l.createdAt)) : 1;
          return (
            <li key={l.id} className="flex items-center gap-3.5 px-4 py-3">
              <span className="size-9 rounded-xl grid place-items-center bg-accent-soft text-accent shrink-0">
                <Timer size={17} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold font-mono">{l.tool}</div>
                <div className="text-[12.5px] text-fg-2 truncate">
                  {principalName(l.principal)}, granted for &ldquo;{l.goal}&rdquo;
                </div>
                {l.expiresAt && (
                  <div className="mt-1.5 h-1 w-48 rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full bg-accent transition-[width] duration-1000" style={{ width: `${pct * 100}%` }} />
                  </div>
                )}
              </div>
              <span className="text-[12.5px] text-fg-2 tabular-nums w-28 text-right">
                {l.expiresAt ? `${left(Math.max(0, l.expiresAt - now))} left` : l.usesLeft !== null ? `${l.usesLeft} use left` : "Until you log out"}
              </span>
              <Button size="sm" variant="ghost" onClick={() => revoke(l.id)}>
                Revoke
              </Button>
            </li>
          );
        })}
        {!live.length && (
          <li className="px-4 py-8 text-center text-[13px] text-fg-3">
            Nothing temporary right now. Choose &ldquo;For 1 hour&rdquo; or &ldquo;This session&rdquo; on an approval to create one.
          </li>
        )}
      </ul>

      <div className="mt-6 mb-2.5 text-[14px] font-semibold">Standing rules</div>
      <ul className="rounded-2xl border border-line divide-y divide-line">
        {standing.map((t) => (
          <li key={t} className="flex items-center gap-3.5 px-4 py-3">
            <span className="size-9 rounded-xl grid place-items-center bg-surface-3 text-fg-2 shrink-0">
              <Lock size={16} />
            </span>
            <div className="flex-1">
              <div className="text-[13.5px] font-semibold font-mono">{t}</div>
              <div className="text-[12.5px] text-fg-2">You, always. Never covers actions that can&apos;t be undone.</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => removeRule(t)}>
              Remove
            </Button>
          </li>
        ))}
        {!standing.length && <li className="px-4 py-6 text-center text-[13px] text-fg-3">No standing rules.</li>}
      </ul>
    </>
  );
}

// ------------------------------------------------------------------ sign-ins vault

function Vault() {
  const installed = useOS((s) => s.installed);
  const custom = useOS((s) => s.customCaps);
  const uninstall = useOS((s) => s.uninstall);
  const onlineAi = useOS((s) => s.settings.onlineAi);
  const wifi = useOS((s) => s.wifi);
  const audit = useOS((s) => s.audit);
  const pushToast = useOS((s) => s.pushToast);
  const caps = [...CATALOG, ...custom].filter((c) => installed[c.id] && c.auth !== "none");
  const uses = (prefix: string) => audit.filter((e) => e.tool.startsWith(prefix) && e.outcome !== "blocked").length;

  const rows = [
    ...caps.map((c) => ({
      id: c.id,
      name: c.name,
      tile: <CapTile cap={c} size={40} />,
      kind: c.auth === "oauth" ? "Sign-in token" : "API key",
      account: installed[c.id].account ?? "",
      handle: `‹secret:${c.id}/${c.auth}›`,
      used: uses(c.tools[0].name.split(".")[0] + "."),
      revoke: () => uninstall(c.id),
    })),
    ...(onlineAi
      ? [
          {
            id: "online",
            name: onlineAi,
            tile: <LogoTile logo={onlineAi === "Gemini" ? "gemini" : "claude"} size={40} />,
            kind: "AI account",
            account: `${BRAND.user.toLowerCase()}@example.com`,
            handle: `‹secret:ai/${onlineAi.toLowerCase()}›`,
            used: 0,
            revoke: undefined,
          },
        ]
      : []),
    ...wifi.networks
      .filter((n) => n.saved && n.secured)
      .map((n) => ({
        id: "wifi-" + n.ssid,
        name: n.ssid,
        tile: <Round icon={Wifi} bg="#3f8fe6" />,
        kind: "Wi-Fi password",
        account: "Saved network",
        handle: `‹secret:wifi/${n.ssid}›`,
        used: uses("network.connect"),
        revoke: undefined,
      })),
  ];

  return (
    <>
      <H
        title="Sign-ins"
        sub="Every password, token and key lives here, encrypted and owned by the broker. AIs only ever see a placeholder; the broker swaps in the real secret at the last moment."
      />
      <ul className="rounded-2xl border border-line divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3.5 px-4 py-3">
            {r.tile}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold truncate">{r.name}</span>
                <Chip>{r.kind}</Chip>
              </div>
              <div className="text-[12.5px] text-fg-2 truncate">{r.account}</div>
              <div className="mt-1 text-[11.5px] text-fg-3">
                AI sees <span className="font-mono text-fg-2">{r.handle}</span>, used {r.used} {r.used === 1 ? "time" : "times"} today
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => pushToast({ title: `${r.name} sign-in renewed`, body: "Old token revoked, new one stored in the broker.", tone: "ok" })}>
              Renew
            </Button>
            {r.revoke && (
              <Button size="sm" variant="ghost" className="text-danger" onClick={r.revoke}>
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-3 gap-2.5">
        {[
          [Lock, "Encrypted at rest", "Owned by the system, not by you or any app."],
          [Eye, "Never shown to AI", "Not in prompts, memory or logs."],
          [KeyRound, "Swapped at the edge", "Only the broker ever holds the real value."],
        ].map(([I, t, d]) => {
          const Icon = I as LucideIcon;
          return (
            <div key={t as string} className="rounded-2xl border border-line p-3.5">
              <Icon size={17} className="text-ok" />
              <div className="mt-2 text-[13px] font-semibold">{t as string}</div>
              <div className="text-[12px] text-fg-2 leading-5">{d as string}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ rules (permission builder)

const WHO = ["the assistant", "Claude Desktop", "any AI"];
const DO = [
  { label: "move and organize files", tool: "files.organize" },
  { label: "open apps", tool: "apps.open" },
  { label: "change settings", tool: "settings.set_theme" },
  { label: "write email drafts", tool: "gmail.draft" },
  { label: "send email", tool: "gmail.send" },
];
const WHERE = ["in Downloads", "in Projects", "anywhere in Home"];
const HOW = ["without asking", "but ask me first", "never"];
const UNTIL = ["for this session", "always", "until Friday"];

interface Rule {
  id: string;
  text: string;
  tone: Tone;
}

function Pick({ value, options, onChange }: { value: number; options: string[]; onChange: (i: number) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="mx-1 my-0.5 h-8 px-2.5 rounded-lg bg-ai-soft text-ai-ink font-semibold border border-ai-line outline-none cursor-pointer text-[14px]"
    >
      {options.map((o, i) => (
        <option key={o} value={i}>
          {o}
        </option>
      ))}
    </select>
  )
}

function Rules() {
  const standing = useOS((s) => s.standingRules);
  const grant = useOS((s) => s.grant);
  const pushToast = useOS((s) => s.pushToast);
  const [who, setWho] = useState(0);
  const [act, setAct] = useState(0);
  const [where, setWhere] = useState(0);
  const [how, setHow] = useState(0);
  const [until, setUntil] = useState(0);
  const [rules, setRules] = useState<Rule[]>(() =>
    standing.map((t) => ({ id: t, text: `Let the assistant ${DO.find((d) => d.tool === t)?.label ?? t} without asking, always`, tone: "ok" as Tone })),
  );

  const irreversible = DO[act].tool === "gmail.send";
  const blockedCombo = irreversible && how === 0;

  const add = () => {
    if (blockedCombo) return;
    const text = `Let ${WHO[who]} ${DO[act].label} ${WHERE[where]} ${HOW[how]}${how === 2 ? "" : ", " + UNTIL[until]}`;
    setRules((r) => [{ id: String(Date.now()), text, tone: how === 0 ? "ok" : how === 1 ? "accent" : "danger" }, ...r]);
    if (how === 0 && who === 0) grant(DO[act].tool);
    pushToast({ title: "Rule added", body: text + ".", tone: "ok" });
  };

  return (
    <>
      <H title="Rules" sub="Build a rule like a sentence. Actions that can't be undone, like sending, can never be set to skip asking." />
      <div className="rounded-2xl border border-line p-5">
        <div className="text-[15px] leading-[2.4]">
          Let
          <Pick value={who} options={WHO} onChange={setWho} />
          <Pick value={act} options={DO.map((d) => d.label)} onChange={setAct} />
          <Pick value={where} options={WHERE} onChange={setWhere} />
          <Pick value={how} options={HOW} onChange={setHow} />
          {how !== 2 && <Pick value={until} options={UNTIL} onChange={setUntil} />}
        </div>
        <div className="mt-3 flex items-center gap-3">
          {blockedCombo ? (
            <span className="flex items-center gap-1.5 text-[12.5px] text-warn font-medium">
              <Ban size={14} /> Sending can&apos;t be undone, so it always asks. Pick &ldquo;but ask me first&rdquo;.
            </span>
          ) : (
            <span className="text-[12.5px] text-fg-3">The broker enforces this. The AI can&apos;t change it.</span>
          )}
          <span className="flex-1" />
          <Button variant="primary" onClick={add} disabled={blockedCombo}>
            <Plus size={14} /> Add rule
          </Button>
        </div>
      </div>

      <h3 className="mt-7 mb-2.5 text-[15px] font-semibold">Your rules</h3>
      <ul className="rounded-2xl border border-line divide-y divide-line">
        {rules.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-3">
            <span className={clsx("size-2 rounded-full shrink-0", r.tone === "ok" ? "bg-ok" : r.tone === "accent" ? "bg-accent" : "bg-danger")} />
            <span className="flex-1 text-[13.5px]">{r.text}</span>
            <Button size="sm" variant="ghost" onClick={() => setRules((x) => x.filter((y) => y.id !== r.id))}>
              Remove
            </Button>
          </li>
        ))}
        <li className="flex items-center gap-3 px-4 py-3 text-fg-2">
          <span className="size-2 rounded-full shrink-0 bg-danger" />
          <span className="flex-1 text-[13.5px]">Never let any AI open Taxes 2025</span>
          <Chip icon={Lock}>Set in Access map</Chip>
        </li>
        <li className="flex items-center gap-3 px-4 py-3 text-fg-2">
          <span className="size-2 rounded-full shrink-0 bg-accent" />
          <span className="flex-1 text-[13.5px]">Always ask before anything that can&apos;t be undone</span>
          <Chip icon={Lock}>Built in</Chip>
        </li>
        <li className="flex items-center gap-3 px-4 py-3 text-fg-2">
          <span className="size-2 rounded-full shrink-0 bg-accent" />
          <span className="flex-1 text-[13.5px]">Always ask before using online AI ({<Cloud size={12} className="inline -mt-0.5" />} with personal details removed)</span>
          <Chip icon={Cpu}>Brain settings</Chip>
        </li>
      </ul>
    </>
  );
}
