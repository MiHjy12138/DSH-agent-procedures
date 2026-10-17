## 本项目（<PROJECT_NAME>）

- 项目库：`procedures/`；中心库：`procedures/central/`（junction → `~/.agent-procedures/cards`）。
- 项目特定（项目名、ID、哈希表、数据表、绝对路径、游戏/模组专属版本）只写项目库。
- 跨项目通用经验写 `procedures/central/_inbox.md`；不确定先写项目库，第二个项目复发再泛化。
- **绝不把本项目的哈希表/数据表/ID 写入中心库。**
- 完整 procedures 机制由全局 `AGENTS.md` / `CLAUDE.md` 提供；如果你的 harness 不读全局指令，运行 `install-workspace.ps1 -WithHook`，或把 `~/.agent-procedures/templates/AGENTS-snippet.local.md` 贴进项目指令文件。
