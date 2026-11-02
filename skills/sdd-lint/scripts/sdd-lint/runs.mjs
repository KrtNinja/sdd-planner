// Счётчик прогонов plan и done по фиче: агент не крутится в цикле правок, а после лимита отдаёт решение человеку.
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const MAX_RUNS = 3;
// Пауза дольше часа — новая попытка: вчерашние прогоны не считаются.
const FRESH_MS = 60 * 60 * 1000;
// Папка — от os.tmpdir() на каждый вызов: TMPDIR может меняться между вызовами run() в одном процессе.
const stateDir = () => path.join(os.tmpdir(), 'sdd-lint-state');
/** @param {string} dir @param {string} kind */
const stateFile = (dir, kind) => path.join(stateDir(), `${crypto.createHash('sha1').update(`${fs.realpathSync(dir)}\0${kind}`).digest('hex')}.json`);

/** @typedef {{ runs: number, time: number, [k: string]: unknown }} RunState */
/** @param {string} dir @param {string} kind @returns {RunState | null} */
function load(dir, kind) {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(dir, kind), 'utf8'));
    return Date.now() - s.time < FRESH_MS ? s : null;
  } catch {
    return null;
  }
}
// Новый прогон: { runs, prev } — prev хранит то, что прошлые прогоны записали через mark.
/** @param {string} dir @param {string} kind */
export function bump(dir, kind) {
  const prev = load(dir, kind);
  const runs = (prev?.runs || 0) + 1;
  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(stateFile(dir, kind), JSON.stringify({ ...prev, runs, time: Date.now() }));
  return { runs, prev };
}
// Дописать в состояние текущего прогона (номер прогона не меняется).
/** @param {string} dir @param {string} kind @param {Record<string, unknown>} extra */
export function mark(dir, kind, extra) {
  const cur = load(dir, kind);
  if (!cur) return;
  fs.writeFileSync(stateFile(dir, kind), JSON.stringify({ ...cur, ...extra, time: Date.now() }));
}
/** @param {string} dir @param {string} kind */
export function reset(dir, kind) {
  fs.rmSync(stateFile(dir, kind), { force: true });
}
