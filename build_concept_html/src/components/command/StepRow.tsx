"use client";

import clsx from "clsx";
import {
  BookMarked,
  Brain,
  Check,
  Cloud,
  Cpu,
  Gauge,
  History,
  LoaderCircle,
  GitBranch,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";
import type { BrokerDecision, PolicyCheck, Step, StepKind } from "@/lib/types";
import { Chip, type Tone } from "../ui";

const KIND_ICON: Record<StepKind, LucideIcon> = {
  context: Brain,
  reflex: Gauge,
  recipe: BookMarked,
  route: Cpu,
  snapshot: History,
  tool: Wrench,
  verify: ShieldCheck,
  think: Sparkles,
  guard: ScanSearch,
  delegate: GitBranch,
};

export const BROKER_LABEL: Record<BrokerDecision, { text: string; tone: Tone }> = {
  allowed: { text: "Allowed", tone: "neutral" },
  remembered: { text: "Already allowed", tone: "neutral" },
  "asked-once": { text: "You allowed once", tone: "ok" },
  "asked-session": { text: "You allowed", tone: "ok" },
  "asked-approved": { text: "You approved", tone: "ok" },
  denied: { text: "You said no", tone: "danger" },
  blocked: { text: "Blocked by a rule", tone: "danger" },
};

export function StepRow({ step, details, last, cloud }: { step: Step; details: boolean; last: boolean; cloud?: boolean }) {
  const Icon = step.kind === "route" && cloud ? Cloud : KIND_ICON[step.kind];
  const active = step.status === "active";
  const done = step.status === "done";
  const blocked = step.status === "blocked";

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative flex gap-3 pl-0.5"
    >
      {/* rail */}
      {!last && <span className="absolute left-[13px] top-7 bottom-[-6px] w-px bg-line" />}
      <span
        className={clsx(
          "relative z-[1] mt-0.5 size-6.5 shrink-0 grid place-items-center rounded-full border transition-colors duration-300",
          active && "border-ai-line bg-ai-soft text-ai-ink",
          done && "border-line bg-surface text-fg-2",
          blocked && "border-danger-line bg-danger-soft text-danger",
        )}
      >
        {active ? (
          <LoaderCircle size={14} className="animate-spin" />
        ) : blocked ? (
          <X size={13} strokeWidth={2.4} />
        ) : (
          <Icon size={13} strokeWidth={2} />
        )}
      </span>

      <div className="flex-1 min-w-0 pb-3.5">
        <div className="flex items-start gap-2">
          <div className={clsx("flex-1 min-w-0 text-[13.5px] leading-6", active ? "font-medium" : "text-fg")}>
            {active ? <span className="shimmer">{step.label}</span> : (step.doneLabel ?? step.label)}
            {done && step.kind === "verify" && <Check size={13} strokeWidth={2.6} className="inline ml-1.5 -mt-0.5 text-ok" />}
          </div>
          {step.broker && step.tool && (
            <Chip tone={BROKER_LABEL[step.broker].tone} className="mt-0.5">
              {BROKER_LABEL[step.broker].text}
            </Chip>
          )}
          {details && step.ms !== undefined && !active && (
            <span className="text-[11px] text-fg-3 tabular-nums mt-1 w-12 text-right">{(step.ms / 1000).toFixed(2)}s</span>
          )}
        </div>
        {step.detail && !active && <div className="text-[12.5px] text-fg-2 leading-5">{step.detail}</div>}
        {step.chips && done && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {step.chips.map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
          </div>
        )}
        {details && step.tool && (
          <div className="mt-2 rounded-lg border border-line bg-surface-2 font-mono text-[11.5px] leading-[1.55] overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5 border-b border-line">
              <span className="font-semibold text-accent">{step.tool.name}</span>
              <span className="text-fg-3">via {step.tool.adapter}</span>
              <span className="ml-auto flex gap-1">
                <Chip tone={step.tool.permission === "read" ? "neutral" : step.tool.permission === "reversible" ? "accent" : "warn"}>
                  {step.tool.permission}
                </Chip>
                {step.tool.snapshot && <Chip tone="ok">snapshot</Chip>}
              </span>
            </div>
            {step.checks && <CheckTrace checks={step.checks} />}
            <pre className="px-2.5 py-1.5 text-fg-2 whitespace-pre-wrap break-all border-t border-line">
              <span className="text-fg-3">→ </span>
              {JSON.stringify(step.tool.input)}
              {done && step.tool.output && (
                <>
                  {"\n"}
                  <span className="text-fg-3">← </span>
                  {JSON.stringify(step.tool.output)}
                </>
              )}
            </pre>
          </div>
        )}
      </div>
    </motion.li>
  );
}

const CHECK_DOT: Record<PolicyCheck["result"], string> = {
  pass: "bg-ok",
  ask: "bg-accent",
  fail: "bg-danger",
  skip: "bg-line-strong",
};

/** The broker's reasoning, one line per check, in the order it ran. */
export function CheckTrace({ checks }: { checks: PolicyCheck[] }) {
  return (
    <ol className="px-2.5 py-2 grid gap-1 font-sans text-[12px]">
      {checks.map((c) => (
        <li key={c.id} className={clsx("flex gap-2", c.result === "skip" && "opacity-45")}>
          <span className={clsx("mt-[5px] size-1.5 rounded-full shrink-0", CHECK_DOT[c.result])} />
          <span className="min-w-0">
            <span className="font-medium text-fg">{c.label}</span> <span className="text-fg-2">{c.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
