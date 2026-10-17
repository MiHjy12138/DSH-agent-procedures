import fs from 'node:fs';
import path from 'node:path';

const workspace = path.resolve(process.argv[2] ?? process.cwd());
const procDir = path.join(workspace, 'procedures');
if (!fs.existsSync(procDir)) {
  console.error(`no procedures directory: ${procDir}`);
  process.exit(2);
}

const skip = new Set(['INDEX.md', '_模板.md', '_inbox.md', 'PROJECT.md', 'catalog.jsonl']);
const rows = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    if (!stat.isFile() || !entry.name.endsWith('.md') || skip.has(entry.name)) continue;
    const rel = path.relative(workspace, full).replaceAll('\\', '/');
    const text = fs.readFileSync(full, 'utf8');
    const title = (text.match(/^#\s+(.+)$/m)?.[1] ?? entry.name).trim();
    const scope = (text.match(/>\s*\*\*Scope\*\*\s*[:：]\s*(.+)$/mi)?.[1] ?? (rel.includes('/central/') ? 'general' : 'project')).trim();
    const trigger = (text.match(/>\s*\*\*触发\*\*\s*[:：]\s*(.+)$/mi)?.[1] ?? text.match(/>\s*触发\s*[:：]\s*(.+)$/mi)?.[1] ?? '').trim();
    rows.push({ scope, file: rel, title, trigger });
  }
}

walk(procDir);
const out = path.join(procDir, 'catalog.jsonl');
fs.writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
console.log(`catalog: ${rows.length} cards -> ${out}`);
for (const r of rows) console.log(`  ${r.scope}\t${r.file}\t${r.title}`);
