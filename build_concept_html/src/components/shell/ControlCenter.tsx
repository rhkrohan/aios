"use client";

import clsx from "clsx";
import { Bluetooth, CircleAlert, CircleCheck, Info, Moon, MoonStar, Sun, Volume2, Wifi, WifiOff, type LucideIcon } from "lucide-react";
import { useOS } from "@/lib/store";
import { timeAgo } from "../ui";

/** Quick toggles plus the notification history. Opens from the top bar. */
export function ControlCenter() {
  const wifi = useOS((s) => s.wifi);
  const setWifi = useOS((s) => s.setWifi);
  const theme = useOS((s) => s.theme);
  const setTheme = useOS((s) => s.setTheme);
  const dnd = useOS((s) => s.dnd);
  const setDnd = useOS((s) => s.setDnd);
  const notes = useOS((s) => s.notifications);
  const clear = useOS((s) => s.clearNotifications);
  const bt = useOS((s) => s.bluetooth);
  const setBt = useOS((s) => s.setBluetooth);
  const bright = useOS((s) => s.brightness);
  const setBright = useOS((s) => s.setBrightness);
  const vol = useOS((s) => s.volume);
  const setVol = useOS((s) => s.setVolume);

  return (
    <div className="p-3 w-[340px]">
      <div className="grid grid-cols-2 gap-2">
        <Tile
          icon={wifi.connected ? Wifi : WifiOff}
          label="Wi-Fi"
          sub={wifi.connected ?? "Off"}
          on={!!wifi.connected}
          onClick={() => setWifi(wifi.connected ? null : wifi.networks[0].ssid)}
        />
        <Tile icon={Bluetooth} label="Bluetooth" sub={bt ? "On" : "Off"} on={bt} onClick={() => setBt(!bt)} />
        <Tile icon={MoonStar} label="Do not disturb" sub={dnd ? "Notifications held" : "Off"} on={dnd} onClick={() => setDnd(!dnd)} />
        <Tile
          icon={theme === "dark" ? Moon : Sun}
          label="Dark mode"
          sub={theme === "dark" ? "On" : "Off"}
          on={theme === "dark"}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        />
      </div>

      <div className="mt-2 grid gap-2 rounded-2xl bg-surface-2 border border-line p-3">
        <Slider icon={Sun} label="Brightness" value={bright} onChange={setBright} />
        <Slider icon={Volume2} label="Volume" value={vol} onChange={setVol} />
      </div>

      <div className="mt-3 flex items-center justify-between px-1">
        <span className="text-[13px] font-semibold">Notifications</span>
        {notes.length > 0 && (
          <button onClick={clear} className="text-[12px] text-fg-2 hover:text-fg">
            Clear all
          </button>
        )}
      </div>
      <ul className="mt-1.5 grid gap-1.5 max-h-[300px] overflow-auto scroll-thin">
        {notes.map((n) => {
          const Icon = n.tone === "ok" ? CircleCheck : n.tone === "warn" ? CircleAlert : Info;
          return (
            <li key={n.id} className="flex gap-2.5 rounded-xl bg-surface-2/80 border border-line px-3 py-2.5">
              <Icon size={15} className={clsx("shrink-0 mt-0.5", n.tone === "ok" ? "text-ok" : n.tone === "warn" ? "text-warn" : "text-accent")} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium flex-1 min-w-0">{n.title}</span>
                  <span className="text-[11px] text-fg-3 shrink-0">{timeAgo(n.at)}</span>
                </div>
                {n.body && <div className="text-[12px] text-fg-2 leading-[1.4]">{n.body}</div>}
              </div>
            </li>
          );
        })}
        {!notes.length && <li className="py-6 text-center text-[12.5px] text-fg-3">You&apos;re all caught up</li>}
      </ul>
    </div>
  );
}

function Tile({ icon: Icon, label, sub, on, onClick }: { icon: LucideIcon; label: string; sub: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={clsx(
        "flex items-center gap-2.5 rounded-2xl p-2.5 text-left border transition-colors",
        on ? "bg-surface border-line shadow-[0_1px_2px_rgba(0,0,0,.06)]" : "bg-surface-2 border-line hover:bg-surface-3",
      )}
    >
      <span className={clsx("size-8 rounded-full grid place-items-center shrink-0 transition-colors", on ? "bg-accent text-white" : "bg-surface-3 text-fg-2")}>
        <Icon size={15} strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-semibold leading-tight">{label}</span>
        <span className="block text-[11.5px] text-fg-2 truncate">{sub}</span>
      </span>
    </button>
  );
}

function Slider({ icon: Icon, label, value, onChange }: { icon: LucideIcon; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2.5">
      <Icon size={15} className="text-fg-2 shrink-0" />
      <span className="sr-only">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 accent-[var(--accent)] cursor-pointer"
        aria-label={label}
      />
    </label>
  );
}
