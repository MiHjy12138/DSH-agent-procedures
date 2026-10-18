import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, 'fixtures', 'procedures');
const server = path.join(here, 'server.mjs');
const playwrightPath = process.env.PLAYWRIGHT_PATH;
const edgePath = process.env.EDGE_PATH;
const canRun = Boolean(playwrightPath && edgePath && fs.existsSync(playwrightPath) && fs.existsSync(edgePath));

function copyFixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-ui-'));
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

test('UI: search, edit, conflict draft, layer create, audit', { skip: canRun ? false : 'PLAYWRIGHT_PATH/EDGE_PATH not set' }, async () => {
  const { chromium } = require(playwrightPath);
  const dir = copyFixtures();
  const port = 4400 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, [server, '--procedures', path.join(dir, 'procedures'), '--port', String(port)], {
    stdio: 'ignore',
  });
  let browser;
  const errors = [];
  try {
    await waitFor(`http://127.0.0.1:${port}/api/state`);
    browser = await chromium.launch({ executablePath: edgePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.card-item');
    assert.equal(await page.locator('.card-item').count(), 3);
    assert.equal(await page.inputValue('#project-select'), 'local');
    assert.match(await page.textContent('#project-path'), /procedures/);

    const beforeWidth = (await page.locator('.sidebar').boundingBox()).width;
    const splitBox = await page.locator('#splitter').boundingBox();
    await page.mouse.move(splitBox.x + splitBox.width / 2, splitBox.y + 160);
    await page.mouse.down();
    await page.mouse.move(splitBox.x + splitBox.width / 2 + 100, splitBox.y + 160, { steps: 6 });
    await page.mouse.up();
    const afterWidth = (await page.locator('.sidebar').boundingBox()).width;
    assert.ok(afterWidth > beforeWidth + 40);
    assert.ok(Number(await page.evaluate(() => localStorage.getItem('exp:sidebar-width'))) > 400);

    await page.click('#inbox-btn');
    await page.waitForSelector('#inbox-panel:not(.hidden)');
    await page.click('#audit-btn');
    await page.waitForSelector('#audit-panel:not(.hidden)');
    await page.waitForFunction(() => document.getElementById('inbox-panel').classList.contains('hidden'));
    await page.click('#audit-btn');
    await page.waitForFunction(() => document.getElementById('audit-panel').classList.contains('hidden'));

    await page.fill('#search', '网页');
    await page.waitForFunction(() => document.querySelectorAll('.card-item').length === 1);
    assert.ok(await page.locator('#list mark').count() > 0);
    await page.click('.card-item');
    await page.waitForFunction(() => document.getElementById('card-title').textContent.includes('抓取-网页空壳'));
    await page.waitForFunction(() => document.querySelectorAll('.card-item .badge.warn').length > 0);
    assert.ok(await page.locator('.card-item .badge.warn').count() > 0);

    await page.click('#edit-btn');
    const raw = await page.inputValue('#editor');
    await page.fill('#editor', `${raw}\n<!-- ui-save -->\n`);
    await page.click('#save-btn');
    await page.waitForTimeout(250);
    assert.ok(fs.readFileSync(path.join(dir, 'procedures', '抓取-网页空壳.md'), 'utf8').includes('ui-save'));

    await page.click('#edit-btn');
    await page.fill('#editor', `${raw}\n<!-- ui-draft -->\n`);
    fs.appendFileSync(path.join(dir, 'procedures', '抓取-网页空壳.md'), '\n<!-- ui-external -->\n', 'utf8');
    page.once('dialog', async (dialog) => {
      assert.match(dialog.message(), /外部修改/);
      await dialog.dismiss();
    });
    await page.click('#save-btn');
    await page.waitForTimeout(250);
    assert.match(await page.textContent('#dirty'), /草稿/);
    const drafts = await page.evaluate(() => Object.keys(localStorage)
      .filter((key) => key.startsWith('exp:draft:') && key.endsWith('抓取-网页空壳.md'))
      .map((key) => localStorage.getItem(key)));
    assert.ok(drafts.some((value) => value?.includes('ui-draft')));

    await page.click('#cancel-btn');
    await page.waitForSelector('#draft-banner:not(.hidden)');
    await page.click('#restore-draft');
    assert.ok((await page.inputValue('#editor')).includes('ui-draft'));
    await page.click('#cancel-btn');
    await page.click('#discard-draft');
    await page.waitForFunction(() => document.querySelector('#draft-banner').classList.contains('hidden'));

    await page.click('#new-btn');
    await page.fill('#new-trigger', 'UI 分层测试');
    await page.waitForFunction(() => document.getElementById('new-file').value.endsWith('.md'));
    await page.selectOption('#new-layer', 'env');
    await page.click('#modal-create');
    await page.waitForTimeout(300);
    const created = fs.readFileSync(path.join(dir, 'procedures', 'UI-分层测试.md'), 'utf8');
    assert.ok(created.includes('UI 分层测试'));
    assert.match(fs.readFileSync(path.join(dir, 'procedures', '_layers.md'), 'utf8'), /UI-分层测试 \| env/);

    await page.click('#audit-btn');
    await page.waitForSelector('#audit-panel:not(.hidden)');
    await page.waitForFunction(() => !document.getElementById('audit-body').textContent.includes('正在检查卡片'));
    assert.match(await page.textContent('#audit-body'), /P0|P1/);
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
