# DSH Agent Procedures

[English](README.md) / 简体中文

给 AI agent 用的文件化经验库。项目卡片只记录这个仓库、游戏或模组才知道的事；中心库只保留
去掉项目名之后仍然成立的坑。一条很小的钩子，让下一次会话在猜之前先搜。

这不是技能、记忆插件、数据库或 RAG。它只是 Markdown、一个触发约定，以及一个可选目录。

**正在创建新项目？** 运行 `scripts/new-project.ps1`。它会创建 `procedures/`、链接
`procedures/central/`、写入项目 scope 块，并把本地文件排除在 git 之外。

## 这是什么

Agent 会反复踩同一个坑：上下文会结束，文档只写正向流程，失败的尝试从来没有被记下来。这个仓库
给 agent 一个记录失败的地方，再用钩子让下一次会话先去找它。

单位是卡片：文件名像 `抓取-网页空壳`，`> 触发` 行用任务里真的会出现的词，正文有首选命令、
不能再试的死路，以及验证方式。卡片约 ≤2 KB，整张卡从不常驻注入；常驻的只有钩子。

卡片分两个作用域：

- `procedures/`：项目特定。
- `procedures/central/`：跨项目中心库（junction 到 `~/.agent-procedures/cards`）。

这个区分是故意的：绝地潜兵2的武器哈希表属于项目库；`pnpm` 可选依赖版本不存在属于中心库。

## 目录

| 路径 | 是什么 |
|---|---|
| `procedures/` | 项目卡片、`INDEX.md`、`_模板.md`、`PROJECT.md` |
| `procedures/central/` | 指向中心库的 junction |
| `procedures/catalog.jsonl` | 生成的检索表（title、scope、trigger、path）；不会整库注入 |
| `templates/AGENTS-snippet.local.md` | 完整钩子：搜索、scope、inbox、只读兜底、Windows/POSIX 示例 |
| `templates/PROJECT-scope.md` | 项目级 scope 短块 |
| `templates/CLASSIFY.md` | 写卡/维护期的分类与去重规则 |
| `scripts/new-project.ps1` | 新建项目库、中心链接、scope、`.gitignore` |
| `scripts/install-workspace.ps1` | 给已有工作区补同样的结构；`-WithHook` 用于只读项目级指令的 harness |
| `scripts/build-catalog.mjs` | 生成 `procedures/catalog.jsonl` |
| `scripts/find-procedures.mjs` | 搜索 catalog，只返回候选卡路径 |
| `scripts/install-local.mjs` | 安装 DSH/Codex/Claude 全局钩子，并初始化一个工作区 |
| `scripts/update-global-hooks.mjs` | 只更新全局钩子块 |
| `cards/` | 中心通用库（本仓库） |
| `tools/` | 可选的 DSH 专用附件：会话挖掘和触发探针 |
| `docs/` | 验证状态、项目/中心库设计、保留的上游方法论 |

## 快速开始

把中心库克隆到脚本期望的位置：

```powershell
git clone https://github.com/MiHjy12138/DSH-agent-procedures.git ~/.agent-procedures
```

完整机制放在各 harness 的全局钩子里。安装全局钩子并初始化一个工作区：

```powershell
node ~/.agent-procedures/scripts/install-local.mjs <workspace> <name>
```

从零创建新项目：

```powershell
pwsh -File ~/.agent-procedures/scripts/new-project.ps1 `
  -Path <project-path> -Name <slug> -Git
```

已有项目：

```powershell
pwsh -File ~/.agent-procedures/scripts/install-workspace.ps1 `
  -Workspace <project-path> -Name <slug>
```

如果某个 harness 只读项目级指令：

```powershell
pwsh -File ~/.agent-procedures/scripts/install-workspace.ps1 `
  -Workspace <project-path> -Name <slug> -WithHook
```

或者把 `templates/AGENTS-snippet.local.md` 贴进该 harness 的 `AGENTS.md` / `CLAUDE.md` 等价文件。
全局钩子文件是 `~/.dsh/AGENTS.md`、`~/.codex/AGENTS.md`、`~/.claude/CLAUDE.md`。

`new-project` / `install-workspace` 只负责建项目库和链接，不会监听文件系统；任意 `mkdir`
不会自动触发。项目创建走脚本，或走一个遵守全局钩子的 agent。

## 作用域：项目库 vs 中心库

| 位置 | 放什么 | 例子 |
|---|---|---|
| 项目 `procedures/` | 依赖本仓库、游戏、模组、版本或绝对路径的事实和失败 | 游戏/模组 ID、哈希表、数据表、加载器版本、本地路径、一次性命令 |
| 中心 `procedures/central/` | 去掉项目名之后仍然成立的模式 | 工具链错误、pnpm/lockfile 行为、DSH/Codex 安装、Windows/POSIX 差异 |

规则：

- 不确定 → 先写项目库。
- 第二个项目也踩到同一个模式，再泛化到中心库。
- **绝不把项目的哈希表、数据表、ID、绝对路径写进中心库。**
- 大表是数据，不是卡：放项目文档，卡里只放指针。

Scope 是钩子 + 复查共同维持的约定，不是数据防丢墙。分类细节见 `templates/CLASSIFY.md`。

## Agent 怎么用

0. **新项目根目录？** 如果 `procedures/` 或 `procedures/central/` 不存在，先运行
   `install-workspace.ps1`（沙箱拦住了就把准确命令告诉用户）。不要假装库已经存在。
1. **动手前**：拿任务里的现象词，搜 `procedures/` 和 `procedures/central/`。Windows PowerShell：
   `Get-ChildItem procedures -Recurse -Filter *.md | Select-String -Pattern "<现象词>"`；
   POSIX：`grep -rl "<现象词>" procedures/`。
2. 如果有 `procedures/catalog.jsonl`，运行
   `node scripts/find-procedures.mjs <workspace> "<现象词>"` 拿候选路径，只读命中的卡。
3. **踩到坑时**：项目特定写 `procedures/_inbox.md`，通用写
   `procedures/central/_inbox.md`。只读沙箱写不进去时，把这一行放进最终回复并说明。
4. **收尾时**：检查两个 inbox，把够格的整理成卡，用 catalog 去重，删掉已消费的 inbox 行。
   不做启动式全库扫描，不整库注入。

`new-project.ps1` 生成的项目级 scope 块只写项目名和中心链接；完整的搜索/记录钩子在全局
harness 文件里。

## 检查

目前没有 CI 测试套件。以下是可复现的检查：

```powershell
node scripts/build-catalog.mjs <workspace>
node scripts/find-procedures.mjs <workspace> "<现象词>"
node --check scripts/build-catalog.mjs
node --check scripts/find-procedures.mjs
```

`find-procedures` 只返回路径，不返回整库；catalog 由卡片标题、scope 和 `> 触发` 行生成。

## 已验证

| 范围 | 状态 | 证据 |
|---|---|---|
| DSH headless | ✅ | 新 headless 会话在没有提醒的情况下搜索并读取了 `procedures/抓取-网页空壳.md` |
| Codex CLI | ✅ | Codex 在脚手架项目里读取了 `procedures/central/插件-pnpm版本不存在.md`，并按卡回答 |
| Claude Code | ⏳ | 全局和项目 `CLAUDE.md` 钩子已写入；本机未跑 Claude 会话 |
| 项目/中心分离 | ✅ | 含绝地潜兵2特定卡的脚手架项目，卡只在项目库；中心库保持干净 |
| Catalog 检索 | ✅ | HD2 查询返回项目卡；pnpm 查询返回中心卡 |
| 空白项目 + 新会话 | ❌ 不自动 | Codex 看到了全局钩子并尝试初始化，但 shell 启动被系统拒绝（`CreateProcessAsUserW` error 5）；它只完成了文件任务，没有建库。要走 `new-project.ps1` 或宿主钩子 |
| `tools/` | ⚠️ 仅 DSH | `scan-sessions.mjs` / `procedures-probe.mjs` 依赖 DSH 会话日志；默认读不了 Codex/Claude |
| 上游 issue | ⚠️ | 上游 #1/#2 涉及 POSIX 命令和只读 inbox；本仓库已包含这两个修复；尚未向上游开 PR |

细节与已知限制：[`docs/VERIFICATION.md`](docs/VERIFICATION.md)。

## 约定

- 卡 ≤ ~2 KB；文件名 = `分类-现象`；`> 触发` 行用任务里会出现的词；四段：触发、首选、死路、验证。
- 项目数据只放项目库；中心库永远不放项目数据。
- 钩子是唯一常驻物；卡按需读。不做启动扫描，不整库注入，不注册一个把全库列进 schema 的工具。
- DSH `tools/` 是可选项；没有它们，卡片、钩子、catalog 和 finder 照常工作。

## 上游与来源

核心卡片/钩子机制、模板和 DSH 工具来自
[`MiHjy12138/DSH-agent-procedures`](https://github.com/MiHjy12138/DSH-agent-procedures)，MIT。
本仓库增加项目/中心库、scope 钩子、POSIX 与只读修复、catalog/finder，以及项目初始化脚本。
原始完整中文方法论保留在 [`METHODOLOGY_cn.md`](METHODOLOGY_cn.md)。

各 harness 的置信度不同；见上面的验证表。报告结果时请写明 harness、版本，以及钩子是全局加载
还是只在项目文件里。

## License

MIT
