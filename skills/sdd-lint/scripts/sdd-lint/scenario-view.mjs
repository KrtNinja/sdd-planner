// Представление одного логического набора сценариев.
// @ts-check
import { READ_LIMIT, visibleLength } from './read-size.mjs';
import { stripProtocol } from './sources.mjs';
import { scenarioFiles } from './scenario-section.mjs';
import { rel } from './md.mjs';
/** @typedef {import('./model.mjs').Feature} Feature */
/** @param {Feature} m */
export function scenarioStatus(m) {
  const spec = visibleLength(stripProtocol(m.spec?.md || ''));
  const files = scenarioFiles(m);
  const size = [`spec: ${spec} / ${READ_LIMIT}`, ...files.map((d) => `scenarios: ${visibleLength(d.md)} / ${READ_LIMIT}`)];
  if (spec > READ_LIMIT) size.push(files.length ? 'spec всё ещё превышает лимит; требуется содержательное сокращение.' :
    'Сначала перенесите весь раздел пользовательских сценариев: scenarios move. Если раздела нет — переносить нечего.');
  if (files.some((d) => visibleLength(d.md) > READ_LIMIT)) size.push('scenarios превышает лимит; требуется содержательное сокращение или отдельное решение.');
  return size.join('\n');
}


/** @param {Feature} m @returns {import('./question.mjs').Question | null} */
export function scenarioMoveQuestion(m) {
  if (!m.flow.state || scenarioFiles(m).length || visibleLength(stripProtocol(m.spec?.md || '')) <= READ_LIMIT) return null;
  return { header: 'Объём требований', question: 'Spec превышает лимит чтения. Как сократим?',
    options: [
      { id: 'scenarios:move', label: 'Вынести раздел сценариев', recommended: true,
        description: 'Инструмент сохранит текст, ID и ссылки', action: { lint: ['scenarios', 'move', rel(m.dir)] } },
      { id: 'scenarios:later', label: 'Позже', action: { none: true } },
    ] };
}

/** @param {Feature} m @param {string[]} ids */
export function scenarioTrace(m, ids) {
  if (!m.flow.graph) return '';
  const graph = m.flow.graph;
  const connected = new Set(ids);
  for (const edge of graph.edges) if (ids.includes(edge.from) || ids.includes(edge.to)) {
    connected.add(edge.from); connected.add(edge.to);
  }
  return [...connected].flatMap((id) => {
    const a = graph.byId.get(id);
    return a ? [`${id}: ${rel(a.file)}:${a.n}`] : [];
  }).join('\n');
}
