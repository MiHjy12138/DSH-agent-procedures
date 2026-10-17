# Project cards + central cards

This repository adds a **two-level experience library** on top of the upstream `agent-procedures` mechanism:

- `procedures/` — project-specific cards (project/game/mod IDs, hash tables, data tables, absolute paths, versions).
- `procedures/central/` — a junction/symlink to the shared general library (`~/.agent-procedures/cards`).
- `procedures/catalog.jsonl` — generated lookup; not injected wholesale.
- `templates/AGENTS-snippet.local.md` — the full hook (project/central search + scope + POSIX/Windows examples).
- `templates/PROJECT-scope.md` — the short project-level scope block.
- `templates/CLASSIFY.md` — classification/dedup rules for write/maintenance time.

## Scope rule

- Project-specific → project `procedures/` only.
- General (still true after removing project identifiers) → `procedures/central/` only.
- Unsure → project first; promote to central after a second project hits it.
- **Never put project hash tables/data tables/IDs into the central library.**

## Create a project

```powershell
pwsh -File scripts/new-project.ps1 -Path <project-path> -Name <slug> -Git
```

The full mechanism comes from global harness hooks (DSH/Codex/Claude). For harnesses that only read project-level files, add `-WithHook`.

## Lookup

```powershell
node scripts/build-catalog.mjs <workspace>
node scripts/find-procedures.mjs <workspace> "<symptom words>"
```

`find-procedures` returns candidate paths only; read only the hits. For large libraries, add FTS/embeddings behind the same interface.

## Tools

`tools/scan-sessions.mjs` and `tools/procedures-probe.mjs` remain **DSH-only optional attachments**. The cards/mechanism and the catalog helpers are harness-agnostic.
