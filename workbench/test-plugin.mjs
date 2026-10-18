import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { apply, name, inject } from './plugin/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, 'fixtures', 'procedures');

test('plugin server mounts under DSH webServer prefix', async () => {
  assert.equal(name, 'dsh-experience-workbench');
  assert.deepEqual(inject, ['webServer']);

  const routes = [];
  const ctx = {
    effect(fn) {
      return fn();
    },
    webServer: {
      register(route) {
        routes.push(route);
        return () => {};
      },
    },
  };
  apply(ctx, { proceduresDir: fixtures });
  assert.equal(routes.length, 1);
  assert.equal(routes[0].kind, 'prefix');
  assert.equal(routes[0].path, '/plugins/experience-workbench');

  const server = http.createServer((req, res) => routes[0].handler(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const html = await (await fetch(`${base}/plugins/experience-workbench/`)).text();
    assert.match(html, /经验库/);
    assert.match(html, /href="styles.css"/);
    assert.match(html, /src="app.js"/);

    const projects = await (await fetch(`${base}/plugins/experience-workbench/api/projects`)).json();
    assert.equal(projects.current.id, 'configured');
    assert.ok(projects.projects.some((project) => project.id === 'configured'));

    const missing = await fetch(`${base}/plugins/experience-workbench/api/project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'missing-project' }),
    });
    assert.equal(missing.status, 400);

    const state = await (await fetch(`${base}/plugins/experience-workbench/api/state`)).json();
    assert.equal(state.cards, 3);
    assert.equal(state.project.id, 'configured');

    const search = await (await fetch(`${base}/plugins/experience-workbench/api/cards?q=${encodeURIComponent('网页抓不到正文')}`)).json();
    assert.equal(search.count, 1);
    assert.equal(search.cards[0].file, '抓取-网页空壳.md');

    const app = await (await fetch(`${base}/plugins/experience-workbench/app.js`)).text();
    assert.match(app, /api\/cards/);
    assert.doesNotMatch(app, /\/api\//);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('client entry registers DSH sidebar and main slots', () => {
  const code = fs.readFileSync(path.join(here, 'plugin', 'client.js'), 'utf8');
  let loaded;
  vm.runInNewContext(code, {
    window: {
      __ModuleLoader__: {
        load(options) {
          loaded = options;
        },
      },
    },
    console,
  });
  assert.equal(loaded.id, 'dsh-experience-workbench');

  const React = {
    createElement(type, props, ...children) {
      return { type, props, children };
    },
  };
  const module = loaded.factory(() => React);
  assert.equal(module.name, 'dsh-experience-workbench');
  assert.deepEqual(Array.from(module.inject), ['slots']);

  const injected = [];
  const registered = [];
  module.apply({
    slots: {
      inject(slot, register) {
        injected.push(slot);
        register();
      },
      register(meta, component) {
        registered.push({ meta, component });
      },
    },
  });

  assert.deepEqual(injected, ['sidebar.panellist', 'main']);
  const sidebar = registered.find((entry) => entry.meta.name === 'sidebar.panellist');
  const main = registered.find((entry) => entry.meta.name === 'main');
  assert.equal(sidebar.meta.label, '经验库');
  assert.equal(main.meta.key, 'experience-workbench');
  const frame = main.component();
  assert.equal(frame.type, 'iframe');
  assert.equal(frame.props.src, '/plugins/experience-workbench/');
});

test('project switch scopes cards to the selected workspace', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-dsh-home-'));
  const workspaceA = path.join(home, 'workspaces', 'a');
  const workspaceB = path.join(home, 'workspaces', 'b');
  fs.mkdirSync(path.join(workspaceA, 'procedures'), { recursive: true });
  fs.mkdirSync(workspaceB, { recursive: true });
  fs.writeFileSync(path.join(workspaceA, 'procedures', 'A-卡.md'), '# A-卡\n\n> **触发**：A 项目现象\n', 'utf8');
  fs.mkdirSync(path.join(home, 'storages'), { recursive: true });
  fs.writeFileSync(path.join(home, 'storages', 'workspace.json'), JSON.stringify({
    tables: {
      workspaces: {
        a: { title: 'default-workspace', path: workspaceA },
        b: { title: 'B 项目', path: workspaceB },
      },
    },
  }), 'utf8');

  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  const routes = [];
  const ctx = {
    effect(fn) { return fn(); },
    webServer: { register(route) { routes.push(route); return () => {}; } },
  };
  apply(ctx, {});
  const server = http.createServer((req, res) => routes[0].handler(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const projects = await (await fetch(`${base}/plugins/experience-workbench/api/projects`)).json();
    assert.equal(projects.current.id, 'a');
    assert.equal(projects.current.name, 'default-workspace');
    assert.equal(projects.current.proceduresDir, path.join(workspaceA, 'procedures'));

    const aState = await (await fetch(`${base}/plugins/experience-workbench/api/state`)).json();
    assert.equal(aState.cards, 1);

    const switched = await (await fetch(`${base}/plugins/experience-workbench/api/project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'b' }),
    })).json();
    assert.equal(switched.project.id, 'b');
    const bState = await (await fetch(`${base}/plugins/experience-workbench/api/state`)).json();
    assert.equal(bState.cards, 0);
    assert.equal(bState.project.proceduresDir, path.join(workspaceB, 'procedures'));

    await fetch(`${base}/plugins/experience-workbench/api/project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'a' }),
    });
    const back = await (await fetch(`${base}/plugins/experience-workbench/api/state`)).json();
    assert.equal(back.cards, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
