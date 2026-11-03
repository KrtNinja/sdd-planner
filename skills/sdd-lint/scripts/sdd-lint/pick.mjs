// Фича и вариант из аргументов: разбор пути к фиче, список фич, подсказка, если аргумента нет.
// @ts-check
import fs from 'node:fs';
import path from 'node:path';

import { CHOICES, SLOTS } from './args.mjs';
import { code, lintCmd, skillCode, lintCode } from './config.mjs';
import { rel } from './md.mjs';

/** @typedef {import('./io.mjs').Ctx} Ctx */

export const DOCS = 'docs';
/** @param {string} d */
export const isDir = (d) => fs.existsSync(d) && fs.statSync(d).isDirectory();
// Фичи в docs/: папки с протоколом или spec (adr — не фича).
export function listFeatures(root = DOCS) {
  if (!isDir(root)) return [];
  return fs
    .readdirSync(root)
    .filter((x) => x !== 'adr' && isDir(path.join(root, x)))
    .filter((x) => ['brainstorming.md', 'spec.md'].some((f) => fs.existsSync(path.join(root, x, f))))
    .sort();
}
// «comments», «docs/comments», «docs/comments/slices/002-x.md» → «docs/comments»; иначе null.
/** @param {string | null | undefined} d @returns {string | null} */
export function resolveFeature(d) {
  if (!d) return null;
  const clean = d.replace(/^@/, '').replace(/[\\/]+$/, '');
  if (!/[\\/]/.test(clean) && isDir(path.join(DOCS, clean))) return path.join(DOCS, clean);
  if (!fs.existsSync(clean)) return null;
  const parts = path.relative(process.cwd(), path.resolve(clean)).split(path.sep);
  const i = parts.length > 1 ? parts.lastIndexOf(DOCS, parts.length - 2) : -1;
  if (i >= 0 && parts[i + 1] !== 'adr') return parts.slice(0, i + 2).join('/');
  return isDir(clean) ? clean : null;
}
// Аргументы до фичи в текущем вызове — чтобы предложить готовую команду.
/** @param {import('./args.mjs').Args} args @param {number} n */
const callPrefix = ({ cmd, pos }, n) => [cmd === 'check' ? null : cmd, ...pos.slice(0, n)].filter((x) => x != null);
/** @param {Ctx} ctx @param {string} why @param {number} n @returns {never} */
export function pickFeature(ctx, why, n) {
  const known = listFeatures();
  if (!known.length) {
    ctx.io.error(isDir(DOCS) ? `${why}. В ${DOCS}/ пока нет фич. Новая начинается с ${skillCode('sdd-grill')} — он спросит задачу.` : `${why}. Нет папки ${DOCS}/ — запускайте из корня репозитория с доками.`);
    ctx.io.exit(2);
  }
  const lines = known.map((f) => `- ${lintCode(...callPrefix(ctx.args, n), f)}`);
  ctx.io.error(`${why}. Фичи в ${code(`${DOCS}/`)}:\n\n${lines.join('\n')}`);
  return ctx.io.exit(2);
}
// Нет варианта (approve без spec|slices|adr) — показать варианты готовыми командами.
/** @param {Ctx} ctx @param {keyof typeof CHOICES} name @returns {never} */
export function pickChoice(ctx, name, n = 0) {
  const { pos } = ctx.args;
  const ex = pos[n + 1] && resolveFeature(pos[n + 1]) ? pos[n + 1] : listFeatures()[0] || '<feature>';
  const opts = Object.entries(CHOICES[name]);
  // completion запускают в терминале, у остальных после варианта идёт фича.
  const withFeature = SLOTS[/** @type {keyof typeof SLOTS} */ (name)].includes('feature');
  const line = (/** @type {string} */ k) => (name === 'completion' ? `sdd-lint completion ${k}` : withFeature ? lintCmd(name, k, ex) : lintCmd(name, k));
  const cmdsList = opts.map(([k]) => line(k));
  const bad = pos[n] ? `Нет варианта «${pos[n]}» у ${name}` : `${name} — выбери вариант`;
  ctx.io.error(`${bad}:\n\n${opts.map(([, d], i) => `- ${code(cmdsList[i])} — ${d}`).join('\n')}`);
  return ctx.io.exit(2);
}
/** @param {Ctx} ctx @param {string | undefined} d @returns {string} */
export function needDir(ctx, d, n = 0) {
  if (!d) pickFeature(ctx, 'Укажи фичу', n);
  const found = resolveFeature(d);
  if (found) return found;
  const parent = path.dirname(path.resolve(d));
  const slug = path.basename(path.resolve(d));
  if (!fs.existsSync(parent)) {
    ctx.io.error(`Нет папки ${rel(parent)}. Запускайте из корня репозитория с доками.`);
    ctx.io.exit(2);
  }
  const known = fs
    .readdirSync(parent)
    .filter((x) => x !== 'adr' && fs.statSync(path.join(parent, x)).isDirectory())
    .filter((x) => ['brainstorming.md', 'spec.md'].some((f) => fs.existsSync(path.join(parent, x, f))));
  ctx.io.error(
    [
      `Нет папки ${d}.`,
      known.length ? `Фичи в ${rel(parent)}/: ${known.join(', ')}.` : `В ${rel(parent)}/ пока нет фич.`,
      `Новая фича начинается с ${skillCode('sdd-grill', slug)}.`,
    ].join(' '),
  );
  return ctx.io.exit(2);
}
