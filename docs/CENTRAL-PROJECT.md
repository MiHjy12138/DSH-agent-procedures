# Project cards + central cards

This is the two-level card layout for `agent-procedures`. It separates what is true only inside
one repository/game/mod from what is reusable across projects.

## Layout

- `procedures/` — project-specific cards. They may contain project names, IDs, hash tables, data
  tables, absolute paths, game/mod versions, and commands that only hold in this repository.
- `procedures/central/` — a junction/symlink to the live shared library
  `~/.agent-procedures/cards`.
- `examples/cards/` — example cards and templates only; not the live central library.
- `procedures/catalog.jsonl` — optional generated lookup (one line per card: scope, path, title,
  trigger). It is derived, not a second hand-maintained library.

## Scope rule

- Project-specific → project `procedures/` only.
- General (still true after removing project identifiers) → `procedures/central/` only.
- Unsure → project first; promote to central after a second project hits the same pattern.
- **Never put project hash tables, data tables, IDs, or absolute paths into the central library.**
- A large table is data, not a card: keep it in the project's own files and point the card at it.

## Why two levels

A single global card directory mixes two different risks: project data leaking into a shared
library, and reusable patterns being buried under project-specific noise. The split makes the
write location explicit and keeps the central library safe to copy to another machine.

## Lookup

Cards are searched by symptom words in the project library and the central library. When the
catalog helper is present, it returns candidate paths only; the full library is never injected.
For very large libraries, add FTS/embeddings behind the same interface.

## Tools

`tools/scan-sessions.mjs`, `tools/procedures-probe.mjs`, `tools/procedures-audit.mjs`, and
`tools/procedures-review.mjs` remain **DSH-only optional attachments**. The card layout, the scope
rule, and the catalog format are harness-agnostic.
