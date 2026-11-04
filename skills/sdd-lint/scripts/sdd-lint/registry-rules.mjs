// Реестр единственный; структурные проверки не оценивают смысл ответа человека.
// @ts-check
import path from 'node:path';
import { parseFlowDocument } from './flow-format.mjs';
import { finding } from './findings.mjs';
import { inSection, noneText, scan } from './md.mjs';
import { questionActions } from './registry-format.mjs';
import { registryQuestions, questionPending } from './registry-view.mjs';

/** @typedef {import('./model.mjs').Feature} Feature */
/** @param {Feature} m */
export function checkRegistry(m) {
  if (!m.flow.state) return [];
  const questions = registryQuestions(m);
  const found = questions.flatMap((q) => questionProblems(q).map((msg) => finding('QU-01', q.file, q.n, `${q.id}: ${msg}`)));
  const keys = new Set();
  for (const q of questions) {
    if (path.basename(q.file) !== 'questions.md') found.push(finding('QU-01', q.file, q.n, 'Запись Q должна быть только в questions.md'));
    try {
      for (const key of Object.keys(questionActions(q))) {
        if (keys.has(key)) found.push(finding('QU-01', q.file, q.n, `Повтор ключа действия ${key}`));
        keys.add(key);
      }
    } catch (error) { found.push(finding('QU-01', q.file, q.n, String(error))); }
  }
  return [...found, ...documentQuestions(m, questions)];
}

/** @param {import('./flow-format.mjs').FlowRecord} q */
function questionProblems(q) {
  const bad = [];
  for (const field of ['Контекст', 'Продолжить', 'Влияние']) if (!q.fields[field]) bad.push(`нет поля ${field}`);
  if (!['known', 'unknown'].includes(q.fields.Влияние)) bad.push('влияние должно быть known или unknown');
  if (q.fields.Влияние === 'known' && !q.refs.length) bad.push('известное влияние требует элементов');
  return [...bad, ...answerProblems(q)];
}

/** @param {import('./flow-format.mjs').FlowRecord} q */
function answerProblems(q) {
  const bad = [];
  if (q.fields.Статус === 'answered' && !(q.fields.Ответ || q.fields.Исключение)) bad.push('нет полученного ответа или решения человека');
  if (q.fields.Исключение && !q.fields.Последствия) bad.push('исключение требует последствий');
  return bad;
}

/** @param {Feature} m @param {import('./flow-format.mjs').FlowRecord[]} questions */
function documentQuestions(m, questions) {
  const docs = [...m.flow.documents, ...m.featureAdrs, ...m.slices.values()];
  if (m.protocol) docs.push(m.protocol);
  const byId = new Map(questions.map((q) => [q.id, q]));
  return docs.filter((d) => path.basename(d.file) !== 'questions.md').flatMap((d) => checkDocument(d, byId));
}

/** @param {string} file @param {string} href @param {import('./flow-format.mjs').FlowRecord | undefined} q */
function validLink(file, href, q) {
  if (!q) return false;
  const [relative, anchor] = href.split('#');
  return path.resolve(path.dirname(file), relative) === path.resolve(q.file) && anchor === q.id.toLowerCase();
}

/** @param {Feature} m */
export function unresolvedRegistry(m) {
  return registryQuestions(m).filter(questionPending);
}

/** @param {{file: string, md: string}} doc
 * @param {Map<string, import('./flow-format.mjs').FlowRecord>} byId */
function checkDocument(doc, byId) {
  const sc = scan(doc.md);
  const open = inSection(sc, /^(Открытые вопросы|Не выяснено)/).filter((l) => !l.inCode && l.text.trim());
  const required = noneText(open.map((l) => l.text).join('\n')) ? new Set() : new Set(open.map((l) => l.n));
  const found = parseFlowDocument(doc.file, doc.md).records.filter((r) => r.kind === 'question')
    .map((q) => finding('QU-01', doc.file, q.n, 'Запись Q должна быть только в questions.md'));
  for (const line of sc.lines.filter((l) => !l.inCode)) {
    const refs = [...line.text.matchAll(/\[(Q[1-9]\d*)\]\(([^)]+)\)/g)];
    const invalid = refs.some(([, id, href]) => !validLink(doc.file, href, byId.get(id)));
    if (invalid || (required.has(line.n) && !refs.length)) {
      found.push(finding('QU-01', doc.file, line.n, 'Вместо отдельного вопроса нужна ссылка на запись Q в questions.md'));
    }
  }
  return found;
}
