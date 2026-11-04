// Раздел переносится целиком, без изменения прозы и выделения новых ID.
// @ts-check
import { scan } from './md.mjs';

export const SCENARIO_LINK = '[Пользовательские сценарии](scenarios.md)';
/** @param {string} md */
export function scenarioSection(md) {
  const lines = scan(md).lines;
  const heads = lines.filter((l) => !l.inCode && /^## Пользовательские сценарии\s*$/.test(l.text));
  if (heads.length > 1) throw new Error('Раздел сценариев повторён');
  if (!heads.length) return null;
  const start = heads[0].n - 1;
  const end = lines.find((l) => !l.inCode && l.n > start + 1 && /^#{1,2} /.test(l.text));
  const raw = md.split('\n');
  const stop = end ? end.n - 1 : raw.length;
  const text = raw.slice(start, stop).join('\n');
  return { start, stop, text, before: raw.slice(0, start).join('\n'), after: raw.slice(stop).join('\n') };
}

/** @param {import('./model.mjs').Feature} m */
export function scenarioFiles(m) {
  return m.flow.documents.filter((d) => /[\\/]scenarios\.md$/.test(d.file));
}
