import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const home = os.homedir();
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snippet = fs.readFileSync(path.join(repo, 'templates/AGENTS-snippet.local.md'), 'utf8').trim();
const block = `<!-- agent-procedures:begin -->\n${snippet}\n<!-- agent-procedures:end -->`;
const targets = [
  path.join(home, '.dsh/AGENTS.md'),
  path.join(home, '.codex/AGENTS.md'),
  path.join(home, '.claude/CLAUDE.md'),
];
const backup = path.join(os.tmpdir(), `agent-procedures-global-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(backup, { recursive: true });

for (const file of targets) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const exists = fs.existsSync(file);
  const original = exists ? fs.readFileSync(file, 'utf8') : '';
  if (exists) fs.writeFileSync(path.join(backup, `${path.basename(path.dirname(file))}-${path.basename(file)}.bak`), original, 'utf8');
  const next = /<!-- agent-procedures:begin -->[\s\S]*?<!-- agent-procedures:end -->/.test(original)
    ? original.replace(/<!-- agent-procedures:begin -->[\s\S]*?<!-- agent-procedures:end -->/, block)
    : `${original.trimEnd()}${original.trim() ? '\n\n---\n\n' : ''}${block}`;
  fs.writeFileSync(file, next.trimEnd() + '\n', 'utf8');
  console.log(`updated: ${file}`);
}
console.log(`backup: ${backup}`);
