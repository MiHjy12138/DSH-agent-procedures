#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const workspace = path.resolve(arg('--workspace', process.cwd()));
const key = crypto.createHash('sha1').update(workspace).digest('hex').slice(0, 12);
const stateFile = path.join(os.tmpdir(), `procedures-workbench-${key}.json`);

if (!fs.existsSync(stateFile)) {
  console.log(JSON.stringify({ ok: true, stopped: false, message: 'no running server for this workspace' }));
  process.exit(0);
}

const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
try {
  process.kill(state.pid);
} catch { /* process already exited */ }
fs.rmSync(stateFile, { force: true });
console.log(JSON.stringify({ ok: true, stopped: true, pid: state.pid, url: state.url }));
