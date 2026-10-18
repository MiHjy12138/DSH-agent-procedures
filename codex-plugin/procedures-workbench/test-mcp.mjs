import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function createClient(child) {
  const pending = new Map();
  let nextId = 1;
  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    const message = JSON.parse(line);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    waiter(message);
  });
  const request = (method, params) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  const notify = (method, params) => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  };
  return { request, notify };
}

test('MCP server lists, initializes, and reads cards', async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-mcp-'));
  const child = spawn(process.execPath, [path.join(here, 'mcp', 'server.mjs')], {
    cwd: here,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const client = createClient(child);
  try {
    const init = await client.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    assert.equal(init.result.serverInfo.name, 'procedures-workbench');
    client.notify('notifications/initialized');
    const list = await client.request('tools/list');
    assert.equal(list.result.tools.length, 6);
    assert.ok(list.result.tools.some((tool) => tool.name === 'procedures_search'));

    const created = await client.request('tools/call', {
      name: 'procedures_init',
      arguments: { project_root: project },
    });
    assert.match(created.result.content[0].text, /created: true/);
    fs.writeFileSync(path.join(project, 'procedures', 'A-卡.md'), '# A-卡\n\n> **触发**：A 项目现象\n', 'utf8');

    const cards = await client.request('tools/call', {
      name: 'procedures_list',
      arguments: { project_root: project },
    });
    assert.match(cards.result.content[0].text, /A-卡/);

    const card = await client.request('tools/call', {
      name: 'procedures_get',
      arguments: { file: 'A-卡.md', project_root: project },
    });
    assert.match(card.result.content[0].text, /A 项目现象/);
  } finally {
    child.kill();
    fs.rmSync(project, { recursive: true, force: true });
  }
});
