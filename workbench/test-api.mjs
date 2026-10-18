import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const server = path.join(here, 'server.mjs');
const fixtures = path.join(here, 'fixtures', 'procedures');

function copyFixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-api-'));
  fs.cpSync(fixtures, path.join(dir, 'procedures'), { recursive: true });
  return dir;
}

async function waitFor(url, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not start: ${url}`);
}

test('server API: search, conflict, layer, audit', async () => {
  const dir = copyFixtures();
  const port = 4300 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, [server, '--procedures', path.join(dir, 'procedures'), '--port', String(port)], {
    stdio: 'ignore',
  });
  try {
    await waitFor(`http://127.0.0.1:${port}/api/state`);
    const base = `http://127.0.0.1:${port}`;

    const state = await (await fetch(`${base}/api/state`)).json();
    assert.equal(state.cards, 3);

    const search = await (await fetch(`${base}/api/cards?q=${encodeURIComponent('网页抓不到正文：为什么只有 SPA 空壳？')}`)).json();
    assert.equal(search.count, 1);
    assert.equal(search.cards[0].file, '抓取-网页空壳.md');
    assert.ok(Array.isArray(search.terms));

    const first = await (await fetch(`${base}/api/card?file=${encodeURIComponent('抓取-网页空壳.md')}`)).json();
    const saved = await (await fetch(`${base}/api/card`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: first.file,
        content: `${first.raw}\n<!-- saved -->\n`,
        previousContent: first.raw,
      }),
    })).json();
    assert.ok(saved.raw.includes('saved'));

    fs.appendFileSync(path.join(dir, 'procedures', '抓取-网页空壳.md'), '\n<!-- external -->\n', 'utf8');
    const stale = await fetch(`${base}/api/card`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: first.file,
        content: `${first.raw}\n<!-- stale -->\n`,
        previousContent: first.raw,
      }),
    });
    assert.equal(stale.status, 409);
    const onDisk = fs.readFileSync(path.join(dir, 'procedures', '抓取-网页空壳.md'), 'utf8');
    assert.ok(onDisk.includes('external'));
    assert.ok(!onDisk.includes('stale'));

    const created = await (await fetch(`${base}/api/card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: '调试-分层测试.md',
        content: '# 调试-分层测试\n\n> **触发**：分层测试\n',
        layer: 'env',
      }),
    })).json();
    assert.equal(created.layer, 'env');

    const changed = await (await fetch(`${base}/api/layer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: '调试-分层测试.md', layer: 'task' }),
    })).json();
    assert.equal(changed.layer, 'task');

    const audit = await (await fetch(`${base}/api/audit`, { method: 'POST' })).json();
    assert.equal(audit.available, true);
    assert.equal(audit.parsed.cards, 4);
  } finally {
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
