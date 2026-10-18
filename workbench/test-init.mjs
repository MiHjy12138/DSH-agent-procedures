import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, 'cli.mjs');

test('CLI init creates skeleton once and preserves user edits', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-cli-init-'));
  try {
    const first = JSON.parse(execFileSync(process.execPath, [cli, 'init', '--workspace', root, '--json'], {
      encoding: 'utf8',
    }));
    assert.equal(first.created, true);
    assert.ok(first.written.includes('_inbox.md'));
    const inbox = path.join(root, 'procedures', '_inbox.md');
    fs.writeFileSync(inbox, '# 用户自己的收件箱\n', 'utf8');

    const second = JSON.parse(execFileSync(process.execPath, [cli, 'init', '--workspace', root, '--json'], {
      encoding: 'utf8',
    }));
    assert.equal(second.created, false);
    assert.deepEqual(second.written, []);
    assert.equal(fs.readFileSync(inbox, 'utf8'), '# 用户自己的收件箱\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
