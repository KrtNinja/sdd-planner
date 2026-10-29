// Счётчик прогонов plan и done по фиче: агент не крутится в цикле правок, а после лимита отдаёт решение человеку.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const MAX_RUNS = 3;
// Пауза дольше часа — новая попытка: вчерашние прогоны не считаются.
const FRESH_MS = 60 * 60 * 1000;
const stateDir = path.join(os.tmpdir(), 'sdd-lint-state');
const stateFile = (dir, kind) => path.join(stateDir, `${crypto.createHash('sha1').update(`${fs.realpathSync(dir)}\0${kind}`).digest('hex')}.json`);

function load(dir, kind) {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(dir, kind), 'utf8'));
    return Date.now() - s.time < FRESH_MS ? s : null;
  } catch {
    return null;
  }
}
// Новый прогон: { runs, prev } — prev хранит то, что прошлые прогоны записали через mark.
export function bump(dir, kind) {
  const prev = load(dir, kind);
  const runs = (prev?.runs || 0) + 1;
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(stateFile(dir, kind), JSON.stringify({ ...prev, runs, time: Date.now() }));
  return { runs, prev };
}
// Дописать в состояние текущего прогона (номер прогона не меняется).
export function mark(dir, kind, extra) {
  const cur = load(dir, kind);
  if (!cur) return;
  fs.writeFileSync(stateFile(dir, kind), JSON.stringify({ ...cur, ...extra, time: Date.now() }));
}
export function reset(dir, kind) {
  fs.rmSync(stateFile(dir, kind), { force: true });
}
