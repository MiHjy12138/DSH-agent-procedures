# Verification status

Confidence is not uniform across this repository. This file records what was actually run, what
was only read from source, and what is still a convention rather than a test.

Last checked: 2026-10-18.

## What was run

| Area | Result | Evidence |
|---|---|---|
| DSH headless read path | ✅ | A new `dsh headless` session, given only the symptom “200 but SPA shell”, searched `procedures/` and read `procedures/抓取-网页空壳.md` without a reminder. |
| Codex CLI read path | ✅ | Codex CLI in a scaffold project listed `procedures/` and `procedures/central/`, read `procedures/central/插件-pnpm版本不存在.md`, and answered from its preferred action. |
| Catalog lookup | ✅ | `find-procedures.mjs` returned the project card for a Helldivers 2 query and the central card for a pnpm query. |
| Project/central split | ✅ | A scaffold project containing a Helldivers 2-specific card kept it in `procedures/`; the central library did not contain the project card. |
| New-project scaffold | ✅ | `new-project.ps1` created `procedures/`, `procedures/central` junction, `PROJECT.md`, project scope blocks, and `.gitignore` entries. |
| POSIX/read-only hook updates | ✅ (text) | The installed hook contains both PowerShell and `grep -rl` examples, and a read-only inbox fallback. Upstream #1/#2 are still open. |

## What was not run

| Area | Status | Why |
|---|---|---|
| Claude Code session | ⏳ | The global and project `CLAUDE.md` hooks are installed, but no Claude session was available to run. |
| `tools/scan-sessions.mjs` on Codex/Claude | ❌ | Source requires DSH session files (`session.v4.jsonl.zstd` / `v3` / `session.jsonl.zstd`) and DSH event types. A Codex root returned no workspaces; a Claude root was not a DSH-shaped session root. |
| `tools/procedures-probe.mjs` on Codex/Claude | ❌ | Same DSH session reader and `tool/call` event assumption. |
| Hard data-loss prevention | ⚠️ convention | The hook and `Scope` headers tell the agent where data belongs; there is no scanner that can prove a table is project-specific. The central library is protected by review, the scope block, and the project/central split — not a security boundary. |

## Checks

The repository has no CI test suite. These are the reproducible checks:

```powershell
node scripts/build-catalog.mjs <workspace>
node scripts/find-procedures.mjs <workspace> "<symptom words>"
node --check scripts/build-catalog.mjs
node --check scripts/find-procedures.mjs
```

For a scaffold:

```powershell
pwsh -File scripts/new-project.ps1 -Path <workspace> -Name <slug> -Git
node scripts/build-catalog.mjs <workspace>
node scripts/find-procedures.mjs <workspace> "<symptom>"
```

## Source facts

- `tools/scan-sessions.mjs` hard-codes the three DSH session filenames, DSH session roots, and
  event types `tool/call`, `tool/result`, `user/message`, `assistant/message`.
- `tools/procedures-probe.mjs` uses the same reader and only treats `read`/`grep`/`ops_*` tool
  calls as hits by default.
- `tools/README.md` states that both scripts are DSH-specific optional attachments and that the
  core hook/cards do not depend on them.
- The upstream issues #1 and #2 cover POSIX examples and the read-only inbox conflict. This
  repository's local hook includes both fixes; upstream has not merged them.

## Known limits

- Scope is enforced by instructions and review, not by a mandatory linter.
- The central library is a local junction in each project; it is not committed to project repos.
- Project creation is a script entry (`new-project.ps1`) or an agent following the global hook;
  arbitrary filesystem creation is not watched.
- Card retrieval is keyword-based by default; for very large libraries, add an FTS/embedding
  top-k behind `find-procedures` rather than injecting the catalog.
