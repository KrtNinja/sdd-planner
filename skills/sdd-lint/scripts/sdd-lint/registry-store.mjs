// Один атомарный файл реестра; счётчик Q резервируется отдельно до публикации.
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { parseFlowState } from './flow-state.mjs';
import { reservedId } from './flow-graph.mjs';
import { read } from './md.mjs';
import { questionDigest, registryRecords } from './registry-format.mjs';

/** @param {string} file */
const content = (file) => read(file) || '';

/** @template T @param {string} dir @param {(md: string) => {md: string, result: T}} change @returns {T} */
export function writeRegistry(dir, change) {
  const file = path.join(dir, 'questions.md');
  const pending = `${file}.pending`;
  const fd = fs.openSync(pending, 'wx', 0o600);
  let published = false;
  try {
    const before = content(file);
    const next = change(before);
    const envelope = { base: questionDigest(before), md: next.md, hash: questionDigest(next.md) };
    fs.writeFileSync(fd, JSON.stringify(envelope));
    fs.fsyncSync(fd);
    publishRegistry(file, envelope);
    published = true;
    fs.unlinkSync(pending);
    return next.result;
  } finally {
    fs.closeSync(fd);
    if (!published) fs.unlinkSync(pending);
  }
}

/** @param {string} file @param {{base: string, md: string, hash: string}} envelope */
function publishRegistry(file, envelope) {
  if (questionDigest(content(file)) !== envelope.base) throw new Error('Реестр изменился во время записи; повторите после проверки');
  const temp = `${file}.writing`;
  const fd = fs.openSync(temp, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, envelope.md);
    fs.fsyncSync(fd);
    fs.renameSync(temp, file);
  } finally {
    fs.closeSync(fd);
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

// Только после остановки писателей. Незавершённый JSON удаляется, полный проверяется до публикации.
/** @param {string} dir */
export function recoverRegistry(dir) {
  const file = path.join(dir, 'questions.md');
  const pending = `${file}.pending`;
  const raw = read(pending);
  if (raw === null) return;
  let envelope;
  try { envelope = JSON.parse(raw); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    fs.unlinkSync(pending);
    return;
  }
  validateEnvelope(envelope);
  const current = questionDigest(content(file));
  if (![envelope.base, envelope.hash].includes(current)) throw new Error('Реестр изменился; проверьте Git и pending вручную');
  validateReserved(dir, envelope.md);
  if (fs.existsSync(`${file}.writing`)) fs.unlinkSync(`${file}.writing`);
  if (current !== envelope.hash) publishRegistry(file, envelope);
  fs.unlinkSync(pending);
}

/** @param {{base: string, md: string, hash: string}} value */
function validateEnvelope(value) {
  if (!value || typeof value.md !== 'string' || typeof value.base !== 'string') throw new Error('Повреждён pending реестра');
  if (questionDigest(value.md) !== value.hash) throw new Error('Повреждён хэш pending реестра');
}

/** @param {string} dir @param {string} md */
function validateReserved(dir, md) {
  const state = parseFlowState(read(path.join(dir, '.sdd-flow.json')));
  if (!state) throw new Error('Восстановление требует признака нового процесса');
  if (fs.existsSync(path.join(dir, '.sdd-flow.json.pending'))) throw new Error('Сначала восстановите счётчики');
  for (const q of registryRecords(md)) if (!reservedId(q, state)) throw new Error(`${q.id}: номер не зарезервирован`);
}
