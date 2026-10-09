# Why the SIOS structure holds up

An honest comparison with how other systems let AI use a computer. It covers where SIOS goes further, where it doesn't yet, and why the design should get more valuable, not less, as models improve.

Written October 2026. Descriptions of other products are based on what was publicly described as of mid-2026, and they change fast. Check them before quoting any of this to someone.

---

## The one-line version

Everyone else is building a better driver. SIOS is building the car: identity, brakes, seatbelts, a dashboard and a black box for AI, so any driver (any model) can be trusted with it.

A smarter model makes fewer mistakes. It doesn't make a computer safe to hand to five different AIs at once. That takes structure, and structure belongs in the OS.

---

## How AI uses computers today: four approaches

**1. Screen-driving agents.** The AI looks at screenshots and clicks, or drives a browser. OpenAI's agent mode, Anthropic's computer use and AI browsers work this way. This approach works with any app, but the agent acts *as you*: your logins, your files, your sessions. The system can't tell the agent's clicks from yours.

**2. Platform actions.** Apps publish typed actions that the system assistant can call: Apple's App Intents, Android's app functions, and Microsoft's App Actions and MCP support in Windows. These are typed and fast, which is the same idea as SIOS's tunnel. Permissions are mostly per app and per prompt, and the platform's own assistant is the main customer.

**3. Agent sandboxes.** The agent gets its own space: a separate account or workspace (Microsoft has described an agent workspace with its own account), or a cloud VM. This is good isolation. Inside the sandbox, though, the agent is mostly all or nothing.

**4. Developer agents.** Coding agents like Claude Code and Codex have permission modes, allow and deny lists per tool, and sandboxing. They're the most mature permission models today, but they cover one kind of work in one app.

Research is ahead of all four. Google DeepMind's CaMeL separates what the user asked for (control) from what the agent read (data). Microsoft's FIDES tracks information flow through agents. Capability-based security, where you hand over exactly the authority needed and nothing more, has been studied for decades. **SIOS didn't invent these ideas.** What it does is put them in the OS, enforced for every AI on the machine at once, and visible to a normal person.

---

## Side by side

"Partial" means some products do some of it. The SIOS column describes the simulation in this folder: the rules are real code, but they guard a simulated machine.

| Property | Screen agents | Platform actions | Agent sandboxes | Developer agents | SIOS (simulation) |
| --- | --- | --- | --- | --- | --- |
| Each AI has its own identity | No, it acts as you | Partial | Yes | Partial | Yes (principals) |
| Every action checked by one guard outside the model | No | Partial | At the boundary | Yes, in one app | Yes, 12 checks, with a trace |
| Trust that's earned and lost by behavior | No | No | No | No | Yes (levels 0 to 4) |
| Permissions that expire (once, an hour, a session) | No | Partial | No | Partial | Yes (leases) |
| Instructions from content can't become actions | Model's job | Model's job | Model's job | Partial | Structural: only your request can authorize |
| Data remembers where it came from (lineage) | No | No | No | No | Yes, labels flow into derived files |
| Data leaving the computer is checked against its sources | No | No | Partial (network rules) | Partial | Yes (Data check) |
| Handing a sub-task to another AI with less authority | No | No | No | Partial (sub-agents) | Yes (Slices) |
| Several agents (and you) don't collide on a file | No | No | Separate spaces | No | Yes (locks, wait your turn) |
| Goals have spending limits | No | No | No | Partial | Yes (Spend check) |
| Tamper-evident record of every decision | No | No | Partial | Partial | Yes (hash chain) |
| Undo across everything an AI did | No | No | Throw away the VM | Partial (git) | Yes, per goal, plus snapshots |
| Works with any model, local or online | Tied to the vendor | Tied to the platform | Varies | Tied to the vendor | Yes, the router picks |

---

## What only the structure can do

These are the things the board packet demo shows. None of them gets easier with a smarter model, because they aren't about intelligence. They're about authority.

1. **Authority goes down, never up.** When a goal hands work to Claude Desktop, it hands over a slice: one folder, two tools, no sending, one write. Claude Desktop can't do more than the goal that started it, however capable it is. A smart agent with too much authority is the dangerous kind.
2. **Data carries its history.** A summary of your budget is still budget data. SIOS labels it that way automatically, so the guard catches it when it tries to leave, even after passing through two AIs and a rewrite.
3. **Content is data, never instructions.** Only your request can authorize an action. A hidden line in a PDF can't, because the broker checks where the instruction came from, not how convincing it is. Better models resist injection better, but no model resists it every time. A structural rule does.
4. **Many agents, one machine.** Locks, budgets and per-agent trust are coordination problems. They grow with the *number* of agents, and the number of agents is going up.
5. **A record you can check.** When something goes wrong, you need to know which agent did what, under which permission, and that nobody edited the log afterwards.

---

## Where SIOS does not go further (yet)

Being honest about this is what makes the rest believable.

- **It's a simulation.** The broker is a TypeScript function guarding a pretend file system. The real version has to be a separate, locked-down service that the AI process can't bypass (decision D4). Nothing is proven until that exists.
- **Labels are coarse.** Lineage works per file: anything a goal reads taints everything it writes. That over-warns. Finer tracking (per field, per sentence) is research territory.
- **Labels must come from somewhere.** Today you set them, or they come from where a file came from (web, email). Labeling a whole home folder automatically, and getting it right, is unsolved.
- **Prompt fatigue.** More checks can mean more questions. Leases, slices and approving a plan once all help, but real users will show where the line is.
- **The big platforms own the apps.** Apple, Google and Microsoft control their app ecosystems and can ship permission features to billions of people. SIOS depends on MCP servers and Linux adapters (D-Bus, AT-SPI), which cover fewer apps.
- **Screen agents work everywhere today.** For an app with no tool, SIOS falls back to accessibility, which is slower and less reliable than a typed tool.
- **Trust scores can be gamed.** An agent could do many easy tasks to earn trust. Weighting by risk and decaying scores over time are open questions.

---

## Why this stays relevant as models improve

| As models get... | Screen-driving needs... | SIOS needs... |
| --- | --- | --- |
| Smarter | Less help, but still acts as you | Nothing new. The same rules hold a smarter driver. |
| Cheaper and more numerous | Nothing to stop them colliding | Already has identity, locks, budgets and slices |
| More autonomous (longer tasks) | Trust in one big leap | Earned trust, leases that expire, a budget per goal |
| Better at resisting injection | Still hopes for the best | Keeps a structural rule as the backstop |
| Local and private | Screenshots of everything | Typed tools and redaction, so less leaves the machine |

The test for anything we build: **would it still matter if the model were ten times better?** Identity, permissions, lineage, delegation, coordination, budgets, audit and undo pass that test. Clever prompting and hand-tuned click scripts don't.

---

## What would prove it

1. Build the real broker as its own service and point a real agent (Claude Code, or an MCP client) at it. Try to get around it.
2. Run the board packet goal on the bootable image with real files and a real mail account.
3. Red-team it: give the injected PDF to several models with and without the broker, and count the leaks.
4. Measure prompt fatigue: how many questions a normal day of tasks produces, before and after leases and plan approval.

> **In the preview:** run "Prepare the Q3 board packet and send it to the team", or watch the "One big goal" chapter in auto mode. `sios explain gmail.send` in the Terminal prints all 12 checks.
