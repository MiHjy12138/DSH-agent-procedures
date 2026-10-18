import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLibrary, META } from '../lib.mjs';

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(pluginDir, '..');
const publicDir = path.join(packageRoot, 'public');
const PREFIX = '/plugins/experience-workbench';

export const name = 'dsh-experience-workbench';
export const inject = ['webServer'];

function resolveProceduresDir(config) {
  const configured = typeof config?.proceduresDir === 'string' ? config.proceduresDir.trim() : '';
  if (configured) return path.resolve(configured);
  const candidates = [
    path.join(process.cwd(), 'procedures'),
    path.join(packageRoot, 'fixtures', 'procedures'),
  ];
  return candidates.find((dir) => fs.existsSync(dir)) ?? candidates[0];
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
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function writeAtomic(file, content) {
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, content, 'utf8');
  fs.renameSync(temp, file);
}

function createHandler(config = {}) {
  const proceduresDir = resolveProceduresDir(config);
  let library = null;
  const getLibrary = () => {
    if (!library) library = createLibrary(proceduresDir, packageRoot);
    return library;
  };

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
    let next = path.basename(String(input ?? '').trim());
    next = next.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-');
    if (!next) throw new Error('文件名不能为空');
    if (!next.endsWith('.md')) next += '.md';
    if (next === '.md' || next.startsWith('.')) throw new Error('非法文件名');
    if (META.has(next)) throw new Error('不能使用元文件名');
    if (next.split('/').length !== 1) throw new Error('文件名不能带路径');
    return next;
  }

  function sendStatic(res, filename) {
    const file = path.join(publicDir, filename);
    if (!fs.existsSync(file)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const type = filename.endsWith('.html')
      ? 'text/html; charset=utf-8'
      : filename.endsWith('.css')
        ? 'text/css; charset=utf-8'
        : 'text/javascript; charset=utf-8';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(file));
  }

  async function handleApi(req, res, sub, url) {
    const lib = getLibrary();
    const api = sub.slice('/api'.length);

    if (req.method === 'GET' && api === '/state') {
      const cards = lib.all();
      return sendJson(res, 200, {
        workspace: path.dirname(proceduresDir),
        proceduresDir,
        cards: cards.length,
        bytes: cards.reduce((n, card) => n + card.bytes, 0),
        layers: Object.fromEntries(lib.layers()),
      });
    }

    if (req.method === 'GET' && api === '/cards') {
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

    if (req.method === 'GET' && api === '/card') {
      const card = lib.get(url.searchParams.get('file'));
      if (!card) return sendJson(res, 404, { error: 'card not found' });
      return sendJson(res, 200, card);
    }

    if (req.method === 'PUT' && api === '/card') {
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

    if (req.method === 'POST' && api === '/card') {
      const body = await readBody(req);
      const cardName = safeNewName(body.file);
      const full = path.join(proceduresDir, cardName);
      if (fs.existsSync(full)) return sendJson(res, 409, { error: '文件已存在' });
      writeAtomic(full, String(body.content ?? ''));
      if (body.layer) lib.setLayer(cardName.replace(/\.md$/, ''), body.layer);
      return sendJson(res, 201, lib.get(cardName));
    }

    if (req.method === 'POST' && api === '/layer') {
      const body = await readBody(req);
      const { full, rel } = safeCardPath(body.file);
      if (!fs.existsSync(full)) return sendJson(res, 404, { error: 'card not found' });
      lib.setLayer(rel.replace(/\.md$/, ''), body.layer);
      return sendJson(res, 200, lib.get(rel));
    }

    if (req.method === 'GET' && api === '/inbox') {
      return sendJson(res, 200, { items: lib.inbox() });
    }

    if (req.method === 'POST' && api === '/inbox') {
      const body = await readBody(req);
      return sendJson(res, 200, { items: lib.appendInbox(body.text) });
    }

    if (req.method === 'GET' && api === '/template') {
      return sendJson(res, 200, { template: lib.template() });
    }

    if (req.method === 'POST' && api === '/audit') {
      return sendJson(res, 200, lib.audit());
    }

    return sendJson(res, 404, { error: 'not found' });
  }

  return async function handler(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
      let pathname = decodeURIComponent(url.pathname);
      if (!pathname.startsWith(PREFIX)) pathname = `${PREFIX}${pathname}`;
      const sub = pathname.slice(PREFIX.length) || '/';

      if (req.method === 'GET' && (sub === '/' || sub === '/index.html')) return sendStatic(res, 'index.html');
      if (req.method === 'GET' && sub === '/app.js') return sendStatic(res, 'app.js');
      if (req.method === 'GET' && sub === '/styles.css') return sendStatic(res, 'styles.css');
      if (sub.startsWith('/api/')) return await handleApi(req, res, sub, url);
      return sendJson(res, 404, { error: 'not found' });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  };
}

export function apply(ctx, config = {}) {
  const handler = createHandler(config);
  const register = () => ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler,
  });
  if (typeof ctx.effect === 'function') ctx.effect(register, 'experience-workbench: routes');
  else register();
}
