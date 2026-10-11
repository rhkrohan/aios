"use client";

// Memory: what SIOS remembers, like /proc for the AI's long-term memory. Lives
// in capd on the live machine (Vault on SIOS). Everything here is the owner's:
// add, edit, mark Sensitive, forget, confirm what SIOS noticed, and choose
// which groups each outside AI may read.

import clsx from "clsx";
import { ArrowLeft, Brain, Check, Clock, EyeOff, Lock, Plus, Search, Share2, Sparkles, Trash2, Users, Waypoints, X, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { switchMachine } from "@/lib/livemachine";
import { liveFetch } from "@/lib/livemachine";
import { liveOwner } from "@/lib/livemirror";
import { useOS } from "@/lib/store";
import type { Win } from "@/lib/types";
import { Avatar, Button } from "../ui";
import { MemoryMap, type MapMem } from "./MemoryMap";
import type { SimReport } from "./MemorySim";

interface Mem {
  id: string;
  text: string;
  kind: string;
  group: string;
  labels: string[];
  source: string;
  created: number;
  last_used: number;
  uses: number;
  person?: { name: string; email: string; role: string };
  links?: string[];
  by?: string;
}
interface Sugg {
  id: string;
  text: string;
  group: string;
  why: string;
}
interface Data {
  memories: Mem[];
  suggestions: Sugg[];
  shares: Record<string, string[]>;
  groups: string[];
}

type Tab = "about" | "people" | "timeline" | "map" | "waiting" | "sharing";
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "about", label: "About you", icon: Brain },
  { id: "people", label: "People", icon: Users },
  { id: "timeline", label: "Timeline", icon: Clock },
  { id: "map", label: "Map over time", icon: Waypoints },
  { id: "waiting", label: "Waiting for your OK", icon: Sparkles },
  { id: "sharing", label: "Who can see what", icon: Share2 },
];
const GROUP_TONE: Record<string, string> = {
  People: "bg-[#8a6d9e]",
  Habits: "bg-ai",
  Work: "bg-accent",
  Personal: "bg-[#c1457d]",
  Finance: "bg-[#c99a2e]",
  History: "bg-fg-3",
};
const SHAREABLE = ["People", "Habits", "Work", "Personal", "Finance", "History"];

function when(secs: number) {
  if (!secs) return "";
  const d = Date.now() / 1000 - secs;
  if (d < 90) return "just now";
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  return new Date(secs * 1000).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function MemoryApp({ win }: { win: Win }) {
  const live = useOS((s) => s.settings.liveMachine);
  const setProps = useOS((s) => s.setWindowProps);
  const sim = win.props?.source === "sim";
  const [simRep, setSimRep] = useState<SimReport | null>(null);
  useEffect(() => {
    if (!sim) return;
    liveFetch("/api/live/memsim")
      .then((r) => r.json())
      .then((j) => setSimRep(j.report))
      .catch(() => setSimRep(null));
  }, [sim]);
  const audit = useOS((s) => s.audit);
  const pushToast = useOS((s) => s.pushToast);
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("about");
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState("");
  const [group, setGroup] = useState("Personal");
  const [sensitive, setSensitive] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const load = () =>
    liveOwner("memory_list")
      .then((d) => d && setData(d))
      .catch(() => {});
  useEffect(() => {
    if (!live) return;
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [live]);

  const act = async (action: string, params: Record<string, unknown>, done?: string) => {
    try {
      await liveOwner(action, params);
      if (done) pushToast({ title: done, tone: "ok" });
      load();
    } catch (e) {
      pushToast({ title: "Not saved", body: e instanceof Error ? e.message : String(e), tone: "warn" });
    }
  };

  const mems = useMemo(() => {
    const all = data?.memories ?? [];
    const f = q.trim().toLowerCase();
    return f ? all.filter((m) => `${m.text} ${m.group} ${m.labels.join(" ")}`.toLowerCase().includes(f)) : all;
  }, [data, q]);
  const about = mems.filter((m) => m.kind === "fact" || m.kind === "preference");
  const people = mems.filter((m) => m.kind === "person");
  const timeline = mems.filter((m) => m.kind === "episode").sort((a, b) => b.created - a.created);
  const waiting = data?.suggestions ?? [];
  const ais = Array.from(
    new Set([
      "Claude Desktop (MCP)",
      "ChatGPT (MCP)",
      ...Object.keys(data?.shares ?? {}),
      ...audit.map((e) => e.principal).filter((p) => p !== "you" && !p.endsWith("(via brain-d)") && !p.startsWith("Watcher")),
    ]),
  );

  if (sim) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-5 h-12 shrink-0 border-b border-line flex items-center gap-3 text-[13px]">
          <button onClick={() => setProps(win.id, { source: "" })} className="inline-flex items-center gap-1.5 text-fg-2 hover:text-fg">
            <ArrowLeft size={14} /> Your memory
          </button>
          <span className="h-5 px-2 rounded-full bg-warn-soft text-warn text-[11.5px] font-medium inline-flex items-center">Simulation</span>
          <span className="text-fg-2 truncate">{simRep ? `${simRep.days} made-up days from the Test lab, ${simRep.memories.length} memories over its life. Not your memory.` : "Run Memory over time in the Test lab first."}</span>
        </div>
        <div className="flex-1 min-h-0 px-5 py-4">{simRep && <MemoryMap memories={simRep.memories as MapMem[]} shares={simRep.shares} />}</div>
      </div>
    );
  }

  if (!live) {
    return (
      <div className="h-full grid place-items-center p-8 text-center">
        <div>
          <Brain size={30} className="mx-auto text-fg-3" />
          <p className="mt-3 text-[15px] font-semibold">Memory lives on the live machine</p>
          <p className="mt-1 text-[13px] text-fg-2 max-w-sm">It&apos;s kept by the broker, so every memory is checked, logged and yours to edit or forget.</p>
          <Button className="mt-4" onClick={() => void switchMachine(true)}>
            Switch to the live machine
          </Button>
        </div>
      </div>
    );
  }

  const count: Record<Tab, number> = { about: about.length, people: people.length, timeline: timeline.length, map: 0, waiting: waiting.length, sharing: Object.keys(data?.shares ?? {}).length };

  const Card = ({ m }: { m: Mem }) => (
    <li className="group rounded-2xl border border-line bg-surface p-3.5 hover:border-ai-line transition-colors">
      {editing === m.id ? (
        <div className="flex gap-2">
          <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} className="flex-1 h-9 rounded-lg border border-line bg-surface-2 px-2.5 text-[13.5px]" aria-label="Edit memory" />
          <Button size="sm" onClick={() => act("memory_edit", { id: m.id, text: editText }, "Updated").then(() => setEditing(null))}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          {m.person ? <Avatar person={{ name: m.person.name, email: m.person.email, role: m.person.role, initials: m.person.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase(), tone: "#7b4fe0" }} size={34} /> : <span className={clsx("mt-1.5 size-2 rounded-full shrink-0", GROUP_TONE[m.group] ?? "bg-fg-3")} />}
          <div className="min-w-0 flex-1">
            <button onClick={() => (setEditing(m.id), setEditText(m.text))} className="text-left text-[14px] leading-snug text-fg hover:text-ai-ink" title="Edit">
              {m.person ? (
                <>
                  <span className="font-semibold">{m.person.name}</span>
                  <span className="text-fg-2"> {m.person.email}</span>
                  {m.person.role && <span className="text-fg-3">, {m.person.role}</span>}
                </>
              ) : (
                m.text
              )}
            </button>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-fg-3">
              <span className="h-5 px-1.5 rounded-full bg-fg/[.06] inline-flex items-center">{m.group}</span>
              {m.labels.includes("Sensitive") && (
                <span className="h-5 px-1.5 rounded-full bg-danger-soft text-danger inline-flex items-center gap-1">
                  <Lock size={10} /> Sensitive, never sent online
                </span>
              )}
              <span>{m.source}</span>
              {m.uses > 0 && <span>· used {m.uses}×</span>}
              {m.last_used > 0 && <span>· {when(m.last_used)}</span>}
            </div>
          </div>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              title={m.labels.includes("Sensitive") ? "Allow online models to see it" : "Mark Sensitive: never sent online"}
              aria-label="Toggle Sensitive"
              onClick={() => act("memory_edit", { id: m.id, labels: m.labels.includes("Sensitive") ? m.labels.filter((l) => l !== "Sensitive") : [...m.labels, "Sensitive"] })}
              className="size-7 grid place-items-center rounded-lg text-fg-3 hover:bg-surface-3 hover:text-fg"
            >
              <EyeOff size={14} />
            </button>
            <button title="Forget" aria-label="Forget" onClick={() => act("memory_delete", { id: m.id }, "Forgotten")} className="size-7 grid place-items-center rounded-lg text-fg-3 hover:bg-danger-soft hover:text-danger">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}
    </li>
  );

  return (
    <div className="h-full flex">
      <aside className="w-56 shrink-0 border-r border-line bg-surface-2/70 p-2 flex flex-col">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx("w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13px]", tab === t.id ? "bg-accent-soft text-accent font-medium" : "hover:bg-surface-3")}
          >
            <t.icon size={16} strokeWidth={1.8} />
            <span className="flex-1 text-left">{t.label}</span>
            {count[t.id] > 0 && <span className={clsx("text-[11px] tabular-nums", t.id === "waiting" ? "h-5 px-1.5 rounded-full bg-ai text-white grid place-items-center" : "text-fg-3")}>{count[t.id]}</span>}
          </button>
        ))}
        <div className="mt-auto p-2 text-[11.5px] text-fg-3 leading-snug">
          Kept by the broker on this computer. Passwords and keys are refused. Sensitive memories never go to an online model.
        </div>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col">
        <div className="px-5 pt-4 pb-3 border-b border-line space-y-2.5">
          <label className="flex items-center gap-2 h-9 px-3 rounded-xl bg-surface-3 text-[13px]">
            <Search size={14} className="text-fg-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search memory" className="flex-1 bg-transparent outline-none" aria-label="Search memory" />
          </label>
          {(tab === "about" || tab === "people") && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.trim()) return;
                void act("memory_add", { text: draft, kind: tab === "people" ? "person" : "fact", group: tab === "people" ? "People" : group, labels: sensitive ? ["Sensitive"] : [] }, "Remembered").then(() => setDraft(""));
              }}
              className="flex items-center gap-2"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={tab === "people" ? "Priya Shah <priya@ledger.example>, accountant" : "Remember something: “I keep invoices in Documents/Finance”"}
                className="flex-1 min-w-0 h-9 rounded-xl border border-line bg-surface px-3 text-[13px]"
                aria-label="Remember something"
              />
              {tab === "about" && (
                <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Group" className="h-9 rounded-xl border border-line bg-surface px-2 text-[13px]">
                  {["Habits", "Work", "Personal", "Finance"].map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => setSensitive((v) => !v)}
                aria-pressed={sensitive}
                title="Sensitive: never sent to an online model"
                className={clsx("h-9 px-2.5 rounded-xl border text-[12px] inline-flex items-center gap-1", sensitive ? "bg-danger-soft border-danger/30 text-danger" : "border-line text-fg-2")}
              >
                <Lock size={12} /> Sensitive
              </button>
              <Button size="sm" type="submit">
                <Plus size={13} /> Remember
              </Button>
            </form>
          )}
        </div>

        {tab === "map" && (
          <div className="flex-1 min-h-0 px-5 py-4">
            <MemoryMap memories={mems} shares={data?.shares ?? {}} />
          </div>
        )}
        <div className={clsx("flex-1 overflow-auto scroll-thin px-5 py-4", tab === "map" && "hidden")}>
          {tab === "about" && (about.length ? <ul className="grid gap-2">{about.map((m) => <Card key={m.id} m={m} />)}</ul> : <Empty text="Nothing yet. Say “remember …” to SIOS, or add something above." />)}
          {tab === "people" && (people.length ? <ul className="grid gap-2 sm:grid-cols-2">{people.map((m) => <Card key={m.id} m={m} />)}</ul> : <Empty text="No people yet." />)}
          {tab === "timeline" &&
            (timeline.length ? (
              <ol className="relative pl-5 border-l border-line space-y-3">
                {timeline.map((m) => (
                  <li key={m.id} className="relative">
                    <span className="absolute -left-[26px] top-1 size-3 rounded-full bg-surface border-2 border-ai" />
                    <div className="text-[11.5px] text-fg-3">{when(m.created)}</div>
                    <div className="text-[13.5px] leading-snug">{m.text.replace(/^day \d+: /, "")}</div>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty text="When SIOS finishes a goal, it notes what happened here. Like a journal, written by the system, not the AI." />
            ))}
          {tab === "waiting" &&
            (waiting.length ? (
              <ul className="grid gap-2.5">
                {waiting.map((s) => (
                  <li key={s.id} className="rounded-2xl border border-ai-line bg-ai-soft/40 p-4">
                    <div className="flex items-start gap-3">
                      <Sparkles size={17} className="text-ai-ink mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-semibold leading-snug">{s.text}</div>
                        <div className="mt-1 text-[12.5px] text-fg-2">SIOS noticed this: {s.why}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2 pl-8">
                      <Button size="sm" onClick={() => act("memory_confirm", { id: s.id }, "Remembered")}>
                        <Check size={13} /> Remember this
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => act("memory_dismiss", { id: s.id })}>
                        <X size={13} /> Not right
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="When SIOS notices a pattern in what you ask, it suggests it here first. Nothing it notices is remembered until you say yes." />
            ))}
          {tab === "sharing" && (
            <div className="space-y-3">
              <p className="text-[12.5px] text-fg-2">SIOS&apos;s own brain can use all your memories (never Sensitive ones online). Outside AIs see nothing unless you share a group with them, like folder permissions.</p>
              {ais.map((ai) => {
                const shared = data?.shares?.[ai] ?? [];
                return (
                  <div key={ai} className="rounded-2xl border border-line p-3.5">
                    <div className="text-[13.5px] font-semibold">{ai}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {SHAREABLE.map((g) => {
                        const on = shared.includes(g);
                        return (
                          <button
                            key={g}
                            aria-pressed={on}
                            onClick={() => act("memory_share", { principal: ai, groups: on ? shared.filter((x) => x !== g) : [...shared, g] })}
                            className={clsx("h-7 px-2.5 rounded-full text-[12px] font-medium border inline-flex items-center gap-1.5", on ? "bg-ok text-white border-ok" : "border-line text-fg-2 hover:border-ai-line")}
                          >
                            <span className={clsx("size-1.5 rounded-full", on ? "bg-white" : GROUP_TONE[g])} />
                            {g}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-1.5 text-[11.5px] text-fg-3">{shared.length ? `Can read: ${shared.join(", ")}` : "Can read nothing"}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="mt-10 mx-auto max-w-sm text-center text-[13px] text-fg-3">{text}</p>;
}
