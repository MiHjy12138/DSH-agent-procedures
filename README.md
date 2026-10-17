# DSH Agent Procedures

English / [简体中文](README_cn.md)

A file-based experience library for AI agents. Project-local cards hold what only this
repository, game or mod knows; a shared central library holds what survives removing the project
name. One small hook makes the next session search the symptom before it guesses.

This is not a skill, a memory plugin, a database, or RAG. It is Markdown, a trigger convention,
and an optional catalog — nothing that needs an API or a service.

**Creating a project?** Run `scripts/new-project.ps1`. It creates `procedures/`, links
`procedures/central/`, writes the project scope block, and ignores local-only files.

## What this is

Agents repeat the same failure because context ends, documentation describes the happy path, and
the failed attempts were never written down. This repository gives the agent a place to write the
failure down and a hook that makes the next session look for it.

The unit is a card: a filename like `抓取-网页空壳`, a `> 触发` line written in the words a task
will actually contain, a preferred command, the dead ends that must not be retried, and a
verification check. Cards are at most ~2 KB. Full card bodies are never injected; the hook is the
only always-on thing.

Cards live at two scopes:

- `procedures/` — project-specific.
- `procedures/central/` — shared general library (a junction to `~/.agent-procedures/cards`).

The distinction is deliberate: a Helldivers 2 weapon hash table belongs in the project library; a
`pnpm` optional-dependency failure belongs in the central library.

## Layout

| Path | What it is |
|---|---|
| `procedures/` | Project cards, `INDEX.md`, `_模板.md`, `PROJECT.md` |
| `procedures/central/` | Junction to the shared general library |
| `procedures/catalog.jsonl` | Generated lookup (title, scope, trigger, path); not injected wholesale |
| `templates/AGENTS-snippet.local.md` | Full hook: search, scope, inbox, read-only fallback, Windows/POSIX examples |
| `templates/PROJECT-scope.md` | Short project-level scope block |
| `templates/CLASSIFY.md` | Classification and dedup rules for write/maintenance time |
| `scripts/new-project.ps1` | Create a project library, central junction, scope block, `.gitignore` |
| `scripts/install-workspace.ps1` | Add the same to an existing workspace; `-WithHook` for harnesses that only read project files |
| `scripts/build-catalog.mjs` | Build `procedures/catalog.jsonl` |
| `scripts/find-procedures.mjs` | Search the catalog and return candidate card paths |
| `scripts/install-local.mjs` | Install the full global hooks for DSH/Codex/Claude and bootstrap one workspace |
| `scripts/update-global-hooks.mjs` | Update the global hook blocks only |
| `cards/` | The central general library (this repository) |
| `tools/` | Optional DSH-only attachments: session mining and a trigger probe |
| `docs/` | Verification, the central/project design, and the preserved upstream methodology |

## Quick start

Clone the central library to the path the scripts expect:

```powershell
git clone https://github.com/MiHjy12138/DSH-agent-procedures.git ~/.agent-procedures
```

The full mechanism lives in global harness hooks. Install them and bootstrap a workspace:

```powershell
node ~/.agent-procedures/scripts/install-local.mjs <workspace> <name>
```

New project from scratch:

```powershell
pwsh -File ~/.agent-procedures/scripts/new-project.ps1 `
  -Path <project-path> -Name <slug> -Git
```

Existing project:

```powershell
pwsh -File ~/.agent-procedures/scripts/install-workspace.ps1 `
  -Workspace <project-path> -Name <slug>
```

If a harness reads only project-level instructions:

```powershell
pwsh -File ~/.agent-procedures/scripts/install-workspace.ps1 `
  -Workspace <project-path> -Name <slug> -WithHook
```

Or paste `templates/AGENTS-snippet.local.md` into that harness's `AGENTS.md` / `CLAUDE.md`
equivalent. The global hook files are `~/.dsh/AGENTS.md`, `~/.codex/AGENTS.md`, and
`~/.claude/CLAUDE.md`.

The `new-project`/`install-workspace` scripts create the project card library and the junction;
they do not watch the filesystem. An arbitrary `mkdir` is not intercepted — project creation goes
through the script, or through an agent that follows the global hook.

## Scope: project vs central

| Where | Holds | Examples |
|---|---|---|
| Project `procedures/` | Facts and failures that depend on this repository, game, mod, version or absolute path | Game/mod IDs, hash tables, data tables, loader versions, local paths, one-off commands |
| Central `procedures/central/` | Patterns that stay true after removing the project name | Toolchain failures, pnpm/lockfile behaviour, DSH/Codex installation, Windows/POSIX differences |

Rules:

- Unsure → project first.
- Promote to central only after a second project hits the same pattern.
- **Never put a project's hash table, data table, IDs, or absolute paths into the central library.**
- A large table is data, not a card: keep it in the project's docs and point the card at it.

Scope is a convention enforced by the hook and review; it is not a data-loss firewall. The
classification prompt in `templates/CLASSIFY.md` is the maintenance procedure.

## How an agent uses it

1. **Before acting**, take the symptom words from the task and search `procedures/` plus
   `procedures/central/`. Windows PowerShell:
   `Get-ChildItem procedures -Recurse -Filter *.md | Select-String -Pattern "<symptom>"`.
   POSIX: `grep -rl "<symptom>" procedures/`.
2. If `procedures/catalog.jsonl` exists, `node scripts/find-procedures.mjs <workspace> "<symptom>"`
   returns candidate paths. Read only the hits.
3. **On a real failure**, write one line to the correct `_inbox.md` — project-specific to
   `procedures/_inbox.md`, general to `procedures/central/_inbox.md`. If the sandbox is read-only,
   put the line in the final response and say it was not written.
4. **At wrap-up**, check both inboxes, turn qualifying lines into cards, deduplicate against the
   catalog, and delete the consumed lines. No startup scan; no full-library injection.

A short project-level scope block (generated by `new-project.ps1`) names the project and points to
the central junction; the full search/record hook lives in the global harness files.

## Checks

There is no CI test suite yet. These are the reproducible checks:

```powershell
node scripts/build-catalog.mjs <workspace>
node scripts/find-procedures.mjs <workspace> "<symptom words>"
node --check scripts/build-catalog.mjs
node --check scripts/find-procedures.mjs
```

`find-procedures` returns paths only; it never returns the whole library. The catalog is generated
from card titles, scopes and `> 触发` lines.

## Verified

| Area | Status | Evidence |
|---|---|---|
| DSH headless | ✅ | A new headless session searched and read `procedures/抓取-网页空壳.md` without a reminder. |
| Codex CLI | ✅ | Codex read `procedures/central/插件-pnpm版本不存在.md` in a scaffold project and answered from the card. |
| Claude Code | ⏳ | Global and project `CLAUDE.md` hooks are installed; no Claude session was run on this machine. |
| Project/central split | ✅ | A scaffold project with a Helldivers 2-specific card kept it project-local; the central library stayed clean. |
| Catalog lookup | ✅ | `find-procedures` returned the project card for a HD2 query and the central card for a pnpm query. |
| `tools/` | ⚠️ DSH-only | `scan-sessions.mjs` / `procedures-probe.mjs` depend on DSH session logs; they do not read Codex/Claude logs out of the box. |
| Upstream issues | ⚠️ | Upstream #1/#2 cover POSIX commands and read-only inbox behaviour; this repository includes both fixes. No upstream PR yet. |

Details and known limits: [`docs/VERIFICATION.md`](docs/VERIFICATION.md).

## Conventions

- Card ≤ ~2 KB; filename = `category-phenomenon`; the `> 触发` line uses the words a task will
  contain; four parts: trigger, preferred action, dead ends, verification.
- Project data stays in the project library; the central library never carries project data.
- The hook is the only always-on artifact. Cards are read on demand. No startup scan, no full
  catalog injection, no tool that lists the library in its schema.
- The DSH `tools/` are optional. The cards, hook, catalog and finder work without them.

## Upstream and provenance

The core card/hook mechanism, templates and DSH tools come from
[`MiHjy12138/DSH-agent-procedures`](https://github.com/MiHjy12138/DSH-agent-procedures), MIT.
This repository adds project/central libraries, the scope hook, the POSIX and read-only fixes, the
catalog/finder, and the project bootstrap scripts. The full original Chinese methodology is
preserved at [`METHODOLOGY_cn.md`](METHODOLOGY_cn.md).

Confidence is not uniform: see the verification table above. If you report a result, name the
harness, version and whether the hook was loaded globally or only in the project file.

## License

MIT
