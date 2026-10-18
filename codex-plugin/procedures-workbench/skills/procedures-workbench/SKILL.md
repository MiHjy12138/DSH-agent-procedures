---
name: procedures-workbench
description: Open the current project's local procedures experience library in Codex's in-app Browser. Use when the user asks to browse, view, or search project experience cards; this is a viewer, not an auto-capture or memory skill.
---

# Procedures Workbench

This plugin starts the local `procedures` workbench and opens it in Codex's
in-app Browser. It does not read the card library into context or modify cards.

## 1. Find the project root

Use the current task's working directory. If it is inside a Git repository,
prefer:

```text
git rev-parse --show-toplevel
```

The target project should contain, or be allowed to receive, a `procedures/`
directory.

## 2. Start the local workbench

Resolve the plugin root as the directory two levels above this `SKILL.md`
(the directory containing `.codex-plugin`). Then run:

```powershell
node "<plugin-root>\scripts\open.mjs" --workspace "<project-root>"
```

The script:

- creates the `procedures/` skeleton once if it does not exist;
- starts a detached local server on a free localhost port;
- reuses an already-running workbench for the same workspace;
- prints one JSON object containing `url`.

Do not start another server if the JSON says `"reused": true`.

## 3. Open it in Browser

Use the Codex Browser tool to navigate to the URL from the JSON output.
The workbench provides:

- project-scoped card list and search;
- Markdown card detail;
- inbox and audit;
- new/edit card operations inside the current project.

If the Browser tool is unavailable, give the user the URL and say the
workbench is running locally.

## 4. Stop when finished

If the user is done viewing and does not want the local server left running:

```powershell
node "<plugin-root>\scripts\stop.mjs" --workspace "<project-root>"
```

`stop.mjs` is scoped to the workspace; it does not kill other projects'
servers.

## Rules

- Viewing is read-only until the user explicitly asks to add or edit a card.
- Do not run this skill automatically after every task; only when the user
  wants to see the library.
- Do not copy card content into the conversation or a memory service.
- The init step is filesystem-only: no model call, no token cost.
