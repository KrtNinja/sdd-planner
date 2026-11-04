// Краткие карточки и консервативная проверка независимости по существующему графу.
// @ts-check
import { requireDocumentationFlow } from './flow.mjs';
import { reqIds, header } from './md.mjs';
import path from 'node:path';

/** @typedef {import('./model.mjs').Feature} Feature */
/** @typedef {import('./flow-format.mjs').FlowRecord} FlowQuestion */
/** @type {Record<string, string>} */
const LABELS = { open: 'ждёт ответа', deferred: 'ждёт ответа (отложен)', answered: 'ответ требует обработки',
  resolved: 'закрыт', excluded: 'закрыт (исключено из объёма)' };

/** @param {Feature} m @param {{id?: string, stage?: string, topic?: string}} [filter] */
export function registryQuestions(m, filter = {}) {
  return m.flow.records.filter((q) => q.kind === 'question' &&
    Object.entries(filter).every(([k, v]) => ({ id: q.id, stage: q.fields.Этап, topic: q.fields.Тема })[k] === v));
}

/** @param {FlowQuestion} q */
export const questionPending = (q) => !['resolved', 'excluded'].includes(q.fields.Статус);

/** @param {FlowQuestion} q */
export function questionCard(q) {
  const impact = q.fields.Влияние === 'known' && q.refs.length
    ? `Зависимая область: ${q.refs.map((r) => r.id).join(', ')}.`
    : 'Область влияния неизвестна — сначала уточним её; независимость пока не подтверждена.';
  return `${q.id} — ${q.title}\n${LABELS[q.fields.Статус]} · ${q.fields.Тема} · ${q.fields.Этап}\n${impact}`;
}

/** @param {Feature} m @param {{id?: string, stage?: string, topic?: string}} [filter] */
export function registrySummary(m, filter = {}) {
  const qs = registryQuestions(m, filter).filter(questionPending);
  return qs.length ? qs.map(questionCard).join('\n\n') : 'Нерешённых вопросов по выбранному фильтру нет.';
}

/** @param {Feature} m */
function dependencyPairs(m) {
  const pairs = (m.flow.graph?.edges || []).filter((e) => !/^Q/.test(e.from)).map((e) => [e.from, e.to]);
  for (const slice of m.slices.values()) {
    const requirements = [...slice.basis];
    for (const ac of slice.acs) for (const id of requirements) pairs.push([ac.id, id]);
    pairs.push(...sliceDependencies(m, slice));
  }
  return [...pairs, ...adrDependencies(m)];
}

/** @param {Feature} m @param {string[]} ids */
function connected(m, ids) {
  const result = new Set(ids);
  const pairs = dependencyPairs(m);
  let size;
  do {
    size = result.size;
    for (const [a, b] of pairs) {
      if (result.has(a)) result.add(b);
      if (result.has(b)) result.add(a);
    }
  } while (result.size !== size);
  return result;
}

/** @param {Feature} m @param {string[]} ids */
function blockingQuestions(m, ids) {
  const area = connected(m, ids);
  return registryQuestions(m).filter(questionPending).filter((q) =>
    q.fields.Влияние !== 'known' || !q.refs.length || q.refs.some((r) => area.has(r.id)));
}

/** @param {Feature} m @param {string[]} ids */
export function draftWork(m, ids) {
  requireDocumentationFlow(m);
  requireKnownDependencies(m);
  if (!ids.length) throw new Error('Укажите элементы черновика; пустая область не доказывает независимость');
  for (const id of ids) {
    if (!m.flow.graph?.byId.has(id) || /^Q/.test(id)) throw new Error(`Неизвестная область черновика: ${id}`);
  }
  const blocked = blockingQuestions(m, ids);
  if (blocked.length) throw new Error(`Черновик зависит от нерешённых вопросов:\n${blocked.map(questionCard).join('\n\n')}`);
  return `Можно продолжить независимый черновик: ${ids.join(', ')}. Обсуждение фичи остаётся незавершённым.\n` +
    'Используйте только подтверждённые решения; отложенные ответы не превращайте в FR. Это не согласование и не передача в разработку.';
}

/** @param {Feature} m @param {string[]} files */
export function fileQuestionBlockers(m, files) {
  const scope = new Set(files.map((f) => path.resolve(f)));
  const ids = [...(m.flow.graph?.byId.values() || [])].filter((a) => scope.has(path.resolve(a.file))).map((a) => a.id);
  return blockingQuestions(m, ids);
}

/** @param {Feature} m @param {import('./model.mjs').Slice} slice */
function sliceDependencies(m, slice) {
  return slice.deps.flatMap((dep) => [...(m.slices.get(dep)?.basis || [])]
    .flatMap((id) => [...slice.basis].map((own) => [own, id])));
}

/** @param {Feature} m */
function adrDependencies(m) {
  const pairs = m.featureAdrs.flatMap((adr) => reqIds(adr.md).map((id) => [`ADR-${adr.num}`, id]));
  for (const slice of m.slices.values()) {
    const adrs = (header(slice.md, 'Почему отдельно', '') || '').match(/\bADR-\d{4}\b/g) || [];
    for (const adr of adrs) for (const id of slice.basis) pairs.push([adr, id]);
  }
  return pairs;
}

/** @param {Feature} m */
function requireKnownDependencies(m) {
  for (const slice of m.slices.values()) {
    for (const dep of slice.deps) if (!m.slices.has(dep)) throw new Error(`Неизвестная зависимость части работы ${dep}`);
    for (const id of slice.basis) if (!m.spec?.reqs.has(id)) throw new Error(`Неизвестное основание части работы ${id}`);
  }
}
