# Validation

## Observed native behavior: installed 0.1.7

On Windows with official Codex **26.1111.2228.0** and plugin **0.1.7**, native acceptance after a user-initiated Codex restart confirmed:

- The conversation-native entry, Show tabs → New tab → More tools → 经验卡, opened the panel.
- Project A and project B selected their respective source projects; A → B → A worked. The library-bearing test project displayed all four cards.
- After manually selecting B inside A using the native dropdown and keyboard, closing only the panel tab and opening a new panel in the same conversation restored A and its source-project indicator.
- A source project without a library remained selected, displayed a missing-library message and an explicit create button, and did not switch to another project or create a library automatically.
- UI Automation observed the source indicator, two library-bearing projects and the missing source project in the dropdown, with no unrelated missing-library projects.
- The current host's model-visible tool registry contained no procedure-library namespace. All seven observed MCP server processes used the 0.1.7 cache directory, whose plugin manifest reported 0.1.7.

This verifies the app-only entry and source-following behavior on the stated Codex build. Earlier 0.1.6 native observations also covered a short period of stable panel height. Screenshots containing private conversations and local paths are not published. No real library/card was created or removed during native acceptance; create-library and Recycle Bin operations are covered by generated fixtures below.

### Upgrade and running connections

The official CLI upgraded only this installed plugin from 0.1.6 to 0.1.7. All eight cached runtime files matched the candidate disk files; their text matched Git HEAD after accounting for line endings. Before the user restarted Codex, existing MCP processes still ran from the 0.1.6 cache and the new panel URI did not open. After the user restarted, the observed processes used 0.1.7 and the native scenarios above passed. Marketplace refresh alone did not replace those running connections. The plugin did not close or restart Codex.

## Candidate 0.1.7

The source-following logic is retained from 0.1.6. This version changes opening-tool visibility from model/app to app-only and replaces a private central initialization helper with explicit, guarded empty-directory creation.

Synthetic tests cover per-request trusted metadata, exact read-only SQLite fallback, longest matching project root, saved selection precedence, missing-source filtering, initialization guards/idempotence, upstream metadata-file exclusion from listing/reading/recycling, protocol/resource compatibility, plain-text rendering, search, UI selection and bounded sizing. A real Windows Recycle Bin test operates solely on a generated fixture. Browser tests use a local synthetic MCP bridge and do not substitute for native Codex acceptance.

Run the commands in [README.md](README.md#develop-and-validate). Fixture directories and raw local outputs remain ignored under `.test-output/`; only aggregate outcomes are recorded here. Packaging checks the manifest/runtime/UI version, all-tools app-only visibility, source syntax and a fixed source-file archive allowlist. It does not install or start Codex.

### Candidate results (Windows / Node.js 24.16.0)

| Check | Result |
| --- | --- |
| Asset build | exit 0 |
| Four Node test files | 11 passed, 0 failed; exit 0 |
| Iframe UI interaction | exit 0 |
| Bounded sizing (390/600/1040px, 12 feedback rounds each and mode transitions) | exit 0 |
| Compact UI (three widths × three locales) | exit 0 |
| Fixed-allowlist source ZIP | 12 files, syntax/version/app-only checks passed; exit 0 |
| CLI local marketplace add/install/list/cache hashes/remove (source and extracted ZIP, fresh temporary homes) | 8 cached files matched for each; exit 0 |
| Same-name 0.1.6 → 0.1.7 upgrade and rollback fixture | passed |
| Native 0.1.7 after user restart | entry, A/B/A, manual-selection reopening, missing-source behavior and model tool visibility passed |

The initial UI harness run still expected the old version string and failed; it was updated to use the runtime version and passed. The initial CLI fixture expected JSON from the uninstall command, which returns plain text; its parser was corrected and the complete fixture passed. These were test-harness issues, not native GUI observations.
