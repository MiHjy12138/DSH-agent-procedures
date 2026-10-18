# 验证记录

日期：2026-10-18

范围：项目本地 `procedures/` 工作台。只做本地文件读写，不接外部服务。

## DSH 内验证

工作台作为 DSH 后台任务启动，地址 `http://127.0.0.1:4177`，数据为
`workbench/fixtures/procedures`。

- `GET /api/state`：3 张卡，2027 bytes；
- `GET /api/cards?q=网页抓不到正文`：1 条命中，`抓取-网页空壳.md`；
- `POST /api/audit`：3 张卡，P0=0，P1=3；
- `GET /`：200，6468 bytes；
- CLI `search pnpm 安装报 ERR_PNPM_NO_MATCHING_VERSION`：只命中
  `工具-pnpm版本不存在.md`；
- `node workbench/test.mjs`：10 tests / 10 pass / 0 fail；
- `node workbench/test-api.mjs`：1 test / 1 pass / 0 fail；
- `node workbench/test-plugin.mjs`：5 tests / 5 pass / 0 fail（prefix 路由 + 客户端 slot + 项目切换 + 对话后建库 + 幂等性）；
- `node workbench/test-init.mjs`：1 test / 1 pass / 0 fail（跨 agent CLI init 幂等、不覆盖）；
- Codex 插件：`validate_plugin.py` 通过；`open.mjs` / `stop.mjs` 实际启动/停止通过。

## DSH 插件

- `workbench/package.json` 增加 `dsh.bundle.patch` 与 `dsh.client.platform=web`；
- 服务端挂载到 `ctx.webServer`：`/plugins/experience-workbench/`；
- 客户端注册 `sidebar.panellist`（经验库）与 `main`（iframe 工作台）；
- 已用 `dsh plugin --profile desktop add link:<workbench>` 链接进 desktop profile；
- 重启 DSH 后侧边栏“经验库”已出现，插件页面在 DSH 内可打开；
- 实测 3 张卡、卡片详情、层选择、搜索入口正常；
- 修复了插件前缀下 `loadCards/loadCard` 仍写死 `/api/...` 导致的 404，改为相对 `api/...`；
- 新增项目 API：读 DSH `workspace.json`，按项目切换 `procedures/`；示例项目只读；
- 新增复核层中文标签、收件箱/审计互斥、顶部按钮说明；
- 项目切换测试使用临时 DSH_HOME：A 项目 1 张卡、切到 B 变 0 张、切回 A 恢复；
- 实际 DSH 里通过插件管理器关闭/开启 `dsh-experience-workbench` 重载了服务端，无需重启整个应用；
- 实际页面项目条列出 6 个项目，`示例项目` 3 张卡，`default-workspace` 0 张；
- 实际页面验证：徽标显示 `原理`，详情显示“复核层”，收件箱/审计互斥；
- 自动建库测试：临时 DSH_HOME 新增 workspace 后**不**立即建；写入第一条真实 session 消息后才创建 `procedures/_inbox.md`、`_layers.md`、`_模板.md`；
- 只打开未对话项目的 `/api/state` 返回 `initialized:false`，不创建目录；
- 重复执行 `ensureProjectLibrary` 不覆盖用户改过的 `_inbox.md`；
- `node workbench/cli.mjs init --workspace .` 已可用于 Codex/Claude Code，不依赖 DSH；
- Codex 插件 `codex-plugin/procedures-workbench` 通过 `validate_plugin.py`；
- Codex 插件已改为 **MCP stdio server**，工具：`procedures_open`、`list/search/get/inbox/init`；
- 增加 MCP Apps 侧边栏 UI：`mcp/mcp-app.html.br`，按 `ui/initialize` / `tools/call` 连接；
- 用 mock host 验证：侧边栏列表渲染、点击卡片读取详情；
- MCP 测试通过：initialize、tools/list（6 个工具）、init 建骨架、list、get；
- 不再启动 Browser，也不需要手动打开页面。

## UI 回归

自动回归（Playwright + Edge，可选）已覆盖：

- 搜索与高亮；
- 左/右分隔条拖动、宽度持久化；
- 选中卡片、Markdown 预览；
- 编辑保存；
- 外部修改冲突、草稿保留、恢复/丢弃；
- 新建卡片并写入 `_layers.md`；
- 审计面板 P0/P1；
- 项目条和当前项目路径；
- 收件箱/审计互斥：打开一个会收起另一个。

DSH 内目测：已通过侧边栏“经验库”打开插件页面，卡片列表和详情可见。
自动回归仍作为辅助证据。

## 已知限制

- 暂无删除/重命名卡片；
- 暂无 MCP；
- 项目来自 DSH `workspace.json`；未做手动路径输入；
- 空项目首次打开会创建空的 `procedures/`；
- 草稿依赖浏览器 localStorage；
- UI 自动回归依赖本机 Playwright/Edge，应用本身零依赖。
