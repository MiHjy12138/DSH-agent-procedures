import fs from 'node:fs';
import path from 'node:path';

const workspace = path.resolve(process.argv[2] ?? process.cwd());
const query = process.argv.slice(3).join(' ').trim();
if (!query) {
  console.error('usage: node find-procedures.mjs <workspace> "<symptom words>"');
  process.exit(2);
}
const catalog = path.join(workspace, 'procedures', 'catalog.jsonl');
if (!fs.existsSync(catalog)) {
  console.error(`catalog missing: ${catalog} (run build-catalog.mjs)`);
  process.exit(2);
}

const terms = [...new Set(query.toLowerCase().split(/[\s,，。；;:：/\\|()（）\[\]{}"'“”‘’]+/).filter(Boolean))];
const rows = fs.readFileSync(catalog, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
const scored = rows.map((row) => {
  const hay = `${row.title} ${row.trigger} ${row.file}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (term.length < 2) continue;
    if (hay.includes(term)) score += term.length >= 4 ? 2 : 1;
  }
  if (hay.includes(query.toLowerCase())) score += 3;
  return { ...row, score };
}).filter((row) => row.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);

if (!scored.length) {
  console.log('no matches');
  process.exit(0);
}
for (const row of scored) {
  console.log(`${row.file}\t[${row.scope}]\t${row.title}`);
  if (row.trigger) console.log(`  trigger: ${row.trigger}`);
}
