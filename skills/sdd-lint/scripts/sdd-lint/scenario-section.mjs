// Раздел переносится целиком, без изменения прозы и выделения новых ID.
// @ts-check
import { scan } from './md.mjs';

export const SCENARIO_LINK = '[Пользовательские сценарии](scenarios.md)';
const SC_HEADING = /^## SC-[1-9]\d* — /;
/** @param {import('./model.mjs').Line[]} lines */
function sectionHeading(lines) {
  const heads = lines.filter((l) => /^## (?:Пользовательские сценарии|Сценарии)\s*$/.test(l.text));
  if (heads.length > 1) throw new Error('Раздел сценариев повторён');
  return heads[0] || lines.find((l) => SC_HEADING.test(l.text)) || null;
}

/** @param {string} md */
export function scenarioSection(md) {
  const lines = scan(md).lines.filter((l) => !l.inCode);
  const head = sectionHeading(lines);
  if (!head) return null;
  const naked = SC_HEADING.test(head.text);
  const start = head.n - 1;
  const end = lines.find((l) => l.n > head.n && /^#{1,2} /.test(l.text) && !(naked && SC_HEADING.test(l.text)));
  const raw = md.split('\n');
  const stop = end ? end.n - 1 : raw.length;
  const text = raw.slice(start, stop).join('\n') + (end ? '\n' : '');
  return { start, stop, text, before: raw.slice(0, start).join('\n'), after: raw.slice(stop).join('\n') };
}

/** @param {import('./model.mjs').Feature} m */
export function scenarioFiles(m) {
  return m.flow.documents.filter((d) => /[\\/]scenarios\.md$/.test(d.file));
}

// Наличие текста — механическое условие, не оценка полноты сценариев.
/** @param {import('./model.mjs').Feature} m */
export function hasScenarios(m) {
  const text = scenarioFiles(m)[0]?.md || scenarioSection(m.spec?.md || '')?.text || '';
  return scan(text).lines.some((l) => !l.inCode && l.text.trim() &&
    !/^(?:#{1,6} |Требования:|Связи:|Статус:|\[Пользовательские сценарии\])/.test(l.text));
}
