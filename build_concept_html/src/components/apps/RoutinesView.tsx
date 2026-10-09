"use client";

import clsx from "clsx";
import { BookMarked, Clock, Play } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { runRequest } from "@/lib/engine";
import { SCENARIOS } from "@/lib/scenarios";
import { useOS } from "@/lib/store";
import { AREA_ICON, Button, Chip } from "../ui";

const WHEN = [
  { id: null, label: "Only when I ask" },
  { id: "morning", label: "Every morning" },
  { id: "friday", label: "Fridays at 4 PM" },
] as const;

const SUGGESTED_ROUTINES = [
  { id: "clean-downloads", why: "You tidy Downloads about once a week." },
  { id: "project-update", why: "You write an update most Fridays." },
];

/** Routines are saved automatically after a task works (recipes in docs/plan/03-brain.md). */
export function RoutinesView() {
  const recipes = useOS((s) => s.recipes);
  const schedules = useOS((s) => s.schedules);
  const setSchedule = useOS((s) => s.setSchedule);
  const setOpen = useOS((s) => s.setCommandOpen);
  const state = useOS();

  // Prefer the steps that actually ran; rebuilding from current state could differ.
  const steps = (id: string) => {
    const ran = state.runs.find((r) => r.scenarioId === id && r.status === "done");
    if (ran) return ran.steps.filter((s) => s.tool).map((s) => s.tool!.name);
    const sc = SCENARIOS.find((s) => s.id === id)!;
    return sc.build({ os: state, text: sc.example.toLowerCase(), usedRecipe: true }).steps.filter((s) => s.tool).map((s) => s.tool!.name);
  };
  const suggested = SUGGESTED_ROUTINES.filter((r) => !recipes.includes(r.id));

  return (
    <div className="p-4 grid gap-6">
      <section>
        <div className="px-1 mb-2 text-[13px] font-semibold text-fg-2">Your routines</div>
        {!recipes.length ? (
          <div className="rounded-2xl border border-dashed border-line-strong p-6 text-center">
            <span className="inline-grid place-items-center size-11 rounded-2xl bg-accent-soft text-accent">
              <BookMarked size={20} />
            </span>
            <div className="mt-2.5 text-[14.5px] font-semibold">No routines yet</div>
            <p className="mt-1 text-[13px] text-fg-2 leading-5 max-w-sm mx-auto">
              When a task works, {BRAND.name} saves its steps as a routine. Next time it runs faster, without planning from scratch.
            </p>
          </div>
        ) : (
          <ul className="grid gap-2.5">
            {recipes.map((id) => {
              const sc = SCENARIOS.find((s) => s.id === id);
              if (!sc) return null;
              const Icon = AREA_ICON[sc.area];
              const chain = steps(id);
              return (
                <li key={id} className="rounded-2xl border border-line bg-surface p-4">
                  <div className="flex items-start gap-3">
                    <span className="size-9 rounded-xl grid place-items-center bg-ok-soft text-ok border border-ok-line shrink-0">
                      <Icon size={17} strokeWidth={1.8} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14.5px] font-semibold">{sc.title}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {chain.map((t, i) => (
                          <span key={t + i} className="flex items-center gap-1">
                            {i > 0 && <span className="text-fg-3 text-[11px]">then</span>}
                            <Chip>{t}</Chip>
                          </span>
                        ))}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setOpen(true);
                        void runRequest(sc.example);
                      }}
                    >
                      <Play size={12} fill="currentColor" /> Run now
                    </Button>
                  </div>
                  <div className="mt-3 flex items-center gap-2 pl-12">
                    <Clock size={13} className="text-fg-3" />
                    <div className="flex rounded-lg bg-surface-3 p-0.5 text-[12px]">
                      {WHEN.map((w) => (
                        <button
                          key={w.label}
                          onClick={() => setSchedule(id, w.id)}
                          className={clsx("px-2.5 h-6.5 rounded-md", (schedules[id] ?? null) === w.id ? "bg-surface font-semibold shadow-sm" : "text-fg-2 hover:text-fg")}
                        >
                          {w.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {schedules[id] && (
                    <div className="mt-2 pl-12 text-[12px] text-fg-2">
                      Runs on its own. Anything that changes things still waits for your OK, and you&apos;ll get a notification.
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {suggested.length > 0 && (
        <section>
          <div className="px-1 mb-2 text-[13px] font-semibold text-fg-2">Suggested for you</div>
          <ul className="grid gap-2">
            {suggested.map((r) => {
              const sc = SCENARIOS.find((s) => s.id === r.id)!;
              const Icon = AREA_ICON[sc.area];
              return (
                <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2/60 p-3.5">
                  <span className="size-9 rounded-xl grid place-items-center bg-surface border border-line text-fg-2 shrink-0">
                    <Icon size={17} strokeWidth={1.8} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold">{sc.title}</div>
                    <div className="text-[12.5px] text-fg-2">{r.why}</div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      setOpen(true);
                      void runRequest(sc.example);
                    }}
                  >
                    Try it once
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
