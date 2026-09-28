# AI integration

## Providers
- Local: llama.cpp server (systemd service, models in /var). Premium: 7B to 8B, 4-bit GGUF. Lite: ~1B for offline basics. Exact Premium model chosen after Phase 1 benchmarks.
- Cloud: Claude, ChatGPT, Gemini, later Meta's Muse (API availability unknown). All behind one provider plugin interface.
- Sign in with OAuth or paste an API key. Credentials are held by the broker, never by the model or brain-d.

## MCP in both directions (D6)
- **brain-d as MCP server**: Claude desktop, ChatGPT or a custom UI can drive the OS with the same tools and permissions as the local assistant.
- **brain-d as MCP client**: built-in tools (files, terminal, apps and windows, Vault memory), plus services and custom MCP servers added by URL.

## Reflex (fast decider, working name)
Inspired by Jev, a hosted "System One" decision model from TypeSafe AI (Sep 2026). We do not use Jev; we build our own locally (D11).

- Never writes text. Answers typed questions about a state:
  - choice: probability per option
  - score: 0 to 1
  - yes/no: probability
- **v1**: small local model via llama.cpp. Feed the state once (cached), ask each question against it, read the probabilities of the allowed options directly instead of generating text.
- **v2**: log every decision and user correction, train tiny calibrated classifiers on a small embedding model.
- **Rules**: code decides, using thresholds in a policy file (example: risk above 0.7 means ask the user). Reflex only picks from predefined options, which limits prompt injection damage.
- **First uses**: local-or-cloud routing, broker risk scoring, command bar intent, notification triage.
