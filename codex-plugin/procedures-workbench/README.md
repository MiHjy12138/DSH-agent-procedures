# Procedures Workbench (Codex MCP plugin)

A project-local viewer for `procedures/` experience cards, exposed as MCP tools.

## What it does

- `procedures_list` — list cards in the current project
- `procedures_search` — search triggers, errors, commands, paths
- `procedures_get` — read one card
- `procedures_inbox` — list inbox lines
- `procedures_init` — create the skeleton once, idempotently

Initialization is filesystem-only: no model call and no token cost.
The plugin does not start a browser or open a UI.

## Project root

Tools accept an optional `project_root`. When omitted, the server uses
`CODEX_PROJECT_ROOT`, `CLAUDE_PROJECT_DIR`, `INIT_CWD`, then its cwd.

## Files

```text
.codex-plugin/plugin.json
.mcp.json
mcp/server.mjs
lib.mjs
init.mjs
tools/
templates/
```
