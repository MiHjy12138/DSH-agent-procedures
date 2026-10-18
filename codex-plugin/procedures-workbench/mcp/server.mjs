#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createLibrary } from '../lib.mjs';
import { ensureProjectLibrary } from '../init.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = [
  {
    name: 'procedures_list',
    description: 'List project-local experience cards. Pass project_root if the current project is not the MCP server cwd.',
    inputSchema: {
      type: 'object',
      properties: {
        project_root: { type: 'string', description: 'Project root containing procedures/.' },
        layer: { type: 'string', enum: ['fixed', 'env', 'task'], description: 'Optional review layer filter.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum cards (default 50).' },
      },
    },
  },
  {
    name: 'procedures_search',
    description: 'Search project-local experience cards by trigger words, errors, commands, paths, or quoted phrases.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Phenomenon/error/path/command query.' },
        project_root: { type: 'string' },
        layer: { type: 'string', enum: ['fixed', 'env', 'task'] },
        limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Maximum matches (default 5).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'procedures_get',
    description: 'Read one experience card by filename.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Card filename, e.g. 抓取-网页空壳.md.' },
        project_root: { type: 'string' },
      },
      required: ['file'],
    },
  },
  {
    name: 'procedures_inbox',
    description: 'List the project-local inbox lines that have not been turned into cards yet.',
    inputSchema: {
      type: 'object',
      properties: {
        project_root: { type: 'string' },
      },
    },
  },
  {
    name: 'procedures_init',
    description: 'Create the procedures/ skeleton once if missing. Idempotent; does not create cards.',
    inputSchema: {
      type: 'object',
      properties: {
        project_root: { type: 'string' },
      },
    },
  },
  {
    name: 'procedures_open',
    description: 'Open the visual project card browser. Pass the project root containing procedures/.',
    inputSchema: {
      type: 'object',
      properties: {
        project_root: { type: 'string' },
      },
      required: ['project_root'],
    },
    _meta: { ui: { visibility: ['model', 'app'] } },
  },
];

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function resolveProjectRoot(args = {}) {
  const raw = args.project_root
    || process.env.CODEX_PROJECT_ROOT
    || process.env.CLAUDE_PROJECT_DIR
    || process.env.INIT_CWD
    || process.cwd();
  const resolved = path.resolve(String(raw));
  if (resolved === pluginRoot || resolved.startsWith(`${pluginRoot}${path.sep}`)) {
    throw new Error('project_root is required: the MCP server cwd is the plugin directory');
  }
  return resolved;
}

function libraryFor(args = {}) {
  const root = resolveProjectRoot(args);
  const init = ensureProjectLibrary(root);
  if (init.error) throw new Error(init.error);
  return {
    root,
    init,
    lib: createLibrary(init.proceduresDir, pluginRoot),
  };
}

function formatCard(card) {
  const trigger = card.trigger ? ` — ${card.trigger}` : '';
  return `- [${card.layer || '未设置'}] ${card.title} (${card.file})${trigger}`;
}

function cardView(card) {
  return {
    file: card.file,
    name: card.name,
    title: card.title,
    trigger: card.trigger,
    layer: card.layer,
    status: card.status,
    bytes: card.bytes,
    updated: card.updated,
    snippet: card.snippet,
  };
}

async function callTool(name, args = {}) {
  if (name === 'procedures_init' || name === 'procedures_open') {
    const root = resolveProjectRoot(args);
    const result = ensureProjectLibrary(root);
    if (result.error) throw new Error(result.error);
    const text = `project: ${root}\ncreated: ${result.created}\nprocedures: ${result.proceduresDir}\nwrote: ${result.written.join(', ') || '(nothing; already initialized)'}`;
    return {
      text,
      structured: {
        project_root: root,
        procedures_dir: result.proceduresDir,
        created: result.created,
        written: result.written,
      },
    };
  }

  const { root, init, lib } = libraryFor(args);

  if (name === 'procedures_list') {
    const layer = typeof args.layer === 'string' ? args.layer : '';
    const limit = Math.max(1, Math.min(100, Number(args.limit) || 50));
    let cards = lib.all();
    if (layer) cards = cards.filter((card) => card.layer === layer);
    cards = cards.slice(0, limit);
    const lines = [
      `project: ${root}`,
      `procedures: ${init.proceduresDir}`,
      `cards: ${cards.length}`,
    ];
    if (!cards.length) lines.push('no cards');
    for (const card of cards) lines.push(formatCard(card));
    return {
      text: lines.join('\n'),
      structured: {
        project_root: root,
        procedures_dir: init.proceduresDir,
        cards: cards.map(cardView),
      },
    };
  }

  if (name === 'procedures_search') {
    const query = String(args.query ?? '').trim();
    if (!query) throw new Error('query is required');
    const layer = typeof args.layer === 'string' ? args.layer : '';
    const limit = Math.max(1, Math.min(20, Number(args.limit) || 5));
    const result = lib.search(query, { layer, limit });
    if (!result.count) {
      return {
        text: `project: ${root}\nno matches`,
        structured: { project_root: root, query, matches: [] },
      };
    }
    const lines = [`project: ${root}`, `matches: ${result.count}`];
    for (const card of result.cards) {
      lines.push(`${formatCard(card)}`);
      if (card.snippet) lines.push(`  ${card.snippet}`);
    }
    return {
      text: lines.join('\n'),
      structured: { project_root: root, query, matches: result.cards.map(cardView) },
    };
  }

  if (name === 'procedures_get') {
    const file = String(args.file ?? '').trim();
    if (!file) throw new Error('file is required');
    const card = lib.get(file);
    if (!card) throw new Error(`card not found: ${file}`);
    const raw = card.raw.length > 60000 ? `${card.raw.slice(0, 60000)}\n…[truncated]` : card.raw;
    return {
      text: raw,
      structured: {
        file: card.file,
        name: card.name,
        title: card.title,
        layer: card.layer,
        raw: card.raw,
      },
    };
  }

  if (name === 'procedures_inbox') {
    const items = lib.inbox();
    if (!items.length) {
      return { text: `project: ${root}\ninbox empty`, structured: { project_root: root, items: [] } };
    }
    return {
      text: [`project: ${root}`, ...items.map((item) => `${item.id}\t${item.text}`)].join('\n'),
      structured: { project_root: root, items },
    };
  }

  throw new Error(`unknown tool: ${name}`);
}

async function handle(message) {
  if (message.method === 'initialize') {
    return {
      protocolVersion: message.params?.protocolVersion || '2024-11-05',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'procedures-workbench', version: '0.2.0' },
    };
  }
  if (message.method === 'tools/list') return { tools };
  if (message.method === 'tools/call') {
    const name = message.params?.name;
    const args = message.params?.arguments ?? {};
    try {
      const result = await callTool(name, args);
      const response = { content: [{ type: 'text', text: result.text }] };
      if (result.structured !== undefined) response.structuredContent = result.structured;
      return response;
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error.message }],
      };
    }
  }
  if (message.method === 'ping') return {};
  return undefined;
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.id === undefined) return;
  if (message.method === 'notifications/initialized' || message.method === 'notifications/cancelled') return;
  try {
    const result = await handle(message);
    if (result === undefined) {
      send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `method not found: ${message.method}` } });
    } else {
      send({ jsonrpc: '2.0', id: message.id, result });
    }
  } catch (error) {
    send({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: error.message } });
  }
});
