#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLibrary } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(name);

const command = argv[0];
const positional = [];
for (let i = 1; i < argv.length; i += 1) {
  const value = argv[i];
  if (value.startsWith('--')) {
    if (['--workspace', '--procedures', '--limit', '--layer', '--add'].includes(value)) i += 1;
    continue;
  }
  positional.push(value);
}

const workspace = path.resolve(arg('--workspace', process.cwd()));
const proceduresDir = path.resolve(arg('--procedures', path.join(workspace, 'procedures')));
const json = has('--json');

function help() {
  console.log(`用法：
  node workbench/cli.mjs search "<目标: 条件，决策/验证?>" [--limit 5] [--layer fixed|env|task] [--json]
  node workbench/cli.mjs show <文件名>
  node workbench/cli.mjs audit [--json]
  node workbench/cli.mjs inbox [--add "一行"]

环境：
  --workspace <repo>   含 procedures/ 的仓库，默认当前目录
  --procedures <dir>   直接指定 procedures 目录

搜索只作用于当前工作区；结果只返回路径/标题/摘要，不整库注入。
只有任务依赖先前经验或历史决策时才搜，不要每个任务都搜。`);
}

if (!command || command === '--help' || command === '-h') {
  help();
  process.exit(0);
}

let lib;
try {
  lib = createLibrary(proceduresDir, repoRoot);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

if (command === 'search') {
  const query = positional.join(' ').trim() || arg('--q', '');
  if (!query) {
    console.error('缺少查询。例：search "网页抓不到正文：为什么只有 SPA 空壳？"');
    process.exit(2);
  }
  const data = lib.search(query, {
    limit: Number(arg('--limit', '5')),
    layer: arg('--layer', ''),
  });
  if (json) {
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
  }
  if (!data.count) {
    console.log('no matches');
    process.exit(0);
  }
  for (const card of data.cards) {
    console.log(`${card.file}\t[${card.layer || 'card'}]\t${card.title}`);
    console.log(`  ${card.snippet}`);
  }
  process.exit(0);
}

if (command === 'show') {
  const file = positional.join(' ').trim();
  if (!file) {
    console.error('缺少文件名');
    process.exit(2);
  }
  const card = lib.get(file);
  if (!card) {
    console.error(`not found: ${file}`);
    process.exit(2);
  }
  if (json) {
    console.log(JSON.stringify(card, null, 2));
    process.exit(0);
  }
  console.log(card.raw);
  process.exit(0);
}

if (command === 'audit') {
  const audit = lib.audit();
  if (json) {
    console.log(JSON.stringify(audit, null, 2));
    process.exit(audit.parsed?.P0?.length ? 1 : 0);
  }
  if (!audit.available) {
    console.error(audit.error);
    process.exit(2);
  }
  if (!audit.parsed) {
    console.log(audit.raw);
    process.exit(audit.exitCode ?? 1);
  }
  const p0 = audit.parsed.P0 ?? [];
  const p1 = audit.parsed.P1 ?? [];
  console.log(`${audit.parsed.cards ?? 0} cards, ${audit.parsed.bytes ?? 0} bytes, P0=${p0.length}, P1=${p1.length}`);
  for (const issue of [...p0, ...p1]) {
    console.log(`${issue.card}\t${issue.kind}\t${issue.detail ?? ''}`);
  }
  process.exit(p0.length ? 1 : 0);
}

if (command === 'inbox') {
  const add = arg('--add', '');
  if (add) {
    lib.appendInbox(add);
    console.log('added');
    process.exit(0);
  }
  const items = lib.inbox();
  if (!items.length) {
    console.log('inbox empty');
    process.exit(0);
  }
  for (const item of items) console.log(`${item.id}\t${item.text}`);
  process.exit(0);
}

console.error(`unknown command: ${command}`);
help();
process.exit(2);
