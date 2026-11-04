// Запись Q и её журнал действий живут только в questions.md.
// @ts-check
import crypto from 'node:crypto';
import { parseFlowDocument } from './flow-format.mjs';

/** @typedef {import('./flow-format.mjs').FlowRecord} FlowQuestion */
/** @param {string} text */
export const questionDigest = (text) => crypto.createHash('sha256').update(text).digest('hex');

/** @param {string} md */
export function registryRecords(md) {
  const parsed = parseFlowDocument('questions.md', md);
  if (parsed.problems.length) throw new Error(parsed.problems.map((p) => p.message).join('; '));
  if (parsed.records.some((r) => r.kind !== 'question')) throw new Error('В questions.md допустимы только вопросы');
  return parsed.records;
}

/** @param {FlowQuestion} q */
export function questionActions(q) {
  const actions = JSON.parse(q.fields.Действия || '{}');
  if (!actions || Array.isArray(actions) || typeof actions !== 'object') throw new Error(`${q.id}: повреждён журнал действий`);
  for (const [key, value] of Object.entries(actions)) {
    if (!/^[\w.-]{1,120}$/.test(key) || !/^[a-f0-9]{64}$/.test(String(value))) throw new Error(`${q.id}: повреждено действие`);
  }
  return /** @type {Record<string, string>} */ (actions);
}

/** @param {FlowQuestion[]} records @param {string} key @param {string} digest */
export function previousAction(records, key, digest) {
  for (const q of records) {
    const actions = questionActions(q);
    if (!Object.hasOwn(actions, key)) continue;
    const saved = actions[key];
    if (saved !== digest) throw new Error('Ключ действия уже использован с другими данными');
    return q;
  }
  return null;
}

/** @param {FlowQuestion} q */
function renderQuestion(q) {
  return [`## ${q.id} — ${q.title}`, `<a id="${q.id.toLowerCase()}"></a>`, ...Object.entries(q.fields).map(([k, v]) => `${k}: ${v}`), ''].join('\n');
}

// Меняется только одна запись, свободный текст и соседние записи сохраняются.
/** @param {string} md @param {FlowQuestion} q @param {FlowQuestion | null} before */
export function replaceQuestion(md, q, before) {
  if (!before) return `${md.trimEnd()}\n\n${renderQuestion(q)}\n`.trimStart();
  const lines = md.split('\n');
  let end = before.n;
  for (const line of lines.slice(before.n)) {
    if (/^#{1,6}\s/.test(line)) break;
    end++;
  }
  const fields = new Set([...Object.keys(before.fields), ...Object.keys(q.fields)]);
  const body = lines.slice(before.n, end).filter((line) => !/^<a id=/.test(line) && ![...fields].some((k) => line.startsWith(`${k}:`)));
  lines.splice(before.n - 1, end - before.n + 1, renderQuestion(q).trimEnd(), ...body);
  return lines.join('\n');
}
