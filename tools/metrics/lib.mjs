// Общее для замеров: список .mjs, разбор в AST, путь от корня репозитория.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const CODE = path.join(REPO, 'skills/sdd-lint/scripts');
export const TESTS = path.join(REPO, 'tests');

export function listMjs(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'fixtures' && e.name !== 'node_modules') out.push(...listMjs(p));
    else if (e.isFile() && e.name.endsWith('.mjs')) out.push(p);
  }
  return out.sort();
}

// Шебанг заменяем пробелами той же длины: смещения в AST совпадают с покрытием V8.
export const source = (file) => fs.readFileSync(file, 'utf8').replace(/^#!.*/, (s) => ' '.repeat(s.length));

export const parse = (src) => acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });

export const tokens = (src) => acorn.tokenizer(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });

export const rel = (file) => path.relative(REPO, file);
