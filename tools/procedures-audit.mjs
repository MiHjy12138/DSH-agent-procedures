#!/usr/bin/env node
// procedures-audit.mjs —— 卡库静态体检：结构、体积、引用、触发词覆盖、过期线索。
//
// 它是 `procedures-review.mjs` 的静态那一半：
//   audit  看「卡本身写得好不好、引用还成不成立」（不需要会话日志）
//   review 看「卡最近有没有被用、该不该复核」（需要会话日志）
//
// 用法：
//   node tools/procedures-audit.mjs                 # 在当前目录找 procedures/
//   node tools/procedures-audit.mjs --dir <procedures 目录>
//   node tools/procedures-audit.mjs --json          # 机器可读
//   node tools/procedures-audit.mjs --max-bytes 3072
//
// 退出码：0 = 没有 P0/P1 问题；1 = 有（方便丢进 CI）。
// 依赖：只用 node 标准库，跨平台。
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const JSON_OUT = argv.includes('--json');
const MAX_BYTES = Number(arg('--max-bytes', 3072));
const STALE_DAYS = Number(arg('--stale-days', 90));
const DIR = path.resolve(arg('--dir', path.join(process.cwd(), 'procedures')));
// 这些文件不是卡
const META = new Set(['README.md', 'INDEX.md', 'INDEX.template.md', '_模板.md', '_inbox.md', '_layers.md', 'PROJECT.md']);

if (!fs.existsSync(DIR)) {
  console.error(`找不到卡库目录：${DIR}\n用 --dir 指定，或先 cd 到含 procedures/ 的工作区。`);
  process.exit(2);
}

const today = new Date();
const daysBetween = (a, b) => Math.floor(Math.abs(today - a) / 86400000);

// ── 收集卡 ────────────────────────────────────────────────────────────────
const cards = fs.readdirSync(DIR, { withFileTypes: true })
  .filter(e => e.isFile() && e.name.endsWith('.md') && !META.has(e.name))
  .map(e => {
    const full = path.join(DIR, e.name);
    const text = fs.readFileSync(full, 'utf8');
    return { file: e.name, stem: e.name.replace(/\.md$/, ''), full, text, bytes: fs.statSync(full).size, mtime: fs.statSync(full).mtime };
  })
  .sort((a, b) => a.stem.localeCompare(b.stem));
const stems = new Set(cards.map(c => c.stem));

// 分层表（可选）：_layers.md 的 | 卡 | 层 | 表
const layers = new Map();
const layerFile = path.join(DIR, '_layers.md');
if (fs.existsSync(layerFile)) {
  for (const line of fs.readFileSync(layerFile, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const c = t.split('|').map(s => s.trim()).filter(Boolean);
    if (c.length >= 2 && c[0] !== '卡' && ['fixed', 'env', 'task'].includes(c[1])) layers.set(c[0], c[1]);
  }
}

const P0 = [], P1 = [];

// ── 1. 结构完整性 ─────────────────────────────────────────────────────────
const REQUIRED = [['触发', /^>\s*\*\*触发\*\*/m], ['首选', /^##\s*首选/m], ['别再来', /^##\s*别再来/m]];
const OPTIONAL = [['验证', /^>\s*\*\*验证\*\*/m], ['被挡时', /^##\s*被挡时/m], ['注意', /^##\s*注意/m], ['证据', /证据/]];
for (const c of cards) {
  const missing = REQUIRED.filter(([, re]) => !re.test(c.text)).map(([n]) => n);
  if (missing.length) P0.push({ card: c.stem, kind: '结构缺必需段', detail: `缺 ${missing.join(' / ')}` });
  const missOpt = OPTIONAL.filter(([, re]) => !re.test(c.text)).map(([n]) => n);
  if (missOpt.length) P1.push({ card: c.stem, kind: '结构缺可选段', detail: `缺 ${missOpt.join(' / ')}` });
}

// ── 2. 体积 ───────────────────────────────────────────────────────────────
for (const c of cards) if (c.bytes > MAX_BYTES) P1.push({ card: c.stem, kind: '体积超限', detail: `${c.bytes} B > ${MAX_BYTES} B（待精简信号：删解释句、别删命令）` });

// ── 3. 分层缺失 ───────────────────────────────────────────────────────────
if (layers.size) for (const c of cards) if (!layers.has(c.stem)) P1.push({ card: c.stem, kind: '未分层', detail: '_layers.md 里没有它，评审时不知道该按哪个复核期' });

// ── 4. 断链：提到别的卡但那张不存在 ───────────────────────────────────────
const LINK_RES = [
  /procedures[\\/]+([^\s`"'（）()<>]+?\.md)/g,     // procedures\xxx.md
  /见卡\s*[`「]([^`」]+)[`」]/g,                    // 见卡 `xxx`
  /卡\s*[`「]([^`」]{4,})[`」]/g,                    // 卡 `xxx`
];
for (const c of cards) {
  const seen = new Set();
  const lineAt = (idx) => {
    const start = c.text.lastIndexOf('\n', idx) + 1;
    const end = c.text.indexOf('\n', idx);
    return c.text.slice(start, end === -1 ? c.text.length : end);
  };
  for (const re of LINK_RES) {
    let m;
    while ((m = re.exec(c.text))) {
      const ref = m[1].replace(/\.md$/, '').replace(/^procedures[\\/]/, '').trim();
      if (!ref || ref === c.stem || seen.has(ref)) continue;
      seen.add(ref);
      if (stems.has(ref)) continue;                       // 全名命中
      // 允许省略限定后缀：引用「工具-DSH 改完不生效」而卡名是「工具-DSH 改完不生效（判据与层次）」
      const fuzzy = [...stems].some(s => s.startsWith(ref) || s.includes(ref));
      if (fuzzy) continue;
      // 外部来源（别人的包 / 上游）不算本库断链
      if (/外部包|对方包|上游|非本库|来源[:：]/.test(lineAt(m.index))) continue;
      if (!/^[A-Za-z0-9_\-]+$/.test(ref)) P0.push({ card: c.stem, kind: '断链', detail: `引用了不存在的卡「${ref}」` });
    }
  }
}

// ── 5. 对象存在性（只查 Windows 绝对路径，避免把 URL/句子当路径）───────────
// 判据：`X:\` 开头、至少两段、无占位符/通配/变量。POSIX 路径不查（噪声太大且跨平台无意义）。
const PATH_RE = /(?:^|[\s`"'（(])([A-Za-z]:\\[^\s`"'|<>*?()[\]]{3,})/gm;
for (const c of cards) {
  const seen = new Set();
  let m;
  while ((m = PATH_RE.exec(c.text))) {
    let p = m[1].replace(/[.,;:]+$/, '').trim();
    if (p.length < 6 || seen.has(p)) continue;
    if (/[<>$%{}]/.test(p)) continue;                    // 占位符 / 变量
    if (!p.includes('\\')) continue;                     // 只有盘符
    seen.add(p);
    let ok = false;
    try { ok = fs.existsSync(p); } catch { ok = false; }
    if (!ok) P1.push({ card: c.stem, kind: '对象可能已消失', detail: p });
  }
}

// ── 6. 触发词覆盖（只有 1 个说法的卡，静默不命中风险）────────────────────
for (const c of cards) {
  const line = (c.text.match(/^>\s*\*\*触发\*\*[:：]\s*(.+)$/m) || [])[1] || '';
  if (!line) continue;
  const n = line.split(/\s*[/／；;]\s*/).filter(s => s.trim()).length;
  if (n <= 1) P1.push({ card: c.stem, kind: '触发词单一', detail: '只有 1 个现象说法，换个词就静默不命中；建议补 2-3 个同义说法' });
}

// ── 7. 过期线索：卡里最旧的「实测/核对」日期距今太久 ──────────────────────
for (const c of cards) {
  const dates = [...c.text.matchAll(/(20\d{2})-(\d{2})-(\d{2})/g)]
    .map(m => new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    .filter(d => !isNaN(d));
  if (!dates.length) continue;
  const oldest = new Date(Math.min(...dates.map(d => d.getTime())));
  const age = daysBetween(oldest, today);
  if (age > STALE_DAYS) P1.push({ card: c.stem, kind: '结论偏旧', detail: `最早日期 ${oldest.toISOString().slice(0, 10)}（${age} 天前）——环境类卡应先复核再用` });
}

// ── 输出 ──────────────────────────────────────────────────────────────────
const total = cards.length;
const sum = cards.reduce((s, c) => s + c.bytes, 0);
if (JSON_OUT) {
  console.log(JSON.stringify({ at: new Date().toISOString(), dir: DIR, cards: total, bytes: sum, layers: layers.size, P0, P1 }, null, 1));
} else {
  console.log(`卡库体检 · ${total} 张 / ${(sum / 1024).toFixed(1)} KB · ${DIR}`);
  const show = (title, list) => {
    console.log(`\n${title}：${list.length}`);
    for (const x of list.slice(0, 40)) console.log(`  · [${x.card}] ${x.kind} —— ${x.detail}`);
    if (list.length > 40) console.log(`  …还有 ${list.length - 40} 条`);
  };
  show('P0 必须修（断链 / 缺必需段）', P0);
  show('P1 建议处理', P1);
  if (!P0.length && !P1.length) console.log('\n全部通过。');
  else console.log('\n结论：P0 会让人下次读错卡或读不到卡，先修；P1 是提清单给人定的，不是自动改的。');
  console.log('本脚本只读 —— 不写、不删、不改任何卡。处置（补 / 并 / 退役）由使用者审阅后决定。');
}
process.exit(P0.length || P1.length ? 1 : 0);
