# Optional Codex native procedure library

This optional Windows integration opens existing Markdown procedure cards in Codex. It is maintained by **Puipipi**. Installing the main repository does not install or enable it.

Open a conversation's **Show tabs → New tab → More tools → 经验卡** entry to select that conversation's project. The global sidebar entry is a general browser; it does not identify the conversation you were previously viewing. A newly opened conversation panel returns to its source project after a manual selection. Refreshing an existing panel preserves its manual selection.

The panel supports searching, plain-text reading, central/project switching, opening the selected directory and confirmed Windows Recycle Bin deletion. It has no background scanner, SessionStart hook, automatic card capture or automatic library creation. Every tool, including the opening tool, is app-only: no card catalog or read-card tool is registered for the model.

## Install or remove

Requires Windows, Node.js 22+ with `node:sqlite`, Windows PowerShell and a Codex build supporting native MCP App entrypoints. From the repository root:

```powershell
codex plugin marketplace add ./integrations/codex-library
codex plugin add procedure-library@procedure-library-local
```

After upgrading or rebinding an existing marketplace, restart Codex yourself, then open the conversation-native entry again. Refreshing the marketplace does not reload MCP processes already running in existing sessions. The plugin does not close or restart Codex automatically.

Remove with `codex plugin remove procedure-library@procedure-library-local` and `codex plugin marketplace remove procedure-library-local`. Removal preserves cards and the explicitly selected project setting. No Codex application files, permissions or profiles are replaced.

## Storage and selection

The central library is `$CODEX_HOME/procedures`, defaulting to `~/.codex/procedures`. Project libraries are `<project-root>/procedures`. A state request reads Codex project registrations and uses the host-provided `_meta.threadId` (or `thread_id`): first an exact project assignment, otherwise an exact read-only SQLite `threads.id → cwd` lookup. It never reads conversation bodies or guesses from recent activity, titles or environment thread IDs. These local metadata formats are version-sensitive; see [VALIDATION.md](VALIDATION.md).

The dropdown contains projects with real libraries and, as its only missing-library exception, the current source project. A missing source remains selected and offers **Create project library**. Only that explicit click creates an empty directory, with source-root and displayed-path checks. Existing valid libraries are preserved; files and junctions at that path are rejected. Other manually selected projects require an existing library. No templates or audit tools are duplicated.

Reading and searching happen on user opening, refreshing, searching or selecting a card. Card content is rendered with `textContent`; Markdown is not executed. Recycle requires confirming the displayed path and uses the Windows Recycle Bin without a permanent-delete fallback.

## Develop and validate

From this directory:

```powershell
python build-ui.py
node --test tests/server.test.mjs tests/source-context.test.mjs tests/initialize.test.mjs tests/resource-compat.test.mjs
node tests/ui-harness.mjs
node tests/bounded-size-harness.mjs
node tests/compact-ui-harness.mjs
python tests/package.py
node tests/marketplace.mjs
```

Browser tests require Chrome; set `CHROME_PATH` if it is not installed at the standard Windows location. All test projects, settings and browser profiles are generated under ignored `.test-output/`. The Recycle Bin test moves only its own generated card. The marketplace test installs and removes only this component in a fresh temporary CLI home, compares all cached runtime hashes and removes that home afterward; it never starts Codex or copies authentication. No test uses a real card library. Python is needed only for asset bundling and packaging; the runtime has no third-party dependencies.

## Relationship to the earlier proposal

Follow-up to [PR #7](https://github.com/MiHjy12138/DSH-agent-procedures/pull/7), whose combined workbench/client integration the maintainer declined. This proposal contains a single opt-in Codex subtree with app-only tools, maintained by Puipipi. It omits the web workbench, DSH plugin, duplicated audit/templates and hooks, and preserves the main tools and default installation behavior.

The runtime originated in Puipipi's local `procedure-library` 0.1.6 implementation. Candidate 0.1.7 restricts the opening tool to app-only and removes its private initialization-helper dependency. It contains no vendor application code. Licensed under this repository's [MIT license](../../LICENSE).
