"use client";

// "A week with SIOS": the demo for everyday people. Four chores, each one
// sentence typed into the Ask bar; the real engine and broker do the work. A
// title card opens each act with its own music, the narrator (ElevenLabs)
// says what just happened, and small sounds follow what's on screen.

import { listen, music, prepare, sfx, stopAll } from "./demoAudio";
import { EVERYDAY_GRANTS, seedEveryday, useEveryday } from "./everyday";
import { resetMachine, useOS } from "./store";
import { useTeam } from "./team";
import type { TourKit } from "./tour";

const os = () => useOS.getState();
const lastRunHas = (f: (s: { status: string; tool?: { name: string } }) => boolean) => !!os().runs.find((r) => !r.parentId)?.steps.some(f);
const clearWindows = () => useOS.setState({ windows: [] });

/** Every line on screen, and what the narrator says for it. */
const L = {
  hello: ["Monday. Four chores you've been putting off.", "It's Monday, and there are four chores you've been putting off. Watch what happens when you just say them."],
  oneSentence: ["One sentence.", "One sentence."],
  tripDone: ["It read the booking email, planned your morning, and set the reminders.", "It found the booking email, planned your morning around the flight, and put the reminders on your list."],
  asksFirst: ["Anything other people will see, it asks first.", "Anything other people will see, it asks you first."],
  wings: ["A little helper keeps watching the flight, so you don't have to.", "And a little helper keeps watching the flight, so you don't have to."],
  compared: ["It compared this year's lease with last year's, line by line.", "It compared this year's lease with last year's, line by line, and found the catch: a new parking fee."],
  twoSaras: ["Two people named Sara. It asked instead of guessing.", "You know two people named Sara. So it asked, instead of guessing."],
  jobIntro: ["A job you like. Applying usually takes an hour.", "A job you like. Applying usually takes an hour."],
  tailored: ["Tailored resume and cover letter, in seconds.", "A tailored resume and cover letter, in seconds."],
  trap: ["The page tried to trick it into sending your passport. Blocked.", "But the page hid an instruction to send your passport. It was blocked. Only you can share that."],
  remembered: ["It remembered your accountant changed.", "It remembered your accountant changed to Marcus in May."],
  sorted: ["Twenty-three receipts found, named, sorted and added up.", "Twenty-three receipts, found, named, sorted, and added up."],
  private: ["Private stays private. Your therapy invoice never leaves.", "Private stays private. Marcus gets the totals, not your therapy invoice."],
  end: ["", "You said four sentences. SIOS did the rest, and asked before anything that mattered."],
} as const;

const SOUNDS_USED = ["click", "type", "whoosh", "ask", "done", "block", "send", "drop", "pet", "card", "finale", "plane", "paper", "shuffle", "total", "stamp", "bed-monday", "bed-trip", "bed-lease", "bed-job", "bed-taxes"];

export async function playEveryday(token: number, k: TourKit) {
  const useTour = k.store;
  const tour = () => useTour.getState();
  resetMachine();
  seedEveryday();
  useTeam.getState().set({ helpers: [], open: null, creating: false });
  useEveryday.getState().set({ form: "empty" });
  // the small, undoable things were allowed earlier this week; what matters still asks
  for (const tool of EVERYDAY_GRANTS) os().addLease({ tool, principal: "owner", kind: "session", expiresAt: null, usesLeft: null, goal: "earlier this week" });
  os().updateSettings({ showDetails: false });
  // the receipts would set off the "tidy your Downloads" suggestion; this story is about other chores
  useOS.setState({ suggestionDismissed: true });

  // the narrator and sounds are made once (then cached), so get them all before starting
  if (tour().sound) {
    useTour.setState({ preparing: { done: 0, of: 1 } });
    // a clip that doesn't load just stays quiet; the rest of the sound carries on
    await prepare(
      Object.values(L).map(([, v]) => v).filter(Boolean),
      SOUNDS_USED,
      (done, of) => useTour.setState({ preparing: { done, of } }),
    );
    useTour.setState({ preparing: null });
  }
  k.guard(token);
  const stopListening = listen();
  try {
    await play(token, k);
  } finally {
    stopListening();
  }
}

/** A sound for a moment in the story, when sound is on. */
const fx = (k: TourKit, name: string, volume = 0.55) => {
  if (k.store.getState().sound) void sfx(name, volume);
};

async function play(token: number, k: TourKit) {
  const say = (line: readonly [string, string]) => k.say(token, line[0], line[1]);
  const caption = (line: readonly [string, string]) => k.caption(token, line[0]);
  const has = (app: string) => os().windows.some((w) => w.app === app);

  // ---- Monday
  k.chapter(0);
  await k.scene(token, "bed-monday", 1800);
  await say(L.hello);

  // ---- a trip from one email
  k.chapter(1);
  await k.scene(token, "bed-trip");
  caption(L.oneSentence);
  await k.ask(token, "I'm flying to Boston Friday, sort it out.");
  await k.until(token, () => has("mail"), 15000);
  fx(k, "plane", 0.5);
  k.closePanel();
  await say(L.tripDone);
  await k.until(token, () => !!os().approval, 20000);
  await say(L.asksFirst);
  await k.approve(token, "Turn on");
  await k.until(token, k.ended, 20000);
  k.closePanel();
  clearWindows();
  await say(L.wings);

  // ---- the lease
  k.chapter(2);
  await k.scene(token, "bed-lease");
  await k.ask(token, "Check my lease renewal and ask Sara about anything odd.");
  await k.until(token, () => lastRunHas((s) => s.tool?.name === "files.read" && s.status !== "pending"), 15000);
  fx(k, "paper", 0.6);
  await k.until(token, () => has("compare"), 20000);
  fx(k, "paper", 0.5);
  k.closePanel();
  await say(L.compared);
  await k.until(token, () => !!os().approval, 20000);
  await say(L.twoSaras);
  await k.approve(token, "Sara Lee");
  await k.until(token, () => !!os().approval, 20000);
  await k.approve(token, "Send");
  await k.until(token, k.ended, 20000);
  k.closePanel();
  clearWindows();

  // ---- a job application, with a trap in the page
  k.chapter(3);
  await k.scene(token, "bed-job");
  os().openApp("browser", { url: "job" });
  await k.wait(token, 900);
  await say(L.jobIntro);
  await k.ask(token, "Apply to this job.");
  await k.wait(token, 1200);
  k.closePanel();
  caption(L.tailored);
  await k.until(token, () => useEveryday.getState().form === "filled", 30000);
  fx(k, "type", 0.4);
  await k.until(token, () => lastRunHas((s) => s.status === "blocked"), 30000);
  await say(L.trap);
  await k.until(token, () => !!os().approval, 20000);
  await k.approve(token, "Submit");
  await k.until(token, () => useEveryday.getState().form === "sent", 20000);
  fx(k, "stamp", 0.6);
  await k.until(token, k.ended, 20000);
  await k.wait(token, 1200);
  k.closePanel();
  clearWindows();

  // ---- taxes
  k.chapter(4);
  await k.scene(token, "bed-taxes");
  await k.ask(token, "Get my taxes ready for my accountant.");
  await k.wait(token, 1500);
  await say(L.remembered);
  k.closePanel();
  await k.until(token, () => !!os().fs["~/Documents/Taxes 2026"], 20000);
  fx(k, "shuffle", 0.6);
  await say(L.sorted);
  await k.until(token, () => (os().fs["~/Documents/Taxes 2026"] ?? []).some((x) => x.name === "Tax summary 2026.csv"), 20000);
  fx(k, "total", 0.55);
  await k.until(token, () => !!os().approval, 30000);
  await say(L.private);
  await k.approve(token, "Send to Marcus");
  await k.until(token, k.ended, 20000);
  await k.wait(token, 1000);
  k.closePanel();

  // ---- your week
  k.chapter(5);
  clearWindows();
  void music(null);
  await k.wait(token, 900);
  k.finish();
  fx(k, "finale", 0.6);
  await say(L.end);
  await k.wait(token, 4000);
  stopAll();
}
