"use client";

// One visual language for the broker's checks, shared by the approval prompt
// and the auto-mode X-ray.

import { Check, Coins, Hash, KeyRound, Send, Ticket, Droplets, Gauge, GitBranch, Globe, Hand, LayoutGrid, MapPin, Power, Target, User, Wrench, type LucideIcon } from "lucide-react";
import type { PolicyCheck } from "@/lib/types";

export const CHECK_META: Record<string, { icon: LucideIcon; word: string }> = {
  stop: { icon: Power, word: "On" },
  principal: { icon: User, word: "Who" },
  trust: { icon: Gauge, word: "Trust" },
  tool: { icon: Wrench, word: "Tool" },
  goal: { icon: Target, word: "Goal" },
  area: { icon: LayoutGrid, word: "Area" },
  place: { icon: MapPin, word: "Place" },
  scope: { icon: GitBranch, word: "Slice" },
  taint: { icon: Globe, word: "Web" },
  flow: { icon: Droplets, word: "Data" },
  budget: { icon: Coins, word: "Spend" },
  level: { icon: Hand, word: "OK?" },
  // capd's checks on the live machine
  token: { icon: KeyRound, word: "Pass" },
  grant: { icon: Ticket, word: "Grant" },
  uses: { icon: Hash, word: "Uses" },
  egress: { icon: Send, word: "Send" },
};

export const checkMeta = (id: string) => CHECK_META[id] ?? { icon: Check, word: id };

export const CHECK_TONE: Record<PolicyCheck["result"], string> = {
  pass: "bg-ok text-white",
  ask: "bg-ai text-white",
  fail: "bg-danger text-white",
  skip: "bg-fg/10 text-fg-3",
};
