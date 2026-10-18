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

- 左侧搜索/筛选/列表，右侧 Markdown 预览；
- 新建卡片：触发现象 + 首选 + 死路 + 验证 + 层（fixed/env/task）；
- 编辑：原文 Markdown，保存到 `procedures/`；外部修改会检测冲突，不覆盖；
- 审计：复用 `tools/procedures-audit.mjs`，显示 P0/P1；
- 收件箱：先记一行，稍后整理成卡；
- 快捷键：`/` 搜索、`N` 新建、`E` 编辑、`J/K` 上下切换、`Ctrl/⌘+S` 保存、`Esc` 取消/关闭。

## 边界

- 只读/写本项目的 `procedures/`；
- 不自动捕获、不自动 writeback、不做全局钩子；
- 不做启动式全库扫描、不整库注入；
- 项目专属 ID/哈希表/数据表/绝对路径只留在本项目。

## 测试

```powershell
node workbench/test.mjs
```
