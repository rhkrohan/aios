"use client";

import clsx from "clsx";
import { Bot, Check, Globe, History, Mail, Plus, ShieldAlert, ShieldCheck, Sparkles, User, X } from "lucide-react";
import { useState } from "react";
import { BRAND } from "@/lib/brand";
import { putBack } from "@/lib/fileops";
import { useOS } from "@/lib/store";
import type { FileItem } from "@/lib/types";
import { FileIcon } from "../icons/Icons";
import { Chip } from "../ui";
import { LABELS, REACH_LABEL, accessFor, dirLabel, historyOf, objAddress, originText, summaryOf, type Reach } from "./model";

const KIND_LABEL: Record<FileItem["kind"], string> = {
  folder: "Folder",
  pdf: "PDF document",
  image: "Image",
  doc: "Document",
  sheet: "Spreadsheet",
  slides: "Slides",
  archive: "Archive",
  installer: "App installer",
  code: "Code",
  text: "Text",
  audio: "Audio",
  video: "Video",
};

const REACH_TONE: Record<Reach, string> = {
  full: "bg-ok",
  "open-change": "bg-ok",
  "open-ask": "bg-accent",
  blocked: "bg-danger",
};

/** Update one item in place, wherever it lives. */
function patchItem(dir: string, id: string, patch: Partial<FileItem>) {
  const fs = useOS.getState().fs;
  useOS.getState().setFs({ ...fs, [dir]: fs[dir].map((x) => (x.id === id ? { ...x, ...patch } : x)) });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 py-3.5 border-t border-line">
      <h4 className="text-[12px] font-semibold text-fg-3 mb-2">{title}</h4>
      {children}
    </section>
  );
}

export function Inspector({ item, dir, onClose }: { item: FileItem; dir: string; onClose: () => void }) {
  const state = useOS();
  const [adding, setAdding] = useState(false);
  const untrusted = item.trust === "untrusted";
  const access = accessFor(state, dir, item);
  const labels = item.labels ?? [];
  const summary = summaryOf(item);
  const OriginIcon = item.origin?.by === "web" ? Globe : item.origin?.by === "email" ? Mail : item.origin?.by === "SIOS" ? Sparkles : User;

  return (
    <aside className="w-[280px] shrink-0 border-l border-line bg-surface-2/50 flex flex-col min-h-0" aria-label="Inspector">
      <div className="flex items-start gap-2 px-4 pt-4 pb-3">
        <div className="flex-1 min-w-0 grid justify-items-center text-center">
          <FileIcon kind={item.kind} name={item.name} size={72} ai={!!item.touchedBy} />
          <div className="mt-2 text-[14px] font-semibold leading-tight break-words max-w-full">{item.name}</div>
          <div className="text-[12px] text-fg-2">
            {KIND_LABEL[item.kind]}
            {item.size ? `, ${item.size}` : ""}
          </div>
          <div className="mt-1.5 max-w-full truncate font-mono text-[10.5px] text-fg-3" title={objAddress(dir, item.name)}>
            {objAddress(dir, item.name)}
          </div>
        </div>
        <button aria-label="Close inspector" onClick={onClose} className="size-6 grid place-items-center rounded-md text-fg-3 hover:bg-surface-3 hover:text-fg shrink-0">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto scroll-thin">
        {dir === "~/Trash" && item.trashedFrom && (
          <div className="mx-4 mt-3">
            <button
              onClick={() => {
                putBack([item.id]);
                onClose();
              }}
              className="w-full h-9 rounded-xl bg-ai text-white text-[13px] font-semibold hover:brightness-110"
            >
              Put back in {dirLabel(item.trashedFrom)}
            </button>
          </div>
        )}

        <Section title="Where it came from">
          <div className="flex gap-2.5 text-[12.5px]">
            <span className="size-7 rounded-lg grid place-items-center bg-surface border border-line text-fg-2 shrink-0">
              <OriginIcon size={14} />
            </span>
            <div className="min-w-0">
              <div className="font-medium leading-5">{originText(item)}</div>
              <div className="text-fg-3">
                In {dirLabel(dir)}
                {item.goal ? `, last changed by the goal "${item.goal}"` : ""}
              </div>
            </div>
          </div>
        </Section>

        <Section title="Trust">
          {untrusted ? (
            <div className="rounded-xl border border-warn-line bg-warn-soft p-2.5 text-[12px] leading-[1.45] text-warn">
              <div className="flex items-center gap-1.5 font-semibold mb-0.5">
                <ShieldAlert size={13} /> Untrusted
              </div>
              Came from the web. The AI treats what&apos;s inside as information, never as instructions, and anything sent out after reading it asks you.
              <button
                onClick={() => patchItem(dir, item.id, { trust: "trusted" })}
                className="mt-1.5 block font-semibold underline underline-offset-2 hover:no-underline"
              >
                I trust this file
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[12.5px]">
              <ShieldCheck size={15} className="text-ok" />
              <span>
                <span className="font-medium">Trusted.</span> <span className="text-fg-2">Made by you or {BRAND.name}.</span>
              </span>
            </div>
          )}
        </Section>

        <Section title="Labels">
          <div className="flex flex-wrap gap-1.5">
            {labels.map((l) => (
              <Chip key={l} tone={l === "Sensitive" ? "danger" : l === "Finance" ? "warn" : "neutral"} className="pr-1">
                {l}
                <button
                  aria-label={`Remove ${l}`}
                  onClick={() => patchItem(dir, item.id, { labels: labels.filter((x) => x !== l) })}
                  className="size-3.5 grid place-items-center rounded-full hover:bg-black/10"
                >
                  <X size={9} />
                </button>
              </Chip>
            ))}
            <div className="relative">
              <button
                onClick={() => setAdding((a) => !a)}
                className="inline-flex items-center gap-1 h-5.5 px-2 rounded-full border border-dashed border-line-strong text-[11px] text-fg-2 hover:text-fg"
              >
                <Plus size={10} /> Add
              </button>
              {adding && (
                <div className="absolute left-0 top-7 z-10 w-36 rounded-xl border border-line bg-surface shadow-pop p-1">
                  {LABELS.map((l) => {
                    const has = labels.includes(l);
                    return (
                      <button
                        key={l}
                        onClick={() => {
                          patchItem(dir, item.id, { labels: has ? labels.filter((x) => x !== l) : [...labels, l] });
                          setAdding(false);
                        }}
                        className="w-full flex items-center justify-between px-2 h-7 rounded-lg text-[12px] hover:bg-surface-2"
                      >
                        {l}
                        {has && <Check size={12} className="text-accent" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          {labels.includes("Sensitive") && <div className="mt-1.5 text-[11.5px] text-fg-3">Sensitive files are hidden from connected AI apps.</div>}
        </Section>

        <Section title="Who can reach it">
          <ul className="grid gap-2">
            {access.map((a) => (
              <li key={a.who} className="flex items-start gap-2 text-[12.5px]">
                <span className={clsx("mt-1.5 size-1.5 rounded-full shrink-0", REACH_TONE[a.reach])} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {a.who !== "You" && <Bot size={12} className="text-fg-3" />}
                    <span className="font-medium">{a.who}</span>
                  </div>
                  <div className="text-fg-2">{REACH_LABEL[a.reach]}</div>
                  <div className="text-[11.5px] text-fg-3">{a.why}</div>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        {summary && (
          <Section title="What's inside">
            <p className="text-[12.5px] leading-5">{summary}</p>
            {untrusted && <p className="mt-1 text-[11.5px] text-fg-3">Summarized as data. Nothing inside was followed as an instruction.</p>}
          </Section>
        )}

        <Section title="History">
          <ol className="grid gap-2">
            {historyOf(item).map((h, i) => (
              <li key={i} className="flex gap-2 text-[12.5px]">
                <span className={clsx("mt-0.5 size-5 rounded-full grid place-items-center shrink-0", h.ai ? "bg-ai-soft text-ai-ink" : "bg-surface-3 text-fg-2")}>
                  {h.ai ? <Sparkles size={11} /> : <History size={11} />}
                </span>
                <div className="min-w-0">
                  <div className="leading-5">{h.title}</div>
                  <div className="text-[11.5px] text-fg-3">
                    {h.when}
                    {h.ai && i === 0 && item.goal ? ". Undo it from Activity." : ""}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </aside>
  );
}
