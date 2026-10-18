import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function ensureProjectLibrary(projectRoot) {
  const root = path.resolve(String(projectRoot ?? ''));
  if (!root || !fs.existsSync(root)) return { created: false, error: '项目目录不存在' };
  const proceduresDir = path.join(root, 'procedures');
  const existed = fs.existsSync(proceduresDir);
  fs.mkdirSync(proceduresDir, { recursive: true });

  const template = path.join(here, 'templates', 'card-template.md');
  const skeleton = {
    '_inbox.md': '# 待整理 inbox\n\n',
    '_layers.md': '| 卡 | 层 |\n| --- | --- |\n',
    '_模板.md': fs.existsSync(template)
      ? fs.readFileSync(template, 'utf8')
      : '# <分类>-<现象>\n\n> **触发**：<任务里会出现的现象>\n> **验证**：<怎么确认这次真的成了>\n\n## 首选\n\n<可直接复制的那一条>\n\n## 别再来\n\n| 弯路 | 为什么不通 |\n| --- | --- |\n| <试过并失败的> | <报错原文 / 为什么不成立> |\n',
  };
  const written = [];
  for (const [name, content] of Object.entries(skeleton)) {
    const file = path.join(proceduresDir, name);
    if (fs.existsSync(file)) continue;
    fs.writeFileSync(file, content, 'utf8');
    written.push(name);
  }
  return { created: !existed, proceduresDir, written };
}
