// Техническое обеспечение входит в согласование фичи; legacy не меняется.
// @ts-check
import path from 'node:path';
import { finding } from './findings.mjs';
import { scan } from './md.mjs';

/** @typedef {import('./model.mjs').Feature} Feature */
/** @param {Feature} m */
export function techFiles(m) {
  return m.flow.documents.filter((d) => path.basename(d.file) === 'tech.md');
}

/** @param {Feature} m */
export function checkTech(m) {
  if (!m.flow.state) return [];
  const doc = techFiles(m)[0];
  const file = path.join(m.dir, 'tech.md');
  if (!doc) return [finding('TE-01', file, null, 'Подготовьте техническое обеспечение до согласования фичи')];
  const records = m.flow.records.filter((r) => r.kind === 'tech' && r.file === file);
  if (records.length !== 1) return [finding('TE-01', file, null, 'Нужен один заголовок TECH — название')];
  const content = scan(doc.md).lines.slice(records[0].n).filter((l) => !l.inCode &&
    !/^(?:#{1,6} |Связи:|Статус:)/.test(l.text)).map((l) => l.text).join(' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '').trim();
  return content ? [] : [finding('TE-01', file, null, 'Объясните применение решения к фиче; одной ссылки недостаточно')];
}
