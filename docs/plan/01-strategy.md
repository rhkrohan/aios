# 01. Strategy

## Core bet
Models will keep getting cheaper and smarter. We cannot out-build AI labs on intelligence. Nobody owns the "body" AI uses on a personal computer. We build the best body.
The model is the driver. We build the car. Every better driver makes our car better.

## Where the value comes from
Intelligence = model + hands (tools) + eyes (state, accessibility) + memory (Vault) + guardrails (broker).
A model inside our OS can do more than the same model in a chat window, because the OS does the hard parts.

## Competitive landscape (Sep 2026)
| Product | Where the agent runs | Controls your local computer | Model choice |
| --- | --- | --- | --- |
| Meta Muse | Per-user cloud VM | No (web and connectors) | Meta only |
| Claude Cowork | Desktop app + sandbox VM | Local folders | Claude only |
| ChatGPT Work / Operator | OpenAI cloud | Limited | OpenAI only |
| Vellum, Jan.ai, AnythingLLM | App on your OS | Partly | Many |
| Us | The OS itself | Yes, whole system | Any |

## Our moat
1. OS-level access: apps, files, settings, windows. Cloud agents and chat apps cannot reach these.
2. Neutrality: any model, local or cloud, same tools and permissions.
3. Shared types: our standard Person, File, Event, Message types let different MCPs and apps work together.
4. Trust: permission broker, undo, activity timeline, local-first privacy.
5. Recipes: workflows that get saved and reused, so the system improves with use regardless of model.

## Muse lessons to adopt
Agent runs unprivileged, a separate supervisor gates actions and network, credentials never visible to the model, taint tracking after reading untrusted content, human approval for irreversible actions.

## Business model (draft)
- Open source core OS.
- Paid: Premium features (advanced recipes, sync across devices, managed cloud model access, home brain setup), business edition with admin policies and audit.
- Curated tool and adapter catalog ("app store for AI tools") as a later revenue line.
