#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ensureProjectLibrary } from '../init.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};

const workspace = path.resolve(arg('--workspace', process.cwd()));
if (!fs.existsSync(workspace)) {
  console.error(JSON.stringify({ ok: false, error: `工作区不存在：${workspace}` }));
  process.exit(2);
}

const init = ensureProjectLibrary(workspace);
if (init.error) {
  console.error(JSON.stringify({ ok: false, error: init.error }));
  process.exit(2);
}

const key = crypto.createHash('sha1').update(workspace).digest('hex').slice(0, 12);
const stateFile = path.join(os.tmpdir(), `procedures-workbench-${key}.json`);

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function healthy(url) {
  try {
    const res = await fetch(`${url}/api/state`);
    return res.ok;
  } catch {
    return false;
  }
}

if (fs.existsSync(stateFile)) {
  try {
    const previous = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (previous.workspace === workspace && await healthy(previous.url)) {
      console.log(JSON.stringify({ ok: true, reused: true, ...previous }));
      process.exit(0);
    }
  } catch { /* start a new server below */ }
  fs.rmSync(stateFile, { force: true });
}

const port = await freePort();
const child = spawn(process.execPath, [
  path.join(pluginRoot, 'server.mjs'),
  '--workspace', workspace,
  '--host', '127.0.0.1',
  '--port', String(port),
], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});
child.unref();

const url = `http://127.0.0.1:${port}`;
const started = Date.now();
while (Date.now() - started < 5000) {
  if (await healthy(url)) {
    const payload = { ok: true, reused: false, url, pid: child.pid, workspace, proceduresDir: init.proceduresDir };
    fs.writeFileSync(stateFile, JSON.stringify(payload), 'utf8');
    console.log(JSON.stringify(payload));
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 120));
}

try { process.kill(child.pid); } catch { /* already gone */ }
console.error(JSON.stringify({ ok: false, error: 'workbench server did not become healthy' }));
process.exit(1);
