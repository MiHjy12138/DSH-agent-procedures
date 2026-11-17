import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {test} from 'node:test';
import {execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = new URL('../', import.meta.url);

test('Codex entry pins a separately maintained plugin rather than importing its runtime', async () => {
  const marketplace = JSON.parse(await fs.readFile(new URL('.agents/plugins/marketplace.json', root), 'utf8'));
  assert.equal(marketplace.name, 'dsh-agent-procedures');
  assert.equal(marketplace.plugins.length, 1);
  const plugin = marketplace.plugins[0];
  assert.equal(plugin.name, 'procedure-library');
  assert.deepEqual(plugin.source, {
    source: 'git-subdir',
    url: 'https://github.com/Puipipi/DSH-agent-procedures.git',
    path: 'integrations/codex-library/codex-plugin',
    ref: 'codex-library',
    sha: plugin.source.sha,
  });
  assert.match(plugin.source.sha, /^[0-9a-f]{40}$/);
  assert.ok(plugin.interface.displayName && plugin.interface.shortDescription);
  await assert.rejects(fs.access(new URL('integrations/codex-library/codex-plugin/', root)), {code: 'ENOENT'});
  const readme = await fs.readFile(new URL('README.md', root), 'utf8');
  assert.ok(readme.includes('codex plugin marketplace add https://github.com/MiHjy12138/DSH-agent-procedures.git'));
  assert.ok(readme.includes(`codex plugin add ${plugin.name}@${marketplace.name}`));
});

test('DSH bundle publishes its static guidance and original templates without runtime dependencies', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('package.json', root), 'utf8'));
  assert.equal(manifest.name, 'dsh-agent-procedures');
  assert.equal(manifest.dsh.bundle.patch, './integrations/dsh/cordis.patch.yml');
  assert.equal(manifest.dependencies, undefined);
  const patch = await fs.readFile(new URL(manifest.dsh.bundle.patch, root), 'utf8');
  assert.match(patch, /name: \.\/index\.mjs/);
  const plugin = await import(new URL('integrations/dsh/index.mjs', root));
  assert.deepEqual(plugin.inject, ['systemPrompt']);
  const registrations = [];
  plugin.apply({systemPrompt: {context: value => registrations.push(value)}});
  assert.equal(registrations.length, 1);
  assert.deepEqual(registrations[0], {
    name: 'procedure-library:guidance',
    order: 9500,
    text: await fs.readFile(new URL('templates/AGENTS-snippet.md', root), 'utf8'),
    interpolate: false,
  });
  // npm's own packlist verifies the artifact installed by DSH, including the
  // relative template read. No archive or install/profile is created here.
  const [pack] = JSON.parse(execSync('npm pack --dry-run --ignore-scripts --json', {
    cwd: fileURLToPath(root), encoding: 'utf8',
  }));
  const files = pack.files.map(file => file.path);
  for (const file of ['LICENSE', 'integrations/dsh/index.mjs', 'integrations/dsh/cordis.patch.yml', 'templates/AGENTS-snippet.md']) {
    assert.ok(files.includes(file), `missing package file: ${file}`);
  }
  assert.ok(files.every(file => !file.startsWith('procedures/') && !file.startsWith('integrations/codex-library/')));
  const readme = await fs.readFile(new URL('README.md', root), 'utf8');
  assert.ok(readme.includes('dsh plugin add https://github.com/MiHjy12138/DSH-agent-procedures.git'));
});
