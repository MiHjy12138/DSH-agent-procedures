# 经验分类 / 去重（维护期，不是每次任务）

这是给 agent 在**写卡/整理 inbox**时用的提示，不要在每个任务开头跑一遍。

## 输入

- `procedures/_inbox.md`（项目特定）
- `procedures/central/_inbox.md`（通用）
- `procedures/catalog.jsonl`（一行一张：scope / file / title / trigger）
- 需要整理的卡/现象

## 判断

1. **General**：去掉项目名、ID、哈希表、数据表、绝对路径、游戏/模组专属版本后，别的项目还会踩到。
   - 写 `procedures/central/`，`Scope: general`。
   - 去掉所有项目标识；保留触发条件、首选、反面清单、验证。
2. **Project-specific**：依赖本项目/游戏/模组的数据、ID、路径、版本、命令。
   - 写项目 `procedures/`，`Scope: project:<slug>`。
   - 大表/哈希表放项目数据文件，卡里只放指针。
3. **不确定**：先写项目库；第二个项目复发再把模式泛化到中心库。
4. **重复**：先搜 catalog 的 title/trigger；同一现象只保留一张，合并触发词，删掉重复。

## 中心库红线

- 绝不写项目名、ID、哈希表、数据表、绝对路径、游戏/模组专属数据。
- 中心库卡必须 `Scope: general`；否则不要放进 `procedures/central/`（live `~/.agent-procedures/cards`）。

## 完成后

如果 catalog 工具已安装，重建 catalog；否则保持卡片文件本身可读即可。
