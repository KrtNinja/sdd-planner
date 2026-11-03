// Снимки защищённых частей для guard после humanizer.
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import { scan, numbers, quotes } from './md.mjs';
import { SRC_RE, srcRefs } from './sources.mjs';

// Папка — от os.tmpdir() на каждый вызов: TMPDIR может меняться между вызовами run() в одном процессе.
const snapDir = () => path.join(os.tmpdir(), 'sdd-lint-snapshots');
/** @param {string} f */
export const snapPath = (f) => path.join(snapDir(), `${crypto.createHash('sha1').update(fs.realpathSync(f)).digest('hex')}.json`);
/** Защищённые части файла по видам: блоки кода, заголовки, ID… @typedef {Record<string, string[]>} Parts */
/** @param {string} md @returns {Parts} */
export function protectedParts(md) {
  const sc = scan(md);
  const outside = sc.lines.filter((l) => !l.inCode);
  const firstH2 = outside.findIndex((l) => /^##\s/.test(l.text));
  const top = outside.slice(0, firstH2 < 0 ? outside.length : firstH2);
  return {
    'блок кода': sc.blocks.map((b) => b.lines.map((l) => l.text.trimEnd()).join('\n')),
    заголовок: outside.filter((l) => /^#{1,6}\s/.test(l.text)).map((l) => l.text.trim()),
    'строка шапки': top.filter((l) => /^[\p{Lu}][^:|]{0,40}:\s*\S/u.test(l.text)).map((l) => l.text.trim()),
    'строка таблицы': outside.filter((l) => l.text.trim().startsWith('|')).map((l) => l.text.trim().replace(/\s+/g, ' ')),
    текст: quotes(md).map((q) => `«${q}»`),
    число: numbers(md),
    ID: [...md.matchAll(/\b(?:N?FR-\d+|AC-\d{3}-[BF]?\d+|ADR-\d+)\b|(?<![\p{L}\d])ОГР-\d+(?!\d)/gu)].map((x) => x[0]),
    'ссылка на протокол': outside.filter((l) => SRC_RE.test(l.text)).map((l) => srcRefs(l.text).map((r) => r.id).join(', ')),
  };
}
/** @param {string} f */
export function saveSnapshot(f) {
  fs.mkdirSync(snapDir(), { recursive: true });
  fs.writeFileSync(
    snapPath(f),
    JSON.stringify({ file: fs.realpathSync(f), time: new Date().toISOString(), parts: protectedParts(fs.readFileSync(f, 'utf8')) }),
  );
}
/** @param {Parts} before @param {Parts} after */
export function diffParts(before, after) {
  /** @type {string[]} */
  const out = [];
  const short = (/** @type {string} */ s) => (s.length > 70 ? `${s.slice(0, 67)}…` : s).replace(/\n/g, ' ⏎ ');
  for (const kind of Object.keys(before)) {
    const left = new Map();
    for (const x of before[kind]) left.set(x, (left.get(x) || 0) + 1);
    const right = new Map();
    for (const x of after[kind] || []) right.set(x, (right.get(x) || 0) + 1);
    for (const [x, c] of left) if ((right.get(x) || 0) < c) out.push(`${kind} — было: ${short(x)}`);
    for (const [x, c] of right) if ((left.get(x) || 0) < c) out.push(`${kind} — стало: ${short(x)}`);
  }
  return out;
}
