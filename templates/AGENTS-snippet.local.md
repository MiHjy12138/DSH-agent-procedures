# 经验流程（procedures）

各工作区 `procedures/` 存**踩过的坑与解法**，不常驻注入，按需读。项目库在 `procedures/`，中心库在 `procedures/central/`（若存在；否则用 `~/.agent-procedures/cards`）。

- **新会话先检查**：如果当前工作区是项目根（有 `.git` / `package.json` / `pyproject.toml` 等）且没有 `procedures/` 或 `procedures/central/`，先运行 `~/.agent-procedures/scripts/install-workspace.ps1 -Workspace <cwd> -Name <slug>`；不要在家目录/系统目录执行。执行不了就先把命令告诉用户，别假装已经创建。

- **动手前**：任务撞上「网页抓不到正文 / 插件改了不生效」这类现象，先**搜**触发词，别凭记忆答：
  拿任务里的现象词搜 `procedures/*.md`（含 `procedures/central/*.md`）。Windows PowerShell：
  `Get-ChildItem procedures -Recurse -Filter *.md | Select-String -Pattern "<现象词>"`；
  POSIX：`grep -rl "<现象词>" procedures/`。
  若 `procedures/catalog.jsonl` 存在，可先跑 `node ~/.agent-procedures/scripts/find-procedures.mjs . "<现象词>"` 取候选路径，再读命中卡。
  命中哪张 read 哪张；卡少或搜不动时，列目录看文件名挑卡，一样算数。

- **项目库 vs 中心库 —— 分类规则**：
  - `procedures/*.md`：**项目特定**经验（项目名、ID、哈希表、数据表、绝对路径、游戏/模组专属版本、只在这个 repo 成立的命令）。
  - `procedures/central/*.md`：**跨项目通用**经验（去掉项目标识后仍成立的坑）。
  - 不确定 → 先写项目库；第二个项目复发，再泛化到中心库。
  - **绝不把项目名、ID、哈希表、数据表、游戏/模组专属数据写进中心库。**

- **踩到坑的当时 —— 最重要的一条**：只要这次不是「照着卡做就顺了」，而是**又试错了几轮**，就立刻记一行：
  - 项目特定 → `procedures/_inbox.md`
  - 跨项目通用 → `procedures/central/_inbox.md`（没有链接就先写项目库）
  **别等收尾** —— 收尾要靠回忆，回忆不可靠；当下记，不会忘。**记一行也算数。**
  **记 inbox 是记笔记、不是"动手改文件"** —— 就算被要求「只读 / 先别动手」，也照记不误。

- **只读沙箱**：如果工作区禁止写 `_inbox.md`，不要反复重试；把该记的一行放进最终回复（或写到外部可写目录），并说明未能写入的原因。

- **收尾时（是检查，不是回忆）**：在说出「完成 / 搞定了 / 修好了」之前，看一眼两个 `_inbox.md`：
  - 有够格的（复发的 / 代价大的）→ 照 `_模板.md` 整理成正式卡，删掉那行 inbox。**文件名就是索引**：写成 `分类-现象`。
  - 项目特定的留项目库；通用的写中心库，并去掉项目标识。
  - 只是小意外 → 留在 inbox，下次开工再整理。

- **一张卡写四条**：触发条件 / 首选姿势 / 反面清单（试过不通的）/ 验证方式。项目数据表、哈希表只放项目文件，不塞卡里、不进中心库。

- **不扫描、不复制**：不做启动式全库扫描；检索一律**定向** —— 拿任务里的现象词去搜，命中几张读几张。

- **新建项目 / 缺少 procedures**：新项目用 `~/.agent-procedures/scripts/new-project.ps1`；已有工作区缺少 `procedures/` 或 `procedures/central/` 用 `~/.agent-procedures/scripts/install-workspace.ps1 -Workspace <path>`。
