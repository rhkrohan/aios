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
  ListChecks,
  Lock,
  Mail,
  OctagonX,
  Pause,
  Play,
  Plus,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  User,
  Users,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { BRAND } from "@/lib/brand";
import { CATALOG } from "@/lib/catalog";
import { useOS, type ScopeRule } from "@/lib/store";
import type { Win } from "@/lib/types";
import { FolderIcon } from "../icons/Icons";
import { StringOrb } from "../icons/StringOrb";
import { Button, Chip, timeAgo, type Tone } from "../ui";
import { LogoTile } from "../icons/BrandLogos";
import { CapTile } from "./StoreApp";

type Page = "overview" | "who" | "access" | "decisions" | "rules";

const PAGES: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: ShieldCheck },
  { id: "who", label: "Who can act", icon: Users },
  { id: "access", label: "Access map", icon: FolderTree },
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

type Verdict = "allowed" | "asked" | "blocked" | "sandboxed";
interface Decision {
  id: string;
  at: number;
  who: string;
  action: string;
  tool: string;
  target: string;
  verdict: Verdict;
  why: string;
}

const VERDICT: Record<Verdict, { label: string; tone: Tone }> = {
  allowed: { label: "Allowed", tone: "ok" },
  asked: { label: "Asked you", tone: "accent" },
  blocked: { label: "Blocked", tone: "danger" },
  sandboxed: { label: "Sandboxed", tone: "neutral" },
};

const HISTORY: Decision[] = [
  {
    id: "h1",
    at: Date.now() - 38 * 60e3,
    who: "weather-tools.dev",
    action: "Tried to read all of Google Drive",
    tool: "drive.files.find",
    target: "Entire Drive",
    verdict: "blocked",
    why: "Not one of its tools. Unknown publishers only get what they declared.",
  },
  {
    id: "h2",
    at: Date.now() - 52 * 60e3,
    who: `${BRAND.name} assistant`,
    action: "Send a request after reading a web page",
    tool: "browser.act",
    target: "unknown-site.example",
    verdict: "asked",
    why: "Network action after reading untrusted content always asks.",
  },
  {
    id: "h3",
    at: Date.now() - 95 * 60e3,
    who: "Claude Desktop",
    action: "Open Taxes 2025",
    tool: "files.read",
    target: "~/Documents/Taxes 2025",
    verdict: "blocked",
    why: "You blocked this folder for every AI.",
  },
  {
    id: "h4",
    at: Date.now() - 140 * 60e3,
    who: "Budget Book",
    action: "Read a bank export",
    tool: "budget.statements.read",
    target: "~/Downloads/statement.csv",
    verdict: "sandboxed",
    why: "Runs with no network, so the file can't leave this computer.",
  },
];

function useDecisions(): Decision[] {
  const runs = useOS((s) => s.runs);
  return useMemo(() => {
    const live: Decision[] = [];
    for (const r of runs) {
      for (const st of r.steps) {
        if (!st.tool || !st.broker) continue;
        live.push({
          id: r.id + st.id,
          at: r.startedAt,
          who: `${BRAND.name} assistant`,
          action: st.doneLabel ?? st.label,
          tool: st.tool.name,
          target: String(st.tool.input.path ?? st.tool.input.in ?? st.tool.input.target ?? st.tool.input.ssid ?? st.tool.input.query ?? r.request),
          verdict: st.broker === "denied" || st.broker === "blocked" ? "blocked" : st.broker.startsWith("asked") ? "asked" : "allowed",
          why:
            st.broker === "allowed"
              ? "Just looking. Always allowed and logged."
              : st.broker === "remembered"
                ? "You allowed this earlier."
                : st.broker === "denied"
                  ? "You said no."
                  : st.broker === "blocked"
                    ? "Blocked by your Access map. Nobody was asked."
                  : st.tool.permission === "irreversible"
                    ? "Can't be undone, so it always asks."
                    : "First time this session, so it asked.",
        });
      }
    }
    return [...live.reverse(), ...HISTORY];
  }, [runs]);
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
  const [paused, setPaused] = useState<string[]>([]);
  const caps = [...CATALOG, ...custom].filter((c) => installed[c.id]);

  const rows: { id: string; name: string; role: keyof typeof ROLES; detail: string; tile: React.ReactNode; last: string; removable?: () => void }[] = [
    { id: "you", name: BRAND.user, role: "Owner", detail: "You, at this computer", tile: <Round icon={User} bg="#2f3540" />, last: "Now" },
    {
      id: "assistant",
      name: `${BRAND.name} assistant`,
      role: "Assistant",
      detail: "Thinks on this computer",
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
    { id: "claude-desktop", name: "Claude Desktop", role: "Connected app", detail: "Files, Mail, Settings", tile: <LogoTile logo="claude" size={40} />, last: "3 days ago" },
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
      <H title="Who can act" sub="Everything that can do something on this computer has its own identity and role. Pause or remove any of them." />
      <ul className="rounded-2xl border border-line divide-y divide-line">
        {rows.map((r) => {
          const off = paused.includes(r.id);
          const fixed = r.role === "Owner" || r.role === "Checker" || r.role === "Broker";
          return (
            <li key={r.id} className={clsx("flex items-center gap-3.5 px-4 py-3", off && "opacity-55")}>
              {r.tile}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold truncate">{r.name}</span>
                  <Chip tone={ROLES[r.role].tone}>{r.role}</Chip>
                  {off && <Chip tone="danger">Paused</Chip>}
                </div>
                <div className="text-[12.5px] text-fg-2 truncate">{r.detail}</div>
              </div>
              <span className="text-[12px] text-fg-3 w-24 text-right">{r.last}</span>
              {!fixed ? (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setPaused((p) => (off ? p.filter((x) => x !== r.id) : [...p, r.id]))}>
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
  const [filter, setFilter] = useState<Verdict | "all">("all");
  const list = filter === "all" ? all : all.filter((d) => d.verdict === filter);
  return (
    <>
      <H title="Decisions" sub="Every time something tried to act, what the broker decided and why." />
      <div className="flex gap-1 mb-3">
        {(["all", "allowed", "asked", "blocked", "sandboxed"] as const).map((f) => (
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
          <li key={d.id} className="grid grid-cols-[92px_1fr_auto] gap-3 px-4 py-3 items-start">
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
              </div>
            </div>
            <span className="text-[12px] text-fg-3 whitespace-nowrap">{timeAgo(d.at)}</span>
          </li>
        ))}
        {!list.length && <li className="py-10 text-center text-[13px] text-fg-3">Nothing here yet</li>}
      </ul>
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
