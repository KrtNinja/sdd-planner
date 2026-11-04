// Узкий журнал переноса. Пока он существует, модель не должна редактировать обе копии.
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { read, SectionConflict } from './md.mjs';
import { questionDigest } from './registry-format.mjs';
import { publishQuestionDocument } from './registry-store.mjs';
import { snapPath } from './snapshot.mjs';

/** @typedef {import('./scenario-plan.mjs').MoveChange} Change */
/** @typedef {{changes: Change[], snapshots: Change[]}} Plan */
/** @param {string} dir */
export const scenarioJournal = (dir) => path.join(dir, '.sdd-scenarios.pending');

/** @param {string} file */
function safeFile(file) {
  if (fs.realpathSync(path.dirname(file)) !== path.dirname(file) || fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink())
    throw new Error(`Перенос не пишет через символические ссылки: ${file}`);
}

/** @param {Change[]} changes */
function validateVersions(changes) {
  for (const c of changes) {
    safeFile(c.file);
    const current = read(c.file);
    if (current !== c.before && current !== c.after) throw new Error(`Конфликт переноса: ${c.file}. Сравните pending и текущий текст; не удаляйте журнал.`);
  }
}

/** @param {string} dir @param {Plan} plan @param {() => void} verify */
export function publishScenarioMove(dir, plan, verify) {
  const file = scenarioJournal(dir);
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    const body = JSON.stringify(plan);
    fs.writeFileSync(fd, JSON.stringify({ body, hash: questionDigest(body) }));
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  finishMove(dir, plan, verify);
}

/** @param {string} dir @param {Plan} plan @param {() => void} verify */
function finishMove(dir, plan, verify) {
  const all = [...plan.changes, ...plan.snapshots];
  validateVersions(all);
  for (const c of all) {
    if (read(c.file) !== c.after) publishQuestionDocument(c.file, c.after, '.scenario-writing');
  }
  verify();
  if (all.some((c) => read(c.file) !== c.after)) throw new Error('Документы изменились во время переноса');
  fs.unlinkSync(scenarioJournal(dir));
}

/** @param {string} dir @param {() => void} verify */
export function recoverScenarioMove(dir, verify) {
  const file = scenarioJournal(dir);
  const raw = read(file);
  if (raw === null) return;
  const envelope = JSON.parse(raw);
  if (typeof envelope.body !== 'string' || questionDigest(envelope.body) !== envelope.hash) throw new Error('Повреждён журнал переноса');
  const plan = /** @type {Plan} */ (JSON.parse(envelope.body));
  validatePaths(dir, plan);
  validateVersions([...plan.changes, ...plan.snapshots]);
  for (const c of [...plan.changes, ...plan.snapshots]) {
    const temp = `${c.file}.scenario-writing`;
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
  finishMove(dir, plan, verify);
}

/** @param {string} dir @param {Plan} plan */
function validatePaths(dir, plan) {
  if (!Array.isArray(plan.changes) || !plan.changes.length || !Array.isArray(plan.snapshots)) throw new Error('Некорректный план переноса');
  const root = path.dirname(dir) + path.sep;
  for (const c of plan.changes) {
    validateDocumentPath(root, c);
  }
  const allowed = new Set(plan.changes.filter((c) => c.before !== null).map((c) => snapPath(c.file)));
  if (plan.snapshots.some((c) => !allowed.has(c.file))) throw new Error('Посторонний снимок в журнале');
}

/** @param {string} dir */
export function requireIdleMove(dir) {
  if (read(path.join(dir, '.sdd-flow.json')) === null) return;
  if (read(scenarioJournal(dir)) !== null) throw new SectionConflict('Сначала scenarios recover; не редактируйте копии');
}

/** @param {string} root @param {Change} c */
function validateDocumentPath(root, c) {
  if (!path.isAbsolute(c.file) || !c.file.startsWith(root) || !c.file.endsWith('.md')) throw new Error('Путь переноса вне документов');
  if (typeof c.after !== 'string') throw new Error('Нет текста переноса');
}
