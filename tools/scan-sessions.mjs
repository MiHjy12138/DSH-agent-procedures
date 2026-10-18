#!/usr/bin/env node
// scan-sessions.mjs —— 解压并检索某类 agent 宿主的会话日志（zstd 多帧），
// 从历史会话里挖「碰壁 → 正确姿势」的经验，作为写经验卡的原料。
//
// 用法（省略工作区时自动选「会话数最多的那个」，并在 stderr 说明选中的是哪个）：
//   node tools/scan-sessions.mjs list                         列所有工作区及其会话数
//   node tools/scan-sessions.mjs calls  [工作区] [正则]        列工具调用 + 配对结果
//   node tools/scan-sessions.mjs user   [工作区] [正则]        列真人发言（找需求/痛点最快）
//   node tools/scan-sessions.mjs say    [工作区] [正则]        列助手发言（找「原来是这样」的结论）
//
// 工作区 slug 由宿主生成（形如 --<路径里非字母数字换成->--），可省略；也可用 --workspace 指定。
// 正则用 JS 语法，如 "ERR|denied|失败|不生效"。
//
// 会话根目录解析顺序（先命中先用；某个候选无效则自动降级到下一个）：
//   1. 环境变量 DSH_HOME        宿主主目录（脚本实际读 <DSH_HOME>/sessions）
//   2. --sessions <路径>        给 sessions 目录本身、或给它的上级主目录都行
//   3. 环境变量 DSH_SESSIONS    直接给 sessions 目录
//   4. 从当前目录逐级向上找 .dsh  在工作区内直接跑时零配置
//   5. ~/.dsh
//
// 可调参数（括号内为对应环境变量，命令行参数优先）：
//   --max-len <n>  单条参数/结果/发言的截断长度（SCAN_MAXLEN，默认 300）
//   --lines <n>    每个会话最多打印多少行（SCAN_LINES，默认 60）
//   --limit <n>    最多处理多少个会话，按体积降序（SCAN_LIMIT，默认不限）
//   --verbose      打印会话根解析过程等诊断信息（SCAN_VERBOSE=1 等效）
//   --help         看用法
//
// 设计说明：会话文件形如 <sessions>/<工作区>/<会话id>/session.v4.jsonl.zstd，
// 由多个 zstd frame 串联而成，必须按 magic 切分后逐段解压，不能整体解。
//
// ⚠ 失效风险：本脚本按特定宿主（DSH）当前的日志格式与目录约定编写，宿主升级后可能静默读空。
//   它只是可选附件，经验库机制本身不依赖任何工具。详见同目录 README.md。

import { zstdDecompressSync } from 'node:zlib'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve as resolvePath } from 'node:path'
import { homedir } from 'node:os'

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
// 会话文件名有三种历史形态（新→旧）。只认最新的那种会漏掉绝大部分历史：
// 实测同一工作区同一时刻，旧格式有三百多个会话、新格式只有几十个。故三种都认，按新→旧取第一个存在的。
const SESSION_FILES = ['session.v4.jsonl.zstd', 'session.v3.jsonl.zstd', 'session.jsonl.zstd']
const MODES = new Set(['list', 'calls', 'results', 'user', 'say'])

class UsageError extends Error {}

const isDir = (p) => { try { return statSync(p).isDirectory() } catch { return false } }
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d }

// ---------- 参数 ----------

const VALUE_FLAGS = { sessions: 'sessions', workspace: 'workspace', 'max-len': 'maxLen', lines: 'lines', limit: 'limit' }

function parseArgs(argv) {
  const flags = { sessions: null, workspace: null, maxLen: null, lines: null, limit: null, verbose: false, help: false }
  const pos = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') { flags.help = true; continue }
    if (a === '--verbose' || a === '-v') { flags.verbose = true; continue }
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

  let mode = 'list'
  if (pos.length && MODES.has(pos[0])) mode = pos.shift()

  // 工作区可以省略；省略时靠「像 slug」（--xxx--）或「后面还跟着一个参数」来判定它是不是工作区。
  let workspace = flags.workspace ?? null
  if (!workspace && pos.length && (/^--.*--$/.test(pos[0]) || pos.length >= 2)) workspace = pos.shift()
  const pattern = pos.shift() ?? null
  if (pos.length) throw new UsageError(`多余的参数：${pos.join(' ')}（工作区/正则至多各一个）`)

  return {
    mode,
    workspace,
    pattern,
    help: flags.help,
    sessionsFlag: flags.sessions,
    verbose: flags.verbose || !!process.env.SCAN_VERBOSE,
    maxLen: num(flags.maxLen ?? process.env.SCAN_MAXLEN, 300),
    lines: num(flags.lines ?? process.env.SCAN_LINES, 60),
    limit: num(flags.limit ?? process.env.SCAN_LIMIT, 0), // 0 = 不限
  }
}

function printHelp() {
  console.log(`scan-sessions —— 检索 agent 历史会话日志

用法：
  node tools/scan-sessions.mjs [list|calls|results|user|say] [工作区] [正则] [选项]

模式：
  list     列所有工作区及其会话数（默认模式）
  calls    列工具调用与配对结果（最常用于找「试了什么、结果如何」）
  results  只搜「工具结果」里的内容（找报错码/输出——例如搜 FS_NOT_OBSERVED 这类
           只在结果里出现的串；用 calls 搜它会 0 命中，因为 calls 匹配的是参数）
  user     列真人发言（找需求与痛点最快）
  say      列助手发言（找结论）

选项：
  --sessions <路径>   会话根目录，或其上级宿主主目录
  --workspace <slug>  指定工作区（也可作为位置参数给出）
  --max-len <n>       截断长度（默认 300，环境变量 SCAN_MAXLEN）
  --lines <n>         每会话最多打印行数（默认 60，SCAN_LINES）
  --limit <n>         最多处理 N 个会话，按体积降序（默认不限，SCAN_LIMIT）
  --verbose, -v       打印会话根解析过程（SCAN_VERBOSE=1）
  --help, -h          本帮助

会话根解析顺序：DSH_HOME → --sessions → DSH_SESSIONS → cwd 向上找 .dsh → ~/.dsh
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

// 列工作区（只有真正含会话日志的目录才算），按会话数降序。
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

// 候选既可能是宿主主目录（其下有 sessions/），也可能是 sessions 目录本身。
function asSessionsDir(candidate) {
  if (!candidate) return null
  const abs = resolvePath(candidate)
  if (!isDir(abs)) return null
  const nested = join(abs, 'sessions')
  if (isDir(nested)) return nested
  return workspacesIn(abs).length ? abs : null
}

// 从 startDir 逐级向上找名为 name 的目录：在工作区里直接跑脚本时无需任何配置。
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
    if (dir) return { dir, label, cand, tried }
  }
  return { dir: null, tried }
}

// ---------- 解码与提取 ----------

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

function sessionsOf(root, wsFilter) {
  const out = []
  if (!isDir(root)) return out
  for (const ws of readdirSync(root)) {
    if (wsFilter && ws !== wsFilter) continue
    const wsPath = join(root, ws)
    if (!isDir(wsPath)) continue
    for (const sid of readdirSync(wsPath)) {
      const p = join(wsPath, sid)
      if (!isDir(p)) continue
      const f = sessionFileIn(p)
      if (!f) continue
      let size = 0
      try { size = statSync(f).size } catch { continue }
      out.push({ ws, sid, f, size })
    }
  }
  return out.sort((a, b) => b.size - a.size)
}

// v3 的结果块是嵌套的 {type:'tool-result', content:[{type:'text'}]}，v4 则是 {type:'text'} 直挂。
// 只认顶层 type==='text' 会让 v3 会话的结果全部读空，所以这里必须递归下去。
const blocks = (m) => {
  const out = []
  const walk = (arr) => {
    for (const b of arr ?? []) {
      if (b?.type === 'text' && typeof b.text === 'string') out.push(b.text)
      else if (Array.isArray(b?.content)) walk(b.content)
    }
  }
  walk(m?.content)
  return out.join(' ').replace(/\s+/g, ' ').trim()
}

// ---------- 主流程 ----------

function main() {
  const o = parseArgs(process.argv.slice(2))
  if (o.help) { printHelp(); return 0 }

  const root = resolveSessionsRoot(o.sessionsFlag)
  if (o.verbose) for (const line of root.tried) console.error(`[scan-sessions] 候选 ${line}`)
  if (!root.dir) {
    console.error('[scan-sessions] 找不到会话根目录。已尝试：')
    for (const line of root.tried) console.error(`  ${line}`)
    console.error('  用 --sessions <路径> 或环境变量 DSH_HOME / DSH_SESSIONS 指定。')
    return 2
  }
  if (o.verbose) console.error(`[scan-sessions] 会话根目录: ${root.dir}（来自 ${root.label}）`)
  // DSH_HOME 按约定排在 --sessions 之前；显式传了却被忽略时要说一声，不然会莫名「没生效」。
  if (o.sessionsFlag && root.label !== '--sessions') {
    console.error(`[scan-sessions] 注意：--sessions 被忽略，实际用的是 ${root.label}（${root.dir}）`)
  }

  const wsList = workspacesIn(root.dir)

  if (o.mode === 'list') {
    if (o.workspace) {
      const hit = wsList.find(w => w.ws === o.workspace)
      if (!hit) {
        console.error(`[scan-sessions] 会话根下没有含会话的工作区 "${o.workspace}"。现有：`)
        for (const w of wsList.slice(0, 10)) console.error(`  ${w.ws}`)
        return 2
      }
      console.log(`${String(hit.sessions).padStart(4)} 个会话  ${hit.ws}`)
      return 0
    }
    if (!wsList.length) console.error('[scan-sessions] 会话根下没有找到任何含会话的工作区。')
    for (const w of wsList) console.log(`${String(w.sessions).padStart(4)} 个会话  ${w.ws}`)
    return 0
  }

  let workspace = o.workspace
  if (!workspace) {
    if (!wsList.length) { console.error('[scan-sessions] 会话根下没有找到任何含会话的工作区。'); return 2 }
    workspace = wsList[0].ws
    console.error(`[scan-sessions] 未指定工作区 → 自动选择会话最多的：${workspace}（${wsList[0].sessions} 个会话）`)
  } else if (!wsList.some(w => w.ws === workspace)) {
    console.error(`[scan-sessions] 会话根下没有含会话的工作区 "${workspace}"。现有：`)
    for (const w of wsList.slice(0, 10)) console.error(`  ${w.ws}`)
    return 2
  }

  let re = null
  if (o.pattern) {
    try { re = new RegExp(o.pattern, 'i') } catch (e) { throw new UsageError(`正则不合法：${e.message}`) }
  }
  const limit = o.limit || Infinity

  for (const { ws, sid, f, size } of sessionsOf(root.dir, workspace).slice(0, limit)) {
    let text
    try { text = decode(readFileSync(f)) } catch { continue }
    const events = []
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      try { events.push(JSON.parse(line)) } catch {}
    }
    // 先收齐全部 tool/result 再配对：日志里 call 总是出现在它的 result 之前，
    // 单趟遍历时 result 表还是空的，RES 会永远显示「(无结果)」。
    const results = new Map()
    const callNames = new Map()   // callId → 工具名（results 模式显示用）
    for (const e of events) {
      if (e.type === 'tool/call') {
        const cid = e.data?.callId
        if (cid) callNames.set(cid, e.data?.name ?? '?')
        continue
      }
      if (e.type !== 'tool/result') continue
      const cid = e.data?.callId ?? e.data?.message?.source?.callId ?? e.data?.toolCallId
      if (cid) results.set(cid, { t: blocks(e.data?.message), err: e.data?.error ?? (e.data?.message?.isError ? 'isError' : null) })
    }
    const lines = []
    for (const e of events) {
      if (o.mode === 'calls' && e.type === 'tool/call') {
        const a = JSON.stringify(e.data?.arguments ?? {})
        if (re && !re.test(a)) continue
        const r = results.get(e.data?.callId)
        const res = r ? (r.err ? 'ERR ' + JSON.stringify(r.err).slice(0, 200) : r.t.slice(0, o.maxLen)) : '(无结果)'
        lines.push(`[t${e.data?.turn}] ${e.data?.name}\n   ARG: ${a.slice(0, o.maxLen)}\n   RES: ${res}`)
        continue
      }
      if (o.mode === 'results' && e.type === 'tool/result') {
        // 结果里才有真正发生过的报错码 / 输出：calls 只匹配参数，搜「FS_NOT_OBSERVED」这类必然 0 命中
        const t = blocks(e.data?.message)
        if (!t || (re && !re.test(t))) continue
        const cid = e.data?.callId ?? e.data?.message?.source?.callId ?? '?'
        const nm = callNames.get(cid) ?? '?'
        lines.push(`[t${e.data?.turn ?? '?'}] ${nm} (${cid})\n   RES: ${t.slice(0, o.maxLen)}`)
        continue
      }
      if (o.mode === 'user' && e.type === 'user/message' && e.data?.source?.kind === 'user') {
        const t = blocks(e.data)
        if (!t || (re && !re.test(t))) continue
        lines.push(t.slice(0, o.maxLen))
        continue
      }
      if (o.mode === 'say' && e.type === 'assistant/message') {
        const t = blocks(e.data?.message)
        if (!t || (re && !re.test(t))) continue
        lines.push(t.slice(0, o.maxLen))
      }
    }
    if (!lines.length) continue
    console.log(`\n########## ${sid}  (${(size / 1024).toFixed(0)} KB)  ${ws} ##########`)
    for (const l of lines.slice(0, o.lines)) console.log(`\n${l}`)
  }
  return 0
}

try {
  process.exitCode = main()
} catch (e) {
  if (e instanceof UsageError) { console.error(`[scan-sessions] ${e.message}（--help 看用法）`); process.exitCode = 2 }
  else throw e
}
