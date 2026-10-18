# tools/ —— 三个可选附件

这些脚本**不是**经验库机制的一部分。它们只是配套工具：

| 脚本 | 解决什么问题 |
| --- | --- |
| `scan-sessions.mjs` | 机制落地**之前**：从已有的历史会话里挖「碰壁 → 正确姿势」，用来攒第一批经验卡 |
| `procedures-probe.mjs` | 机制落地**之后**：盯住新会话，验证 agent 到底有没有主动去读 `procedures/`（钩子生不生效） |
| `procedures-audit.mjs` | 卡攒起来**之后**：静态体检 —— 结构缺段、断链、体积、触发词覆盖、对象失效、结论偏旧 |

核心机制（钩子 + 索引 + 卡）**不依赖这些脚本中的任何一个**。删掉 `tools/` 目录，机制照常工作。

三个文件各自独立、零依赖，可以单独拷走——但都依赖同一套宿主约定（见文末「失效风险」）。

---

## 前置要求

- **Node.js ≥ 22.15.0 或 ≥ 23.8.0**（仅 `scan-sessions.mjs` 与 `procedures-probe.mjs`）。会话日志是 zstd 压缩的，脚本用 `node:zlib` 的 `zstdDecompressSync`
  （该 API 自 v22.15.0 / v23.8.0 起提供，官方标记为实验性；实测 Node 24 可用）。
  更早的 Node 会在运行时报 `zstdDecompressSync is not a function`。
- `procedures-audit.mjs` **不读会话日志**，不需要 zstd —— Node 18+ 即可跑。
- 无 npm 依赖，不需要 `npm install`。

---

## `procedures-audit.mjs` —— 卡库静态体检

```bash
node tools/procedures-audit.mjs                       # 在当前目录找 procedures/
node tools/procedures-audit.mjs --dir path/to/procedures
node tools/procedures-audit.mjs --json                 # 机器可读，便于接 CI
node tools/procedures-audit.mjs --max-bytes 3072 --stale-days 90
```

检查七项，**只读，不写、不删、不改任何卡**：

| 检查 | 级别 | 判据 |
| --- | --- | --- |
| 结构缺必需段 | P0 | 缺「触发 / 首选 / 别再来」任一 |
| 断链 | P0 | 卡里引用的另一张卡不存在（能识别省略限定后缀、以及标注为外部来源的引用） |
| 体积超限 | P1 | > `--max-bytes`（默认 3072 B）。超了先删解释性句子，别删命令 |
| 未分层 | P1 | 有 `_layers.md` 但表里没有这张卡 |
| 对象可能已消失 | P1 | 卡里的 Windows 绝对路径不存在。**常含示例路径，需人工确认** |
| 触发词单一 | P1 | 触发行只有 1 个说法 —— 换个词就静默不命中 |
| 结论偏旧 | P1 | 卡里最早日期距今超过 `--stale-days`（默认 90） |

**退出码**：`0` 全通过 / `1` 有 P0 或 P1 / `2` 找不到卡库目录。

**分工**：`audit` 看「卡本身写得好不好、引用还成不成立」（不需要会话日志）；`procedures-review` 看「卡最近有没有被用、该不该复核」（需要读会话日志）。两者配合 = 静态 + 动态。

**它不会替你处置**：P0/P1 都只是清单，「补 / 并 / 退役」由使用者审阅后决定 —— 这是机制的红线，不是工具的缺陷。

---

## `procedures-review.mjs` —— 卡库使用情况评审

```bash
node tools/procedures-review.mjs --procedures path/to/procedures
node tools/procedures-review.mjs --procedures ... --days 30     # 强制统一阈值
node tools/procedures-review.mjs --procedures ... --grace 0     # 关掉新建卡宽限
node tools/procedures-review.mjs --procedures ... --include-results   # 结果里出现卡名也算被读
node tools/procedures-review.mjs --procedures ... --json
```

它回答的是**动态**问题：这张卡最近有没有被用过、按分层该不该复核。静态问题（结构/断链/体积）交给 `procedures-audit.mjs`。

- 读 `_layers.md` 的「卡 | 层」表，按层给复核期：`fixed` 永不复核 / `env` 90 天 / `task` 180 天。
- **宽限期 7 天**：新建的卡还没机会被用，不提名（`--grace 0` 可关）。
- **口径**：只统计 `read/grep/glob` 等读取类工具里出现卡名；`write/edit` 是在产卡、不算触发；**列目录看文件名挑卡天然不计入**。所以「从没被整篇读过」≠「没用」—— 它可能一直靠卡名当索引起用。
- `--include-results` 会把 `tool/result` 里出现卡名也算一次（那次读取真的取到了内容，证据更硬）。

**依赖**：读 DSH 的会话日志（`session.v*.jsonl.zstd`，多帧 zstd），所以**只适用于 DSH**，和 `scan-sessions.mjs` 同一条失效边界。不想读会话时，只用 `procedures-audit.mjs` 也能维持卡库健康。

**同样只出清单，不删卡。**

---

## 会话根目录怎么找（两个脚本共用同一套逻辑）

按下面的顺序逐个候选，**命中即用**；某个候选不成立就自动降级到下一个：

| 顺序 | 来源 | 说明 |
| --- | --- | --- |
| 1 | 环境变量 `DSH_HOME` | 宿主主目录，脚本实际读 `<DSH_HOME>/sessions` |
| 2 | 命令行 `--sessions <路径>` | 给 `sessions` 目录本身、或给它的上级宿主主目录都行 |
| 3 | 环境变量 `DSH_SESSIONS` | 直接给 `sessions` 目录 |
| 4 | 从当前目录逐级向上找 `.dsh` | 在工作区里直接跑脚本时**零配置**生效 |
| 5 | `~/.dsh` | |

两个细节：

- **`--sessions` 排在 `DSH_HOME` 之后是刻意约定。** 若 `DSH_HOME` 有效而 `--sessions` 被忽略，脚本会在 stderr 明确说明实际用的是哪一个，不会静默。
- 候选「无效」的判定是：该位置下既没有 `sessions` 子目录，本身也不是一个装着会话的工作区根。
  所以一个存在但没有会话数据的 `~/.dsh` 不会被误当成会话根（否则会静默输出空结果）。
- 两个脚本的**默认工作区**：省略时不猜死值，而是取「会话数最多的那个工作区」并在 stderr 说明选中了谁，
  例如 `未指定工作区 → 自动选择会话最多的：<slug>（N 个会话）`。

---

## scan-sessions.mjs

解压会话日志（每个会话文件由多个 zstd frame 串联，必须按 magic 切分后逐段解压），按四种模式检索。

### 用法

```bash
# 列所有工作区及其会话数
node tools/scan-sessions.mjs list

# 列工具调用 + 配对结果（最常用于看清「试了什么、结果如何」）
node tools/scan-sessions.mjs calls "<关键词正则>"
node tools/scan-sessions.mjs calls <工作区> "ERR|denied|失败|不生效"

# 列真人发言（找需求与痛点最快）
node tools/scan-sessions.mjs user "为什么|不对|还是不行"

# 列助手发言（找结论）
node tools/scan-sessions.mjs say "根因|其实是"
```

工作区可以省略（自动选会话最多的那个），也可以写成位置参数或 `--workspace <slug>`。
工作区 slug 由宿主生成（形如 `--<路径里非字母数字换成->--`），照着 `list` 的输出抄即可。

### 选项与环境变量

| 选项 | 环境变量 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--sessions <路径>` | `DSH_HOME` / `DSH_SESSIONS` | 见上文 | 会话根位置 |
| `--workspace <slug>` | — | 自动取最大 | 目标工作区 |
| `--max-len <n>` | `SCAN_MAXLEN` | 300 | 单条参数/结果/发言的截断长度 |
| `--lines <n>` | `SCAN_LINES` | 60 | 每个会话最多打印多少行 |
| `--limit <n>` | `SCAN_LIMIT` | 不限 | 最多处理多少个会话（按文件体积降序） |
| `--verbose` | `SCAN_VERBOSE=1` | 关 | 打印会话根解析过程 |
| `--help` | — | — | 用法 |

正则用 JS 语法。`calls` 模式下正则匹配的是**工具参数**（不是结果）。

### 必须保住的三个机制（踩过坑换来的，别顺手简化掉）

1. **三种会话文件名都认**：`session.v4.jsonl.zstd` / `session.v3.jsonl.zstd` / `session.jsonl.zstd`。
   只认最新那种会漏掉绝大部分历史——实测同一工作区同一时刻，旧格式三百多个、新格式几十个（有少量两种并存）。
2. **两遍遍历配对**：先把全部 `tool/result` 收进表，再遍历 `tool/call` 去配。
   日志里 call 总出现在它的 result 之前，单趟遍历时结果表还是空的，结果栏会**永远**显示 `(无结果)`。
3. **结果块递归提取**：新版的结果是 `{type:'text'}` 直挂，旧版是嵌套的
   `{type:'tool-result', content:[{type:'text'}]}`。只认顶层 `type==='text'` 会让旧版会话的结果全空。

---

## procedures-probe.mjs

常驻探针：每隔一段时间扫一次目标工作区里**新出现**的会话，把其中的工具调用打出来，
凡是「主动去读」且参数命中关键词的，标 `<<< HIT`。

### 用法

```bash
# 前台跑，Ctrl-C 停
node tools/procedures-probe.mjs

# 指定工作区与频率
node tools/procedures-probe.mjs <工作区> --interval 3000

# 脚本化自检：只扫一轮就退出
node tools/procedures-probe.mjs --once

# 自检 HIT 判定本身：跳过基线，回放已有会话中的 HIT
node tools/procedures-probe.mjs --once --replay
```

**判据**：出现 `<<< HIT` = 钩子生效、agent 主动去读了；一行都没有 = 没触发（agent 凭记忆答了）。

注意 `--keyword` 是**子串匹配**：默认的 `procedures` 也会命中 `agent-procedures/`、`procedures-probe.mjs`
这类**路径名**，产生误报。要更严格就把关键词写成带路径分隔符的形式，例如 `--keyword "[\\/]procedures[\\/]"`。

开一个**新会话**问 3~5 个分属不同卡片的现象，然后看探针输出。

### 选项与环境变量

| 选项 | 环境变量 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--sessions <路径>` | `DSH_HOME` / `DSH_SESSIONS` | 见上文 | 会话根位置 |
| `--workspace <slug>` | — | 自动取最大 | 目标工作区 |
| `--interval <毫秒>` | `PROBE_INTERVAL_MS` | 5000 | 轮询间隔 |
| `--top <n>` | `PROBE_TOP` | 6 | 每轮最多检查最近多少个会话 |
| `--max-len <n>` | `PROBE_MAXLEN` | 160 | 工具参数截断长度 |
| `--keyword <正则>` | `PROBE_KEYWORD` | `procedures` | 命中关键词 |
| `--hit-tools <正则>` | `PROBE_HIT_TOOLS` | `read\|grep\|ops_grep\|glob\|ops_glob\|ops_inspect_local_file` | 算作「主动去读」的工具 |
| `--trace-tools <正则>` | `PROBE_TRACE_TOOLS` | 上一行 + `write\|edit\|ops_bash\|pwsh\|ops_replace` | 普通轨迹也打印的工具 |
| `--once` | — | 关 | 只扫一轮就退出 |
| `--replay` | — | 关 | 跳过启动基线，回放已有会话中的 HIT |
| `--verbose` | `PROBE_VERBOSE=1` | 关 | 打印会话根解析过程 |
| `--help` | — | — | 用法 |

### 必须保住的三个机制（踩过坑换来的，别顺手简化掉）

1. **启动基线**：进程起来时把当时已存在的会话全部标记为「已知」。
   否则那个一直活跃的当前会话每轮都会被当成新会话，把全部历史回放一遍——真正的信号会被自己淹掉。
2. **新会话的 cursor 起点是 `-1`**：新会话只回放 HIT 行，不回放普通调用。
   子代理会话一出现就是几十条工具调用，全打出来等于没输出。
3. **HIT 只认读取类工具**：`read` / `grep` / `glob` 及 `ops_*` 读取类。
   `write` / `edit` 是在**产出**卡片，不是机制被触发；`ops_bash` 既能读也能写、且常把路径当普通文本打印，误报率高——都不算 HIT。
   （普通轨迹仍然打印，只是不带 HIT 标记。）

---

## 失效风险

**这两个脚本按特定 agent 宿主（DSH）当前的内部实现编写，依赖未公开的约定。宿主升级后可能失效，而且多半是静默失效——不报错，只是读不到东西。**

具体依赖：

- **目录约定**：`<会话根>/<工作区>/<会话id>/session*.jsonl.zstd`
- **文件名约定**：`session.v4.jsonl.zstd` / `session.v3.jsonl.zstd` / `session.jsonl.zstd` 三种形态
- **压缩格式**：zstd，且**多帧串联**（一个文件里多个 frame，必须按 magic `28 B5 2F FD` 切分）
- **日志结构**：JSONL；事件类型 `tool/call`、`tool/result`、`user/message`、`assistant/message`；
  字段 `data.callId`、`data.message.source.callId`、`data.toolCallId`、`data.turn`、`data.step`
- **工具命名**：`read` / `grep` / `glob` / `ops_*` 这套名字
- **HIT 判据**：依赖本仓库约定的 `procedures/` 目录命名（可用 `--keyword` 改）

**怎么发现它失效了**：`list` 一个会话都列不出来，或 `calls` 全是空。
这时先确认会话根对不对（`--verbose`），再确认宿主的日志格式有没有变。

**它失效了怎么办**：`tools/` 只是附件。核心机制（钩子 + 索引 + 卡）是纯文件约定，与任何工具无关——
这两个脚本读不了日志，不影响机制运行，只影响「挖掘历史」和「验证触发」这两件辅助工作。

---

## 隐私提示

脚本会把**会话原文片段**（工具参数、真人发言、助手发言）直接打到终端，其中**很可能含本机绝对路径、用户名、项目名**。

把输出贴到 issue、文档、公开仓库之前，请自己先脱敏。发布方不为此负责。

---

## 授权

与仓库其余部分一致：MIT。
