# 03. The brain (brain-d)

## Principle
The model suggests; the OS enforces. brain-d surrounds any model with structure so even small models succeed.

## Request flow
1. Request arrives (command bar, voice, external AI via MCP, phone).
2. Context injection: brain-d automatically adds relevant Vault memory and a system state snapshot. The model does not have to remember to look.
3. Reflex classifies: which area (files, network, email...), how hard, how risky.
4. Recipe check: if a saved recipe matches, run it without big-model planning.
5. Tool filtering: load only the tools for the relevant area(s).
6. Router picks a model: local for everyday tasks, cloud for hard reasoning (with consent and redaction).
7. Model proposes one step at a time. Output is constrained to valid tool names and schemas.
8. Broker approves or blocks; snapshot taken automatically before irreversible changes.
9. Tool runs; result includes the new state (built-in verification).
10. Loop guard: same failure twice, stop and escalate (cloud model or ask the user).
11. Done: summary to user, activity timeline entry, recipe saved if new and successful.

## Components
| Component | Job |
| --- | --- |
| Orchestrator | Runs the flow above, tracks long tasks and background jobs |
| Router | Chooses local, cloud or home brain per task |
| Reflex | Fast typed decisions (choice, score, yes/no) with probabilities; never writes text |
| Context injector | Pulls Vault memory and system state into every request |
| Planner interface | Talks to whichever model is chosen; enforces constrained output |
| Recipe engine | Stores, matches and runs known workflows |
| Loop guard | Detects repeated failures and escalates |

## Models
- Local (Premium): 7B to 8B instruct model, 4-bit GGUF, via llama.cpp.
- Local (Lite): ~1B model for Reflex, routing, offline basics.
- Cloud: Claude, OpenAI, Gemini as plugins behind one interface.
- Home brain (later): a user's desktop GPU serving a larger model over the home network.
- All models are interchangeable. Better models get swapped in with no design change.

## Reflex (fast decider)
Inspired by Jev (TypeSafe AI). Answers typed questions about a state:
| Type | Example | Answer |
| --- | --- | --- |
| Choice | Which area is this request about? | probability per option |
| Score | How risky is this action? | 0 to 1 |
| Yes/no | Worth interrupting the user? | probability of yes |
v1 runs on the local model: state cached once, read option probabilities directly, no generation.
v2 (later): tiny trained classifiers, calibrated.
Code applies thresholds from a policy file. Reflex only supplies numbers and can only pick predefined options.

## Routing rules (defaults, user can change)
- Local: settings, files, network, app control, short summaries, short drafts, anything private.
- Cloud: long writing, complex multi-app planning, coding, research. Always with consent (per request or standing rule) and Vault redaction.
- Offline: local only, and the user is told if a task needs cloud.

## Recipes
A recipe is a named, parameterized list of tool calls that worked before. Saved automatically after success (user can review). Shareable later.
Example: "thank commenters" = linkedin.get_post_comments -> people.resolve -> gmail.draft per person -> approval -> gmail.send.

## Fine-tuning (later, optional)
LoRA fine-tune the local model on our tool catalog and habits once real usage data exists. Never fine-tune to memorize commands or facts; those live in tools and the docs library.
