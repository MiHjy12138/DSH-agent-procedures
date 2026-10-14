#!/usr/bin/env node
// procedures-probe.mjs —— 探针：盯住某个工作区的**新会话**，记录它有没有主动去读 procedures 经验库。
//
// 用法：
//   node tools/procedures-probe.mjs [工作区] [选项]
//   工作区省略时自动选「会话数最多的那个」，并在 stderr 说明选中的是哪个。
//
// 输出示例：
//   [20:31:05] 探针启动 · <工作区> · 每 5s 扫一次
//   [20:31:05] 基线 <N> 个会话已标记为已知，只跟踪之后新建的
//   [20:31:40] NEW   <会话id>
//   [20:31:47]       t1/s2  read  {"file_path":"...<sep>procedures<sep>INDEX.md"}   <<< HIT
//   [20:31:51]       t1/s4  read  {"file_path":"...<sep>主题卡.md"}                 <<< HIT
//
// 判据：出现 HIT 行 = 机制被触发；一行都没有 = 没触发（agent 凭记忆答了）。
//
// 会话根目录解析顺序（先命中先用；某个候选无效则自动降级到下一个）：
//   DSH_HOME → --sessions → DSH_SESSIONS → 从当前目录逐级向上找 .dsh → ~/.dsh
//
// 可调参数（括号内为对应环境变量，命令行参数优先）：
//   --interval <毫秒>    轮询间隔（PROBE_INTERVAL_MS，默认 5000）
//   --top <n>            每轮最多检查最近多少个会话（PROBE_TOP，默认 6）
//   --max-len <n>        单条工具参数打印时的截断长度（PROBE_MAXLEN，默认 160）
//   --keyword <正则>     命中关键词（PROBE_KEYWORD，默认 "procedures"）
//   --hit-tools <正则>   算作「主动去读」的工具名（PROBE_HIT_TOOLS，见下）
//   --trace-tools <正则> 普通轨迹也打印的工具名（PROBE_TRACE_TOOLS）
//   --once               只扫一轮就退出（脚本化自检用）
//   --replay             跳过启动基线：把已有会话也当新会话，只回放其中的 HIT（自检用）
//   --verbose, -v        打印会话根解析过程
//   --help, -h           看用法
//
// ⚠ 失效风险：本脚本按特定宿主（DSH）当前的日志格式与目录约定编写，宿主升级后可能静默失效。
//   它只是可选附件，经验库机制本身不依赖任何工具。详见同目录 README.md。

import { zstdDecompressSync } from 'node:zlib'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve as resolvePath } from 'node:path'
import { homedir } from 'node:os'

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
// 会话文件名有三种历史形态，三种都认（只认最新那种会漏掉绝大部分历史）。
const SESSION_FILES = ['session.v4.jsonl.zstd', 'session.v3.jsonl.zstd', 'session.jsonl.zstd']

// HIT 只认「主动去读」的工具：read / grep / glob 及 ops_* 读取类。
// write / edit 是在产出卡片，ops_bash 既能读也能写且常把路径当普通文本打印——都不算机制被触发。
const DEFAULT_HIT_TOOLS = '^(read|grep|ops_grep|glob|ops_glob|ops_inspect_local_file)$'
// 普通轨迹（不含 HIT 标记）额外记录这些工具，用来还原「它到底去干了什么」。
const DEFAULT_TRACE_TOOLS = '^(read|write|edit|grep|ops_grep|glob|ops_glob|ops_bash|pwsh|ops_inspect_local_file|ops_replace)$'

class UsageError extends Error {}

const isDir = (p) => { try { return statSync(p).isDirectory() } catch { return false } }
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d }
const ts = () => new Date().toTimeString().slice(0, 8)

// ---------- 参数 ----------

const VALUE_FLAGS = {
  sessions: 'sessions', workspace: 'workspace', interval: 'interval', top: 'top',
  'max-len': 'maxLen', keyword: 'keyword', 'hit-tools': 'hitTools', 'trace-tools': 'traceTools',
}

function parseArgs(argv) {
  const flags = { sessions: null, workspace: null, interval: null, top: null, maxLen: null, keyword: null, hitTools: null, traceTools: null, once: false, replay: false, verbose: false, help: false }
  const pos = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') { flags.help = true; continue }
    if (a === '--verbose' || a === '-v') { flags.verbose = true; continue }
    if (a === '--once') { flags.once = true; continue }
    if (a === '--replay') { flags.replay = true; continue }
    // 工作区 slug 长得很像选项（--xxx--），先按形状放过，再判「未知选项」。
    const m = /^--([a-z][a-z-]*)(?:=(.*))?$/.exec(a)
    if (m && !/^--.*--$/.test(a)) {
      const key = VALUE_FLAGS[m[1]]
      if (!key) throw new UsageError(`未知选项 --${m[1]}`)
      const v = m[2] !== undefined ? m[2] : argv[++i]
      if (v === undefined) throw new UsageError(`选项 --${m[1]} 需要一个值`)
      flags[key] = v
      continue
    }
    pos.push(a)
  }

  let workspace = flags.workspace ?? null
  if (!workspace && pos.length && (/^--.*--$/.test(pos[0]) || pos.length >= 2)) workspace = pos.shift()
  if (pos.length) {
    if (!workspace && pos.length === 1) workspace = pos.shift()
    else throw new UsageError(`多余的参数：${pos.join(' ')}`)
  }

  const mk = (pattern, label) => { try { return new RegExp(pattern, 'i') } catch (e) { throw new UsageError(`${label} 不是合法正则：${e.message}`) } }

  return {
    workspace,
    help: flags.help,
    sessionsFlag: flags.sessions,
    verbose: flags.verbose || !!process.env.PROBE_VERBOSE,
    once: flags.once,
    replay: flags.replay,
    interval: num(flags.interval ?? process.env.PROBE_INTERVAL_MS, 5000),
    top: num(flags.top ?? process.env.PROBE_TOP, 6),
    maxLen: num(flags.maxLen ?? process.env.PROBE_MAXLEN, 160),
    keywordRe: mk(flags.keyword ?? process.env.PROBE_KEYWORD ?? 'procedures', '--keyword'),
    hitToolRe: mk(flags.hitTools ?? process.env.PROBE_HIT_TOOLS ?? DEFAULT_HIT_TOOLS, '--hit-tools'),
    traceToolRe: mk(flags.traceTools ?? process.env.PROBE_TRACE_TOOLS ?? DEFAULT_TRACE_TOOLS, '--trace-tools'),
  }
}

function printHelp() {
  console.log(`procedures-probe —— 盯住新会话，看它有没有主动去读 procedures

用法：
  node tools/procedures-probe.mjs [工作区] [选项]

选项：
  --sessions <路径>   会话根目录，或其上级宿主主目录
  --workspace <slug>  指定工作区（也可作为位置参数给出）
  --interval <毫秒>   轮询间隔（默认 5000，环境变量 PROBE_INTERVAL_MS）
  --top <n>           每轮最多检查最近多少个会话（默认 6，PROBE_TOP）
  --max-len <n>       工具参数截断长度（默认 160，PROBE_MAXLEN）
  --keyword <正则>    命中关键词（默认 procedures，PROBE_KEYWORD）
  --hit-tools <正则>  算作「主动去读」的工具名（默认 read/grep/glob 与 ops_* 读取类）
  --trace-tools <正则> 普通轨迹也打印的工具名
  --once              只扫一轮就退出
  --replay            跳过启动基线，回放已有会话中的 HIT（自检用）
  --verbose, -v       打印会话根解析过程
  --help, -h          本帮助

判据：出现 <<< HIT 行 = 机制被触发；一行都没有 = 没触发。
省略工作区时自动选会话数最多的那个，并在 stderr 说明实际选中的是哪个。`)
}

// ---------- 会话根 ----------

function sessionFileIn(sessionDir) {
  for (const n of SESSION_FILES) { const f = join(sessionDir, n); if (existsSync(f)) return f }
  return null
}

function countSessions(wsDir) {
  let entries
  try { entries = readdirSync(wsDir) } catch { return 0 }
  let n = 0
  for (const sid of entries) {
    const p = join(wsDir, sid)
    if (isDir(p) && sessionFileIn(p)) n++
  }
  return n
}

function workspacesIn(root) {
  if (!isDir(root)) return []
  const out = []
  for (const ws of readdirSync(root)) {
    const dir = join(root, ws)
    if (!isDir(dir)) continue
    const n = countSessions(dir)
    if (n > 0) out.push({ ws, dir, sessions: n })
  }
  return out.sort((a, b) => b.sessions - a.sessions || a.ws.localeCompare(b.ws))
}

function asSessionsDir(candidate) {
  if (!candidate) return null
  const abs = resolvePath(candidate)
  if (!isDir(abs)) return null
  const nested = join(abs, 'sessions')
  if (isDir(nested)) return nested
  return workspacesIn(abs).length ? abs : null
}

function findUp(startDir, name) {
  let cur = resolvePath(startDir)
  for (;;) {
    const p = join(cur, name)
    if (isDir(p)) return p
    const up = dirname(cur)
    if (up === cur) return null
    cur = up
  }
}

function resolveSessionsRoot(sessionsFlag) {
  const candidates = [
    ['DSH_HOME', process.env.DSH_HOME],
    ['--sessions', sessionsFlag],
    ['DSH_SESSIONS', process.env.DSH_SESSIONS],
    ['cwd 向上查找 .dsh', findUp(process.cwd(), '.dsh')],
    ['~/.dsh', join(homedir(), '.dsh')],
  ]
  const tried = []
  for (const [label, cand] of candidates) {
    if (!cand) continue
    const dir = asSessionsDir(cand)
    tried.push(`${label} = ${cand} → ${dir ?? '（无效）'}`)
    if (dir) return { dir, label, tried }
  }
  return { dir: null, tried }
}

// ---------- 解码 ----------

function decode(buf) {
  const idx = []
  for (let i = 0; i + 4 <= buf.length; i++) if (buf.compare(MAGIC, 0, 4, i, i + 4) === 0) idx.push(i)
  if (!idx.length) return ''
  let t = ''
  for (let k = 0; k < idx.length; k++) {
    try { t += zstdDecompressSync(buf.subarray(idx[k], idx[k + 1] ?? buf.length)).toString('utf8') } catch {}
  }
  return t
}

// ---------- 主流程 ----------

function main() {
  const o = parseArgs(process.argv.slice(2))
  if (o.help) { printHelp(); return 0 }

  const root = resolveSessionsRoot(o.sessionsFlag)
  if (o.verbose) for (const line of root.tried) console.error(`[probe] 候选 ${line}`)
  if (!root.dir) {
    console.error('[probe] 找不到会话根目录。已尝试：')
    for (const line of root.tried) console.error(`  ${line}`)
    console.error('  用 --sessions <路径> 或环境变量 DSH_HOME / DSH_SESSIONS 指定。')
    return 2
  }

  let workspace = o.workspace
  if (!workspace) {
    const list = workspacesIn(root.dir)
    if (!list.length) { console.error('[probe] 会话根下没有找到任何含会话的工作区。'); return 2 }
    workspace = list[0].ws
    console.error(`[probe] 未指定工作区 → 自动选择会话最多的：${workspace}（${list[0].sessions} 个会话）`)
  }

  const dir = join(root.dir, workspace)
  if (!isDir(dir)) {
    console.error(`[probe] 会话根下没有工作区 "${workspace}"。现有：`)
    for (const w of workspacesIn(root.dir).slice(0, 10)) console.error(`  ${w.ws}`)
    return 2
  }

  function sessionsOf() {
    const entries = readdirSync(dir) // 工作区目录已确认存在
    const out = []
    for (const sid of entries) {
      const p = join(dir, sid)
      if (!isDir(p)) continue
      const f = sessionFileIn(p)
      if (!f) continue
      try { out.push({ sid, f, mtime: statSync(f).mtimeMs }) } catch {}
    }
    return out.sort((a, b) => b.mtime - a.mtime)
  }

  const known = new Set()
  const cursor = new Map()
  let hits = 0

  function scan() {
    for (const s of sessionsOf().slice(0, o.top)) {
      let text
      try { text = decode(readFileSync(s.f)) } catch { continue }
      const evs = []
      for (const line of text.split('\n')) { if (!line.trim()) continue; try { evs.push(JSON.parse(line)) } catch {} }
      const calls = evs.filter(e => e.type === 'tool/call')
      const isNew = !known.has(s.sid)
      if (isNew) {
        known.add(s.sid)
        // cursor 起点 -1 = 新会话：只回放 HIT，不回放普通调用。
        // 否则子代理会话一出现就把它几十条工具调用全刷出来，真正的信号会被淹掉。
        cursor.set(s.sid, -1)
        console.log(`[${ts()}] NEW   ${s.sid}`)
      }
      const n = cursor.get(s.sid) ?? 0
      if (n >= 0 && calls.length <= n) continue
      const start = n < 0 ? 0 : n
      const onlyHits = n < 0
      for (const e of calls.slice(start)) {
        const a = JSON.stringify(e.data?.arguments ?? {})
        const name = e.data?.name ?? '?'
        const isHit = o.hitToolRe.test(name) && o.keywordRe.test(a)
        if (onlyHits && !isHit) continue
        if (!isHit && !o.traceToolRe.test(name)) continue
        if (isHit) hits++
        console.log(`[${ts()}]       t${e.data?.turn}/s${e.data?.step}  ${name}  ${a.slice(0, o.maxLen)}${isHit ? '   <<< HIT' : ''}`)
      }
      cursor.set(s.sid, calls.length)
    }
  }

  // 启动基线：此刻已存在的会话全部记为已知 ——
  // 否则那个一直活跃的当前会话每轮都会被当成「新会话」，把全部历史回放一遍。
  if (!o.replay) for (const s of sessionsOf()) known.add(s.sid)

  console.log(`[${ts()}] 探针启动 · ${workspace} · 每 ${o.interval / 1000}s 扫一次 · 会话根 ${root.dir}`)
  if (o.replay) console.log(`[${ts()}] --replay：跳过基线，回放已有会话中的 HIT（自检用，不代表实时触发）`)
  else console.log(`[${ts()}] 基线 ${known.size} 个会话已标记为已知，只跟踪之后新建的`)
  console.log(`[${ts()}] 等待新会话……读到匹配 ${o.keywordRe} 的读取类工具调用会标 <<< HIT`)

  scan()
  if (o.once) { console.log(`[${ts()}] --once：已扫一轮，退出（累计 HIT ${hits} 次）`); return 0 }

  const timer = setInterval(scan, o.interval)
  process.on('SIGINT', () => {
    clearInterval(timer)
    console.log(`\n[${ts()}] 探针停止 · 累计 HIT ${hits} 次`)
    process.exitCode = 0
  })
  return null // 常驻：不设退出码，等 SIGINT
}

try {
  const code = main()
  if (code !== null) process.exitCode = code
} catch (e) {
  if (e instanceof UsageError) { console.error(`[probe] ${e.message}（--help 看用法）`); process.exitCode = 2 }
  else throw e
}
