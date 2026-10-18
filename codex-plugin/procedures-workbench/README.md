# Procedures Workbench (Codex plugin)

A local viewer for a project's `procedures/` experience cards.

## What it does

- Creates the `procedures/` skeleton once, if missing.
- Starts the local workbench on a free localhost port.
- Opens it in Codex's in-app Browser.

It does not read the library into context, call a model just to initialize it,
or write cards automatically.

## Use

Ask Codex to open the procedures workbench in the current project. The skill
runs `scripts/open.mjs`, then navigates Browser to the printed URL.

## Files

```text
.codex-plugin/plugin.json
skills/procedures-workbench/SKILL.md
scripts/open.mjs
scripts/stop.mjs
server.mjs
lib.mjs
init.mjs
public/
tools/
templates/
```
