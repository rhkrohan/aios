"use client";

import clsx from "clsx";
import { Check, Copy, LoaderCircle, MonitorSmartphone, ShieldCheck, Smartphone, SquareCode } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";
import { useOS } from "@/lib/store";
import { Button, Chip, Toggle } from "../ui";
import { LogoTile } from "../icons/BrandLogos";

interface Client {
  id: string;
  name: string;
  kind: string;
  tile: React.ReactNode;
}

const CLIENTS: Client[] = [
  { id: "claude-desktop", name: "Claude Desktop", kind: "AI app on this computer", tile: <LogoTile logo="claude" size={44} /> },
  { id: "chatgpt", name: "ChatGPT", kind: "AI app on this computer", tile: <Tile bg="linear-gradient(160deg,#3c4148,#15181c)">G</Tile> },
  { id: "phone", name: "Your phone", kind: "Ask from anywhere on your home network", tile: <Tile bg="linear-gradient(160deg,#6fb4ff,#3d6fe0)"><Smartphone size={18} /></Tile> },
  { id: "custom", name: "Custom app", kind: "Anything that speaks MCP", tile: <Tile bg="linear-gradient(160deg,#a6adb7,#6b737e)"><SquareCode size={18} /></Tile> },
];

function Tile({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <span className="size-11 rounded-[13px] grid place-items-center text-white font-semibold text-[17px] shrink-0 shadow-[0_6px_14px_-8px_rgba(0,0,0,.5)]" style={{ background: bg }}>
      {children}
    </span>
  );
}

/**
 * External AIs drive this computer through brain-d's MCP server, under the same
 * broker rules as the built-in assistant (docs/plan/04-tunnel-and-tools.md).
 */
export function ConnectionsPage() {
  const pushToast = useOS((s) => s.pushToast);
  // Shared with the broker: these areas are what lib/policy.ts enforces.
  const connected = useOS((s) => s.connectedApps);
  const setApp = useOS((s) => s.setConnectedApp);
  const [pairing, setPairing] = useState<Client | null>(null);
  const [copied, setCopied] = useState(false);
  const endpoint = `http://${BRAND.device}.local:7801/mcp`;

  return (
    <>
      <div className="mb-5">
        <h2 className="text-[20px] font-semibold tracking-[-0.01em]">Connected AI apps</h2>
        <p className="text-[13px] text-fg-2 mt-0.5">Other AIs can use this computer too. They follow the same rules as the built-in assistant, and every action shows up in Activity.</p>
      </div>

      <ul className="grid gap-2.5">
        {CLIENTS.map((c) => {
          const on = connected[c.id];
          return (
            <li key={c.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-center gap-3.5">
                {c.tile}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14.5px] font-semibold">{c.name}</span>
                    {on && <Chip tone="ok">Connected</Chip>}
                  </div>
                  <div className="text-[12.5px] text-fg-2">{on ? on.since : c.kind}</div>
                </div>
                {on ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setApp(c.id, null);
                      pushToast({ title: `${c.name} disconnected`, body: "It can no longer use this computer.", tone: "info" });
                    }}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => setPairing(c)}>
                    Connect
                  </Button>
                )}
              </div>
              {on && (
                <div className="mt-3 pl-[58px]">
                  <div className="text-[12px] font-semibold text-fg-2 mb-1.5">Can use</div>
                  <div className="flex flex-wrap gap-1.5">
                    {["Files", "Mail", "Settings", "Network", "Apps", "Web"].map((a) => {
                      const has = on.areas.includes(a);
                      return (
                        <button
                          key={a}
                          onClick={() =>
                            setApp(c.id, { ...on, areas: has ? on.areas.filter((x) => x !== a) : [...on.areas, a] })
                          }
                          className={clsx(
                            "h-7 px-3 rounded-full text-[12.5px] border transition-colors flex items-center gap-1",
                            has ? "bg-accent-soft border-accent-line text-accent font-medium" : "border-line text-fg-3 hover:text-fg",
                          )}
                        >
                          {has && <Check size={12} strokeWidth={2.6} />} {a}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 rounded-2xl bg-surface-2 border border-line p-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <MonitorSmartphone size={15} className="text-accent" /> Address for custom apps
        </div>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 min-w-0 truncate rounded-lg bg-surface border border-line px-3 h-9 grid items-center font-mono text-[12.5px]">{endpoint}</code>
          <Button
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(endpoint).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <div className="mt-2 text-[12px] text-fg-2">Only reachable on your home network. New apps still need a pairing code.</div>
      </div>

      <div className="mt-3 flex gap-2.5 rounded-2xl border border-line p-4 text-[12.5px] leading-5 text-fg-2">
        <ShieldCheck size={16} className="text-ok shrink-0 mt-0.5" />
        <span>
          Connected apps never get your passwords. They see the same tools, ask for the same approvals, and can be cut off here anytime.
        </span>
      </div>

      <AnimatePresence>
        {pairing && (
          <Pairing
            client={pairing}
            onClose={() => setPairing(null)}
            onDone={() => {
              setApp(pairing.id, { since: "Connected just now", areas: ["Files", "Settings"] });
              pushToast({ title: `${pairing.name} connected`, body: "It can use Files and Settings. Change that anytime.", tone: "ok" });
              setPairing(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function Pairing({ client, onClose, onDone }: { client: Client; onClose: () => void; onDone: () => void }) {
  const [code] = useState(() => String(Math.floor(100000 + Math.random() * 900000)));
  const [waiting, setWaiting] = useState(true);
  const [remember, setRemember] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setWaiting(false), 2600);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div className="fixed inset-0 z-[985] grid place-items-center p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-[#0b1220]/35 backdrop-blur-[3px]" onClick={onClose} />
      <motion.div
        initial={{ y: 14, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 10, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 460, damping: 34 }}
        className="relative w-full max-w-[420px] rounded-[22px] bg-surface shadow-pop p-6 text-center"
      >
        <div className="flex justify-center">{client.tile}</div>
        <div className="mt-3 text-[18px] font-semibold">Connect {client.name}</div>
        <p className="mt-1 text-[13px] text-fg-2 leading-5">
          {client.id === "phone" ? "Open the SIOS app on your phone and enter this code." : `In ${client.name}, add ${BRAND.name} as a connector and enter this code.`}
        </p>
        <div className="mt-4 flex justify-center gap-1.5">
          {code.split("").map((d, i) => (
            <span key={i} className="w-10 h-12 rounded-xl bg-surface-2 border border-line grid place-items-center text-[22px] font-semibold tabular-nums">
              {d}
            </span>
          ))}
        </div>
        <div className="mt-4 h-6 flex items-center justify-center gap-2 text-[13px]">
          {waiting ? (
            <>
              <LoaderCircle size={14} className="animate-spin text-accent" /> <span className="text-fg-2">Waiting for {client.name}...</span>
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-ok font-medium">
              <Check size={15} strokeWidth={2.6} /> {client.name} found. Allow it?
            </span>
          )}
        </div>
        <label className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3.5 py-2.5 text-left text-[12.5px]">
          <span>Ask me again before it changes anything</span>
          <Toggle checked={remember} onChange={setRemember} label="Ask before changes" />
        </label>
        <div className="mt-5 flex gap-2">
          <Button className="flex-1" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" variant="primary" disabled={waiting} onClick={onDone}>
            Allow
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
