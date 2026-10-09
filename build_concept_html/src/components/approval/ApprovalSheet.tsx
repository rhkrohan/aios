"use client";

// The approval prompt. Built to be decided at a glance: who wants to do what,
// a small visual preview, safety as tags, then Deny / Allow. Details live one
// tap away under "Why is it asking?".

import clsx from "clsx";
import { Coins, Droplets, ArrowRight, Bot, ChevronDown, Globe, History, Lock, Paperclip, ShieldAlert, ShieldCheck, Target, Undo2, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { BRAND } from "@/lib/brand";
import { useOS } from "@/lib/store";
import type { ApprovalAnswer, ApprovalPreview, ApprovalRequest } from "@/lib/types";
import { CHECK_TONE, checkMeta } from "../checks";
import { LogoTile } from "../icons/BrandLogos";
import { FolderIcon } from "../icons/Icons";
import { StringOrb } from "../icons/StringOrb";
import { Avatar } from "../ui";

const TOOL_WORDS: Record<string, string> = {
  "fs.list": "look in folders",
  "fs.read": "read files",
  "fs.write": "create and edit files",
  "fs.move": "move files",
  "fs.trash": "move files to the Trash",
  "mail.send": "send email (asks you each time)",
  "fs.find": "search files",
  "fs.organize": "move files",
  "ui.open_app": "open apps",
  "ui.show_folder": "show you folders",
  "ui.quick_look": "show you previews",
  "ui.notify": "notify you",
  "ui.set_theme": "switch light or dark",
  "net.connect_wifi": "join Wi-Fi",
};

export function ApprovalSheet() {
  const pending = useOS((s) => s.approval);
  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          key={pending.request.id}
          className="fixed inset-0 z-[980] grid place-items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <div className="absolute inset-0 bg-[#0b1220]/25 backdrop-blur-[2px]" />
          <Sheet req={pending.request} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const DURATIONS: { id: ApprovalAnswer; label: string }[] = [
  { id: "once", label: "Once" },
  { id: "hour", label: "1 hour" },
  { id: "session", label: "Session" },
];

/** One strong line saying what will happen. Generic "Let X do Y?" titles fall back to the first change. */
function headline(req: ApprovalRequest) {
  if (/^(let |allow )/i.test(req.title) && req.changes[0]) return req.changes[0].text;
  return req.title.replace(/\?$/, "");
}

function Sheet({ req }: { req: ApprovalRequest }) {
  const answer = useOS((s) => s.answerApproval);
  const onlineAi = useOS((s) => s.settings.onlineAi);
  const [why, setWhy] = useState(false);
  const [duration, setDuration] = useState<ApprovalAnswer>("once");
  const primary = useRef<HTMLButtonElement>(null);
  const reversible = req.kind === "reversible";
  const irreversible = req.kind === "irreversible";
  const title = headline(req);
  const usedFirstChange = title === req.changes[0]?.text;
  const sub = usedFirstChange ? req.changes[0]?.sub : req.changes[0]?.text;

  const allow = () => answer(reversible ? duration : "approve");

  useEffect(() => {
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        answer("deny");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer]);

  // safety, as small tags
  const tags: { icon: LucideIcon; text: string; tone: "ok" | "warn" | "neutral" }[] = [];
  if (reversible && !req.pass) tags.push({ icon: Undo2, text: "Undo anytime", tone: "ok" });
  if (req.pass) tags.push({ icon: ShieldCheck, text: "Checked by capd on every call", tone: "ok" });
  if (req.pass && !req.pass.tools.includes("mail.send")) tags.push({ icon: Lock, text: "Can't send anything out", tone: "ok" });
  if (req.tool?.snapshot) tags.push({ icon: History, text: "Snapshot first", tone: "ok" });
  if (irreversible) tags.push({ icon: ShieldAlert, text: "Can't be undone", tone: "warn" });
  if (req.kind === "cloud") {
    tags.push({ icon: ShieldCheck, text: "Names removed", tone: "ok" });
    tags.push({ icon: Lock, text: "Files stay here", tone: "ok" });
  }
  if (req.tainted) tags.push({ icon: Globe, text: "Read outside content", tone: "warn" });
  if (req.carries?.length) tags.push({ icon: Droplets, text: "Carries private data", tone: "warn" });
  if (req.checks?.some((c) => c.id === "budget" && c.result === "ask")) tags.push({ icon: Coins, text: "Over budget", tone: "warn" });
  if (req.scope) tags.push({ icon: Target, text: req.scope, tone: "neutral" });

  return (
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="approval-title"
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 460, damping: 32 }}
      className="glass relative w-full max-w-[440px] max-h-[calc(100vh-48px)] flex flex-col rounded-[28px] bg-glass-strong backdrop-blur-3xl backdrop-saturate-150 border border-glass-line shadow-pop overflow-hidden"
    >
      <div className="overflow-auto scroll-thin px-6 pt-6">
        {/* who wants to do what */}
        <div className="flex items-center gap-3">
          <Requester name={req.principalName} />
          <div className="min-w-0 text-[13px] text-fg-2 leading-tight">
            <span className="font-semibold text-fg">{req.principalName ?? BRAND.name}</span> wants to
            <div className="text-[12px] text-fg-3 truncate mt-0.5">for &ldquo;{req.request}&rdquo;</div>
          </div>
        </div>
        <h2 id="approval-title" className="mt-4 text-[22px] leading-[1.2] font-semibold tracking-[-0.015em]">
          {title}
        </h2>
        {sub && <p className="mt-1.5 text-[13.5px] text-fg-2 leading-snug">{sub}</p>}

        {req.plan && req.plan.length > 0 && (
          <ol className="mt-4 space-y-1.5">
            {req.plan.map((s) => (
              <li key={s.n} className="flex items-start gap-2.5 text-[13px]">
                <span
                  className={clsx(
                    "mt-px size-5 shrink-0 rounded-full grid place-items-center text-[11px] font-semibold",
                    s.tone === "ok" && "bg-ok-soft text-ok",
                    s.tone === "ask" && "bg-ai-soft text-ai-ink",
                    s.tone === "block" && "bg-danger-soft text-danger",
                  )}
                >
                  {s.n}
                </span>
                <span className="min-w-0">
                  <span className="text-fg">{s.text}</span>
                  {s.note && <span className={clsx("block text-[12px]", s.tone === "block" ? "text-danger" : "text-ai-ink")}>{s.note}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}

        {req.pass && (
          <dl className="mt-4 rounded-2xl border border-line bg-surface-2/70 divide-y divide-line text-[13px]">
            {[
              { k: "May", v: req.pass.tools.map((t) => TOOL_WORDS[t] ?? t).join(", ") || "nothing" },
              { k: "Folders", v: req.pass.folders.length ? req.pass.folders.map((f) => f || "the whole sandbox").join(", ") : "the whole sandbox" },
              { k: "Limits", v: req.pass.limits },
            ].map((r) => (
              <div key={r.k} className="flex gap-3 px-3.5 py-2.5">
                <dt className="w-16 shrink-0 text-fg-3">{r.k}</dt>
                <dd className="font-medium text-fg break-words min-w-0">{r.v}</dd>
              </div>
            ))}
            {req.pass.why && <div className="px-3.5 py-2.5 text-[12.5px] text-fg-2 leading-snug">{req.pass.why}</div>}
          </dl>
        )}

        {req.preview && (
          <div className="mt-4">
            <Preview preview={req.preview} ai={onlineAi ?? "online AI"} />
          </div>
        )}

        {/* safety tags */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t.text}
              className={clsx(
                "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] font-medium",
                t.tone === "ok" && "bg-ok-soft text-ok",
                t.tone === "warn" && "bg-warn-soft text-warn",
                t.tone === "neutral" && "bg-fg/[.06] text-fg-2",
              )}
            >
              <t.icon size={13} strokeWidth={2.2} />
              {t.text}
            </span>
          ))}
        </div>

        {/* where the data in this action came from */}
        {req.carries && req.carries.length > 0 && (
          <div className="mt-4 rounded-2xl bg-warn-soft/60 px-3.5 py-3">
            <div className="text-[12px] font-semibold text-warn">This carries data from</div>
            <ul className="mt-1.5 space-y-1">
              {req.carries.map((d) => (
                <li key={d.path ?? d.name} className="flex items-center gap-2 text-[12.5px] text-fg">
                  <Droplets size={13} className="text-warn shrink-0" />
                  <span className="truncate font-medium">{d.name}</span>
                  <span className="ml-auto flex gap-1 shrink-0">
                    {d.labels.map((l) => (
                      <span key={l} className="px-1.5 h-5 inline-flex items-center rounded-full bg-fg/[.07] text-[11px] text-fg-2">{l}</span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* why */}
        {req.checks && (
          <div className="mt-4 mb-1">
            <button onClick={() => setWhy(!why)} className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg-2 hover:text-fg">
              <span className="flex -space-x-1">
                {req.checks.slice(-4).map((c) => (
                  <span key={c.id} className={clsx("size-3.5 rounded-full ring-2 ring-[var(--glass-strong)]", CHECK_TONE[c.result].split(" ")[0])} />
                ))}
              </span>
              Why is it asking?
              <ChevronDown size={13} className={clsx("transition-transform", why && "rotate-180")} />
            </button>
            <AnimatePresence initial={false}>{why && <Why checks={req.checks} tool={req.tool?.name} />}</AnimatePresence>
          </div>
        )}
      </div>

      {/* decide */}
      <div className="shrink-0 px-6 pt-4 pb-5 mt-2">
        {reversible && !req.noDuration && (
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[12.5px] text-fg-2">Allow for</span>
            <div className="flex rounded-full bg-fg/[.07] p-0.5" role="radiogroup" aria-label="Allow for">
              {DURATIONS.map((d) => (
                <button
                  key={d.id}
                  role="radio"
                  aria-checked={duration === d.id}
                  onClick={() => setDuration(d.id)}
                  className={clsx(
                    "h-7 px-3.5 rounded-full text-[12.5px] font-medium transition-all",
                    duration === d.id ? "bg-surface text-fg shadow-[0_1px_3px_rgba(0,0,0,.12)]" : "text-fg-2 hover:text-fg",
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {req.alwaysLabel && (
          <label className="mb-3 flex items-center gap-2.5 text-[12.5px] text-fg-2 cursor-pointer select-none">
            <input type="checkbox" checked={duration === "always"} onChange={(e) => setDuration(e.target.checked ? "always" : "once")} className="size-4 accent-[var(--ai)]" />
            {req.alwaysLabel}
          </label>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => answer("deny")}
            className="h-11 rounded-2xl text-[14px] font-semibold bg-fg/[.07] hover:bg-fg/[.11] text-fg transition-colors"
          >
            {req.denyLabel ?? "Deny"}
          </button>
          <button
            ref={primary}
            onClick={allow}
            className={clsx(
              "h-11 rounded-2xl text-[14px] font-semibold text-white transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
              irreversible ? "bg-warn focus-visible:ring-warn/40" : "bg-ai focus-visible:ring-ai/40",
            )}
          >
            {req.primaryLabel ?? "Allow"}
          </button>
        </div>
        <div className="mt-2.5 text-center text-[11.5px] text-fg-3">
          Decided by the permission broker, not the AI. <span className="kbd ml-1">esc</span> to deny
        </div>
      </div>
    </motion.div>
  );
}

function Requester({ name }: { name?: string }) {
  if (!name) return <StringOrb size={40} strands={16} />;
  if (/claude/i.test(name)) return <LogoTile logo="claude" size={40} />;
  return (
    <span className="size-10 rounded-full grid place-items-center bg-[#59616b] text-white shrink-0">
      <Bot size={18} />
    </span>
  );
}

function Why({ checks, tool }: { checks: NonNullable<ApprovalRequest["checks"]>; tool?: string }) {
  const firstInteresting = checks.find((c) => c.result !== "pass" && c.result !== "skip") ?? checks[checks.length - 1];
  const [sel, setSel] = useState(firstInteresting.id);
  const current = checks.find((c) => c.id === sel) ?? firstInteresting;
  return (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
      <div className="mt-3 rounded-2xl bg-fg/[.04] p-3">
        <div className="flex justify-between gap-1">
          {checks.map((c, i) => {
            const m = checkMeta(c.id);
            return (
              <motion.button
                key={c.id}
                onClick={() => setSel(c.id)}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex flex-col items-center gap-1"
                aria-label={c.label}
              >
                <span className={clsx("size-8 rounded-[10px] grid place-items-center transition-transform", CHECK_TONE[c.result], c.id === sel && "scale-110 ring-2 ring-offset-1 ring-fg/30 ring-offset-transparent")}>
                  <m.icon size={15} strokeWidth={2.2} />
                </span>
                <span className={clsx("text-[10px] font-semibold", c.id === sel ? "text-fg" : "text-fg-3")}>{m.word}</span>
              </motion.button>
            );
          })}
        </div>
        <div className="mt-3 text-[12.5px] leading-snug">
          <span className="font-semibold">{current.label}</span> <span className="text-fg-2">{current.detail}</span>
        </div>
        {tool && <div className="mt-1.5 font-mono text-[11px] text-fg-3">{tool}</div>}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------- previews

function Preview({ preview, ai }: { preview: ApprovalPreview; ai: string }) {
  if (preview.type === "email") {
    return (
      <div className="rounded-2xl bg-surface/80 border border-line p-3.5">
        <div className="flex items-center gap-2">
          <span className="flex -space-x-1.5">
            {preview.to.map((p) => (
              <Avatar key={p.email} person={p} size={24} />
            ))}
          </span>
          <span className="text-[13px] font-semibold truncate">{preview.to.map((p) => p.name.split(" ")[0]).join(", ")}</span>
        </div>
        <div className="mt-2 text-[13px] font-medium">{preview.subject}</div>
        <div className="mt-1 text-[12.5px] text-fg-2 leading-snug line-clamp-3 whitespace-pre-line">{preview.body.replace(/^Hi[^\n]*\n+/, "")}</div>
        {preview.attachment && (
          <div className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-fg-2">
            <Paperclip size={12} /> {preview.attachment}
          </div>
        )}
      </div>
    );
  }
  if (preview.type === "moves") {
    return (
      <div className="flex flex-wrap gap-1.5">
        {preview.groups.map((g) => (
          <span key={g.folder} className="inline-flex items-center gap-1.5 h-9 pl-1.5 pr-3 rounded-xl bg-surface/80 border border-line text-[12.5px] font-medium">
            <FolderIcon size={22} />
            {g.folder}
            <span className="text-fg-3 font-normal tabular-nums">{g.files.length}</span>
          </span>
        ))}
      </div>
    );
  }
  if (preview.type === "redaction") {
    const mark = (text: string) =>
      text.split(/(\[[A-Z_0-9: a-z]+\])/g).map((part, i) =>
        /^\[.*\]$/.test(part) ? (
          <mark key={i} className="rounded px-1 bg-ai-soft text-ai-ink font-medium">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      );
    return (
      <div className="rounded-2xl bg-surface/80 border border-line p-3.5 text-[12.5px] leading-[1.55]">
        <div className="text-[11.5px] font-semibold text-fg-3 mb-1">What {ai} sees</div>
        {mark(preview.redacted)}
      </div>
    );
  }
  const swatch = (dark: boolean) => (
    <span className={clsx("w-20 h-12 rounded-lg border overflow-hidden flex flex-col", dark ? "bg-[#1e2023] border-[#43484e]" : "bg-white border-[#cfcfc9]")}>
      <span className={clsx("h-2", dark ? "bg-[#0e0f11]" : "bg-[#e9ecef]")} />
      <span className="flex-1 p-1.5 grid gap-1">
        <span className={clsx("h-1.5 w-10 rounded", dark ? "bg-[#43484e]" : "bg-[#e4e4df]")} />
        <span className={clsx("h-1.5 w-6 rounded", dark ? "bg-[#7d9dff]" : "bg-[#4f7bf7]")} />
      </span>
    </span>
  );
  return (
    <div className="flex items-center justify-center gap-4 rounded-2xl bg-surface/80 border border-line py-3.5">
      {swatch(preview.from === "Dark")}
      <ArrowRight size={16} className="text-fg-3" />
      {swatch(preview.to === "Dark")}
    </div>
  );
}
