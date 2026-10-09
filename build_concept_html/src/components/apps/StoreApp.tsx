"use client";

import clsx from "clsx";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  ChevronDown,
  Cloud,
  Download,
  Globe,
  KeyRound,
  Link2,
  LoaderCircle,
  Lock,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { BRAND } from "@/lib/brand";
import { BUILT_IN, CATALOG, CATEGORIES, RISK_LABEL, TRUST_LABEL, type CapTool, type Capability, type Category } from "@/lib/catalog";
import { runRequest } from "@/lib/engine";
import { useOS } from "@/lib/store";
import type { Win } from "@/lib/types";
import { Button, Chip, Toggle, type Tone } from "../ui";
import { LogoTile } from "../icons/BrandLogos";

type Page = "discover" | "installed" | "updates";

// ------------------------------------------------------------------ shared bits

export function CapTile({ cap, size = 56 }: { cap: Capability; size?: number }) {
  if (cap.logo) return <LogoTile logo={cap.logo} size={size} dark={cap.logoDark} />;
  const light = cap.color[0] === "#ffffff";
  return (
    <span
      className="grid place-items-center shrink-0 font-semibold shadow-[0_1px_0_rgba(255,255,255,.35)_inset,0_6px_16px_-8px_rgba(0,0,0,.45)]"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        background: `linear-gradient(160deg, ${cap.color[0]}, ${cap.color[1]})`,
        color: light ? "#111" : "#fff",
        fontSize: size * (cap.glyph.length > 1 ? 0.34 : 0.44),
        border: light ? "1px solid #e2e2e2" : undefined,
      }}
    >
      {cap.glyph}
    </span>
  );
}

function TrustBadge({ cap }: { cap: Capability }) {
  const tone: Tone = cap.trust === "official" || cap.trust === "verified" ? "accent" : cap.trust === "community" ? "neutral" : "warn";
  const Icon = cap.trust === "unknown" ? ShieldAlert : cap.trust === "community" ? Users : BadgeCheck;
  return (
    <Chip tone={tone} icon={Icon}>
      {TRUST_LABEL[cap.trust]}
    </Chip>
  );
}

const PERM: Record<CapTool["permission"], { label: string; tone: Tone }> = {
  read: { label: "Just looks", tone: "neutral" },
  reversible: { label: "Asks the first time", tone: "accent" },
  irreversible: { label: "Always asks", tone: "warn" },
};

function useAllCaps() {
  const custom = useOS((s) => s.customCaps);
  return useMemo(() => [...CATALOG, ...custom], [custom]);
}

// ------------------------------------------------------------------ app

export function StoreApp({ win }: { win: Win }) {
  const setProps = useOS((s) => s.setWindowProps);
  const installed = useOS((s) => s.installed);
  const caps = useAllCaps();
  const page = (win.props?.page as Page) ?? "discover";
  const capId = win.props?.cap ?? "";
  const cap = caps.find((c) => c.id === capId);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [installing, setInstalling] = useState<Capability | null>(null);
  const [addUrl, setAddUrl] = useState(false);

  const updates = caps.filter((c) => installed[c.id] && c.update && installed[c.id].version !== c.update.version);
  const go = (p: Partial<{ page: Page; cap: string }>) => setProps(win.id, { page: p.page ?? page, cap: p.cap ?? "" });

  return (
    <div className="h-full flex relative">
      <aside className="w-56 shrink-0 border-r border-line bg-surface-2/70 p-3 flex flex-col gap-1">
        <div className="flex items-center gap-2 h-9 px-2.5 mb-2 rounded-[10px] bg-surface border border-line">
          <Search size={14} className="text-fg-3" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              go({ page: "discover", cap: "" });
            }}
            placeholder="Search the Store"
            className="bg-transparent outline-none text-[13px] flex-1 min-w-0 placeholder:text-fg-3"
          />
        </div>
        <NavItem icon={Sparkles} label="Discover" on={page === "discover" && !category && !cap} onClick={() => { setCategory(null); go({ page: "discover", cap: "" }); }} />
        <NavItem icon={PackageCheck} label="Installed" count={Object.keys(installed).length} on={page === "installed" && !cap} onClick={() => go({ page: "installed", cap: "" })} />
        <NavItem icon={RefreshCw} label="Updates" count={updates.length || undefined} badge on={page === "updates" && !cap} onClick={() => go({ page: "updates", cap: "" })} />
        <div className="px-2.5 pt-4 pb-1 text-[12px] font-semibold text-fg-3">Categories</div>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => {
              setCategory(c);
              go({ page: "discover", cap: "" });
            }}
            className={clsx(
              "text-left px-2.5 h-8 rounded-lg text-[13px]",
              category === c && page === "discover" && !cap ? "bg-surface font-semibold shadow-[0_0_0_1px_var(--line)]" : "text-fg-2 hover:bg-surface-3 hover:text-fg",
            )}
          >
            {c}
          </button>
        ))}
        <div className="mt-auto">
          <button
            onClick={() => setAddUrl(true)}
            className="w-full flex items-center gap-2 px-2.5 h-9 rounded-[10px] text-[13px] text-fg-2 hover:bg-surface-3 hover:text-fg border border-dashed border-line-strong"
          >
            <Link2 size={14} /> Add a server by URL
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 overflow-auto scroll-thin bg-surface">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={cap ? `cap-${cap.id}` : `${page}-${category ?? ""}`}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.16 }}
          >
            {cap ? (
              <Detail cap={cap} onBack={() => go({ cap: "" })} onInstall={() => setInstalling(cap)} />
            ) : page === "installed" ? (
              <InstalledPage caps={caps} onOpen={(id) => go({ cap: id })} />
            ) : page === "updates" ? (
              <UpdatesPage caps={updates} onOpen={(id) => go({ cap: id })} />
            ) : (
              <Discover caps={caps} q={q} category={category} onOpen={(id) => go({ cap: id })} onInstall={setInstalling} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>{installing && <InstallFlow cap={installing} onClose={() => setInstalling(null)} />}</AnimatePresence>
      <AnimatePresence>{addUrl && <AddByUrl onClose={() => setAddUrl(false)} onInspect={(c) => { setAddUrl(false); setInstalling(c); }} />}</AnimatePresence>
    </div>
  );
}

function NavItem({ icon: Icon, label, count, on, badge, onClick }: { icon: typeof Search; label: string; count?: number; on: boolean; badge?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-2.5 px-2.5 h-9 rounded-[10px] text-[13.5px] text-left transition-colors",
        on ? "bg-surface font-semibold shadow-[0_1px_2px_rgba(0,0,0,.06),0_0_0_1px_var(--line)]" : "text-fg-2 hover:bg-surface-3 hover:text-fg",
      )}
    >
      <Icon size={16} strokeWidth={1.8} className={on ? "text-accent" : undefined} />
      <span className="flex-1">{label}</span>
      {count !== undefined && (
        <span className={clsx("text-[11.5px] tabular-nums", badge ? "min-w-5 h-5 px-1.5 grid place-items-center rounded-full bg-ai text-white font-semibold" : "text-fg-3")}>
          {count}
        </span>
      )}
    </button>
  );
}

function GetButton({ cap, onInstall, onOpen }: { cap: Capability; onInstall: () => void; onOpen?: () => void }) {
  const inst = useOS((s) => s.installed[cap.id]);
  if (inst)
    return (
      <Button size="sm" onClick={onOpen} className="min-w-16">
        Open
      </Button>
    );
  return (
    <Button size="sm" variant="primary" onClick={onInstall} className="min-w-16">
      Get
    </Button>
  );
}

// ------------------------------------------------------------------ discover

function Discover({
  caps,
  q,
  category,
  onOpen,
  onInstall,
}: {
  caps: Capability[];
  q: string;
  category: Category | null;
  onOpen: (id: string) => void;
  onInstall: (c: Capability) => void;
}) {
  const query = q.trim().toLowerCase();
  const list = caps.filter(
    (c) =>
      c.trust !== "unknown" &&
      (!category || c.category === category) &&
      (!query || `${c.name} ${c.tagline} ${c.category}`.toLowerCase().includes(query)),
  );
  const featured = caps.filter((c) => c.featured);
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSlide((i) => (i + 1) % featured.length), 6000);
    return () => clearInterval(t);
  }, [featured.length]);
  const hero = featured[slide];

  return (
    <div className="p-6">
      {!query && !category && hero && (
        <section className="relative overflow-hidden rounded-[22px] p-7 text-white mb-7 min-h-[200px]" style={{ background: `linear-gradient(120deg, ${hero.color[1]}, ${hero.color[0]} 55%, #6a7cff)` }}>
          <div className="absolute -right-10 -top-10 size-72 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute right-10 bottom-6 opacity-95">
            <CapTile cap={hero} size={112} />
          </div>
          <div className="relative max-w-[60%]">
            <div className="text-[12.5px] font-semibold text-white/75">Featured</div>
            <h2 className="mt-1 text-[30px] font-semibold tracking-[-0.02em] leading-tight">{hero.name}</h2>
            <p className="mt-1.5 text-[14.5px] text-white/85 leading-6">{hero.description}</p>
            <div className="mt-4 flex items-center gap-2">
              <button onClick={() => onOpen(hero.id)} className="h-9 px-4 rounded-full bg-white text-[#111] text-[13.5px] font-semibold hover:bg-white/90">
                Learn more
              </button>
              <span className="flex gap-1.5 ml-2">
                {featured.map((f, i) => (
                  <button key={f.id} aria-label={f.name} onClick={() => setSlide(i)} className={clsx("h-1.5 rounded-full transition-all", i === slide ? "w-5 bg-white" : "w-1.5 bg-white/50")} />
                ))}
              </span>
            </div>
          </div>
        </section>
      )}

      <div className="flex items-end justify-between mb-3">
        <h3 className="text-[17px] font-semibold">{query ? `Results for "${q.trim()}"` : category ?? "Popular"}</h3>
        <span className="text-[12.5px] text-fg-3">Every listing is checked before it appears here</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3">
        {list.map((c) => (
          <div
            key={c.id}
            onClick={() => onOpen(c.id)}
            className="group flex gap-3.5 p-3.5 rounded-2xl border border-line hover:border-line-strong hover:shadow-[0_8px_24px_-14px_rgba(0,0,0,.3)] bg-surface cursor-pointer transition-all"
          >
            <CapTile cap={c} size={52} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[14.5px] font-semibold truncate">{c.name}</span>
                {(c.trust === "official" || c.trust === "verified") && <BadgeCheck size={14} className="text-accent shrink-0" />}
              </div>
              <div className="text-[12.5px] text-fg-2 leading-[1.35] line-clamp-2">{c.tagline}</div>
              <div className="mt-1.5 flex items-center gap-2 text-[11.5px] text-fg-3">
                <span className="flex items-center gap-0.5">
                  <Star size={11} fill="currentColor" /> {c.rating}
                </span>
                <span>{c.category}</span>
              </div>
            </div>
            <div onClick={(e) => e.stopPropagation()} className="self-center">
              <GetButton cap={c} onInstall={() => onInstall(c)} onOpen={() => onOpen(c.id)} />
            </div>
          </div>
        ))}
        {!list.length && <div className="col-span-full py-16 text-center text-[13.5px] text-fg-3">Nothing found. Try another word, or add a server by URL.</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ detail

function Detail({ cap, onBack, onInstall }: { cap: Capability; onBack: () => void; onInstall: () => void }) {
  const inst = useOS((s) => s.installed[cap.id]);
  const uninstall = useOS((s) => s.uninstall);
  const pushToast = useOS((s) => s.pushToast);
  const try_ = cap.id === "github";

  return (
    <div className="p-6 max-w-[760px]">
      <button onClick={onBack} className="flex items-center gap-1 text-[13px] text-fg-2 hover:text-fg mb-5">
        <ArrowLeft size={15} /> Back
      </button>

      <div className="flex items-start gap-5">
        <CapTile cap={cap} size={96} />
        <div className="flex-1 min-w-0">
          <h2 className="text-[26px] font-semibold tracking-[-0.02em] leading-tight">{cap.name}</h2>
          <div className="text-[14px] text-fg-2">{cap.tagline}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <TrustBadge cap={cap} />
            <span className="text-[12.5px] text-fg-3 ml-1">by {cap.publisher}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {inst ? (
            <>
              {try_ && (
                <Button
                  variant="primary"
                  onClick={() => {
                    void runRequest("Check my open pull requests");
                  }}
                >
                  Try it
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  uninstall(cap.id);
                  pushToast({ title: `${cap.name} removed`, body: "Its tools are gone and the sign-in was deleted from the broker.", tone: "info" });
                }}
              >
                Remove
              </Button>
            </>
          ) : (
            <Button variant="primary" size="lg" onClick={onInstall}>
              <Download size={15} /> Get
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-4 rounded-2xl border border-line divide-x divide-line text-center">
        {[
          [String(cap.rating), "rating", <Star key="s" size={12} fill="currentColor" className="inline -mt-0.5" />],
          [cap.installs, "installs", null],
          [cap.execution === "remote" ? "Online" : "Sandbox", cap.execution === "remote" ? "connects to service" : "runs on this computer", null],
          [cap.version, "version", null],
        ].map(([v, l, icon], i) => (
          <div key={i} className="py-3">
            <div className="text-[16px] font-semibold">
              {v} {icon}
            </div>
            <div className="text-[11.5px] text-fg-3">{l as string}</div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-[14px] leading-6">{cap.description}</p>

      <h3 className="mt-7 mb-2 text-[15px] font-semibold">What the assistant can do with it</h3>
      <ul className="rounded-2xl border border-line divide-y divide-line">
        {cap.tools.map((t) => (
          <li key={t.name} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-medium">{t.plain}</div>
              <div className="text-[11.5px] font-mono text-fg-3">{t.name}</div>
            </div>
            <Chip tone={PERM[t.permission].tone}>{PERM[t.permission].label}</Chip>
          </li>
        ))}
      </ul>

      <h3 className="mt-7 mb-2 text-[15px] font-semibold">Privacy and safety</h3>
      <div className="grid grid-cols-2 gap-2.5">
        <Fact icon={Globe} title="What leaves this computer" body={cap.dataLeaves} />
        <Fact
          icon={KeyRound}
          title="Sign-in"
          body={
            cap.auth === "oauth"
              ? `You sign in on ${cap.publisher}'s page. The system keeps the token; the AI never sees it.`
              : cap.auth === "apikey"
                ? "You paste a key once. It's stored by the system, never shown to the AI."
                : "No account needed."
          }
        />
        <Fact
          icon={cap.execution === "remote" ? Cloud : Lock}
          title={cap.execution === "remote" ? "Runs online" : "Runs in a sandbox"}
          body={cap.execution === "remote" ? "Connected through a managed, encrypted channel." : "Isolated from your files and network unless a task allows it."}
        />
        <Fact icon={ShieldCheck} title="Kinds of access" body={cap.risks.map((r) => RISK_LABEL[r]).join(", ") + "."} />
      </div>

      <div className="mt-6 rounded-2xl bg-surface-2 border border-line p-4 text-[13px] leading-6 text-fg-2">
        <span className="font-semibold text-fg">Installing doesn&apos;t give blanket access.</span> It adds these tools to what {BRAND.name} can use. Every task still goes
        through the permission broker, and you can remove it anytime.
      </div>
    </div>
  );
}

function Fact({ icon: Icon, title, body }: { icon: typeof Globe; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-line p-3.5">
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        <Icon size={15} className="text-accent" /> {title}
      </div>
      <div className="mt-1 text-[12.5px] text-fg-2 leading-5">{body}</div>
    </div>
  );
}

// ------------------------------------------------------------------ installed + updates

function InstalledPage({ caps, onOpen }: { caps: Capability[]; onOpen: (id: string) => void }) {
  const installed = useOS((s) => s.installed);
  const toggleTool = useOS((s) => s.toggleTool);
  const uninstall = useOS((s) => s.uninstall);
  const [open, setOpen] = useState<string | null>(null);
  const mine = caps.filter((c) => installed[c.id]);

  return (
    <div className="p-6 max-w-[780px]">
      <h2 className="text-[22px] font-semibold tracking-[-0.01em]">Installed</h2>
      <p className="text-[13.5px] text-fg-2">Turn single tools off without removing the whole thing.</p>

      <ul className="mt-5 grid gap-2.5">
        {mine.map((c) => {
          const inst = installed[c.id];
          const on = c.tools.length - inst.disabledTools.length;
          return (
            <li key={c.id} className="rounded-2xl border border-line overflow-hidden">
              <button onClick={() => setOpen(open === c.id ? null : c.id)} className="w-full flex items-center gap-3.5 p-3.5 text-left hover:bg-surface-2/60">
                <CapTile cap={c} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14.5px] font-semibold">{c.name}</span>
                    {c.trust === "unknown" && <Chip tone="warn">Unknown publisher</Chip>}
                  </div>
                  <div className="text-[12.5px] text-fg-2">
                    {inst.account ? `Signed in as ${inst.account}` : "No account"}, {on} of {c.tools.length} tools on, v{inst.version}
                  </div>
                </div>
                <ChevronDown size={16} className={clsx("text-fg-3 transition-transform", open === c.id && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {open === c.id && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                    <ul className="border-t border-line divide-y divide-line">
                      {c.tools.map((t) => (
                        <li key={t.name} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="flex-1">
                            <div className="text-[13px] font-medium">{t.plain}</div>
                            <div className="text-[11.5px] text-fg-3">{PERM[t.permission].label}</div>
                          </div>
                          <Toggle checked={!inst.disabledTools.includes(t.name)} onChange={() => toggleTool(c.id, t.name)} label={t.plain} />
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-2 px-4 py-3 border-t border-line bg-surface-2/60">
                      <Button size="sm" onClick={() => onOpen(c.id)}>
                        Details
                      </Button>
                      <span className="flex-1" />
                      <Button size="sm" variant="ghost" className="text-danger" onClick={() => uninstall(c.id)}>
                        Remove and sign out
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>

      <h3 className="mt-8 mb-2 text-[15px] font-semibold">Built in</h3>
      <div className="grid grid-cols-2 gap-2.5">
        {BUILT_IN.map((b) => (
          <div key={b.name} className="flex items-center gap-3 rounded-2xl border border-line p-3">
            <span className="size-9 rounded-xl bg-accent-soft text-accent grid place-items-center text-[12px] font-bold">{b.tools}</span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold">{b.name}</div>
              <div className="text-[12px] text-fg-2 truncate">{b.note}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UpdatesPage({ caps, onOpen }: { caps: Capability[]; onOpen: (id: string) => void }) {
  const updateCap = useOS((s) => s.updateCap);
  const pushToast = useOS((s) => s.pushToast);
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="p-6 max-w-[760px]">
      <h2 className="text-[22px] font-semibold tracking-[-0.01em]">Updates</h2>
      <p className="text-[13.5px] text-fg-2">An update that asks for new permissions always shows you what changed first.</p>
      {!caps.length ? (
        <div className="mt-10 grid justify-items-center text-center">
          <span className="size-12 rounded-2xl bg-ok-soft text-ok grid place-items-center">
            <Check size={22} />
          </span>
          <div className="mt-3 text-[15px] font-semibold">Everything is up to date</div>
        </div>
      ) : (
        <ul className="mt-5 grid gap-2.5">
          {caps.map((c) => (
            <li key={c.id} className="flex items-start gap-3.5 rounded-2xl border border-line p-4">
              <CapTile cap={c} size={48} />
              <div className="flex-1 min-w-0">
                <button onClick={() => onOpen(c.id)} className="text-[14.5px] font-semibold hover:underline">
                  {c.name}
                </button>
                <div className="text-[12.5px] text-fg-3">
                  {c.version} to {c.update!.version}
                </div>
                <p className="mt-1.5 text-[13px] leading-5">{c.update!.notes}</p>
                <div className="mt-2">
                  <Chip tone="ok" icon={ShieldCheck}>
                    No new permissions
                  </Chip>
                </div>
              </div>
              <Button
                size="sm"
                variant="primary"
                disabled={busy === c.id}
                onClick={() => {
                  setBusy(c.id);
                  setTimeout(() => {
                    updateCap(c.id, c.update!.version);
                    setBusy(null);
                    pushToast({ title: `${c.name} updated`, body: `Now on version ${c.update!.version}.`, tone: "ok" });
                  }, 1400);
                }}
              >
                {busy === c.id ? <LoaderCircle size={14} className="animate-spin" /> : "Update"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ install flow

const STEPS = ["Review", "Sign in", "Safety checks", "Ready"] as const;

function InstallFlow({ cap, onClose }: { cap: Capability; onClose: () => void }) {
  const install = useOS((s) => s.install);
  const addCustom = useOS((s) => s.addCustomCap);
  const toggleTool = useOS((s) => s.toggleTool);
  const pushToast = useOS((s) => s.pushToast);
  const [step, setStep] = useState(0);
  const [off, setOff] = useState<string[]>([]);
  const [checks, setChecks] = useState(0);
  const [key, setKey] = useState("");
  const needsSignIn = cap.auth !== "none";
  const account = cap.auth === "oauth" ? `${BRAND.user.toLowerCase()}@${cap.id === "github" ? "github" : "example"}.com` : undefined;
  const unknown = cap.trust === "unknown";

  const CHECKS = [
    "Reading the listing and checking its format",
    unknown ? "Publisher can't be verified, using strict limits" : `Confirming it's really from ${cap.publisher}`,
    cap.execution === "remote" ? "Setting up an encrypted connection" : "Creating a sandbox with no file access",
    `Matching ${cap.tools.length} tools to ${BRAND.name} names`,
    needsSignIn ? "Locking the sign-in inside the permission broker" : "No sign-in to store",
  ];

  useEffect(() => {
    if (step !== 2) return;
    if (checks >= CHECKS.length) {
      const t = setTimeout(() => {
        if (unknown) addCustom(cap);
        install(cap.id, cap.version, account ?? (cap.auth === "apikey" ? "API key" : undefined));
        off.forEach((t) => toggleTool(cap.id, t));
        pushToast({ title: `${cap.name} is ready`, body: `${cap.tools.length - off.length} new tools. Each task still asks.`, tone: "ok" });
        setStep(3);
      }, 450);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setChecks((c) => c + 1), 520);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, checks]);

  const next = () => setStep((s) => (s === 0 && !needsSignIn ? 2 : s + 1));

  return (
    <motion.div className="absolute inset-0 z-10 grid place-items-center p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-[#0b1220]/30 backdrop-blur-[2px]" onClick={step === 2 ? undefined : onClose} />
      <motion.div
        role="dialog"
        aria-label={`Install ${cap.name}`}
        initial={{ y: 16, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 10, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 460, damping: 34 }}
        className="relative w-full max-w-[520px] max-h-full flex flex-col rounded-[22px] bg-surface shadow-pop overflow-hidden"
      >
        {/* progress */}
        <div className="flex gap-1.5 px-6 pt-5">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1">
              <div className={clsx("h-1 rounded-full transition-colors duration-300", i <= step ? "bg-accent" : "bg-surface-3")} />
              <div className={clsx("mt-1.5 text-[11.5px]", i === step ? "font-semibold text-fg" : "text-fg-3")}>{s}</div>
            </div>
          ))}
        </div>

        <div className="px-6 pt-5 pb-2 overflow-auto scroll-thin">
          <div className="flex items-center gap-3.5">
            <CapTile cap={cap} size={52} />
            <div>
              <div className="text-[18px] font-semibold leading-tight">
                {step === 0 && `Add ${cap.name}?`}
                {step === 1 && `Sign in to ${cap.name}`}
                {step === 2 && "Checking it's safe"}
                {step === 3 && `${cap.name} is ready`}
              </div>
              <div className="mt-1">
                <TrustBadge cap={cap} />
              </div>
            </div>
          </div>

          {step === 0 && (
            <>
              {unknown && (
                <div className="mt-4 flex gap-2.5 rounded-xl bg-warn-soft border border-warn-line p-3 text-[12.5px] leading-5 text-warn">
                  <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                  <span>
                    <span className="font-semibold">{BRAND.name} can&apos;t verify who runs this server.</span> It will run with strict limits: every action asks
                    first, and it can&apos;t see your memory.
                  </span>
                </div>
              )}
              <div className="mt-4 text-[13px] font-semibold">Choose what it may do</div>
              <ul className="mt-2 rounded-2xl border border-line divide-y divide-line">
                {cap.tools.map((t) => (
                  <li key={t.name} className="flex items-center gap-3 px-3.5 py-2.5">
                    <div className="flex-1">
                      <div className="text-[13px] font-medium">{t.plain}</div>
                      <div className="text-[11.5px] text-fg-3">{PERM[t.permission].label}</div>
                    </div>
                    <Toggle
                      checked={!off.includes(t.name)}
                      onChange={() => setOff((o) => (o.includes(t.name) ? o.filter((x) => x !== t.name) : [...o, t.name]))}
                      label={t.plain}
                    />
                  </li>
                ))}
              </ul>
              <ul className="mt-4 grid gap-1.5 text-[12.5px] text-fg-2">
                {[
                  "Adds these tools to what the assistant can use",
                  ...(needsSignIn ? ["Your sign-in is kept by the system, never by the AI"] : []),
                  "Each task still asks before it acts",
                  "You can remove it anytime from Installed",
                ].map((l) => (
                  <li key={l} className="flex gap-2">
                    <Check size={14} className="text-ok shrink-0 mt-0.5" /> {l}
                  </li>
                ))}
              </ul>
            </>
          )}

          {step === 1 && (
            <div className="mt-4">
              {cap.auth === "oauth" ? (
                <div className="rounded-2xl border border-line overflow-hidden">
                  <div className="flex items-center gap-2 px-3.5 h-9 bg-surface-2 border-b border-line text-[12px] text-fg-2">
                    <Lock size={12} /> {cap.publisher.toLowerCase().replace(/\s.*/, "")}.com/login/oauth
                  </div>
                  <div className="p-5 text-center">
                    <div className="flex items-center justify-center gap-3">
                      <span className="size-10 rounded-full bg-[#2f3540] text-white grid place-items-center text-[14px] font-semibold">{BRAND.user[0]}</span>
                      <span className="text-fg-3">to</span>
                      <CapTile cap={cap} size={40} />
                    </div>
                    <div className="mt-3 text-[15px] font-semibold">
                      Allow {BRAND.name} on {BRAND.device}
                    </div>
                    <div className="text-[12.5px] text-fg-2">Signed in as {account}</div>
                    <ul className="mt-3 text-left text-[12.5px] grid gap-1 mx-auto max-w-[300px]">
                      {cap.tools
                        .filter((t) => !off.includes(t.name))
                        .map((t) => (
                          <li key={t.name} className="flex gap-2">
                            <Check size={13} className="text-ok mt-0.5 shrink-0" /> {t.plain}
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <label className="block">
                  <span className="text-[13px] font-semibold">API key</span>
                  <input
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    type="password"
                    placeholder="Paste your key"
                    className="mt-1.5 w-full h-10 px-3 rounded-xl border border-line-strong bg-surface-2 outline-none focus:ring-2 focus:ring-accent/30 font-mono text-[13px]"
                  />
                </label>
              )}
              <div className="mt-3 flex gap-2 rounded-xl bg-surface-2 p-3 text-[12.5px] text-fg-2 leading-5">
                <KeyRound size={15} className="text-accent shrink-0 mt-0.5" />
                Your password goes to {cap.publisher}, not to the AI. The system keeps the sign-in locked in the permission broker.
              </div>
            </div>
          )}

          {step === 2 && (
            <ul className="mt-5 grid gap-2.5">
              {CHECKS.map((c, i) => (
                <li key={c} className={clsx("flex items-center gap-3 text-[13.5px] transition-opacity", i > checks && "opacity-40")}>
                  <span
                    className={clsx(
                      "size-6 rounded-full grid place-items-center shrink-0",
                      i < checks ? (unknown && i === 1 ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok") : "bg-surface-3 text-fg-3",
                    )}
                  >
                    {i < checks ? (
                      unknown && i === 1 ? <ShieldAlert size={13} /> : <Check size={13} strokeWidth={2.6} />
                    ) : i === checks ? (
                      <LoaderCircle size={13} className="animate-spin" />
                    ) : null}
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          )}

          {step === 3 && (
            <div className="mt-5">
              <div className="rounded-2xl bg-ok-soft border border-ok-line p-4 text-[13.5px] leading-6">
                Added <span className="font-semibold">{cap.tools.length - off.length} tools</span> to what {BRAND.name} can use. Nothing runs until you ask, and each
                task still asks before it acts.
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {cap.tools
                  .filter((t) => !off.includes(t.name))
                  .map((t) => (
                    <Chip key={t.name}>{t.name}</Chip>
                  ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-6 py-4 mt-3 border-t border-line bg-surface-2/60">
          {step < 2 && (
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}
          <span className="flex-1" />
          {step === 0 && (
            <Button variant="primary" onClick={next} disabled={off.length === cap.tools.length}>
              {needsSignIn ? "Continue" : unknown ? "Add anyway" : "Add"}
            </Button>
          )}
          {step === 1 && (
            <Button variant="primary" onClick={next} disabled={cap.auth === "apikey" && key.length < 6}>
              {cap.auth === "oauth" ? "Authorize" : "Save key"}
            </Button>
          )}
          {step === 3 && (
            <>
              <Button onClick={onClose}>Done</Button>
              {cap.id === "github" && !off.includes("github.pr.read") && (
                <Button
                  variant="primary"
                  onClick={() => {
                    onClose();
                    void runRequest("Check my open pull requests");
                  }}
                >
                  Try: check my pull requests
                </Button>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------------ add by URL

function AddByUrl({ onClose, onInspect }: { onClose: () => void; onInspect: (c: Capability) => void }) {
  const [url, setUrl] = useState("https://mcp.weather-tools.dev/sse");
  const [busy, setBusy] = useState(false);
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  return (
    <motion.div className="absolute inset-0 z-10 grid place-items-center p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-[#0b1220]/30 backdrop-blur-[2px]" onClick={onClose} />
      <motion.div
        initial={{ y: 16, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 10, scale: 0.98 }}
        className="relative w-full max-w-[480px] rounded-[22px] bg-surface shadow-pop p-6"
      >
        <div className="text-[18px] font-semibold">Add a server by URL</div>
        <p className="mt-1 text-[13px] text-fg-2 leading-5">For MCP servers that aren&apos;t in the Store. {BRAND.name} inspects it first and shows you what it can do.</p>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="mt-4 w-full h-10 px-3 rounded-xl border border-line-strong bg-surface-2 outline-none focus:ring-2 focus:ring-accent/30 font-mono text-[12.5px]"
          aria-label="Server URL"
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!host || busy}
            onClick={() => {
              setBusy(true);
              setTimeout(() => {
                onInspect({
                  id: "custom-" + host,
                  name: host.replace(/^mcp\./, ""),
                  tagline: "Custom MCP server",
                  description: `Added by URL from ${host}.`,
                  publisher: host,
                  trust: "unknown",
                  category: "Productivity",
                  execution: "remote",
                  auth: "none",
                  risks: ["read"],
                  dataLeaves: `The questions you ask it, sent to ${host}.`,
                  tools: [
                    { name: "custom.forecast.read", plain: "Get the weather forecast", permission: "read" },
                    { name: "custom.alerts.read", plain: "Read weather alerts", permission: "read" },
                  ],
                  color: ["#b9c0ca", "#7d8794"],
                  glyph: host.replace(/^mcp\./, "")[0]?.toUpperCase() ?? "?",
                  installs: "n/a",
                  rating: 0,
                  version: "0.1.0",
                });
              }, 900);
            }}
          >
            {busy ? <LoaderCircle size={14} className="animate-spin" /> : "Inspect"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
