# 本地经验库工作台（设计草案）

## 定位

一个**本地优先、跟着 repo 走、可 review** 的经验卡工作台。

它不是记忆插件，不做自动 writeback，不做全局常驻钩子，不和 Memorax 抢“记忆”这件事。

- Memorax：跨会话、个人、自动记忆。
- 本工作台：仓库自带、可 git diff、可 PR review 的经验卡；人/agent 按需查看和编辑。

## 不做什么

- 不做自动记忆、自动 writeback、自动捕获；
- 不做第二套语义索引，不把卡片/catalog 注入模型上下文；
- 不做全局常驻钩子，不做启动式全库扫描；
- 不做跨项目中心库；跨项目复用交给 Memorax；
- 不把项目专属 ID、哈希表、数据表、绝对路径写进任何共享记忆。

## 数据格式

沿用原仓库 `procedures/*.md`：

- 文件名 = `分类-现象`，文件名本身就是索引；
- `> **触发**：` 行写任务里会出现的现象词；
- 卡内四段：触发 / 首选 / 反面试错 / 验证；
- `_layers.md` 可选：`fixed` / `env` / `task`，用于复核期；
- `INDEX.md` 只做消歧，不逐卡列；
- 不新增 catalog、不逐卡建索引。

## 工作台能力（MVP）

### CLI

```text
exp search "<现象词>"        # 只回路径/标题/摘要，不整库注入
exp show <卡名>              # 看一张卡
exp add                      # 按模板新建，写到 procedures/
exp audit                    # 复用 procedures-audit
exp open                     # 本地网页工作台
```

### 本地网页

- 卡片列表：按层、scope、最近修改、审计状态筛选；
- 搜索：文件名/触发行/正文，高亮命中；
- 详情：Markdown 预览 + 原文；
- 编辑：保存到 `procedures/`，保留 git diff；
- 审计：显示 `procedures-audit` 的 P0/P1；
- 不自动保存到 Memorax，不自动写记忆。

### 检索

- 卡片数量少：启动时内存索引，按文件名/触发行/正文打分；
- 数量大：可换本地 FTS/trigram；
- 索引是**临时/本地**的，不提交、不注入、不常驻；
- CLI 默认只回路径/标题/短摘要，完整卡由调用方按需读。

## 技术栈

- Node.js 24 + TypeScript；
- 本地 HTTP + 浏览器 UI，不先上 Electron/Tauri；
- 复用 `tools/procedures-audit.mjs`；
- 无后端服务、无网络依赖、无模型 token 常驻；
- 以后可选 MCP：`search/read/write`，但默认不启动、不常驻。

## 推荐实施顺序

1. `exp search/show`：文件扫描 + 临时搜索；
2. `exp audit`：复用现有审计；
3. `exp open`：本地网页列表/详情；
4. `exp add/edit`：模板和保存；
5. 测试夹具：10–38 张卡，验证搜索/编辑/审计；
6. 可选 MCP。

## 与 Memorax 的边界

- 不双向同步；
- 不自动把卡写进 Memorax；
- 如果以后要导出，只做手动单向导出，并明确提示项目专属数据不导出；
- 同一事实只存一处。

## 成功标准

- 不增加任何全局 token；
- 不自动捕获，不会和 Memorax 重复写；
- 人能在本地快速搜索/编辑/审计；
- 经验卡能跟 repo 走、能 review、能回滚；
- 搜索命中靠文件名/触发行/正文，不靠常驻大索引。
