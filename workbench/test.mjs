import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLibrary } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const proceduresDir = path.join(here, 'fixtures', 'procedures');
const lib = createLibrary(proceduresDir, repoRoot);

test('natural-language symptom routes to the right card', () => {
  const data = lib.search('网页抓不到正文：为什么只有 SPA 空壳？', { limit: 5 });
  assert.equal(data.cards[0]?.file, '抓取-网页空壳.md');
  assert.equal(data.cards.length, 1);
});

test('exact handle routes without noise', () => {
  const data = lib.search('pnpm 安装报 ERR_PNPM_NO_MATCHING_VERSION', { limit: 5 });
  assert.equal(data.cards[0]?.file, '工具-pnpm版本不存在.md');
});

test('unrelated handle returns no matches', () => {
  const data = lib.search('完全不存在的现象 XYZ_999', { limit: 5 });
  assert.equal(data.count, 0);
  assert.deepEqual(data.cards, []);
});

test('quoted phrase must match', () => {
  const hit = lib.search('"网页空壳"', { limit: 5 });
  assert.equal(hit.cards[0]?.file, '抓取-网页空壳.md');
  const miss = lib.search('"根本不存在的短语"', { limit: 5 });
  assert.equal(miss.count, 0);
});

test('layer filter works', () => {
  const data = lib.search('layer:env pnpm', { limit: 5 });
  assert.equal(data.cards[0]?.layer, 'env');
  const empty = lib.search('layer:task pnpm', { limit: 5 });
  assert.equal(empty.count, 0);
});

test('card read returns raw content', () => {
  const card = lib.get('抓取-网页空壳.md');
  assert.match(card.raw, /SPA/);
  assert.equal(lib.get('../secret.md'), null);
});

test('inbox is read-only unless explicitly appended', () => {
  const items = lib.inbox();
  assert.ok(items.length >= 2);
});

test('audit is available and parses', () => {
  const audit = lib.audit();
  assert.equal(audit.available, true);
  assert.ok(audit.parsed);
  assert.equal(typeof audit.parsed.P0.length, 'number');
});

test('template contains required sections', () => {
  const template = lib.template();
  assert.match(template, /触发/);
  assert.match(template, /别再来/);
});
