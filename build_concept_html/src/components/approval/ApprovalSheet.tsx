"use client";

import clsx from "clsx";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Cloud,
  Folder,
  History,
  Lock,
  Paperclip,
  ShieldAlert,
  ShieldCheck,
  Target,
  Undo2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { BRAND } from "@/lib/brand";
import { useOS } from "@/lib/store";
import type { ApprovalPreview, ApprovalRequest } from "@/lib/types";
import { AREA_ICON, Avatar, Button, Chip } from "../ui";
import { StringOrb } from "../icons/StringOrb";

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
          transition={{ duration: 0.18 }}
        >
          <div className="absolute inset-0 bg-[#14171a]/35 backdrop-blur-[3px]" />
          <Sheet req={pending.request} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Sheet({ req }: { req: ApprovalRequest }) {
  const answer = useOS((s) => s.answerApproval);
  const onlineAi = useOS((s) => s.settings.onlineAi);
  const [tech, setTech] = useState(false);
  const primary = useRef<HTMLButtonElement>(null);
  const Icon = req.kind === "cloud" ? Cloud : AREA_ICON[req.area];
  const irreversible = req.kind === "irreversible";

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

  return (
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="approval-title"
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 460, damping: 34 }}
      className="relative w-full max-w-[540px] max-h-[calc(100vh-64px)] flex flex-col rounded-[22px] bg-surface shadow-pop overflow-hidden"
    >
      <div className={clsx("h-1 shrink-0", irreversible ? "bg-warn" : "bg-ai")} />

      <div className="overflow-auto scroll-thin">
        <div className="px-6 pt-5">
          <div className="flex items-center gap-3">
            <span
              className={clsx(
                "size-10 rounded-xl grid place-items-center border",
                irreversible ? "bg-warn-soft border-warn-line text-warn" : "bg-ai-soft border-ai-line text-ai-ink",
              )}
            >
              <Icon size={19} strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <div className="text-[12px] text-fg-2 font-medium flex items-center gap-1.5"><StringOrb size={18} strands={12} />{BRAND.name} is asking</div>
              <div className="text-[12.5px] text-fg-2 truncate">You asked: “{req.request}”</div>
            </div>
          </div>

          <h2 id="approval-title" className="mt-4 text-[20px] leading-7 font-semibold tracking-[-0.01em]">
            {req.title}
          </h2>

          <ul className="mt-3 grid gap-2">
            {req.changes.map((c) => (
              <li key={c.text} className="flex gap-2.5">
                <span className="mt-[3px] size-4.5 rounded-full bg-surface-3 grid place-items-center shrink-0">
                  <Check size={11} strokeWidth={2.6} className="text-fg-2" />
                </span>
                <div className="text-[13.5px] leading-6">
                  <div className="font-medium">{c.text}</div>
                  {c.sub && <div className="text-[12.5px] text-fg-2 leading-5">{c.sub}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {req.preview && (
          <div className="px-6 mt-4">
            <Preview preview={req.preview} ai={onlineAi ?? "online AI"} />
          </div>
        )}

        <div className="px-6 mt-4 grid gap-1.5">
          <Safety req={req} />
        </div>

        <div className="px-6 mt-3 mb-1">
          <button onClick={() => setTech((t) => !t)} className="flex items-center gap-1 text-[12px] text-fg-3 hover:text-fg-2">
            <ChevronDown size={13} className={clsx("transition-transform", tech && "rotate-180")} />
            Technical details
          </button>
          <AnimatePresence initial={false}>
            {tech && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <dl className="mt-2 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 rounded-xl border border-line bg-surface-2 p-3 font-mono text-[11.5px]">
                  {req.tool ? (
                    <>
                      <dt className="text-fg-3">tool</dt>
                      <dd className="text-accent font-semibold">{req.tool.name}</dd>
                      <dt className="text-fg-3">adapter</dt>
                      <dd>{req.tool.adapter}</dd>
                      <dt className="text-fg-3">permission</dt>
                      <dd>{req.tool.permission}</dd>
                      <dt className="text-fg-3">input</dt>
                      <dd className="break-all text-fg-2">{JSON.stringify(req.tool.input)}</dd>
                    </>
                  ) : (
                    <>
                      <dt className="text-fg-3">decision</dt>
                      <dd>router.cloud</dd>
                      <dt className="text-fg-3">provider</dt>
                      <dd>{onlineAi}</dd>
                    </>
                  )}
                  <dt className="text-fg-3">rule</dt>
                  <dd className="font-sans text-fg-2">
                    {req.kind === "reversible" && "Changes ask the first time per session."}
                    {req.kind === "irreversible" && "Actions that can't be undone always ask."}
                    {req.kind === "cloud" && "Online AI asks first (Settings > Brain)."}
                  </dd>
                  <dt className="text-fg-3">decided by</dt>
                  <dd className="font-sans text-fg-2">Permission broker, not the AI</dd>
                </dl>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-2 px-6 py-4 mt-2 border-t border-line bg-surface-2/60">
        <Button variant="ghost" onClick={() => answer("deny")}>
          {req.denyLabel ?? "Don't allow"}
        </Button>
        <span className="flex-1" />
        {req.kind === "reversible" ? (
          <>
            <Button onClick={() => answer("once")}>Allow once</Button>
            <Button ref={primary} variant="primary" onClick={() => answer("session")}>
              Allow for this session
            </Button>
          </>
        ) : (
          <Button ref={primary} variant="primary" onClick={() => answer("approve")}>
            {req.primaryLabel ?? "Allow"}
          </Button>
        )}
      </div>
    </motion.div>
  );
}

function Safety({ req }: { req: ApprovalRequest }) {
  const rows: { icon: typeof Undo2; text: string; tone: "ok" | "warn" | "neutral" }[] = [];
  if (req.kind === "reversible") {
    rows.push({ icon: Undo2, text: "You can undo this from Activity", tone: "ok" });
    if (req.tool?.snapshot) rows.push({ icon: History, text: "A snapshot is saved before anything changes", tone: "ok" });
  }
  if (req.kind === "irreversible") rows.push({ icon: ShieldAlert, text: "This can't be undone once it's done", tone: "warn" });
  if (req.kind === "cloud") {
    rows.push({ icon: ShieldCheck, text: "Your memory, files and passwords stay on this computer", tone: "ok" });
    rows.push({ icon: Lock, text: "Only the cleaned-up text below leaves this computer", tone: "neutral" });
  }
  if (req.scope) rows.push({ icon: Target, text: `Only touches ${req.scope}`, tone: "neutral" });
  return (
    <>
      {rows.map((r) => (
        <div
          key={r.text}
          className={clsx(
            "flex items-center gap-2 text-[12.5px] rounded-lg px-2.5 py-1.5",
            r.tone === "ok" && "bg-ok-soft text-ok",
            r.tone === "warn" && "bg-warn-soft text-warn font-medium",
            r.tone === "neutral" && "bg-surface-2 text-fg-2",
          )}
        >
          <r.icon size={14} strokeWidth={2} />
          {r.text}
        </div>
      ))}
    </>
  );
}

function Preview({ preview, ai }: { preview: ApprovalPreview; ai: string }) {
  if (preview.type === "email") {
    return (
      <div className="rounded-xl border border-line overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-line bg-surface-2 grid gap-1.5 text-[12.5px]">
          <div className="flex items-center gap-2">
            <span className="w-14 text-fg-3">To</span>
            <span className="flex -space-x-1.5">
              {preview.to.map((p) => (
                <Avatar key={p.email} person={p} size={22} />
              ))}
            </span>
            <span className="truncate">{preview.to.map((p) => p.name.split(" ")[0]).join(", ")}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-14 text-fg-3">Subject</span>
            <span className="font-medium">{preview.subject}</span>
          </div>
        </div>
        <div className="px-3.5 py-3 text-[13px] leading-[1.6] whitespace-pre-line max-h-40 overflow-auto scroll-thin">{preview.body}</div>
        {preview.attachment && (
          <div className="px-3.5 pb-3">
            <Chip icon={Paperclip}>{preview.attachment}</Chip>
          </div>
        )}
      </div>
    );
  }
  if (preview.type === "moves") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {preview.groups.map((g) => (
          <div key={g.folder} className="rounded-xl border border-line bg-surface-2 p-2.5">
            <div className="flex items-center gap-1.5 text-[12.5px] font-semibold">
              <Folder size={14} className="text-accent" fill="currentColor" fillOpacity={0.15} />
              {g.folder}
              <span className="ml-auto text-fg-3 font-normal">{g.files.length}</span>
            </div>
            <div className="mt-1 text-[11.5px] text-fg-2 leading-[1.5]">
              {g.files.slice(0, 2).map((f) => (
                <div key={f} className="truncate">
                  {f}
                </div>
              ))}
              {g.files.length > 2 && <div className="text-fg-3">+{g.files.length - 2} more</div>}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (preview.type === "redaction") {
    const mark = (text: string) =>
      text.split(/(\[[A-Z_0-9: a-z]+\])/g).map((part, i) =>
        /^\[.*\]$/.test(part) ? (
          <mark key={i} className="rounded px-1 bg-accent-soft text-accent font-medium">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      );
    return (
      <div className="rounded-xl border border-line overflow-hidden text-[12.5px] leading-[1.6]">
        <div className="px-3.5 py-2.5">
          <div className="text-[12px] font-semibold text-fg-3 mb-1">Your note</div>
          <div className="text-fg-2">{preview.original}</div>
        </div>
        <div className="px-3.5 py-2.5 border-t border-line bg-surface-2">
          <div className="text-[12px] font-semibold text-fg-3 mb-1">
            What {ai} sees
          </div>
          <div>{mark(preview.redacted)}</div>
          <div className="mt-2 flex gap-1">
            {preview.removed.map((r) => (
              <Chip key={r} tone="accent">
                {r} removed
              </Chip>
            ))}
          </div>
        </div>
      </div>
    );
  }
  // setting
  const swatch = (dark: boolean) => (
    <span className={clsx("w-24 h-14 rounded-lg border overflow-hidden flex flex-col", dark ? "bg-[#1e2023] border-[#43484e]" : "bg-white border-[#cfcfc9]")}>
      <span className={clsx("h-2.5", dark ? "bg-[#0e0f11]" : "bg-[#2b2f34]")} />
      <span className="flex-1 p-1.5 grid gap-1">
        <span className={clsx("h-1.5 w-12 rounded", dark ? "bg-[#43484e]" : "bg-[#e4e4df]")} />
        <span className={clsx("h-1.5 w-8 rounded", dark ? "bg-[#8fb3d9]" : "bg-[#2f5d8a]")} />
      </span>
    </span>
  );
  return (
    <div className="flex items-center justify-center gap-4 rounded-xl border border-line bg-surface-2 py-4">
      <div className="grid justify-items-center gap-1 text-[12px] text-fg-2">
        {swatch(preview.from === "Dark")}
        {preview.from}
      </div>
      <ArrowRight size={16} className="text-fg-3" />
      <div className="grid justify-items-center gap-1 text-[12px] font-medium">
        {swatch(preview.to === "Dark")}
        {preview.to}
      </div>
    </div>
  );
}
