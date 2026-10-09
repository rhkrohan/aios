"use client";

import clsx from "clsx";
import { FlaskConical, Plug, Brain, ChevronDown, Cloud, Cpu, Lock, Moon, Palette, ShieldCheck, Sun, Wifi, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";
import { liveFetch, setDaemon } from "@/lib/livemachine";
import { useOS, type Settings } from "@/lib/store";
import type { Win } from "@/lib/types";
import { Button, Chip, Toggle } from "../ui";
import { BrandMark } from "../icons/Icons";
import { ConnectionsPage } from "./ConnectionsPage";
import { TestLab } from "./TestLab";
import { LiveRules } from "./LiveRules";

const PAGES = [
  { id: "brain", label: "Brain", icon: Brain },
  { id: "permissions", label: "Permissions", icon: ShieldCheck },
  { id: "connections", label: "Connected AI apps", icon: Plug },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "wifi", label: "Wi-Fi", icon: Wifi },
  { id: "lab", label: "Test lab", icon: FlaskConical },
] as const;

export function SettingsApp({ win }: { win: Win }) {
  const page = win.props?.page ?? "brain";
  const setProps = useOS((s) => s.setWindowProps);
  return (
    <div className="h-full flex">
      <aside className="w-52 shrink-0 border-r border-line bg-surface-2/70 p-2">
        {PAGES.map((p) => (
          <button
            key={p.id}
            onClick={() => setProps(win.id, { page: p.id })}
            className={clsx(
              "w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13px]",
              page === p.id ? "bg-accent-soft text-accent font-medium" : "hover:bg-surface-3",
            )}
          >
            <p.icon size={16} strokeWidth={1.8} />
            {p.label}
          </button>
        ))}
      </aside>
      <div className="flex-1 min-w-0 overflow-auto scroll-thin">
        <div className="max-w-[560px] mx-auto px-7 py-6">
          {page === "brain" && <BrainPage />}
          {page === "permissions" && <PermissionsPage />}
          {page === "connections" && <ConnectionsPage />}
          {page === "appearance" && <AppearancePage />}
          {page === "wifi" && <WifiPage />}
          {page === "lab" && (
            <>
              <H title="Test lab" sub="Real test files for the live machine: load a pack built for one feature, make your own file, or reset." />
              <TestLab />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function H({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-[20px] font-semibold tracking-[-0.01em]">{title}</h2>
      <p className="text-[13px] text-fg-2 mt-0.5">{sub}</p>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("rounded-2xl border border-line bg-surface p-4", className)}>{children}</div>;
}

function Row({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-3 border-t border-line first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-medium">{title}</div>
        {sub && <div className="text-[12.5px] text-fg-2 leading-5">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

const PRIVACY = [
  { label: "Nothing personal", sub: "Online AI never sees names, places or anything from memory." },
  { label: "Only what the task needs", sub: "Personal details are swapped for placeholders and put back on this computer." },
  { label: "Full context", sub: "Online AI gets the same context as the local brain. Fastest, least private." },
];

function BrainPage() {
  const s = useOS((x) => x.settings);
  const update = useOS((x) => x.updateSettings);
  const [adv, setAdv] = useState(false);
  return (
    <>
      <H title="Brain" sub={`Where ${BRAND.name} thinks, and what it may share.`} />

      <div className="grid gap-3">
        <Card className="flex gap-3.5">
          <span className="size-10 rounded-xl bg-ok-soft text-ok grid place-items-center shrink-0">
            <Cpu size={19} />
          </span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold">On this computer</span>
              <Chip tone="ok">Active</Chip>
            </div>
            <div className="text-[12.5px] text-fg-2 leading-5 mt-0.5">Handles everyday tasks. Private, and works without internet.</div>
          </div>
        </Card>

        <Card>
          <div className="flex gap-3.5">
            <span className="size-10 rounded-xl bg-accent-soft text-accent grid place-items-center shrink-0">
              <Cloud size={19} />
            </span>
            <div className="flex-1">
              <div className="text-[14px] font-semibold">Online AI for hard tasks</div>
              <div className="text-[12.5px] text-fg-2 leading-5 mt-0.5">Long writing, research and complex plans.</div>
              <div className="mt-3 flex rounded-lg border border-line p-0.5 w-fit text-[12.5px]">
                {(["Claude", "ChatGPT", "Gemini"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => update({ onlineAi: p })}
                    className={clsx("px-3 h-7 rounded-md", s.onlineAi === p ? "bg-surface-3 font-medium" : "text-fg-2 hover:text-fg")}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => update({ onlineAi: null })}
                  className={clsx("px-3 h-7 rounded-md", s.onlineAi === null ? "bg-surface-3 font-medium" : "text-fg-2 hover:text-fg")}
                >
                  None
                </button>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="text-[13.5px] font-medium">What online AI may see</div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {PRIVACY.map((p, i) => (
              <button
                key={p.label}
                onClick={() => update({ privacy: i as Settings["privacy"] })}
                className={clsx(
                  "rounded-xl border px-2.5 py-2 text-[12px] text-left leading-4 transition-colors",
                  s.privacy === i ? "border-accent bg-accent-soft text-accent font-medium" : "border-line hover:bg-surface-2",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-2.5 text-[12.5px] text-fg-2 leading-5">{PRIVACY[s.privacy].sub}</div>
        </Card>

        <Card>
          <Row title="Ask before using online AI" sub="Shows exactly what will be sent, every time.">
            <Toggle checked={s.askBeforeCloud} onChange={(v) => update({ askBeforeCloud: v })} label="Ask before using online AI" />
          </Row>
          <Row title="Fall back to this computer when offline" sub="Hard tasks get a simpler answer instead of failing.">
            <Toggle checked={s.offlineFallback} onChange={(v) => update({ offlineFallback: v })} label="Offline fallback" />
          </Row>
          <Row
            title="Plan new requests with live AI"
            sub="Anything that isn't a built-in demo goes to your AI provider (OpenAI or Claude, from .env.local). It sees file names and settings, never file contents or passwords."
          >
            <Toggle checked={s.liveAi} onChange={(v) => update({ liveAi: v })} label="Live AI planning" />
          </Row>
          <Row title="Use live AI for everything" sub="Even the built-in demos get planned by the real model. Good for testing; slower and costs a little per request.">
            <Toggle checked={s.liveAll} onChange={(v) => update({ liveAll: v, liveAi: v ? true : s.liveAi })} label="Live AI for everything" />
          </Row>
        </Card>

        <LiveMachineCard on={s.liveMachine} set={(v) => update({ liveMachine: v })} />

        <button onClick={() => setAdv((a) => !a)} className="flex items-center gap-1 text-[12.5px] text-fg-3 hover:text-fg-2 w-fit">
          <ChevronDown size={13} className={clsx("transition-transform", adv && "rotate-180")} /> Advanced
        </button>
        <AnimatePresence initial={false}>
          {adv && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-1.5 rounded-xl border border-line bg-surface-2 p-3.5 text-[12px] font-mono">
                <dt className="text-fg-3">local model</dt>
                <dd>8B instruct, 4-bit GGUF</dd>
                <dt className="text-fg-3">runtime</dt>
                <dd>llama.cpp server (system service)</dd>
                <dt className="text-fg-3">fast decider</dt>
                <dd>Reflex v1 on local model</dd>
                <dt className="text-fg-3">online provider</dt>
                <dd>{s.onlineAi ?? "none"}</dd>
                <dt className="text-fg-3">memory</dt>
                <dd>Vault, encrypted, ~/.local/share</dd>
              </dl>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

function PermissionsPage() {
  const grants = useOS((s) => s.grants);
  const standing = useOS((s) => s.standingRules);
  const revoke = useOS((s) => s.revokeGrants);
  const removeRule = useOS((s) => s.removeStandingRule);
  const levels = [
    { name: "Looking", ex: "Read a file, list windows, search memory", rule: "Allowed, always logged", tone: "neutral" as const },
    { name: "Changes", ex: "Open an app, move files, change a setting, write a draft", rule: "Asks the first time each session", tone: "accent" as const },
    { name: "Can't be undone", ex: "Send, post, delete, pay, run commands", rule: "Always asks", tone: "warn" as const },
    { name: "After reading the web", ex: "Any network action after reading pages, emails or unknown files", rule: "Always asks", tone: "warn" as const },
  ];
  return (
    <>
      <H title="Permissions" sub="Every action goes through the permission broker. The AI can't skip it." />
      <LiveRules />

      <Card>
        <div className="text-[13.5px] font-medium mb-2">How it decides</div>
        <div className="grid gap-2">
          {levels.map((l) => (
            <div key={l.name} className="flex items-start gap-3 text-[12.5px]">
              <Chip tone={l.tone} className="mt-0.5 w-32 justify-center">
                {l.name}
              </Chip>
              <div className="flex-1">
                <div>{l.rule}</div>
                <div className="text-fg-3">{l.ex}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="mt-3">
        <div className="flex items-center justify-between">
          <div className="text-[13.5px] font-medium">Allowed this session</div>
          {grants.length > 0 && (
            <Button size="sm" variant="ghost" onClick={revoke}>
              Reset all
            </Button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {grants.length ? grants.map((g) => <Chip key={g} tone="accent">{g}</Chip>) : <span className="text-[12.5px] text-fg-3">Nothing yet. Choose &ldquo;Allow for this session&rdquo; on a prompt.</span>}
        </div>
      </Card>
      <Card className="mt-3">
        <div className="text-[13.5px] font-medium">Standing rules</div>
        <div className="text-[12.5px] text-fg-2">These never ask. Only changes can be standing rules, never actions that can&apos;t be undone.</div>
        <ul className="mt-2.5 grid gap-1.5">
          {standing.map((r) => (
            <li key={r} className="flex items-center gap-2 rounded-lg bg-surface-2 border border-line px-3 h-9 text-[12.5px]">
              <Lock size={13} className="text-fg-3" />
              <span className="font-mono flex-1">{r}</span>
              <span className="text-fg-3">Save drafts in Mail</span>
              <button aria-label="Remove rule" onClick={() => removeRule(r)} className="size-6 grid place-items-center rounded-md hover:bg-surface-3">
                <X size={13} />
              </button>
            </li>
          ))}
          {!standing.length && <li className="text-[12.5px] text-fg-3">No standing rules.</li>}
        </ul>
      </Card>
    </>
  );
}

function AppearancePage() {
  const theme = useOS((s) => s.theme);
  const setTheme = useOS((s) => s.setTheme);
  const wallpaper = useOS((s) => s.wallpaper);
  const setWallpaper = useOS((s) => s.setWallpaper);
  return (
    <>
      <H title="Appearance" sub="Light or dark, for the desktop and every app." />
      <div className="grid grid-cols-2 gap-3">
        {(["light", "dark"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTheme(t)}
            className={clsx("rounded-2xl border-2 p-2 text-left transition-colors", theme === t ? "border-accent" : "border-line hover:border-line-strong")}
          >
            <div className={clsx("h-24 rounded-xl overflow-hidden border", t === "dark" ? "bg-[#16191d] border-[#33373c]" : "bg-[#e9ebe6] border-[#e4e4df]")}>
              <div className={clsx("h-3", t === "dark" ? "bg-black/60" : "bg-[#2b2f34]")} />
              <div className={clsx("m-3 h-12 w-24 rounded-lg", t === "dark" ? "bg-[#24272b]" : "bg-white")} />
            </div>
            <div className="flex items-center gap-1.5 px-1 pt-2 text-[13px] font-medium">
              {t === "dark" ? <Moon size={14} /> : <Sun size={14} />}
              {t === "dark" ? "Dark" : "Light"}
            </div>
          </button>
        ))}
      </div>
      <h3 className="mt-7 mb-3 text-[14px] font-semibold">Wallpaper</h3>
      <div className="grid grid-cols-3 gap-3">
        {(
          [
            { id: "dusk", label: "Dusk", src: "/wallpapers/dusk.jpg" },
            { id: "lake", label: "Lake", src: "/wallpapers/lake.jpg" },
            { id: "tunnel", label: "Tunnel", src: null },
          ] as const
        ).map((w) => (
          <button key={w.id} onClick={() => setWallpaper(w.id)} className="text-left">
            <span
              className={clsx(
                "block aspect-[16/10] rounded-xl overflow-hidden ring-2 ring-offset-2 ring-offset-surface transition",
                wallpaper === w.id ? "ring-accent" : "ring-transparent hover:ring-line-strong",
              )}
            >
              {w.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={w.src} alt="" className="size-full object-cover" />
              ) : (
                <span className="size-full grid place-items-end justify-center bg-[radial-gradient(circle_at_66%_62%,#f5b551_0,#a9bfd6_18%,#dfe5ea_45%,#eceeeb_75%)]">
                  <BrandMark size={44} className="text-white/80 mb-1" />
                </span>
              )}
            </span>
            <span className="block mt-1.5 text-[13px] font-medium">{w.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function WifiPage() {
  const wifi = useOS((s) => s.wifi);
  const setWifi = useOS((s) => s.setWifi);
  return (
    <>
      <H title="Wi-Fi" sub={wifi.connected ? `Connected to ${wifi.connected}` : "Not connected"} />
      <Card className="p-1.5">
        {wifi.networks.map((n) => {
          const on = wifi.connected === n.ssid;
          return (
            <div key={n.ssid} className="flex items-center gap-3 px-3 h-12 rounded-xl hover:bg-surface-2">
              <Wifi size={16} className={on ? "text-accent" : "text-fg-2"} />
              <div className="flex-1">
                <div className="text-[13.5px] font-medium">{n.ssid}</div>
                <div className="text-[11.5px] text-fg-3">
                  {on ? "Connected" : n.saved ? "Saved" : n.secured ? "Secured" : "Open"}
                  {n.saved && ", password kept by the system"}
                </div>
              </div>
              <Button size="sm" variant={on ? "ghost" : "secondary"} onClick={() => setWifi(on ? null : n.ssid)}>
                {on ? "Disconnect" : "Connect"}
              </Button>
            </div>
          );
        })}
      </Card>
    </>
  );
}

/** The real machine: a real model on real files, every call decided by capd. */
function LiveMachineCard({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  type Status = { up: boolean; key: boolean; sandbox: string; daemon?: { busy: string | null; error: string | null } };
  const [st, setSt] = useState<Status | null>(null);
  const [pending, setPending] = useState(false);
  const load = () =>
    liveFetch("/api/live/status")
      .then((r) => r.json())
      .then((j: Status) => setSt(j))
      .catch(() => setSt({ up: false, key: false, sandbox: "~/SIOS-sandbox" }));
  useEffect(() => {
    load();
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const busy = pending || !!st?.daemon?.busy;
  const act = async (action: "start" | "stop") => {
    setPending(true);
    await setDaemon(action).catch(() => null);
    await load();
    setPending(false);
  };
  const toggle = (v: boolean) => {
    set(v);
    if (v && st && !st.up) void act("start");
  };
  return (
    <Card>
      <Row
        title="Live machine"
        sub={`brain-d plans with OpenAI against the real files in ${st?.sandbox ?? "~/SIOS-sandbox"}. capd checks every step; you approve the plan once, and anything risky asks again.`}
      >
        <Toggle checked={on} onChange={toggle} label="Live machine" />
      </Row>
      <div className="px-4 pb-3.5 -mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className={clsx("h-6 px-2 rounded-full inline-flex items-center gap-1.5", st?.up ? "bg-ok-soft text-ok" : busy ? "bg-ai-soft text-ai-ink" : "bg-warn-soft text-warn")}>
          <span className={clsx("size-1.5 rounded-full bg-current", busy && "animate-pulse")} />
          {st === null ? "Checking" : st.up ? "Running: capd and brain-d" : busy ? (st.daemon?.busy ?? "Starting") : "Stopped"}
        </span>
        <span className={clsx("h-6 px-2 rounded-full inline-flex items-center gap-1.5", st?.key ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
          <span className="size-1.5 rounded-full bg-current" /> {st?.key ? "OpenAI key loaded" : "No OpenAI key"}
        </span>
        <span className="ml-auto flex gap-1.5">
          {st && !st.up && (
            <Button size="sm" onClick={() => act("start")} disabled={busy}>
              {busy ? "Starting..." : "Start live machine"}
            </Button>
          )}
          {st?.up && (
            <Button size="sm" variant="secondary" onClick={() => act("stop")} disabled={busy}>
              Stop
            </Button>
          )}
        </span>
      </div>
      {st?.daemon?.error && <div className="mx-4 mb-3 rounded-xl bg-danger-soft text-danger px-3 py-2 text-[12.5px]">{st.daemon.error}</div>}
      {st && !st.key && (
        <div className="mx-4 mb-4 rounded-xl bg-surface-2 border border-line p-3 text-[12.5px] text-fg-2 leading-5">
          Put OPENAI_API_KEY in build_concept_html/.env.local, then restart pnpm dev.
        </div>
      )}
    </Card>
  );
}
