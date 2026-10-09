"use client";

import clsx from "clsx";
import {
  AppWindow,
  Brain,
  Cpu,
  Folder,
  Mail,
  PenLine,
  SlidersHorizontal,
  Users,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import type { Area, FileKind, Person } from "@/lib/types";
import { FileIcon } from "./icons/Icons";

export const AREA_ICON: Record<Area, LucideIcon> = {
  files: Folder,
  settings: SlidersHorizontal,
  network: Wifi,
  apps: AppWindow,
  people: Users,
  memory: Brain,
  mail: Mail,
  system: Cpu,
  writing: PenLine,
};

export function FileGlyph({ kind, name, size = 18, ai }: { kind: FileKind; name: string; size?: number; ai?: boolean }) {
  return <FileIcon kind={kind} name={name} size={size} ai={ai} />;
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...rest
}: ComponentProps<"button"> & { variant?: BtnVariant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...rest}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-all duration-150 select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
        "disabled:opacity-45 disabled:pointer-events-none active:scale-[0.98]",
        size === "sm" && "h-7 px-2.5 text-[12.5px]",
        size === "md" && "h-8.5 px-3.5 text-[13px]",
        size === "lg" && "h-10 px-4.5 text-[14px]",
        variant === "primary" &&
          "bg-accent text-white shadow-[0_1px_0_rgba(255,255,255,.18)_inset,0_1px_2px_rgba(0,0,0,.18)] hover:bg-accent-strong [:root[data-theme=dark]_&]:text-[#10161d]",
        variant === "secondary" && "bg-surface border border-line-strong text-fg hover:bg-surface-2 shadow-[0_1px_1px_rgba(0,0,0,.04)]",
        variant === "ghost" && "text-fg-2 hover:bg-surface-3 hover:text-fg",
        variant === "quiet" && "text-accent hover:bg-accent-soft",
        variant === "danger" && "bg-danger text-white hover:opacity-90",
        className,
      )}
    >
      {children}
    </button>
  );
}

export type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "ai";

export function Chip({ tone = "neutral", children, className, icon: Icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: LucideIcon }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-2 h-5.5 text-[11px] font-medium whitespace-nowrap",
        tone === "neutral" && "border-line bg-surface-2 text-fg-2",
        tone === "accent" && "border-accent-line bg-accent-soft text-accent",
        tone === "ok" && "border-ok-line bg-ok-soft text-ok",
        tone === "warn" && "border-warn-line bg-warn-soft text-warn",
        tone === "danger" && "border-danger-line bg-danger-soft text-danger",
        tone === "ai" && "border-ai-line bg-ai-soft text-ai-ink",
        className,
      )}
    >
      {Icon && <Icon size={11} strokeWidth={2.2} />}
      {children}
    </span>
  );
}

export function Avatar({ person, size = 28 }: { person: Person; size?: number }) {
  return (
    <span
      className="inline-grid place-items-center rounded-full text-white font-semibold ring-2 ring-surface shrink-0"
      style={{ width: size, height: size, background: person.tone, fontSize: size * 0.38 }}
      title={person.name}
    >
      {person.initials}
    </span>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative h-5.5 w-9.5 rounded-full transition-colors duration-200 shrink-0",
        checked ? "bg-accent" : "bg-line-strong",
      )}
    >
      <span
        className={clsx(
          "absolute top-0.5 left-0.5 size-4.5 rounded-full bg-white shadow-sm transition-transform duration-200",
          checked && "translate-x-4",
        )}
      />
    </button>
  );
}

export function timeAgo(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
