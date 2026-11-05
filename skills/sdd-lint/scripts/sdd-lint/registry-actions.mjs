// Детерминированные действия; содержательное проведение ответа — следующий блок.
// @ts-check
import { questionContext } from './registry-context.mjs';
import { read } from './md.mjs';
import { loadFeature } from './feature.mjs';
import { requireDocumentationFlow } from './flow.mjs';
import { buildFlowGraph } from './flow-graph.mjs';
import { reserveFlowId } from './flow-state.mjs';
import { questionRequest, questionActions, registryRecords, replaceQuestion } from './registry-format.mjs';
import { writeRegistry } from './registry-store.mjs';

/** @typedef {import('./flow-format.mjs').FlowRecord} FlowQuestion */
/** @typedef {{key: string, id?: string, title?: string, stage?: string, topic?: string, context?: string,
 * resume?: string, refs?: string[], impact?: string, parent?: string, followup?: string, colleagues?: string,
 * answer?: string, origin?: string, decision?: string, consequences?: string}} Input */
/** @type {Record<string, string>} */
const FIELDS = { stage: 'Этап', topic: 'Тема', context: 'Контекст', resume: 'Продолжить', impact: 'Влияние',
  parent: 'Родитель', followup: 'Уточнения', colleagues: 'Коллеги', answer: 'Ответ', decision: 'Исключение', consequences: 'Последствия' };

/** @param {Input} input */
function validateInput(input) {
  if (!input || typeof input.key !== 'string' || !/^[\w.-]{1,120}$/.test(input.key)) throw new Error('Нужен постоянный ключ действия key');
  for (const [key, value] of Object.entries(input)) {
    validateValue(key, value);
  }
}

/** @param {Input} input @param {(keyof Input)[]} keys */
function requireFields(input, keys) {
  for (const key of keys) if (!input[key]) throw new Error(`Нужно поле ${key}`);
}

/** @param {string} verb @param {Input} input @param {FlowQuestion | null} before @returns {FlowQuestion} */
function changedQuestion(verb, input, before) {
  if (verb === 'add') {
    if (input.id) throw new Error('Для нового вопроса не задавайте id');
    requireFields(input, ['title', 'stage', 'topic', 'context', 'resume', 'impact']);
    return newQuestion(input);
  }
  if (!before) throw new Error('Вопрос не найден');
  if (['resolved', 'excluded'].includes(before.fields.Статус)) throw new Error('Вопрос уже закрыт');
  const q = { ...before, fields: { ...before.fields } };
  transition(q, verb, input);
  return q;
}

/** @param {Input} input @returns {FlowQuestion} */
function newQuestion(input) {
  /** @type {Record<string, string>} */
  const fields = { Статус: 'open' };
  for (const [key, label] of Object.entries(FIELDS)) {
    const value = input[/** @type {keyof Input} */ (key)];
    if (typeof value === 'string') fields[label] = value;
  }
  if (input.refs?.length) fields.Элементы = input.refs.join(', ');
  return { id: 'Q1', kind: 'question', title: /** @type {string} */ (input.title), file: 'questions.md', n: 1,
    fields, refs: [], parent: null };
}

/** @param {FlowQuestion} q @param {string} verb @param {Input} input */
function transition(q, verb, input) {
  if (verb === 'defer') {
    if (q.fields.Статус === 'answered') throw new Error('Ответ требует обработки; откладывание не удаляет ответ');
    q.fields.Статус = 'deferred';
    if (input.colleagues) q.fields.Коллеги = input.colleagues;
  } else if (verb === 'answer') {
    requireFields(input, ['answer']);
    recordAnswer(q, input);
    q.fields.Статус = 'answered';
  } else if (verb === 'exclude') {
    requireFields(input, ['decision', 'consequences']);
    q.fields.Исключение = /** @type {string} */ (input.decision);
    q.fields.Последствия = /** @type {string} */ (input.consequences);
    q.fields.Статус = 'answered';
  } else if (verb === 'scope') {
    requireFields(input, ['impact']);
    q.fields.Влияние = /** @type {string} */ (input.impact);
    delete q.fields.Элементы;
    if (input.refs?.length) q.fields.Элементы = input.refs.join(', ');
  } else throw new Error('Действие: add, defer, answer, exclude или scope');
}

/** @param {FlowQuestion} q @param {Input} input */
function recordAnswer(q, input) {
  const answer = /** @type {string} */ (input.answer);
  const history = JSON.parse(q.fields.ОтветыJSON || '[]');
  if (!history.length && q.fields.Ответ) history.push({ answer: q.fields.ОтветJSON ? JSON.parse(q.fields.ОтветJSON) : q.fields.Ответ });
  history.push({ answer, origin: input.origin || 'unconfirmed' });
  q.fields.ОтветыJSON = JSON.stringify(history);
  q.fields.ОтветJSON = JSON.stringify(answer);
  delete q.fields.Исключение;
  delete q.fields.Последствия;
  q.fields.Ответ = /[\r\n]/.test(answer) ? 'Дословный ответ в ОтветJSON' : answer;
  q.fields.Происхождение = input.origin || 'unconfirmed';
}

/** @param {string} dir @param {string} verb @param {Input} input */
export function applyQuestion(dir, verb, input) {
  validateInput(input);
  validateAction(verb, input);
  if (!loadFeature(dir).flow.state) throw new Error('Не найден .sdd-flow.json для реестра вопросов');
  return writeRegistry(dir, (md) => {
    const { records, previous, digest } = questionRequest(md, verb, input);
    if (previous) return { md, result: previous };
    const before = records.find((r) => r.id === input.id) || null;
    if (before?.fields.Пакет) throw new Error('Сначала завершите проведение сохранённого пакета');
    const q = changedQuestion(verb, input, before);
    q.fields.Действия = JSON.stringify({ ...questionActions(q), [input.key]: digest });
    validateChange(dir, q, verb);
    if (['add', 'scope'].includes(verb)) {
      const m = loadFeature(dir);
      q.fields.Снимок = JSON.stringify(questionContext(m, input.refs || []).map((c) => ({ id: c.id, file: c.file, hash: c.hash })));
    }
    if (verb === 'add') q.id = reserveFlowId(dir, 'Q');
    return { md: replaceQuestion(md, q, before), result: q };
  });
}

/** @param {string} dir @param {FlowQuestion} q @param {string} verb */
function validateChange(dir, q, verb) {
  const m = loadFeature(dir, (file) => file.endsWith('questions.md.pending') ? null : read(file));
  if (['answer', 'exclude'].includes(verb)) {
    if (m.flow.problems.length) throw new Error(m.flow.problems.map((p) => p.message).join('; '));
    registryRecords(replaceQuestion('', q, null));
    return;
  }
  requireDocumentationFlow(m);
  registryRecords(replaceQuestion('', q, null));
  if (!['known', 'unknown'].includes(q.fields.Влияние)) throw new Error('Влияние: known или unknown');
  if (q.fields.Влияние === 'known' && !q.fields.Элементы) throw new Error('Для известного влияния нужны связанные элементы');
  validateTargets(m, q);
}

/** @param {import('./model.mjs').Feature} m @param {FlowQuestion} q */
function validateTargets(m, q) {
  const candidate = { ...q, id: `Q${/** @type {import('./flow-state.mjs').FlowState} */ (m.flow.state).next.Q}` };
  const parsed = registryRecords(replaceQuestion('', candidate, null));
  const graph = buildFlowGraph(m, [...m.flow.records, ...parsed], read);
  if (graph.problems.length) throw new Error(graph.problems.map((p) => p.message).join('; '));
}

/** @param {string} verb @param {Input} input */
function validateAction(verb, input) {
  /** @type {Record<string, string[]>} */
  const allowed = {
    add: ['title', 'stage', 'topic', 'context', 'resume', 'refs', 'impact', 'parent', 'followup', 'colleagues'],
    defer: ['id', 'colleagues'], answer: ['id', 'answer', 'origin'], exclude: ['id', 'decision', 'consequences'],
    scope: ['id', 'refs', 'impact'],
  };
  if (input.origin && !['analyst', 'colleague', 'recommendation', 'unconfirmed'].includes(input.origin))
    throw new Error('Неизвестное происхождение ответа');
  if (!allowed[verb]) throw new Error('Неизвестное действие реестра');
  for (const key of Object.keys(input)) {
    if (key !== 'key' && !allowed[verb].includes(key)) throw new Error(`Поле ${key} недопустимо для ${verb}`);
  }
}

/** @param {string} key @param {unknown} value */
function validateValue(key, value) {
  if (key === 'refs') {
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) throw new Error('refs — массив ID');
  } else if (key === 'answer') {
    validateAnswer(value);
  } else if (typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value)) {
    throw new Error(`${key}: нужен непустой текст одной строкой`);
  }
}

/** @param {unknown} value */
function validateAnswer(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('answer: нужен непустой ответ');
}
