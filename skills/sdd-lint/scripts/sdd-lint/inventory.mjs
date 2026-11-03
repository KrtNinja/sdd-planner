// Опись доступных документов и кода: ограниченный обход каталогов для вопроса об источниках.
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { DOCS, isDir, listFeatures } from './pick.mjs';

const SKIP = new Set(['node_modules', 'dist', 'build', 'target', 'vendor', 'coverage', 'out', 'tmp']);
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|py|java|kt|kts|go|cs|rb|php|swift|scala|rs|c|cc|cpp|h|hpp|sql|dart)$/i;
const CONTRACT = /(openapi|swagger|asyncapi)[^/]*\.(ya?ml|json)$|\.(proto|graphql|avsc)$/i;
/** @typedef {{ readme: number, md: number, code: number, contract: number }} Counts */
/** @typedef {{ budget: number, counts: Counts }} Walk */
/** @param {string} name */
const skipped = (name) => name.startsWith('.') || SKIP.has(name);

/** @param {Counts} c @param {string} name */
function countEntry(c, name) {
  if (/^readme(\.md)?$/i.test(name)) c.readme++;
  else if (CONTRACT.test(name)) c.contract++;
  else if (CODE_EXT.test(name)) c.code++;
  else if (/\.md$/i.test(name)) c.md++;
}
/** @param {string} dir @returns {fs.Dirent[]} */
function readableEntries(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
/** @param {string} dir @param {number} depth @param {Walk} state */
function walkFiles(dir, depth, state) {
  for (const e of readableEntries(dir)) {
    if (--state.budget < 0 || skipped(e.name)) continue;
    if (e.isDirectory()) {
      if (depth < 4) walkFiles(path.join(dir, e.name), depth + 1, state);
    } else countEntry(state.counts, e.name);
  }
}
/** @param {string} dir */
function countFiles(dir) {
  const counts = { readme: 0, md: 0, code: 0, contract: 0 };
  walkFiles(dir, 1, { budget: 3000, counts });
  return counts;
}

/** @param {string | null} exclude */
function artifactItems(exclude) {
  const others = listFeatures().filter((f) => f !== exclude);
  const items = [];
  if (others.length) items.push(`${DOCS}/ — фичи: ${others.slice(0, 5).join(', ')}${others.length > 5 ? ` и ещё ${others.length - 5}` : ''}`);
  const adr = isDir(path.join(DOCS, 'adr')) ? fs.readdirSync(path.join(DOCS, 'adr')).filter((x) => /^\d{4}-.+\.md$/.test(x)).length : 0;
  if (adr) items.push(`${DOCS}/adr/ — ADR: ${adr}`);
  return { items, docs: others.length + adr };
}
/** @param {Counts} c */
function countParts(c) {
  return [
    c.readme && `README: ${c.readme}`,
    c.md && `документов: ${c.md}`,
    c.contract && `контрактов: ${c.contract}`,
    c.code && `файлов кода: ${c.code}`,
  ].filter(Boolean);
}
/** @param {string} root */
function projectDirs(root) {
  return fs.readdirSync(root, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((e) => e.isDirectory() && !skipped(e.name) && e.name !== DOCS);
}
/** @param {string | null} [exclude] */
export function inventory(exclude = null) {
  const artifacts = artifactItems(exclude);
  const root = process.cwd();
  const readme = fs.existsSync(path.join(root, 'README.md'));
  const items = [...(readme ? ['README.md'] : []), ...artifacts.items];
  let code = 0;
  let docs = Number(readme) + artifacts.docs;
  for (const e of projectDirs(root)) {
    const c = countFiles(path.join(root, e.name));
    const parts = countParts(c);
    if (!parts.length) continue;
    items.push(`${e.name}/ — ${parts.join(', ')}`);
    code += c.code + c.contract;
    docs += c.readme + c.md;
  }
  return { items: items.slice(0, 8), code, docs, empty: !items.length };
}
