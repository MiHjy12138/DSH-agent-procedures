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
- `node workbench/test-plugin.mjs`：2 tests / 2 pass / 0 fail（prefix 路由 + 客户端 slot 注册）。

## DSH 插件

- `workbench/package.json` 增加 `dsh.bundle.patch` 与 `dsh.client.platform=web`；
- 服务端挂载到 `ctx.webServer`：`/plugins/experience-workbench/`；
- 客户端注册 `sidebar.panellist`（经验库）与 `main`（iframe 工作台）；
- 已用 `dsh plugin --profile desktop add link:<workbench>` 链接进 desktop profile；
- 本次验证未重启 DSH，因此“重启后真实侧边栏/iframe 目测”仍待完成。

## UI 回归

自动回归（Playwright + Edge，可选）已覆盖：

- 搜索与高亮；
- 选中卡片、Markdown 预览；
- 编辑保存；
- 外部修改冲突、草稿保留、恢复/丢弃；
- 新建卡片并写入 `_layers.md`；
- 审计面板 P0/P1。

DSH 内目测：工作台已在 DSH 后台运行，待通过 DSH 的浏览器/WebView 打开 4177 做最终人工确认。
自动回归只作为辅助证据，不作为 DSH 内验收替代。

## 已知限制

- 暂无删除/重命名卡片；
- 暂无 MCP；
- 仅单项目；不跨项目；
- 草稿依赖浏览器 localStorage；
- UI 自动回归依赖本机 Playwright/Edge，应用本身零依赖。
