"use client";

import clsx from "clsx";
import { Check, Cloud, Cpu, HardDrive, LoaderCircle, MemoryStick, MonitorCog, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";
import { useOS, type Settings } from "@/lib/store";
import { StringOrb } from "../icons/StringOrb";
import { Button, Chip } from "../ui";
import { LogoTile, type LogoKey } from "../icons/BrandLogos";

type Where = "local" | "online";
type Provider = NonNullable<Settings["onlineAi"]>;

const PROVIDERS: { id: Provider | "Muse" | "Other"; tag: string; bg: string; logo?: LogoKey; soon?: boolean }[] = [
  { id: "Claude", tag: "Anthropic", bg: "", logo: "claude" },
  { id: "ChatGPT", tag: "OpenAI", bg: "linear-gradient(160deg,#3c4148,#15181c)" },
  { id: "Gemini", tag: "Google", bg: "", logo: "gemini" },
  { id: "Muse", tag: "Meta", bg: "", logo: "meta", soon: true },
  { id: "Other", tag: "Any API key", bg: "linear-gradient(160deg,#cfd5dc,#9aa3ad)" },
];

const DONE_KEY = "sios-setup-done";

export function markSetupSeen() {
  try {
    return window.localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return true; // storage blocked: don't nag
  }
}

/** First boot, from docs/plan/08-ux.md. Also reachable from System > Run setup again. */
export function SetupFlow() {
  const open = useOS((s) => s.setupOpen);
  return <AnimatePresence>{open && <Flow />}</AnimatePresence>;
}

function Flow() {
  const setOpen = useOS((s) => s.setSetupOpen);
  const update = useOS((s) => s.updateSettings);
  const pushToast = useOS((s) => s.pushToast);
  const [step, setStep] = useState(0);
  const [where, setWhere] = useState<Where>("local");
  const [alsoOnline, setAlsoOnline] = useState(true);
  const [provider, setProvider] = useState<Provider>("Claude");
  const [privacy, setPrivacy] = useState<Settings["privacy"]>(1);
  const wantsOnline = where === "online" || alsoOnline;

  // steps: 0 welcome, 1 hardware, 2 where, 3 provider, 4 sign in + test, 5 privacy, 6 done
  const order = wantsOnline ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 5, 6];
  const idx = order.indexOf(step);
  const next = () => setStep(order[Math.min(idx + 1, order.length - 1)]);
  const back = () => setStep(order[Math.max(idx - 1, 0)]);

  const finish = () => {
    update({ onlineAi: wantsOnline ? provider : null, privacy, askBeforeCloud: true });
    try {
      window.localStorage.setItem(DONE_KEY, "1");
    } catch {}
    setOpen(false);
    pushToast({ title: "You're all set", body: `Click the orb or press ⌘K to ask ${BRAND.name} anything.`, tone: "ok" });
  };
  const skip = () => {
    try {
      window.localStorage.setItem(DONE_KEY, "1");
    } catch {}
    setOpen(false);
  };

  return (
    <motion.div className="fixed inset-0 z-[1500] grid place-items-center p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.3 } }}>
      <div className="absolute inset-0 bg-[#0b1220]/45 backdrop-blur-xl" />
      <button onClick={skip} className="absolute top-5 right-6 text-[13px] text-white/75 hover:text-white">
        Skip setup
      </button>

      <motion.div
        initial={{ y: 20, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="glass relative w-full max-w-[600px] rounded-[30px] bg-glass-strong backdrop-blur-3xl border border-glass-line shadow-pop overflow-hidden"
      >
        {/* progress */}
        <div className="flex justify-center gap-1.5 pt-6">
          {order.map((s, i) => (
            <span key={s} className={clsx("h-1.5 rounded-full transition-all duration-300", i === idx ? "w-6 bg-accent" : i < idx ? "w-1.5 bg-accent/60" : "w-1.5 bg-fg/15")} />
          ))}
        </div>

        <div className="px-10 pt-6 pb-8 min-h-[440px] flex flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col"
            >
              {step === 0 && (
                <div className="flex-1 grid justify-items-center content-center text-center">
                  <StringOrb size={150} />
                  <h1 className="mt-6 font-display font-light text-[40px] tracking-[.32em] pl-[.32em]">{BRAND.name}</h1>
                  <p className="mt-2 text-[15px] text-fg-2 max-w-sm leading-6">Your computer, with an assistant that can actually use it. Let&apos;s get it ready. It takes about a minute.</p>
                </div>
              )}

              {step === 1 && <Hardware />}

              {step === 2 && (
                <>
                  <H title="Where should your assistant think?" sub="You can change this later in Settings." />
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <Choice on={where === "local"} onClick={() => setWhere("local")} icon={Cpu} title="On this computer" badge="Recommended">
                      Private by default and works without internet. Great for everyday tasks.
                    </Choice>
                    <Choice on={where === "online"} onClick={() => setWhere("online")} icon={Cloud} title="Connect an AI account">
                      Use Claude, ChatGPT or Gemini for everything. Needs internet.
                    </Choice>
                  </div>
                  {where === "local" && (
                    <label className="mt-4 flex items-center gap-3 rounded-2xl border border-line p-3.5 cursor-pointer">
                      <input type="checkbox" checked={alsoOnline} onChange={(e) => setAlsoOnline(e.target.checked)} className="size-4 accent-[var(--accent)]" />
                      <span className="text-[13.5px]">
                        <span className="font-semibold">Also connect an AI account for hard tasks.</span> <span className="text-fg-2">It always asks before using it.</span>
                      </span>
                    </label>
                  )}
                </>
              )}

              {step === 3 && (
                <>
                  <H title="Which AI account?" sub="Sign in once. Every app on this computer can use it through the system." />
                  <div className="mt-5 grid gap-2">
                    {PROVIDERS.map((p) => (
                      <button
                        key={p.id}
                        disabled={p.soon}
                        onClick={() => p.id !== "Other" && p.id !== "Muse" && setProvider(p.id)}
                        className={clsx(
                          "flex items-center gap-3.5 rounded-2xl border p-3 text-left transition-colors",
                          provider === p.id ? "border-accent bg-accent-soft" : "border-line hover:bg-black/[.03]",
                          p.soon && "opacity-50 cursor-not-allowed",
                        )}
                      >
                        {p.logo ? (
                          <LogoTile logo={p.logo} size={40} />
                        ) : (
                          <span className="size-10 rounded-xl grid place-items-center text-white font-semibold shrink-0" style={{ background: p.bg }}>
                            {p.id[0]}
                          </span>
                        )}
                        <span className="flex-1">
                          <span className="block text-[14.5px] font-semibold">{p.id}</span>
                          <span className="block text-[12.5px] text-fg-2">{p.tag}</span>
                        </span>
                        {p.soon && <Chip>Soon</Chip>}
                        {provider === p.id && <Check size={17} className="text-accent" strokeWidth={2.5} />}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {step === 4 && <SignIn provider={provider} />}

              {step === 5 && (
                <>
                  <H title="What may online AI see?" sub="Only matters for hard tasks sent online. Everyday tasks stay here." />
                  <div className="mt-5 grid gap-2">
                    {(
                      [
                        [0, "Nothing personal", "Names, places and memory never leave this computer."],
                        [1, "Only what the task needs", "Personal details are swapped for placeholders, then put back here."],
                        [2, "Full context", "Fastest answers, least private."],
                      ] as const
                    ).map(([v, t, d]) => (
                      <button
                        key={v}
                        onClick={() => setPrivacy(v)}
                        className={clsx("flex items-start gap-3 rounded-2xl border p-3.5 text-left", privacy === v ? "border-accent bg-accent-soft" : "border-line hover:bg-black/[.03]")}
                      >
                        <span className={clsx("mt-0.5 size-4.5 rounded-full border-2 grid place-items-center shrink-0", privacy === v ? "border-accent" : "border-fg-3")}>
                          {privacy === v && <span className="size-2 rounded-full bg-accent" />}
                        </span>
                        <span>
                          <span className="block text-[14px] font-semibold">
                            {t} {v === 1 && <span className="text-[12px] font-medium text-accent ml-1">Recommended</span>}
                          </span>
                          <span className="block text-[12.5px] text-fg-2">{d}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {step === 6 && (
                <div className="flex-1 grid justify-items-center content-center text-center">
                  <span className="size-16 rounded-full bg-ok text-white grid place-items-center">
                    <Check size={30} strokeWidth={2.6} />
                  </span>
                  <h2 className="mt-5 text-[26px] font-semibold tracking-[-0.01em]">You&apos;re all set</h2>
                  <ul className="mt-5 grid gap-2.5 text-left text-[13.5px] max-w-sm">
                    {[
                      `Click the orb or press ⌘K to ask ${BRAND.name} anything.`,
                      "Changes ask first. Anything that can't be undone always asks.",
                      "Everything it does shows up in Activity, with an undo button.",
                    ].map((t) => (
                      <li key={t} className="flex gap-2.5">
                        <Check size={16} className="text-ok shrink-0 mt-0.5" strokeWidth={2.4} /> {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-6 flex items-center gap-2">
            {idx > 0 && step !== 6 && (
              <Button variant="ghost" onClick={back}>
                Back
              </Button>
            )}
            <span className="flex-1" />
            {step === 6 ? (
              <Button variant="primary" size="lg" onClick={finish}>
                Start using {BRAND.name}
              </Button>
            ) : (
              <Button variant="primary" size="lg" onClick={next}>
                {step === 0 ? "Get started" : "Continue"}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function H({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h2 className="text-[24px] font-semibold tracking-[-0.01em] leading-tight">{title}</h2>
      <p className="mt-1 text-[14px] text-fg-2">{sub}</p>
    </div>
  );
}

function Choice({ on, onClick, icon: Icon, title, badge, children }: { on: boolean; onClick: () => void; icon: typeof Cpu; title: string; badge?: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={clsx("rounded-2xl border-2 p-4 text-left transition-colors", on ? "border-accent bg-accent-soft" : "border-line hover:bg-black/[.03]")}>
      <div className="flex items-center justify-between">
        <span className={clsx("size-10 rounded-xl grid place-items-center", on ? "bg-accent text-white" : "bg-surface-3 text-fg-2")}>
          <Icon size={19} />
        </span>
        {badge && <Chip tone="accent">{badge}</Chip>}
      </div>
      <div className="mt-3 text-[15px] font-semibold">{title}</div>
      <div className="mt-1 text-[12.5px] text-fg-2 leading-5">{children}</div>
    </button>
  );
}

function Checklist({ items, onDone }: { items: { icon?: typeof Cpu; label: string; value?: string }[]; onDone?: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= items.length) {
      onDone?.();
      return;
    }
    const t = setTimeout(() => setN((x) => x + 1), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);
  return (
    <ul className="mt-5 grid gap-2">
      {items.map((it, i) => {
        const Icon = it.icon;
        return (
          <li key={it.label} className={clsx("flex items-center gap-3 rounded-2xl border border-line px-4 py-3 transition-opacity", i > n && "opacity-40")}>
            {Icon && <Icon size={17} className="text-fg-2" />}
            <span className="flex-1 text-[14px]">{it.label}</span>
            {i < n ? (
              <span className="flex items-center gap-1.5 text-[13px] text-ok font-medium">
                {it.value} <Check size={15} strokeWidth={2.6} />
              </span>
            ) : i === n ? (
              <LoaderCircle size={15} className="animate-spin text-accent" />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function Hardware() {
  const [done, setDone] = useState(false);
  return (
    <>
      <H title="Checking this computer" sub="To see if the assistant can think right here." />
      <Checklist
        onDone={() => setDone(true)}
        items={[
          { icon: MemoryStick, label: "Memory", value: "16 GB" },
          { icon: MonitorCog, label: "Graphics", value: "8 GB" },
          { icon: HardDrive, label: "Storage", value: "SSD, 512 GB" },
        ]}
      />
      <AnimatePresence>
        {done && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-2xl bg-ok-soft border border-ok-line p-4 flex gap-3">
            <Cpu size={18} className="text-ok shrink-0 mt-0.5" />
            <div className="text-[13.5px] leading-5">
              <span className="font-semibold">Premium edition.</span> This computer can run the assistant itself, so everyday tasks stay private and work offline.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function SignIn({ provider }: { provider: Provider }) {
  const [signed, setSigned] = useState(false);
  const [tested, setTested] = useState(false);
  return (
    <>
      <H title={`Connect ${provider}`} sub="You sign in on their page. The system keeps the sign-in; the AI never sees your password." />
      {!signed ? (
        <div className="mt-6 rounded-2xl border border-line p-6 text-center">
          <div className="text-[14px] text-fg-2">A sign-in window will open for {provider}.</div>
          <Button className="mt-4" variant="primary" size="lg" onClick={() => setSigned(true)}>
            Sign in with {provider}
          </Button>
        </div>
      ) : (
        <>
          <Checklist
            onDone={() => setTested(true)}
            items={[
              { label: `Reaching ${provider}`, value: "Connected" },
              { label: "Asking a test question", value: "Answered" },
              { label: "Checking personal details are removed", value: "Working" },
            ]}
          />
          {tested && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 flex items-center gap-2 text-[13.5px] text-ok font-medium">
              <ShieldCheck size={16} /> {provider} is connected and only used when you say yes.
            </motion.div>
          )}
        </>
      )}
    </>
  );
}
