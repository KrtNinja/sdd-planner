// Журнал проведения находится в самой Q. Закрытие — последний шаг после записи и проверок.
// @ts-check
import path from 'node:path';
import { questionCard } from './registry-view.mjs';
import { loadFeature } from './feature.mjs';
import { read } from './md.mjs';
import { requireDocumentationFlow } from './flow.mjs';
import { writeRegistry } from './registry-store.mjs';
import { questionRequest, questionActions, questionDigest, replaceQuestion } from './registry-format.mjs';
import { contextChanges, questionContext } from './registry-context.mjs';
import { applyDecisionFiles, candidateFeature, checkDecision, checkDecisionMeaning, decisionFiles, decisionReviews, decisionLinks } from './decision-files.mjs';

/** @typedef {import('./flow-format.mjs').FlowRecord} Question */
/** @typedef {{id: string, file: string | null, hash: string | null}} Context */
/** @typedef {{changes: import('./decision-files.mjs').Change[], summary: string, assessment: string,
 * tradeoffs: string, remaining: string, obligations: string, context: Context[]}} Package */
/** @typedef {{key: string, id: string, packageHash?: string, decision?: string, origin?: string, agreement?: string,
 * summary?: string, assessment?: string, tradeoffs?: string, remaining?: string, obligations?: string,
 * ready?: boolean, conflicts?: string[], context?: Context[], changes?: import('./decision-files.mjs').Change[]}} Input */

/** @param {string} dir */
const unlockedFeature = (dir) => loadFeature(dir, (file) => file.endsWith('questions.md.pending') ? null : read(file));

/** @param {string} dir @param {string} verb @param {Input} input */
export function decisionAction(dir, verb, input) {
  if (!loadFeature(dir).flow.state) throw new Error('Пакет доступен только в новом процессе');
  if (!input || typeof input.key !== 'string' || !/^[\w.-]{1,120}$/.test(input.key)) throw new Error('Нужен постоянный ключ действия key');
  return writeRegistry(dir, (md) => {
    const { records, previous, digest } = questionRequest(md, verb, input);
    if (previous) return { md, result: decisionCard(previous) };
    const before = records.find((q) => q.id === input.id);
    if (!before || before.fields.Статус !== 'answered') throw new Error('Нужен вопрос с ответом, требующим обработки');
    const q = { ...before, fields: { ...before.fields } };
    performDecision(dir, q, { verb, input });
    q.fields.Действия = JSON.stringify({ ...questionActions(q), [input.key]: digest });
    return { md: replaceQuestion(md, q, before), result: decisionCard(q) };
  });
}

/** @param {string} dir @param {Question} q @param {{verb: string, input: Input}} action */
function performDecision(dir, q, { verb, input }) {
  if (verb === 'prepare') prepareDecision(dir, q, input);
  else if (verb === 'accept') acceptDecision(q, input);
  else if (verb === 'apply') finishDecision(dir, q, input);
  else if (verb === 'revise') reviseDecision(dir, q, input);
  else throw new Error('Действие пакета: prepare, accept или apply');
}

/** @param {Input} input */
function requireAssessment(input) {
  for (const key of /** @type {const} */ (['summary', 'assessment', 'tradeoffs', 'remaining'])) {
    if (typeof input[key] !== 'string' || !input[key].trim()) throw new Error(`Нужно поле ${key}`);
  }
  if (input.ready !== true || !Array.isArray(input.conflicts) || input.conflicts.length)
    throw new Error('Частичный ответ или противоречие: продолжите ветку до подготовки пакета');
}

/** @param {string} dir @param {Question} q @param {Input} input */
function prepareDecision(dir, q, input) {
  if (q.fields.Пакет) throw new Error('Пакет уже сохранён: продолжите его, не создавайте дубликат');
  requireAssessment(input);
  const m = unlockedFeature(dir);
  requireDocumentationFlow(m);
  const { current } = contextChanges(m, q);
  requireContext(current, input.context);
  const files = decisionFiles(m, /** @type {import('./decision-files.mjs').Change[]} */ (input.changes));
  const changes = decisionReviews(m, decisionLinks(dir, files));
  const candidate = candidateFeature(dir, changes);
  checkDecisionMeaning(m, candidate, /** @type {string} */ (input.obligations));
  checkDecision(candidate);
  const pack = { changes, summary: input.summary, assessment: input.assessment, tradeoffs: input.tradeoffs,
    remaining: input.remaining, obligations: input.obligations, context: input.context };
  q.fields.Пакет = JSON.stringify(pack);
  if (input.agreement !== undefined) acceptDecision(q, { ...input, decision: input.agreement, packageHash: questionDigest(q.fields.Пакет) });
}

/** @param {Context[]} current @param {Context[] | undefined} supplied */
function requireContext(current, supplied) {
  if (!Array.isArray(supplied) || current.length !== supplied.length) throw new Error('Сначала загрузите актуальную ветку через resume');
  for (const c of current) {
    if (!c.file || !c.hash) throw new Error(`Связанный элемент ${c.id} удалён; сначала разберите конфликт`);
    if (!supplied.some((s) => s.id === c.id && s.file === c.file && s.hash === c.hash))
      throw new Error(`Контекст ${c.id} изменился после чтения; повторите resume и смысловую оценку`);
  }
}

/** @param {Question} q @param {Input} input */
function acceptDecision(q, input) {
  requirePackage(q, input.packageHash);
  if (input.origin !== 'analyst' || typeof input.decision !== 'string' || !input.decision.trim())
    throw new Error('Нужно явно принятое решение аналитика, не рекомендация ИИ или сообщение коллег');
  q.fields.Согласование = JSON.stringify({ hash: input.packageHash, decision: input.decision, origin: input.origin });
}

/** @param {Question} q @param {string | undefined} hash @returns {Package} */
function requirePackage(q, hash) {
  if (!q.fields.Пакет || questionDigest(q.fields.Пакет) !== hash) throw new Error('Пакет отсутствует или изменился');
  return JSON.parse(q.fields.Пакет);
}

/** @param {string} dir @param {Question} q @param {Input} input */
function finishDecision(dir, q, input) {
  const pack = requirePackage(q, input.packageHash);
  const accepted = JSON.parse(q.fields.Согласование || 'null');
  if (accepted?.hash !== input.packageHash) throw new Error('Сначала согласуйте пакет целиком');
  const m = unlockedFeature(dir);
  checkUnchangedContext(m, pack);
  applyDecisionFiles(m, pack.changes);
  const after = unlockedFeature(dir);
  checkDecision(after);
  for (const c of pack.changes) {
    if (read(path.resolve(dir, c.file)) !== c.after) throw new Error(`Документ изменился во время проведения: ${c.file}`);
  }
  q.fields.Статус = q.fields.Исключение ? 'excluded' : 'resolved';
}

/** @param {import('./model.mjs').Feature} m @param {Package} pack */
function checkUnchangedContext(m, pack) {
  const untouched = pack.context.filter((c) => !pack.changes.some((change) => change.file === c.file));
  requireContext(questionContext(m, untouched.map((c) => c.id)), untouched);
}

/** @param {Question} q */
function decisionCard(q) {
  if (!q.fields.Пакет) return `${q.id}: ответ требует обработки; подготовьте исправленный пакет.`;
  const p = /** @type {Package} */ (JSON.parse(q.fields.Пакет));
  return `${questionCard(q)}\nЧто меняется и почему: ${p.summary}\n` +
    `Компромиссы: ${p.tradeoffs}\nОставшиеся вопросы: ${p.remaining}\n` +
    `Файлы: ${p.changes.map((c) => c.file).join(', ')}\npackageHash: ${questionDigest(q.fields.Пакет)}`;
}

/** @param {string} dir @param {Question} q @param {Input} input */
function reviseDecision(dir, q, input) {
  const pack = requirePackage(q, input.packageHash);
  for (const c of pack.changes) {
    if (read(path.resolve(dir, c.file)) !== c.before) throw new Error('Пакет частично проведён или контекст изменился; сначала восстановите документы');
  }
  delete q.fields.Пакет;
  delete q.fields.Согласование;
}
