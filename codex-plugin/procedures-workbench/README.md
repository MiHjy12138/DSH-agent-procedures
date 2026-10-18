# Procedures Workbench (Codex MCP plugin)

A project-local viewer for `procedures/` experience cards, packaged as an MCP App.

## What it does

- `procedures_open` — opens the card browser for a project
- `procedures_list` — list cards
- `procedures_search` — search triggers, errors, commands, paths
- `procedures_get` — read one card
- `procedures_inbox` — list inbox lines
- `procedures_init` — create the skeleton once, idempotently

`mcp/mcp-app.html.br` is the MCP Apps side-panel UI. It connects to the
same MCP server with `ui/initialize` and calls `tools/call`, following the
pattern used by Codex Security.

Initialization is filesystem-only: no model call and no token cost.

## Project root

Tools accept an optional `project_root`. When omitted, the server uses
`CODEX_PROJECT_ROOT`, `CLAUDE_PROJECT_DIR`, `INIT_CWD`, then its cwd.

## Files

```text
.codex-plugin/plugin.json
.mcp.json
mcp/server.mjs
mcp/mcp-app.html
mcp/mcp-app.html.br
lib.mjs
init.mjs
tools/
templates/
```
