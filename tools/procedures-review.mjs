#!/usr/bin/env node
// procedures-review.mjs —— 卡库评审：谁该被复核、体积有没有撞红线。
//
// 分层：读 procedures\_layers.md 的「卡 | 层」表，按层给复核期
//   fixed（原理/语法）→ 永不提名   env（版本/路径）→ 90 天   task（任务型）→ 180 天
//
// 用法：
//   node _tools/procedures-review.mjs                 # 按分层的复核期
//   node _tools/procedures-review.mjs --days 14       # 强制全局阈值（覆盖分层）
//   node _tools/procedures-review.mjs --json          # 给别的脚本吃
//   node _tools/procedures-review.mjs --limit 500     # 最多扫多少个会话（按体积降序）
//
// 只统计「读取类」工具（read/grep/glob/ops_inspect/ops_grep/ops_glob）里出现卡名，
// write/edit/ops_replace 是在产卡、不算触发 —— 与卡 `工具-会话探针` 的判据一致。
import { zstdDecompressSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { homedir } from 'node:os';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const DAYS_OVERRIDE = argv.includes('--days') ? Number(arg('--days', 0)) : null;
const INCLUDE_RESULTS = argv.includes('--include-results');   // 结果里出现卡名也算被读（更硬的证据）
const GRACE_DAYS = Number(arg('--grace', 7));   // 新建卡的宽限期：刚建就问「要不要删」是噪声
const LIMIT = Number(arg('--limit', 400));
const JSON_OUT = argv.includes('--json');

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const PROC = resolve(arg('--procedures', join(ROOT, 'procedures')));
const META = new Set(['README.md', 'INDEX.md', '_模板.md', '_inbox.md', '_layers.md']);

// ── 红线（2026-10-18 定，依据见 procedures\README.md）────────────────────────
const LIMIT_INDEX = 2048;
const LIMIT_NAMES = 3072;
const LIMIT_TOTAL = 163840;

// ── 分层与复核期 ───────────────────────────────────────────────────────────
const LAYER_DAYS = { fixed: Infinity, env: 90, task: 180 };
function readLayers(file) {
  const m = new Map();
  if (!existsSync(file)) return m;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|') || /^\|\s*-+/.test(t) || /^\|\s*卡\s*\|/.test(t)) continue;
    const cells = t.split('|').map(s => s.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    if (cells[0] === '卡' || cells[1] === '层') continue;   // 表头
    if (LAYER_DAYS[cells[1]] !== undefined) m.set(cells[0], cells[1]);
  }
  return m;
}
const LAYERS = readLayers(join(PROC, '_layers.md'));

// ── 找 sessions 根 ─────────────────────────────────────────────────────────
function findSessions() {
  const cands = [];
  if (process.env.DSH_SESSIONS) cands.push(process.env.DSH_SESSIONS);
  if (process.env.DSH_HOME) cands.push(join(process.env.DSH_HOME, 'sessions'));
  let d = ROOT;
  for (let i = 0; i < 6; i++) { cands.push(join(d, '.dsh', 'sessions')); d = dirname(d); }
  cands.push(join(homedir(), '.dsh', 'sessions'));
  return cands.find(p => existsSync(p)) || null;
}
const slugOf = (p) => '--' + p.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '--';

// ── 多帧 zstd 解压（见卡 `文件-DSH会话日志解析`）────────────────────────────
function decode(file) {
  const buf = readFileSync(file);
  const pos = [];
  for (let i = 0; i + 4 <= buf.length; i++) if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) pos.push(i);
  pos.push(buf.length);
  let txt = '';
  for (let i = 0; i < pos.length - 1; i++) { try { txt += zstdDecompressSync(buf.subarray(pos[i], pos[i + 1])).toString('utf8'); } catch {} }
  return txt;
}

// ── 卡清单与体积 ───────────────────────────────────────────────────────────
if (!existsSync(PROC)) {
  console.error(`找不到卡库目录：${PROC}\n用 --procedures <目录> 指定，或先 cd 到含 procedures/ 的工作区。`);
  process.exit(2);
}
const cards = readdirSync(PROC).filter(f => f.endsWith('.md') && !META.has(f)).map(f => {
  const full = join(PROC, f);
  return { name: f, stem: basename(f, '.md'), bytes: statSync(full).size, mtime: statSync(full).mtime };
}).sort((a, b) => a.name.localeCompare(b.name));
const indexBytes = existsSync(join(PROC, 'INDEX.md')) ? statSync(join(PROC, 'INDEX.md')).size : 0;
const nameBytes = Buffer.byteLength(cards.map(c => c.stem).join('\n'), 'utf8');
const totalBytes = cards.reduce((s, c) => s + c.bytes, 0);

// ── 扫会话 ─────────────────────────────────────────────────────────────────
const READ_TOOLS = new Set(['read', 'grep', 'glob', 'ops_inspect_local_file', 'ops_grep', 'ops_glob', 'ops_read', 'list_dir']);
const sessRoot = findSessions();
const hits = new Map(cards.map(c => [c.name, { count: 0, last: 0 }]));
let scanned = 0, calls = 0, errs = 0;
if (sessRoot) {
  const slug = slugOf(ROOT);
  const dirs = [join(sessRoot, slug)].filter(existsSync);
  const files = [];
  for (const d of dirs) for (const sid of readdirSync(d)) {
    const sub = join(d, sid);
    try { if (!statSync(sub).isDirectory()) continue; } catch { continue; }
    for (const f of readdirSync(sub)) if (f.startsWith('session') && f.includes('.jsonl')) {
      const p = join(sub, f); try { files.push({ p, size: statSync(p).size }); } catch {}
    }
  }
  files.sort((a, b) => b.size - a.size);
  const seen = new Set();
  for (const { p } of files.slice(0, LIMIT)) {
    let txt; try { txt = decode(p); } catch { errs++; continue; }
    scanned++;
    const hasCall = txt.includes('"tool/call"');
    const hasResult = INCLUDE_RESULTS && txt.includes('"tool/result"');
    if (!hasCall && !hasResult) continue;
    for (const line of txt.split('\n')) {
      const isCall = line.includes('"tool/call"');
      const isResult = hasResult && line.includes('"tool/result"');
      if (!isCall && !isResult) continue;
      let e; try { e = JSON.parse(line); } catch { continue; }
      let hay = '', t = 0;
      if (e.type === 'tool/call') {
        const name = e.data?.name || e.name;
        if (!READ_TOOLS.has(name)) continue;
        hay = String(e.data?.arguments ?? e.arguments ?? '');
        t = Number(e.data?.time ?? e.time ?? 0);
      } else if (e.type === 'tool/result' && INCLUDE_RESULTS) {
        // 结果里出现卡名 = 那次读取真的取到了这张卡的内容（比只看参数更硬的证据）
        const msg = e.data?.message;
        hay = (msg?.content || []).filter(c => c?.type === 'text').map(c => c.text || '').join('\n');
        t = Number(e.time ?? e.data?.time ?? 0);
        if (!hay) continue;
      } else continue;
      const key = (e.data?.callId || e.data?.message?.toolCallId || e.callId || '') + '@' + (e.sessionId || '');
      if (seen.has(key)) continue; seen.add(key);
      if (hay.length) calls++;
      for (const c of cards) if (hay.includes(c.stem)) { const h = hits.get(c.name); h.count++; h.last = Math.max(h.last, t); }
    }
  }
}

// ── 出结果 ─────────────────────────────────────────────────────────────────
const now = Date.now();
const graceFor = (ageDays) => ageDays < GRACE_DAYS;
const rows = cards.map(c => {
  const h = hits.get(c.name);
  const layer = LAYERS.get(c.stem) ?? null;
  const dueDays = DAYS_OVERRIDE ?? (layer ? LAYER_DAYS[layer] : 90);
  const idle = h.last ? Math.floor((now - h.last) / 86400000) : null;
  const ageDays = Math.floor((now - c.mtime.getTime()) / 86400000);
  const never = h.count === 0;
  const inGrace = never && graceFor(ageDays);
  const due = layer !== 'fixed' && !inGrace && (never || idle >= dueDays);
  return { card: c.stem, bytes: c.bytes, reads: h.count, lastRead: h.last ? new Date(h.last).toISOString().slice(0, 10) : null, mtime: c.mtime.toISOString().slice(0, 10), ageDays, idleDays: idle, layer, dueDays: dueDays === Infinity ? null : dueDays, inGrace, due };
});

const over = { index: indexBytes > LIMIT_INDEX, names: nameBytes > LIMIT_NAMES, total: totalBytes > LIMIT_TOTAL };
const verdict = (over.index || over.names || over.total) ? 'OVER' : 'OK';
const unlayered = rows.filter(r => !r.layer);
const dueRows = rows.filter(r => r.due).sort((a, b) => (b.idleDays ?? 9999) - (a.idleDays ?? 9999));
const graceRows = rows.filter(r => r.inGrace);
const fixedNever = rows.filter(r => r.layer === 'fixed' && r.reads === 0);

if (JSON_OUT) {
  console.log(JSON.stringify({ at: new Date().toISOString(), sessionsRoot: sessRoot, scanned, calls, errs, limits: { LIMIT_INDEX, LIMIT_NAMES, LIMIT_TOTAL }, size: { indexBytes, nameBytes, totalBytes, cards: cards.length }, verdict, over, layers: LAYER_DAYS, unlayered: unlayered.map(r => r.card), due: dueRows, rows }, null, 1));
} else {
  console.log(`卡库评审 · ${new Date().toLocaleString('zh-CN')}`);
  console.log(`会话根 ${sessRoot ?? '未找到'} ｜ 扫 ${scanned} 个会话 / ${calls} 次读取类调用${errs ? ` / ${errs} 个解压失败` : ''}`);
  console.log(`红线 ${verdict} —— INDEX ${indexBytes}/${LIMIT_INDEX} B ｜ 卡名 ${nameBytes}/${LIMIT_NAMES} B ｜ 卡库 ${totalBytes}/${LIMIT_TOTAL} B（${cards.length} 张）`);
  const byLayer = { env: 0, task: 0, fixed: 0 };
  for (const r of rows) if (r.layer) byLayer[r.layer]++;
  console.log(`分层 ${rows.length - unlayered.length}/${rows.length} —— env ${byLayer.env} / task ${byLayer.task} / fixed ${byLayer.fixed}${unlayered.length ? ` / 未分层 ${unlayered.length}` : ''}`);
  if (unlayered.length) { console.log('  未分层（去 _layers.md 补登）:'); for (const r of unlayered) console.log(`    · ${r.card}`); }

  console.log(`\n该问的（按分层复核期）：${dueRows.length} 张`);
  for (const r of dueRows) {
    const when = r.reads === 0 ? '从没被整份读过' : `${r.idleDays} 天没被读`;
    console.log(`  · [${r.layer ?? '?'}/${r.dueDays ?? '?'}d] ${r.card} —— ${when}`);
  }
  if (!dueRows.length) console.log('  （无）');
  if (graceRows.length) console.log(`\n宽限期内（建卡 < ${GRACE_DAYS} 天，不提名）：${graceRows.length} 张`);

  if (fixedNever.length) {
    console.log(`\n不过期层里从没被读过的：${fixedNever.length} 张 —— 不提名复不复核，仅作记录：`);
    for (const r of fixedNever) console.log(`  · ${r.card}`);
  }
  const top = [...rows].sort((a, b) => b.reads - a.reads).slice(0, 3);
  console.log(`\n命中最多：${top.map(r => `${r.card}（${r.reads}）`).join(' · ')}`);
  if (verdict === 'OK') console.log('\n红线全绿：不用分册。');
  else console.log('\n有红线超标 → 按 README「评审与红线」一节分域分册，grep 加 -r。');
  console.log('\n口径：只统计 read/grep/glob 里出现卡名 = 被取用；列目录挑卡天然不计入，所以「没被读」≠「没用」。');
  console.log('候选只提不删 —— 保留 / 改触发词 / 并卡 / 退役 都由创作者定。');
}
