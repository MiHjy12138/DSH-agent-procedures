import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLibrary, META } from '../lib.mjs';
import { ensureProjectLibrary } from '../init.mjs';

export { ensureProjectLibrary };

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(pluginDir, '..');
const publicDir = path.join(packageRoot, 'public');
const PREFIX = '/plugins/experience-workbench';

export const name = 'dsh-experience-workbench';
export const inject = ['webServer'];

function readDshProjects() {
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const file = path.join(dshHome, 'storages', 'workspace.json');
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const raw = parsed?.tables?.workspaces ?? {};
    return Object.keys(raw)
      .map((id) => {
        const item = raw[id] ?? {};
        if (typeof item.path !== 'string' || !item.path) return null;
        const root = path.resolve(item.path);
        if (!fs.existsSync(root)) return null;
        const proceduresDir = path.join(root, 'procedures');
        return {
          id,
          name: item.title || path.basename(root),
          root,
          proceduresDir,
          hasProcedures: fs.existsSync(proceduresDir),
          sessionIds: Array.isArray(item.sessionIds) ? item.sessionIds : [],
          dsh: true,
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function hasRealConversation(project) {
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const sessionsDir = path.join(dshHome, 'storages', 'session_projcache', 'sessions');
  const fresh = project?.root
    ? readDshProjects().find((item) => item.root === path.resolve(project.root))
    : null;
  const sessionIds = fresh?.sessionIds ?? project?.sessionIds ?? [];
  for (const sessionId of sessionIds) {
    try {
      const file = path.join(sessionsDir, `${sessionId}.json`);
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      const count = parsed?.record?.rows?.titleInput?.val?.count;
      if (Number(count) > 0) return true;
    } catch { /* ignore a partially-written session */ }
  }
  return false;
}

function buildProjects(config = {}) {
  const projects = [];
  const seen = new Set();
  const add = (project) => {
    if (!project || seen.has(project.proceduresDir)) return;
    seen.add(project.proceduresDir);
    projects.push(project);
  };

  const configured = typeof config.proceduresDir === 'string' ? config.proceduresDir.trim() : '';
  if (configured) {
    const proceduresDir = path.resolve(configured);
    add({
      id: 'configured',
      name: '本地配置',
      root: path.dirname(proceduresDir),
      proceduresDir,
      hasProcedures: fs.existsSync(proceduresDir),
      configured: true,
    });
  }

  for (const project of readDshProjects()) add(project);

  const demoDir = path.join(packageRoot, 'fixtures', 'procedures');
  if (fs.existsSync(demoDir)) {
    add({
      id: 'demo',
      name: '示例项目',
      root: packageRoot,
      proceduresDir: demoDir,
      hasProcedures: true,
      demo: true,
    });
  }

  if (!projects.length) {
    add({
      id: 'local',
      name: path.basename(process.cwd()) || '当前项目',
      root: process.cwd(),
      proceduresDir: path.join(process.cwd(), 'procedures'),
      hasProcedures: false,
    });
  }

  return projects;
}

function chooseProject(projects, config = {}) {
  if (config.proceduresDir) return projects.find((project) => project.configured);
  const defaultWorkspace = projects.find((project) => project.name === 'default-workspace');
  const withProcedures = projects.find((project) => project.hasProcedures);
  return defaultWorkspace || withProcedures || projects[0];
}

function startWorkspaceWatcher(ctx) {
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const storagesDir = path.join(dshHome, 'storages');
  const sessionsDir = path.join(storagesDir, 'session_projcache', 'sessions');
  if (!fs.existsSync(storagesDir)) return;
  const seen = new Set(readDshProjects().map((project) => project.id));
  let timer = null;
  const check = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      for (const project of readDshProjects()) {
        if (seen.has(project.id)) continue;
        // A new workspace alone is not enough: wait for the first real user message.
        if (!hasRealConversation(project)) continue;
        try {
          ensureProjectLibrary(project.root);
          seen.add(project.id);
        } catch { /* project may be mid-creation; retry on the next event */ }
      }
    }, 200);
  };
  const watchers = [];
  try {
    watchers.push(fs.watch(storagesDir, { persistent: false }, (event, filename) => {
      if (!filename || String(filename) === 'workspace.json') check();
    }));
  } catch { /* no workspace watcher */ }
  if (fs.existsSync(sessionsDir)) {
    try {
      watchers.push(fs.watch(sessionsDir, { persistent: false }, (event, filename) => {
        if (!filename || String(filename).endsWith('.json')) check();
      }));
    } catch { /* no session watcher */ }
  }
  if (!watchers.length) return;
  const dispose = () => {
    for (const watcher of watchers) watcher.close();
    if (timer) clearTimeout(timer);
  };
  if (typeof ctx.effect === 'function') ctx.effect(() => dispose, 'experience-workbench: workspace watcher');
  else return dispose;
}

function projectView(project) {
  return {
    id: project.id,
    name: project.name,
    root: project.root,
    proceduresDir: project.proceduresDir,
    hasProcedures: project.hasProcedures,
    demo: Boolean(project.demo),
  };
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
  const projects = buildProjects(config);
  let current = chooseProject(projects, config);
  let proceduresDir = current.proceduresDir;
  let library = null;

  function canAutoInit() {
    return !current.dsh || current.demo || current.configured || hasRealConversation(current);
  }

  function ensureProcedures(force = false) {
    if (!fs.existsSync(proceduresDir) && !force && !canAutoInit()) {
      throw new Error('这个项目还没有开始过真实对话；先发一条消息，或手动创建卡片');
    }
    const result = ensureProjectLibrary(current.root);
    if (result.error) throw new Error(`${result.error}：${current.root}`);
    current.hasProcedures = true;
  }

  const getLibrary = (force = false) => {
    ensureProcedures(force);
    if (!library) library = createLibrary(proceduresDir, packageRoot);
    return library;
  };

  function selectProject(id) {
    const next = projects.find((project) => project.id === id);
    if (!next) throw new Error('项目不存在');
    current = next;
    proceduresDir = next.proceduresDir;
    library = null;
    return next;
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
    const api = sub.slice('/api'.length);

    if (req.method === 'GET' && api === '/projects') {
      return sendJson(res, 200, {
        projects: projects.map(projectView),
        current: projectView(current),
      });
    }

    if (req.method === 'POST' && api === '/project') {
      const body = await readBody(req);
      const next = selectProject(String(body.id ?? ''));
      return sendJson(res, 200, { project: projectView(next) });
    }

    const initialized = fs.existsSync(proceduresDir);
    const conversation = hasRealConversation(current);
    const canRead = initialized || !current.dsh || current.configured || current.demo || conversation;

    if (!canRead && req.method === 'GET') {
      if (api === '/state') {
        return sendJson(res, 200, {
          workspace: current.root,
          project: projectView(current),
          proceduresDir,
          cards: 0,
          bytes: 0,
          layers: {},
          initialized: false,
          conversation: false,
        });
      }
      if (api === '/cards') {
        return sendJson(res, 200, {
          q: url.searchParams.get('q') ?? '',
          layer: url.searchParams.get('layer') ?? '',
          count: 0,
          cards: [],
          terms: [],
          handles: [],
          phrases: [],
        });
      }
      if (api === '/card') return sendJson(res, 404, { error: 'card not found' });
      if (api === '/inbox') return sendJson(res, 200, { items: [] });
      if (api === '/template') {
        const file = path.join(packageRoot, 'templates', 'card-template.md');
        return sendJson(res, 200, { template: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '' });
      }
    }
    if (!canRead && req.method === 'POST' && api === '/audit') {
      return sendJson(res, 200, {
        available: false,
        error: '这个项目还没有开始过真实对话；发送第一条消息后自动建库',
      });
    }

    if (req.method !== 'GET' && current.demo && api !== '/audit') {
      return sendJson(res, 400, { error: '示例项目只读；请先切换到你的项目' });
    }

    const lib = getLibrary(req.method !== 'GET' && api !== '/audit');

    if (req.method === 'GET' && api === '/state') {
      const cards = lib.all();
      return sendJson(res, 200, {
        workspace: current.root,
        project: projectView(current),
        proceduresDir,
        cards: cards.length,
        bytes: cards.reduce((n, card) => n + card.bytes, 0),
        layers: Object.fromEntries(lib.layers()),
        initialized: true,
        conversation,
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
  startWorkspaceWatcher(ctx);
}
