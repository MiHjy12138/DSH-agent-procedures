import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const META = new Set([
  'README.md', 'INDEX.md', 'INDEX.template.md', '_模板.md', '_inbox.md',
  '_layers.md', 'PROJECT.md', 'catalog.jsonl',
]);

const CJK_STOP = /为什么|为何|怎么|怎样|如何|什么|哪些|哪个|是否|只有|这个|那个|问题|可以|应该|需要|一下|现在|之前|然后|以及|一个|一些|我们|你们|他们|真的|还是|就是|因为|所以|但是|如果|已经|没有|不能|可能|有关|关于|请问/g;
const EN_STOP = new Set([
  'why', 'how', 'what', 'which', 'the', 'a', 'an', 'is', 'are', 'was', 'were',
  'to', 'of', 'for', 'in', 'on', 'and', 'or', 'with', 'this', 'that', 'it',
  'be', 'do', 'does', 'did', 'can', 'should', 'would', 'could', 'please',
]);

function readLayers(proceduresDir) {
  const file = path.join(proceduresDir, '_layers.md');
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.split('|').map((s) => s.trim()).filter(Boolean);
    if (cells.length < 2 || cells[0] === '卡' || /^\|?\s*-+/.test(t)) continue;
    if (['fixed', 'env', 'task'].includes(cells[1])) map.set(cells[0], cells[1]);
  }
  return map;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!stat.isFile() || !entry.name.endsWith('.md') || META.has(entry.name)) continue;
    out.push(full);
  }
  return out;
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return '';
}

function parseCard(proceduresDir, full, layers) {
  const text = fs.readFileSync(full, 'utf8');
  const rel = path.relative(proceduresDir, full).replaceAll('\\', '/');
  const name = path.basename(rel, '.md');
  const stat = fs.statSync(full);
  const trigger = firstMatch(text, [
    />\s*\*\*触发\*\*\s*[:：]\s*(.+)$/im,
    />\s*触发\s*[:：]\s*(.+)$/im,
  ]);
  const explicitLayer = firstMatch(text, [
    />\s*\*\*(?:层|layer)\*\*\s*[:：]\s*(.+)$/im,
  ]);
  return {
    file: rel,
    name,
    title: firstMatch(text, [/^#\s+(.+)$/m]) || name,
    trigger,
    layer: explicitLayer || layers.get(name) || '',
    status: firstMatch(text, [/>\s*\*\*状态\*\*\s*[:：]\s*(.+)$/im]),
    bytes: stat.size,
    updated: stat.mtime.toISOString(),
    raw: text,
    summary: trigger || text.replace(/^#.*$/m, '').replace(/\s+/g, ' ').trim().slice(0, 180),
  };
}

function cjkTerms(text) {
  const terms = new Set();
  for (const run of text.match(/[\u3400-\u9fff]+/g) ?? []) {
    if (run.length <= 6) terms.add(run);
    for (const n of [2, 3]) {
      if (run.length < n) continue;
      for (let i = 0; i + n <= run.length; i += 1) terms.add(run.slice(i, i + n));
    }
  }
  return terms;
}

function parseQuery(input) {
  let text = String(input ?? '').trim();
  const filters = { layer: '', file: '', title: '', trigger: '' };
  for (const key of Object.keys(filters)) {
    const re = new RegExp(`(?:^|\\s)${key}:("[^"]+"|\\S+)`, 'i');
    const match = text.match(re);
    if (match) {
      filters[key] = match[1].replace(/^"|"$/g, '');
      text = text.replace(match[0], ' ').trim();
    }
  }

  const phrases = [];
  for (const match of text.matchAll(/"([^"]+)"|“([^”]+)”|'([^']+)'/g)) {
    const phrase = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (phrase.length >= 2) phrases.push(phrase.toLowerCase());
  }

  const hasContent = Boolean(text.trim());
  const cleaned = text.replace(CJK_STOP, ' ').replace(/\s+/g, ' ').trim();
  const lower = cleaned.toLowerCase();
  const terms = new Set(cjkTerms(lower));
  for (const ascii of lower.match(/[a-z0-9][a-z0-9_.:/\\-]{1,}/g) ?? []) {
    if (!EN_STOP.has(ascii)) terms.add(ascii);
  }

  const handles = new Set();
  for (const match of lower.match(/[a-z0-9_./\\-]+\.(?:md|mjs|js|ts|json|ps1|cmd|yml|yaml)/g) ?? []) handles.add(match);
  for (const match of lower.match(/\b[a-z][a-z0-9]*_[a-z0-9_]+\b/g) ?? []) handles.add(match);
  for (const match of lower.match(/\b(?:pnpm|npm|node|git|pwsh|powershell|python|docker|kubectl|curl)\b/g) ?? []) handles.add(match);
  for (const match of lower.match(/\b[a-z0-9]+:[a-z0-9_.:/\\-]+\b/g) ?? []) handles.add(match);

  return {
    text: lower,
    hasContent,
    phrases: [...new Set(phrases)],
    terms: [...terms],
    handles: [...handles],
    filters,
  };
}

function scoreText(value, query) {
  const hay = String(value).toLowerCase();
  let score = 0;
  let hits = 0;

  for (const phrase of query.phrases) {
    if (hay.includes(phrase)) { score += 9; hits += 1; }
  }
  for (const handle of query.handles) {
    if (hay.includes(handle)) { score += 5; hits += 1; }
  }
  for (const term of query.terms) {
    if (term.length < 2) continue;
    if (hay.includes(term)) {
      hits += 1;
      score += term.length >= 3 ? 2 : 1;
    }
  }
  return { score, hits };
}

function scoreCard(card, query, df, total) {
  const name = card.name.toLowerCase();
  const title = card.title.toLowerCase();
  const trigger = card.trigger.toLowerCase();
  const file = card.file.toLowerCase();
  const raw = card.raw.toLowerCase();
  let score = 0;
  let hits = 0;

  for (const phrase of query.phrases) {
    if (name.includes(phrase) || file.includes(phrase)) { score += 14; hits += 1; }
    if (title.includes(phrase)) { score += 10; hits += 1; }
    if (trigger.includes(phrase)) { score += 8; hits += 1; }
    if (raw.includes(phrase)) { score += 4; hits += 1; }
  }
  for (const handle of query.handles) {
    if (name.includes(handle) || file.includes(handle)) { score += 8; hits += 1; }
    if (trigger.includes(handle)) { score += 6; hits += 1; }
    if (raw.includes(handle)) { score += 4; hits += 1; }
  }
  for (const term of query.terms) {
    if (term.length < 2) continue;
    const weight = 1 + Math.log((total + 1) / ((df.get(term) ?? 0) + 1));
    if (name.includes(term) || file.includes(term)) { score += weight * 1.7; hits += 1; }
    else if (trigger.includes(term)) { score += weight * 1.35; hits += 1; }
    else if (title.includes(term)) { score += weight; hits += 1; }
    else if (raw.includes(term)) { score += weight * 0.55; hits += 1; }
  }
  return { score, hits };
}

function makeSnippet(card, query) {
  const text = card.raw.replace(/\s+/g, ' ');
  const needles = [...query.phrases, ...query.handles, ...query.terms]
    .filter((x) => x.length >= 2)
    .sort((a, b) => b.length - a.length);
  for (const needle of needles) {
    const i = text.toLowerCase().indexOf(needle);
    if (i < 0) continue;
    const start = Math.max(0, i - 50);
    return `${start > 0 ? '…' : ''}${text.slice(start, start + 170)}${start + 170 < text.length ? '…' : ''}`;
  }
  return card.summary;
}

export function createLibrary(proceduresDir, repoRoot) {
  const root = path.resolve(proceduresDir);
  if (!fs.existsSync(root)) throw new Error(`找不到 procedures 目录：${root}`);

  function layers() {
    return readLayers(root);
  }

  function all() {
    const map = layers();
    return walk(root)
      .map((full) => parseCard(root, full, map))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function get(file) {
    const clean = String(file ?? '').replaceAll('\\', '/');
    if (!clean.endsWith('.md') || clean.split('/').length !== 1 || META.has(clean)) return null;
    const full = path.resolve(root, clean);
    if (!full.startsWith(root + path.sep) || !fs.existsSync(full)) return null;
    return parseCard(root, full, layers());
  }

  function search(input, options = {}) {
    const query = parseQuery(input);
    const limit = Math.max(1, Math.min(100, Number(options.limit ?? 20)));
    const layer = options.layer || query.filters.layer;
    const cards = all();
    const results = [];
    const total = cards.length;

    const hayOf = (card) => `${card.name} ${card.title} ${card.trigger} ${card.file} ${card.raw}`.toLowerCase();
    const df = new Map();
    for (const term of query.terms) {
      if (term.length < 2) continue;
      df.set(term, cards.reduce((n, card) => n + (hayOf(card).includes(term) ? 1 : 0), 0));
    }
    const minScore = query.phrases.length || query.handles.length
      ? 2
      : query.text.length <= 4
        ? 1.5
        : 2.2;

    if (query.hasContent && !query.text && !query.phrases.length && !query.handles.length && !query.terms.length) {
      return { query: input, terms: [], handles: [], phrases: [], count: 0, cards: [] };
    }

    for (const card of cards) {
      const hay = hayOf(card);
      if (layer && card.layer !== layer) continue;
      if (query.filters.file && !card.file.toLowerCase().includes(query.filters.file.toLowerCase())) continue;
      if (query.filters.title && !card.title.toLowerCase().includes(query.filters.title.toLowerCase())) continue;
      if (query.filters.trigger && !card.trigger.toLowerCase().includes(query.filters.trigger.toLowerCase())) continue;
      if (query.handles.length && !query.handles.some((handle) => hay.includes(handle))) continue;
      if (query.phrases.length && !query.phrases.some((phrase) => hay.includes(phrase))) continue;
      if (!query.text && !query.phrases.length && !query.handles.length && !query.terms.length) {
        results.push({ ...card, score: 0, hits: 0, snippet: card.summary });
        continue;
      }
      const scored = scoreCard(card, query, df, total);
      if (scored.score >= minScore) {
        results.push({ ...card, ...scored, snippet: makeSnippet(card, query) });
      }
    }

    results.sort((a, b) => (
      query.text
        ? b.score - a.score || b.updated.localeCompare(a.updated) || a.name.localeCompare(b.name)
        : b.updated.localeCompare(a.updated) || a.name.localeCompare(b.name)
    ));

    return {
      query: input,
      terms: query.terms,
      handles: query.handles,
      phrases: query.phrases,
      count: results.length,
      cards: results.slice(0, limit).map((card) => ({
        file: card.file,
        name: card.name,
        title: card.title,
        trigger: card.trigger,
        layer: card.layer,
        status: card.status,
        bytes: card.bytes,
        updated: card.updated,
        score: card.score,
        hits: card.hits,
        snippet: card.snippet,
      })),
    };
  }

  function inbox() {
    const file = path.join(root, '_inbox.md');
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((text, index) => ({ id: index, text }));
  }

  function appendInbox(text) {
    const file = path.join(root, '_inbox.md');
    const clean = String(text ?? '').replace(/\r?\n/g, ' ').trim();
    if (!clean) throw new Error('inbox 内容为空');
    const prefix = fs.existsSync(file) ? '' : '# 待整理 inbox\n\n';
    fs.appendFileSync(file, `${prefix}- ${clean}\n`, 'utf8');
    return inbox();
  }

  function audit() {
    const file = path.join(repoRoot, 'tools', 'procedures-audit.mjs');
    if (!fs.existsSync(file)) return { available: false, error: 'procedures-audit.mjs not found' };
    const result = spawnSync(process.execPath, [file, '--dir', root, '--json'], {
      encoding: 'utf8',
      timeout: 15000,
    });
    let parsed = null;
    try { parsed = JSON.parse(result.stdout); } catch { /* raw below */ }
    return {
      available: true,
      exitCode: result.status,
      parsed,
      raw: parsed ? '' : result.stdout.trim(),
    };
  }

  function template() {
    const file = path.join(repoRoot, 'templates', 'card-template.md');
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
    return `# <分类>-<现象>\n\n> **触发**：<任务里会出现的现象>\n> **验证**：<怎么确认这次真的成了>\n\n## 首选\n\n<可直接复制的那一条>\n\n## 被挡时\n\n<兜底>\n\n## 别再来\n\n| 弯路 | 为什么不通 |\n| --- | --- |\n| <试过并失败的> | <报错原文 / 为什么不成立> |\n\n## 注意\n\n- <为什么会错>\n\n证据：<会话 id / commit / 文件路径>\n`;
  }

  return { proceduresDir: root, repoRoot, all, get, search, inbox, appendInbox, audit, template, layers };
}
