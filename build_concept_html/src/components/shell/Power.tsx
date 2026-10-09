"use client";

import { ArrowRight, Moon, Power as PowerIcon, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { create } from "zustand";
import { BRAND } from "@/lib/brand";
import { useOS } from "@/lib/store";
import { StringOrb } from "../icons/StringOrb";
import { Button } from "../ui";
import { markSetupSeen } from "./SetupFlow";

/** Which power action is waiting for confirmation. */
export const usePowerPrompt = create<{
  action: null | "shutdown" | "restart";
  last: "shutdown" | "restart";
  ask: (a: "shutdown" | "restart" | null) => void;
}>((set) => ({
  action: null,
  last: "shutdown",
  ask: (action) => set({ action }),
}));

/** Everything that sits above the desktop when the machine isn't simply "on". */
export function PowerLayer() {
  const power = useOS((s) => s.power);
  return (
    <>
      <AnimatePresence>
        {power === "off" && <OffScreen key="off" />}
        {power === "booting" && <BootScreen key="boot" />}
        {power === "locked" && <LockScreen key="lock" />}
        {power === "sleeping" && <SleepScreen key="sleep" />}
        {power === "shutting" && <ShutdownScreen key="shut" />}
      </AnimatePresence>
      <PowerConfirm />
    </>
  );
}

const layer = "fixed inset-0 z-[3000]";

// ---------------------------------------------------------------- off

function OffScreen() {
  const setPower = useOS((s) => s.setPower);
  const [pressed, setPressed] = useState(false);
  const turnOn = () => {
    if (pressed) return;
    setPressed(true);
    setTimeout(() => setPower("booting"), 450);
  };
  useEffect(() => {
    const onKey = () => turnOn();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <motion.div className={`${layer} bg-black grid place-items-center`} initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
      <div className="grid justify-items-center gap-6">
        <motion.button
          onClick={turnOn}
          aria-label="Turn on"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.94 }}
          animate={pressed ? { scale: 0.9, opacity: 0 } : { scale: 1, opacity: 1 }}
          transition={{ duration: 0.35 }}
          className="relative size-24 rounded-full grid place-items-center text-white/80 hover:text-white outline-none"
          style={{ background: "radial-gradient(circle at 50% 35%, #2a2d33, #121316 70%)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.08), 0 20px 40px -10px rgba(0,0,0,.8)" }}
        >
          <span className="absolute inset-0 rounded-full ring-1 ring-white/10" />
          <motion.span
            className="absolute -inset-3 rounded-full ring-1 ring-[#7d9dff]/40"
            animate={{ opacity: [0.2, 0.7, 0.2], scale: [1, 1.06, 1] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          />
          <PowerIcon size={34} strokeWidth={1.6} />
        </motion.button>
        <motion.div animate={{ opacity: pressed ? 0 : 1 }} className="text-center">
          <div className="text-[14px] text-white/70">Press to turn on</div>
          <div className="mt-1 text-[12px] text-white/35">or press any key</div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------- boot

const BOOT_LINES = ["Checking the system image", "Starting the permission broker", "Waking the assistant on this computer", "Getting your desktop ready"];

function BootScreen() {
  const setPower = useOS((s) => s.setPower);
  const bootTo = useOS((s) => s.bootTo);
  const setSetupOpen = useOS((s) => s.setSetupOpen);
  const [line, setLine] = useState(0);

  const done = () => {
    const first = !markSetupSeen();
    setPower(first ? "on" : bootTo);
    if (first) setTimeout(() => setSetupOpen(true), 500);
  };

  useEffect(() => {
    if (line >= BOOT_LINES.length) {
      const t = setTimeout(done, 350);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setLine((l) => l + 1), 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line]);

  return (
    <motion.div
      className={`${layer} bg-black grid place-items-center cursor-pointer`}
      onClick={done}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.7 } }}
    >
      <div className="grid justify-items-center">
        <motion.div initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}>
          <StringOrb size={170} busy />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, letterSpacing: "0.9em" }}
          animate={{ opacity: 1, letterSpacing: "0.5em" }}
          transition={{ delay: 0.5, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-8 pl-[.5em] font-display font-extralight text-white text-[44px]"
        >
          {BRAND.name}
        </motion.div>
        <div className="mt-10 w-56 h-[3px] rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-[#7fd0ff] via-[#7d9dff] to-[#9b7bff]"
            initial={{ width: "4%" }}
            animate={{ width: `${Math.min(100, ((line + 1) / BOOT_LINES.length) * 100)}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
        <div className="mt-4 h-5 text-[12.5px] text-white/45">
          <AnimatePresence mode="wait">
            <motion.span key={line} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
              {BOOT_LINES[Math.min(line, BOOT_LINES.length - 1)]}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------- lock

const subscribeTick = (cb: () => void) => {
  const t = setInterval(cb, 10_000);
  return () => clearInterval(t);
};

function LockScreen() {
  const setPower = useOS((s) => s.setPower);
  const wallpaper = useOS((s) => s.wallpaper);
  const tick = useSyncExternalStore(subscribeTick, () => Math.floor(Date.now() / 10_000), () => null);
  const now = tick === null ? null : new Date();
  const [pw, setPw] = useState("");
  const [shake, setShake] = useState(0);
  const ask = usePowerPrompt((s) => s.ask);

  const unlock = () => {
    if (!pw) {
      setShake((n) => n + 1);
      return;
    }
    setPower("on");
  };

  return (
    <motion.div
      className={`${layer} overflow-hidden bg-[#0a0f1a]`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.35 } }}
      exit={{ opacity: 0, scale: 1.04, transition: { duration: 0.45 } }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={wallpaper === "lake" ? "/wallpapers/lake.jpg" : "/wallpapers/dusk.jpg"} alt="" className="absolute inset-0 size-full object-cover scale-110 blur-2xl" />
      <div className="absolute inset-0 bg-[#0a0f1a]/35" />

      <div className="relative h-full flex flex-col items-center text-white">
        <div className="mt-[12vh] text-center">
          <div className="text-[18px] font-medium text-white/85">{now?.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</div>
          <div className="font-display font-extralight text-[120px] leading-none tracking-[-0.02em] tabular-nums">
            {now?.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M/i, "")}
          </div>
        </div>

        <div className="mt-auto mb-[16vh] grid justify-items-center">
          <span className="size-20 rounded-full grid place-items-center text-[30px] font-semibold bg-white/20 backdrop-blur-xl ring-1 ring-white/30">{BRAND.user[0]}</span>
          <div className="mt-3 text-[18px] font-semibold">{BRAND.user}</div>
          <motion.form
            key={shake}
            animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : {}}
            transition={{ duration: 0.35 }}
            onSubmit={(e) => {
              e.preventDefault();
              unlock();
            }}
            className="mt-4 flex items-center gap-1 h-11 w-[260px] pl-4 pr-1 rounded-full bg-white/20 backdrop-blur-xl ring-1 ring-white/25"
          >
            <input
              autoFocus
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Password"
              className="flex-1 min-w-0 bg-transparent outline-none text-[14px] placeholder:text-white/60"
              aria-label="Password"
            />
            <button type="submit" aria-label="Unlock" className="size-9 rounded-full grid place-items-center bg-white/25 hover:bg-white/35">
              <ArrowRight size={16} />
            </button>
          </motion.form>
          <div className="mt-2.5 text-[12px] text-white/55">Any password works in this preview</div>
        </div>

        <div className="absolute bottom-6 right-6 flex gap-2">
          {[
            { label: "Sleep", icon: Moon, onClick: () => setPower("sleeping") },
            { label: "Restart", icon: RotateCcw, onClick: () => ask("restart") },
            { label: "Shut down", icon: PowerIcon, onClick: () => ask("shutdown") },
          ].map((b) => (
            <button key={b.label} onClick={b.onClick} className="flex flex-col items-center gap-1.5 w-16 text-[11.5px] text-white/80 hover:text-white">
              <span className="size-10 rounded-full grid place-items-center bg-white/15 backdrop-blur-xl ring-1 ring-white/20">
                <b.icon size={17} />
              </span>
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------- sleep

function SleepScreen() {
  const setPower = useOS((s) => s.setPower);
  useEffect(() => {
    let armed = false;
    const t = setTimeout(() => (armed = true), 600); // ignore the click that put it to sleep
    const wake = () => armed && setPower("locked");
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [setPower]);
  return (
    <motion.div className={`${layer} bg-black grid place-items-end justify-center pb-10`} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.8 } }} exit={{ opacity: 0 }}>
      <motion.div className="size-1.5 rounded-full bg-white/50" animate={{ opacity: [0.15, 0.7, 0.15] }} transition={{ duration: 4, repeat: Infinity }} />
    </motion.div>
  );
}

// ---------------------------------------------------------------- shutting down

function ShutdownScreen() {
  const setPower = useOS((s) => s.setPower);
  const restart = usePowerPrompt((s) => s.last) === "restart";
  useEffect(() => {
    const t = setTimeout(() => setPower(restart ? "booting" : "off"), 2200);
    return () => clearTimeout(t);
  }, [restart, setPower]);
  return (
    <motion.div className={`${layer} bg-black grid place-items-center`} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.5 } }} exit={{ opacity: 0 }}>
      <div className="grid justify-items-center">
        <motion.div initial={{ scale: 1, opacity: 1 }} animate={{ scale: 0.15, opacity: 0 }} transition={{ delay: 0.6, duration: 1.4, ease: [0.7, 0, 0.84, 0] }}>
          <StringOrb size={120} />
        </motion.div>
        <motion.div initial={{ opacity: 0.8 }} animate={{ opacity: 0 }} transition={{ delay: 1.2, duration: 0.8 }} className="mt-6 text-[13px] text-white/60">
          {restart ? "Restarting" : "Shutting down"}
        </motion.div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------- confirm

function PowerConfirm() {
  const { action, ask } = usePowerPrompt();
  const windows = useOS((s) => s.windows);
  const running = useOS((s) => s.runs.filter((r) => r.status === "running" || r.status === "waiting").length);
  const setPower = useOS((s) => s.setPower);
  const closeAll = () => useOS.setState({ windows: [], commandOpen: false });

  const go = () => {
    if (!action) return;
    usePowerPrompt.setState({ action: null, last: action });
    closeAll();
    // after any shutdown or restart, the machine comes back to the lock screen
    setPower("shutting", "locked");
  };

  return (
    <AnimatePresence>
      {action && (
        <motion.div className="fixed inset-0 z-[3100] grid place-items-center p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-[#0b1220]/40 backdrop-blur-[3px]" onClick={() => ask(null)} />
          <motion.div
            initial={{ y: 12, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 460, damping: 34 }}
            className="glass relative w-full max-w-[380px] rounded-[24px] bg-glass-strong backdrop-blur-3xl border border-glass-line shadow-pop p-6 text-center"
          >
            <span className="mx-auto size-12 rounded-full grid place-items-center bg-surface-3 text-fg">
              {action === "restart" ? <RotateCcw size={20} /> : <PowerIcon size={20} />}
            </span>
            <div className="mt-3 text-[18px] font-semibold">{action === "restart" ? "Restart now?" : "Shut down now?"}</div>
            <ul className="mt-3 grid gap-1 text-[13px] text-fg-2">
              {windows.length > 0 && (
                <li>
                  {windows.length} open {windows.length === 1 ? "window" : "windows"} will close
                </li>
              )}
              {running > 0 && <li className="text-warn font-medium">A task is still running. It will stop safely before anything changes.</li>}
              <li>Your files and settings are already saved</li>
            </ul>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button onClick={() => ask(null)}>Cancel</Button>
              <Button variant="primary" onClick={go}>
                {action === "restart" ? "Restart" : "Shut down"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
