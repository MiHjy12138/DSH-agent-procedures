import {readFileSync} from 'node:fs';

export const name = 'procedure-library';
export const inject = ['systemPrompt'];

export function apply(ctx) {
  ctx.systemPrompt.context({
    name: 'procedure-library:guidance',
    order: 9500,
    text: readFileSync(new URL('../../templates/AGENTS-snippet.md', import.meta.url), 'utf8'),
    interpolate: false,
  });
}
