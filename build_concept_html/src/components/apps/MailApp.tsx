"use client";

import clsx from "clsx";
import { FileText, Inbox, Paperclip, Send } from "lucide-react";
import { useState } from "react";
import { BRAND } from "@/lib/brand";
import { useOS } from "@/lib/store";
import type { Win } from "@/lib/types";
import { Avatar, Chip } from "../ui";

export function MailApp({ win }: { win?: Win }) {
  const sent = useOS((s) => s.mail);
  const INBOX = useOS((s) => s.inbox);
  const [box, setBox] = useState<"inbox" | "sent">(win?.props?.box === "inbox" ? "inbox" : sent.length ? "sent" : "inbox");
  const [sel, setSel] = useState<string | null>(win?.props?.open ?? null);
  // another app (or the assistant) asked to show a particular message
  const wantBox = win?.props?.box;
  const wantOpen = win?.props?.open;
  const want = `${wantBox ?? ""}|${wantOpen ?? ""}`;
  const [seen, setSeen] = useState(want);
  if (want !== seen) {
    setSeen(want);
    if (wantBox === "inbox" || wantBox === "sent") setBox(wantBox);
    if (wantOpen) setSel(wantOpen);
  }

  const rows =
    box === "inbox"
      ? INBOX.map((m) => ({ id: m.id, who: m.from.name, people: [m.from], subject: m.subject, body: m.body, time: m.time, attachment: m.attachment, ai: false }))
      : sent.map((m) => ({ id: m.id, who: "To " + m.to.map((p) => p.name.split(" ")[0]).join(", "), people: m.to, subject: m.subject, body: m.body, time: m.time, attachment: m.attachment, ai: true }));
  const current = rows.find((r) => r.id === sel) ?? rows[0];

  return (
    <div className="h-full flex text-[13px]">
      <aside className="w-44 shrink-0 border-r border-line bg-surface-2/70 p-2">
        {[
          { id: "inbox" as const, label: "Inbox", icon: Inbox, n: INBOX.length },
          { id: "sent" as const, label: "Sent", icon: Send, n: sent.length },
        ].map((b) => (
          <button
            key={b.id}
            onClick={() => {
              setBox(b.id);
              setSel(null);
            }}
            className={clsx("w-full flex items-center gap-2 px-2 h-8 rounded-lg", box === b.id ? "bg-accent-soft text-accent font-medium" : "hover:bg-surface-3")}
          >
            <b.icon size={15} />
            <span className="flex-1 text-left">{b.label}</span>
            <span className="text-[11px] text-fg-3">{b.n || ""}</span>
          </button>
        ))}
        <button className="w-full flex items-center gap-2 px-2 h-8 rounded-lg hover:bg-surface-3 text-fg-2">
          <FileText size={15} /> Drafts
        </button>
      </aside>
      <div className="w-72 shrink-0 border-r border-line overflow-auto scroll-thin">
        {rows.map((r) => (
          <button
            key={r.id}
            onClick={() => setSel(r.id)}
            className={clsx("w-full text-left px-3.5 py-3 border-b border-line", current?.id === r.id ? "bg-accent-soft/70" : "hover:bg-surface-2")}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium truncate flex-1">{r.who}</span>
              <span className="text-[11px] text-fg-3">{r.time}</span>
            </div>
            <div className="truncate">{r.subject}</div>
            <div className="truncate text-fg-3 text-[12px]">{r.body}</div>
          </button>
        ))}
        {!rows.length && <div className="p-6 text-center text-fg-3">Nothing sent yet</div>}
      </div>
      <div className="flex-1 min-w-0 overflow-auto scroll-thin">
        {current && (
          <article className="p-6">
            <h3 className="text-[18px] font-semibold">{current.subject}</h3>
            <div className="mt-3 flex items-center gap-2.5">
              <span className="flex -space-x-1.5">
                {current.people.map((p) => (
                  <Avatar key={p.email} person={p} size={30} />
                ))}
              </span>
              <div className="min-w-0">
                <div className="font-medium truncate">{current.who}</div>
                <div className="text-[12px] text-fg-3">{current.time}</div>
              </div>
              {current.ai && (
                <Chip tone="ai" className="ml-auto">
                  Sent by {BRAND.name} with your OK
                </Chip>
              )}
            </div>
            <p className="mt-5 whitespace-pre-line leading-[1.7] text-[13.5px]">{current.body}</p>
            {current.attachment && (
              <div className="mt-4">
                <Chip icon={Paperclip}>{current.attachment}</Chip>
              </div>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
