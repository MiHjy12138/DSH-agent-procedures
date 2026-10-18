# 项目经验库工作台

本地优先、跟 repo 走的经验卡工作台。只做项目本地卡片，不做自动捕获、不做跨项目共享。

## 运行

```powershell
# 在一个含 procedures/ 的项目里
node workbench/server.mjs --workspace .

# 或用自带示例
node workbench/server.mjs --procedures workbench/fixtures/procedures
```

打开输出的 `http://127.0.0.1:4177`。可选 `--port 4180`、`--host`。

## DSH 插件

`workbench/` 同时是一个 DSH 插件包（`dsh.bundle.patch` + `dsh.client.platform=web`）。
安装后在 DSH 侧边栏出现“经验库”，页面同源挂载
`/plugins/experience-workbench/`，不需要另起 4177。

本地开发安装（桌面/Web profile 都可以）：

```powershell
dsh plugin --profile desktop add link:C:\path\to\workbench
# 或 --profile web
```

装完重启 DSH；也可以在“插件”页把 `dsh-experience-workbench` 关闭再打开来重载。
插件配置在 `cordis.patch.yml`：

```yaml
- insert:
    - id: experience-workbench
      name: dsh-experience-workbench
      config:
        proceduresDir: "C:\path\to\project\procedures"
```

`proceduresDir` 留空时：项目条列出 DSH 工作区，默认进入 `default-workspace`；
包内 `fixtures/procedures/` 作为只读的“示例项目”。插件不跨项目、不写回、不接外部记忆。

## 项目

顶部“当前项目”条会列出 DSH 工作区（读 `~/.dsh/storages/workspace.json`）和只读的
“示例项目”。每个项目只读自己的 `procedures/`，搜索、审计、收件箱、草稿都按当前项目隔离；
不会把多个项目的卡混在一个列表里。选择会记住在浏览器 localStorage。

`proceduresDir` 配置存在时，会多一个“本地配置”项目并作为入口；默认进入
`default-workspace`（没有卡就显示空状态，不是全局库）。

## 自动建库

新 workspace 登记到 `workspace.json` 时，插件文件监听会为它创建一次骨架：

```text
procedures/
  _inbox.md
  _layers.md
  _模板.md
```

不调用模型、不读 skill、不消耗 token；只检查文件是否存在，存在就跳过、不覆盖。
第一次打开“经验库”或切换项目时也会再兜底检查当前项目。

## CLI

```powershell
node workbench/cli.mjs search "网页抓不到正文：为什么只有 SPA 空壳？" --limit 5
node workbench/cli.mjs show 抓取-网页空壳.md
node workbench/cli.mjs audit
node workbench/cli.mjs inbox
node workbench/cli.mjs inbox --add "现象：一句话"
```

搜索只作用于当前工作区，默认只回路径/标题/摘要，不整库注入。`--json` 给脚本用。

## 搜索纪律

- 只有任务依赖先前经验、历史决策、旧修复或已知死路时才搜；简单当前事实不搜。
- 查询写成 `目标: 条件，决策/验证?`，不要只丢一串名词。
- 支持 `"精确短语"`、错误码、路径、命令、`file:` / `title:` / `trigger:` / `layer:` 过滤。
- 先看 3–5 个路由结果，按需打开 1–2 张；不把整库塞进上下文。

## 索引

- 文件是唯一 source of truth；搜索索引在启动/调用时派生，不提交、不常驻、不注入。
- 不生成逐卡 catalog；文件名 + 触发行 + 正文就够。
- 卡片多了再换本地 FTS/trigram，接口不变。

## 钩子

`workbench/AGENTS-snippet.md` 是**可选的项目级**短钩子：只提醒“有经验库、按需搜、别自动捕获”。
它不是全局钩子，不会常驻，也不会写记忆。

## 界面

- 左侧搜索/筛选/列表，右侧 Markdown 预览；中间分隔条可拖动改变占比，右侧自适应；
- 分隔条默认左栏 400px，双击复位，方向键微调，宽度记在本机 localStorage；
- 新建卡片：触发现象 + 首选 + 死路 + 验证 + 复核层（fixed=原理 / env=环境 / task=任务）；
- 编辑：原文 Markdown，保存到 `procedures/`；外部修改会检测冲突，不覆盖；
- 草稿：编辑内容自动留在本地，冲突后也可恢复/丢弃；
- 审计：复用 `tools/procedures-audit.mjs`，列表显示 P0/P1，抽屉看详情；
- 收件箱：先记一行，稍后整理成卡；收件箱和审计是互斥抽屉，打开一个会收起另一个；
- 顶部按钮：收件箱、审计、新建卡片；悬停有说明；
- 快捷键：`/` 搜索、`N` 新建、`E` 编辑、`J/K` 上下切换、`Ctrl/⌘+S` 保存、`Esc` 取消/关闭。

## 边界

- 只读/写本项目的 `procedures/`；
- 不自动捕获、不自动 writeback、不做全局钩子；
- 不做启动式全库扫描、不整库注入；
- 项目专属 ID/哈希表/数据表/绝对路径只留在本项目。

## 测试

```powershell
node workbench/test.mjs        # lib 搜索/分层/审计
node workbench/test-api.mjs    # 保存冲突/原子写/分层/审计 API
node workbench/test-plugin.mjs # prefix 路由 + slot + 项目隔离 + 新工作区自动建库
```

可选 UI 回归（需要本机 Edge + Playwright）：

```powershell
$env:PLAYWRIGHT_PATH = '<...>\node_modules\playwright'
$env:EDGE_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
node workbench/test-ui.mjs    # 搜索/高亮/编辑/冲突草稿/新建分层/审计
```
