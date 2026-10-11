"use client";

// Test lab: put test data on the live machine. Packs load ready-made homes
// built to exercise one feature each; the file maker makes a single file with
// the labels and trust you choose; reset goes back to the standard home.

import clsx from "clsx";
import { FlaskConical, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { runRequest } from "@/lib/engine";
import { switchMachine } from "@/lib/livemachine";
import { liveOwner, refreshLive } from "@/lib/livemirror";
import { useOS } from "@/lib/store";
import { Button } from "../ui";
import { ConfusionTest } from "./ConfusionTest";
import { MemorySim } from "./MemorySim";

interface Pack {
  name: string;
  title: string;
  about: string;
  try: string[];
  files: number;
}

const LABELS = ["Work", "Personal", "Finance", "Sensitive"] as const;
const SOURCES = [
  { id: "you", label: "Made by you", origin: "made by you (test file)", untrusted: false },
  { id: "web", label: "From the web", origin: "downloaded from the web (test file)", untrusted: true },
  { id: "email", label: "Email attachment", origin: "email attachment (test file)", untrusted: true },
] as const;

export function TestLab() {
  const live = useOS((s) => s.settings.liveMachine);
  const fs = useOS((s) => s.fs);
  const pushToast = useOS((s) => s.pushToast);
  const setCommandOpen = useOS((s) => s.setCommandOpen);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // the file maker
  const folders = useMemo(() => Object.keys(fs).filter((d) => d !== "~/Trash").sort(), [fs]);
  const [dir, setDir] = useState("~/Downloads");
  const [name, setName] = useState("test-note.txt");
  const [text, setText] = useState("This is a test file.\n");
  const [labels, setLabels] = useState<string[]>([]);
  const [source, setSource] = useState<(typeof SOURCES)[number]["id"]>("you");

  useEffect(() => {
    if (!live) return;
    liveOwner("packs")
      .then((p) => setPacks(p ?? []))
      .catch(() => setPacks([]));
  }, [live]);

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await fn();
      refreshLive();
      pushToast({ title: done, tone: "ok" });
    } catch (e) {
      pushToast({ title: "The live machine refused", body: e instanceof Error ? e.message : String(e), tone: "warn" });
    } finally {
      setBusy(null);
    }
  };

  const tryIt = (request: string) => {
    void runRequest(request);
    setCommandOpen(true);
  };

  if (!live) {
    return (
      <div className="rounded-2xl border border-line p-6 text-center">
        <FlaskConical size={26} className="mx-auto text-fg-3" />
        <p className="mt-2 text-[14px] font-medium">The test lab works on the live machine</p>
        <p className="mt-1 text-[12.5px] text-fg-2">It puts real test files in ~/SIOS-sandbox, for the real AI and broker to work on.</p>
        <Button className="mt-4" onClick={() => void switchMachine(true)}>
          Switch to the live machine
        </Button>
      </div>
    );
  }

  const rel = dir === "~" ? "" : dir.replace(/^~\//, "");
  const src = SOURCES.find((s) => s.id === source)!;

  return (
    <div className="space-y-6">
      <section>
        <ConfusionTest />
      </section>

      <section>
        <MemorySim />
      </section>

      <section>
        <h3 className="text-[13px] font-semibold mb-2">Test packs</h3>
        <div className="grid gap-2.5">
          {packs.map((p) => (
            <div key={p.name} className="rounded-2xl border border-line p-3.5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold">
                    {p.title} <span className="text-[12px] font-normal text-fg-3">{p.files} files</span>
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-fg-2 leading-snug">{p.about}</p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <Button size="sm" disabled={!!busy} onClick={() => run(p.name, () => liveOwner("load_pack", { name: p.name, reset: false }), `Added "${p.title}" to the sandbox`)}>
                    {busy === p.name ? "Adding..." : "Add files"}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => run(p.name + "-fresh", () => liveOwner("load_pack", { name: p.name, reset: true }), `Started fresh with "${p.title}"`)}>
                    Start fresh
                  </Button>
                </div>
              </div>
              {p.try.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {p.try.map((t) => (
                    <button key={t} onClick={() => tryIt(t)} className="h-7 px-2.5 rounded-full bg-ai-soft text-ai-ink text-[12px] font-medium inline-flex items-center gap-1 hover:brightness-95">
                      <Play size={11} /> {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {packs.length === 0 && <p className="text-[12.5px] text-fg-3">Loading packs from capd...</p>}
        </div>
      </section>

      <section>
        <h3 className="text-[13px] font-semibold mb-2">Make a test file</h3>
        <div className="rounded-2xl border border-line p-3.5 space-y-3 text-[13px]">
          <div className="flex gap-2">
            <select value={dir} onChange={(e) => setDir(e.target.value)} aria-label="Folder" className="h-9 rounded-lg border border-line bg-surface px-2 min-w-0 flex-1">
              {folders.map((d) => (
                <option key={d} value={d}>
                  {d === "~" ? "Home" : d.replace(/^~\//, "")}
                </option>
              ))}
            </select>
            <input value={name} onChange={(e) => setName(e.target.value)} aria-label="File name" className="h-9 rounded-lg border border-line bg-surface px-2.5 flex-1 min-w-0" />
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Contents" rows={4} className="w-full rounded-lg border border-line bg-surface p-2.5 font-mono text-[12px]" />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-fg-3 text-[12px] mr-1">Labels</span>
            {LABELS.map((l) => (
              <button
                key={l}
                onClick={() => setLabels((x) => (x.includes(l) ? x.filter((y) => y !== l) : [...x, l]))}
                aria-pressed={labels.includes(l)}
                className={clsx("h-7 px-2.5 rounded-full text-[12px] font-medium border", labels.includes(l) ? "bg-accent text-white border-accent" : "border-line text-fg-2")}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Where it came from">
            <span className="text-fg-3 text-[12px] mr-1">Came from</span>
            {SOURCES.map((s) => (
              <button
                key={s.id}
                role="radio"
                aria-checked={source === s.id}
                onClick={() => setSource(s.id)}
                className={clsx("h-7 px-2.5 rounded-full text-[12px] font-medium border", source === s.id ? (s.untrusted ? "bg-warn text-white border-warn" : "bg-ok text-white border-ok") : "border-line text-fg-2")}
              >
                {s.label}
              </button>
            ))}
            {src.untrusted && <span className="text-[11.5px] text-warn">untrusted: AIs treat it as data only</span>}
          </div>
          <Button
            disabled={!!busy || !name.trim()}
            onClick={() =>
              run("file", () => liveOwner("create_file", { path: [rel, name.trim()].filter(Boolean).join("/"), text, labels, untrusted: src.untrusted, origin: src.origin }), `Made ${name.trim()}`)
            }
          >
            Make file
          </Button>
        </div>
      </section>

      <section>
        <h3 className="text-[13px] font-semibold mb-2">Reset</h3>
        <div className="rounded-2xl border border-line p-3.5 flex items-center gap-3 text-[13px]">
          <RotateCcw size={16} className="text-fg-3 shrink-0" />
          <span className="flex-1 text-fg-2">Wipe the sandbox back to the standard home. Your test files go; the decision log stays.</span>
          {confirmReset ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="danger" disabled={!!busy} onClick={() => run("reset", () => liveOwner("load_pack", { name: "standard-home", reset: true }), "Reset to the standard home").then(() => setConfirmReset(false))}>
                Yes, reset
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setConfirmReset(true)}>
              Reset sandbox
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
