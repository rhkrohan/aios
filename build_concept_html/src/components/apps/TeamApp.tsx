"use client";

// Team: every agent working for you in one place. The leader (SIOS's own
// brain) and each helper pet with its job, what it's doing, its recent work,
// which AI drives it, and whether it shows on the desktop. Each helper is its
// own identity on the live machine: its own passes, its own log lines.

import clsx from "clsx";
import { Eye, EyeOff, Pause, Play, Plus, Trash2, Users } from "lucide-react";
import { switchMachine } from "@/lib/livemachine";
import { usePet } from "@/lib/pet";
import { useOS } from "@/lib/store";
import { BRAINS, useTeam, type HelperStatus } from "@/lib/team";
import { StringOrb } from "../icons/StringOrb";
import { HelperBody } from "../pet/PetFace";
import { BrainPicker, ago, brainCtl, jobLine } from "../pet/PetTeam";
import { Button } from "../ui";

const STATE: Record<HelperStatus["state"], { word: string; tone: string }> = {
  idle: { word: "Resting", tone: "bg-fg/[.07] text-fg-2" },
  working: { word: "Working", tone: "bg-ai-soft text-ai-ink" },
  waiting: { word: "Needs your OK", tone: "bg-warn-soft text-warn" },
  done: { word: "Just finished", tone: "bg-ok-soft text-ok" },
  paused: { word: "Paused", tone: "bg-fg/[.07] text-fg-3" },
};

export function TeamApp() {
  const live = useOS((s) => s.settings.liveMachine);
  const helpers = useTeam((s) => s.helpers);
  const setTeam = useTeam((s) => s.set);
  const pushToast = useOS((s) => s.pushToast);
  const leaderVisible = usePet((s) => s.visible);
  const setLeaderVisible = usePet((s) => s.setVisible);

  const act = async (action: string, params: Record<string, unknown>, done?: string) => {
    try {
      await brainCtl(action, params);
      if (done) pushToast({ title: done, tone: "info" });
    } catch (e) {
      pushToast({ title: "Not now", body: e instanceof Error ? e.message : String(e), tone: "warn" });
    }
  };

  return (
    <div className="h-full overflow-auto scroll-thin p-5">
      <div className="flex items-center gap-3 mb-4">
        <Users size={18} className="text-ai-ink" />
        <div className="flex-1">
          <div className="text-[16px] font-semibold">Your team</div>
          <div className="text-[12.5px] text-fg-2">Every agent working for you, what it&apos;s doing, and which AI drives it.</div>
        </div>
        <Button size="sm" onClick={() => (live ? setTeam({ creating: true, open: null }) : void switchMachine(true))}>
          <Plus size={13} /> New helper
        </Button>
      </div>

      {/* the leader */}
      <div className="rounded-2xl border border-line p-4 flex items-center gap-4">
        <span className="relative shrink-0" style={{ width: 52, height: 52 }}>
          <span className="absolute -inset-[14%] grid place-items-center">
            <StringOrb size={66} strands={18} lively={1} />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14.5px] font-semibold">SIOS</span>
            <span className="h-5 px-1.5 rounded-full bg-ai-soft text-ai-ink text-[11px] font-medium inline-flex items-center">Leader</span>
          </div>
          <div className="text-[12.5px] text-fg-2">Answers you, plans with brain-d, and announces what the helpers report.</div>
          <div className="mt-2 flex items-center gap-1.5 text-[12px]">
            <span className="text-fg-3">Brain</span>
            <span className="h-6 px-2 rounded-full bg-ai text-white inline-flex items-center">OpenAI</span>
            <span className="text-fg-3">(set for the whole system in Settings, Brain)</span>
          </div>
        </div>
        <VisibilityToggle on={leaderVisible} onChange={setLeaderVisible} />
      </div>

      {!live && (
        <div className="mt-4 rounded-2xl border border-dashed border-line p-5 text-center text-[13px] text-fg-2">
          Helpers do real work, so they live on the live machine.
          <div className="mt-3">
            <Button size="sm" onClick={() => void switchMachine(true)}>
              Switch to the live machine
            </Button>
          </div>
        </div>
      )}
      {live && helpers.length === 0 && (
        <p className="mt-6 text-center text-[13px] text-fg-3">No helpers yet. Tap the little + next to your pet, or New helper above.</p>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {helpers.map((s) => {
          const h = s.helper;
          const st = STATE[s.state];
          return (
            <div key={h.id} className={clsx("rounded-2xl border border-line p-4", h.hidden && "bg-surface-2/60")}>
              <div className="flex items-center gap-3">
                <span className="relative block shrink-0" style={{ width: 44, height: 44 }}>
                  <HelperBody size={44} color={h.color} mood={s.state === "working" ? "working" : s.state === "paused" ? "paused" : "idle"} busy={s.state === "working"} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14.5px] font-semibold truncate">{h.name}</span>
                    <span className={clsx("h-5 px-1.5 rounded-full text-[11px] font-medium inline-flex items-center", st.tone)}>{st.word}</span>
                  </div>
                  <div className="text-[12px] text-fg-3 truncate">Works as &ldquo;{h.name} (helper)&rdquo;</div>
                </div>
                <VisibilityToggle on={!h.hidden} onChange={(v) => act("helpers_update", { id: h.id, hidden: !v }, v ? `${h.name} is back on the desktop` : `${h.name} is working quietly`)} />
              </div>
              <div className="mt-3 rounded-xl bg-fg/[.05] px-3 py-2 text-[12.5px] leading-snug">{jobLine(h)}</div>
              <div className="mt-3">
                <BrainPicker value={h.brain || "openai"} onChange={(b) => act("helpers_update", { id: h.id, brain: b }, `${h.name} now runs on ${BRAINS.find((x) => x.id === b)?.label}`)} />
              </div>
              <div className="mt-3 text-[11.5px] font-semibold text-fg-3">Recent work</div>
              <ul className="mt-1 space-y-1">
                {h.runs.length === 0 && <li className="text-[12.5px] text-fg-3">Nothing yet.</li>}
                {h.runs.slice(0, 3).map((r) => (
                  <li key={r.goal + r.at} className="flex gap-2 text-[12.5px]">
                    <span className={clsx("mt-1.5 size-1.5 rounded-full shrink-0", r.failed ? "bg-warn" : "bg-ok")} />
                    <span className="min-w-0 flex-1 truncate">{r.text}</span>
                    <span className="text-[11px] text-fg-3 shrink-0">{ago(r.at)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-1.5">
                <Button size="sm" disabled={s.state === "working" || s.state === "waiting"} onClick={() => act("helpers_run_now", { id: h.id }, `${h.name} is on it`)}>
                  <Play size={12} /> Run now
                </Button>
                <Button size="sm" variant="secondary" onClick={() => act("helpers_update", { id: h.id, active: !h.active }, h.active ? `${h.name} is taking a nap` : `${h.name} is back at work`)}>
                  {h.active ? <Pause size={12} /> : <Play size={12} />} {h.active ? "Pause" : "Resume"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => act("helpers_remove", { id: h.id }, `${h.name} retired`)}>
                  <Trash2 size={12} /> Retire
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VisibilityToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-pressed={on}
      title={on ? "Shown on the desktop" : "Working quietly (in the tray on the right edge)"}
      className={clsx("h-8 px-2.5 rounded-full text-[12px] font-medium inline-flex items-center gap-1.5 border", on ? "border-line text-fg-2" : "border-dashed border-line text-fg-3")}
    >
      {on ? <Eye size={13} /> : <EyeOff size={13} />} {on ? "Shown" : "Quiet"}
    </button>
  );
}
