# 09. Memory (Vault)

Vault is our existing local AI memory layer. It becomes the context engine.

## Jobs
- Capture: only what the user allows (never all keystrokes).
- Organize: people, projects, preferences, finances, personal life categories.
- Retrieve: token-optimized, only what a task needs; injected automatically by brain-d.
- Redact: strip personal details before any cloud call, following the privacy slider.
- Resolve: back `people.resolve` so "my team" becomes real Person records.

## Storage
Local database in the user's home. Encrypted at rest. Exportable and deletable by the user.

## Open items
- Merge Vault's current categories with shared types (Person, Event, File...).
- Decide what is captured automatically vs only on request.
