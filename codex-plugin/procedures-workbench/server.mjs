#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLibrary, META } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = here;
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};

const workspace = path.resolve(arg('--workspace', process.cwd()));
const proceduresDir = path.resolve(arg('--procedures', path.join(workspace, 'procedures')));
const host = arg('--host', '127.0.0.1');
const port = Number(arg('--port', '4177'));
const publicDir = path.join(here, 'public');
const project = {
  id: 'local',
  name: path.basename(workspace) || '当前项目',
  root: workspace,
  proceduresDir,
  hasProcedures: fs.existsSync(proceduresDir),
};

let lib;
try {
  lib = createLibrary(proceduresDir, repoRoot);
} catch (error) {
  console.error(error.message);
  console.error('用 --procedures <dir> 或 --workspace <repo> 指定项目。');
  process.exit(2);
}

function safeCardPath(file) {
  if (typeof file !== 'string' || !file.trim() || file.includes('\0')) throw new Error('非法文件名');
  const rel = file.replaceAll('\\', '/');
  if (!rel.endsWith('.md') || rel.split('/').length !== 1) throw new Error('只允许 procedures/ 下的一层 .md 文件');
  if (META.has(rel)) throw new Error('不能编辑元文件');
  const full = path.resolve(proceduresDir, rel);
  if (!full.startsWith(proceduresDir + path.sep)) throw new Error('路径越界');
  return { full, rel };
}

function safeNewName(input) {
  let name = path.basename(String(input ?? '').trim());
  name = name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-');
  if (!name) throw new Error('文件名不能为空');
  if (!name.endsWith('.md')) name += '.md';
  if (name === '.md' || name.startsWith('.')) throw new Error('非法文件名');
  if (META.has(name)) throw new Error('不能使用元文件名');
  if (name.split('/').length !== 1) throw new Error('文件名不能带路径');
  return name;
}

function sendJson(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function writeAtomic(file, content) {
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, content, 'utf8');
  fs.renameSync(temp, file);
}

function sendStatic(res, name) {
  const file = path.join(publicDir, name);
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  const type = name.endsWith('.html')
    ? 'text/html; charset=utf-8'
    : name.endsWith('.css')
      ? 'text/css; charset=utf-8'
      : 'text/javascript; charset=utf-8';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(file));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const p = url.pathname;

    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return sendStatic(res, 'index.html');
    if (req.method === 'GET' && p === '/app.js') return sendStatic(res, 'app.js');
    if (req.method === 'GET' && p === '/styles.css') return sendStatic(res, 'styles.css');

    if (req.method === 'GET' && p === '/api/projects') {
      return sendJson(res, 200, { projects: [project], current: project });
    }

    if (req.method === 'POST' && p === '/api/project') {
      const body = await readBody(req);
      if (body.id && body.id !== project.id) return sendJson(res, 404, { error: 'project not found' });
      return sendJson(res, 200, { project });
    }

    if (req.method === 'GET' && p === '/api/state') {
      const cards = lib.all();
      return sendJson(res, 200, {
        workspace,
        project,
        proceduresDir,
        cards: cards.length,
        bytes: cards.reduce((n, card) => n + card.bytes, 0),
        layers: Object.fromEntries(lib.layers()),
      });
    }

    if (req.method === 'GET' && p === '/api/cards') {
      const q = url.searchParams.get('q') ?? '';
      const layer = url.searchParams.get('layer') ?? '';
      const data = lib.search(q, { layer, limit: 100 });
      return sendJson(res, 200, {
        q,
        layer,
        count: data.count,
        cards: data.cards,
        terms: data.terms,
        handles: data.handles,
        phrases: data.phrases,
      });
    }

    if (req.method === 'GET' && p === '/api/card') {
      const card = lib.get(url.searchParams.get('file'));
      if (!card) return sendJson(res, 404, { error: 'card not found' });
      return sendJson(res, 200, card);
    }

    if (req.method === 'PUT' && p === '/api/card') {
      const body = await readBody(req);
      const { full, rel } = safeCardPath(body.file);
      if (!fs.existsSync(full)) return sendJson(res, 404, { error: 'card not found' });
      const current = fs.readFileSync(full, 'utf8');
      if (body.previousContent !== undefined && String(body.previousContent) !== current) {
        return sendJson(res, 409, {
          error: '文件已被外部修改，未保存；请刷新后重试',
          current,
        });
      }
      writeAtomic(full, String(body.content ?? ''));
      if (body.layer !== undefined) lib.setLayer(rel.replace(/\.md$/, ''), body.layer);
      return sendJson(res, 200, lib.get(rel));
    }

    if (req.method === 'POST' && p === '/api/card') {
      const body = await readBody(req);
      const name = safeNewName(body.file);
      const full = path.join(proceduresDir, name);
      if (fs.existsSync(full)) return sendJson(res, 409, { error: '文件已存在' });
      writeAtomic(full, String(body.content ?? ''));
      if (body.layer) lib.setLayer(name.replace(/\.md$/, ''), body.layer);
      return sendJson(res, 201, lib.get(name));
    }

    if (req.method === 'POST' && p === '/api/layer') {
      const body = await readBody(req);
      const { full, rel } = safeCardPath(body.file);
      if (!fs.existsSync(full)) return sendJson(res, 404, { error: 'card not found' });
      lib.setLayer(rel.replace(/\.md$/, ''), body.layer);
      return sendJson(res, 200, lib.get(rel));
    }

    if (req.method === 'GET' && p === '/api/inbox') {
      return sendJson(res, 200, { items: lib.inbox() });
    }

    if (req.method === 'POST' && p === '/api/inbox') {
      const body = await readBody(req);
      return sendJson(res, 200, { items: lib.appendInbox(body.text) });
    }

    if (req.method === 'GET' && p === '/api/template') {
      return sendJson(res, 200, { template: lib.template() });
    }

    if (req.method === 'POST' && p === '/api/audit') {
      return sendJson(res, 200, lib.audit());
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
});

server.listen(port, host, () => {
  const actualPort = server.address().port;
  console.log(`项目经验库工作台: http://${host}:${actualPort}`);
  console.log(`procedures: ${proceduresDir}`);
  console.log('Ctrl+C 退出');
});
