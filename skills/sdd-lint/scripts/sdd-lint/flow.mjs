// Загрузка v2 с тем же readFn, что у loadFeature (включая diff из Git). Legacy не получает новых требований.
// @ts-check
import path from 'node:path';
import { finding } from './findings.mjs';
import { parseFlowDocument } from './flow-format.mjs';
import { buildFlowGraph, reservedId } from './flow-graph.mjs';
import { parseFlowState } from './flow-state.mjs';

/** @typedef {import('./flow-state.mjs').FlowState} FlowState */
/** @typedef {import('./flow-format.mjs').FlowRecord} FlowRecord */
/** @typedef {import('./flow-format.mjs').FormatProblem} FormatProblem */
/** @typedef {{ state: FlowState | null, records: FlowRecord[], problems: FormatProblem[],
 * documents: {file: string, md: string}[], graph: import('./flow-graph.mjs').FlowGraph | null }} DocumentationFlow */

/** @param {string} dir @param {(file: string) => string | null} readFn */
function stateAt(dir, readFn) {
  const file = path.join(dir, '.sdd-flow.json');
  const pending = readFn(`${file}.pending`);
  try {
    const state = parseFlowState(readFn(file));
    const problems = pending === null ? [] : [{ file, n: 1, message: 'Незавершённая запись: остановите писателя и вызовите recoverFlowState' }];
    return { state, problems };
  } catch (error) {
    return { state: null, problems: [{ file, n: 1, message: String(error) }] };
  }
}

/** @param {string} dir @param {(file: string) => string | null} readFn @returns {DocumentationFlow} */
export function loadDocumentationFlow(dir, readFn) {
  const { state, problems } = stateAt(dir, readFn);
  /** @type {DocumentationFlow} */
  const flow = { state, problems, records: /** @type {FlowRecord[]} */ ([]), documents: [], graph: null };
  if (!state) return flow;
  if (readFn(path.join(dir, 'questions.md.pending')) !== null)
    flow.problems.push({ file: path.join(dir, 'questions.md'), n: 1,
      message: 'Незавершённая запись реестра: остановите писателей и вызовите questions recover' });
  if (readFn(path.join(dir, '.sdd-scenarios.pending')) !== null)
    flow.problems.push({ file: path.join(dir, 'spec.md'), n: 1,
      message: 'Перенос сценариев не завершён: остановите писателей и вызовите scenarios recover; не редактируйте копии' });
  for (const name of ['questions.md', 'spec.md', 'scenarios.md', 'tech.md']) {
    const file = path.join(dir, name);
    const md = readFn(file);
    if (md === null) continue;
    const parsed = parseFlowDocument(file, md);
    flow.records.push(...parsed.records);
    flow.problems.push(...parsed.problems);
    flow.documents.push({ file, md });
  }
  return flow;
}

/** @param {import('./model.mjs').Feature} m @param {(file: string) => string | null} readFn */
export function indexDocumentationFlow(m, readFn) {
  if (m.flow.state) m.flow.graph = buildFlowGraph(m, m.flow.records, readFn);
}

/** @param {import('./model.mjs').Feature} m */
export function checkDocumentationFlow(m) {
  const flow = m.flow;
  const problems = [...flow.problems, ...(flow.graph?.problems || [])];
  if (flow.state) {
    for (const record of flow.records) {
      if (!reservedId(record, flow.state)) problems.push({ ...record, message: `${record.id}: ID не зарезервирован инструментом` });
    }
  }
  return problems.map((p) => finding('FL-01', p.file, p.n, p.message));
}

/** @param {import('./model.mjs').Feature} m */
export function requireDocumentationFlow(m) {
  if (!m.flow.state) throw new Error('Не найден .sdd-flow.json для работы с ID и связями');
  const problems = checkDocumentationFlow(m);
  if (problems.length) throw new Error(problems.map((p) => p.msg).join('; '));
}
