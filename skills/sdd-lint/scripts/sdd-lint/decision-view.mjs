// Согласование пакета через существующие ask/choose, без подтверждения каждого файла.
// @ts-check
import { questionDigest } from './registry-format.mjs';
import { rel } from './md.mjs';

/** @typedef {import('./flow-format.mjs').FlowRecord} Question */
/** @param {string} dir @param {Question} q @returns {import('./question.mjs').Question} */
export function decisionQuestion(dir, q) {
  const pack = JSON.parse(q.fields.Пакет);
  const hash = questionDigest(q.fields.Пакет);
  const verb = q.fields.Согласование ? 'apply' : 'accept';
  const label = verb === 'accept' ? 'Согласовать пакет' : 'Завершить проведение';
  const options = [decisionOption(dir, q, { verb, hash, label }),
    decisionOption(dir, q, { verb: 'revise', hash, label: 'Доработать пакет' }),
    { id: 'decision:later', label: 'Вернуться позже', action: { none: /** @type {const} */ (true) } }];
  return { header: 'Решение по вопросу', question: `${q.id}: ${label.toLowerCase()}?`,
    preview: `Что меняется и почему: ${pack.summary}\nКомпромиссы: ${pack.tradeoffs}\nОставшиеся вопросы: ${pack.remaining}`,
    options };
}

/** @param {string} dir @param {Question} q @param {{verb: string, hash: string, label: string}} option */
function decisionOption(dir, q, { verb, hash, label }) {
  const input = { key: `${verb}-${q.id}-${hash}`, id: q.id, packageHash: hash,
    ...(verb === 'accept' ? { origin: 'analyst', decision: label } : {}) };
  return { id: `decision:${verb}:${q.id}:${hash}`, label,
    action: { lint: ['questions', verb, rel(dir), JSON.stringify(input)] } };
}
