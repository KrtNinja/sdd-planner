// Адресация по ID: индекс пересобирается из документов, обратные связи не хранятся.
// @ts-check
import path from 'node:path';
import { scan } from './md.mjs';
import { flowRef } from './flow-format.mjs';

/** @typedef {import('./flow-format.mjs').FlowRecord} FlowRecord */
/** @typedef {{ id: string, file: string, n: number }} Address */
/** @typedef {{ from: string, to: string, kind: string }} Edge */
/** @typedef {import('./flow-format.mjs').FormatProblem} FormatProblem */
/** @typedef {{ byId: Map<string, Address>, edges: Edge[], problems: FormatProblem[] }} FlowGraph */

/** @param {import('./model.mjs').Feature} m @returns {Address[]} */
function existingAddresses(m) {
  const reqs = [...(m.spec?.reqs.values() || [])].map((r) => ({ id: r.id, file: m.specFile, n: r.n }));
  const acs = [...m.slices.values()].flatMap((s) => s.acs.map((a) => ({ id: a.id, file: s.file, n: a.n })));
  const adrs = m.adrs.map((a) => ({ id: `ADR-${a.num}`, file: a.file, n: 1 }));
  return [...reqs, ...acs, ...adrs];
}

/** @param {Address[]} addresses @param {FormatProblem[]} problems */
function indexAddresses(addresses, problems) {
  /** @type {Map<string, Address>} */
  const byId = new Map();
  for (const address of addresses) {
    if (byId.has(address.id)) problems.push({ ...address, message: `Дубликат ID ${address.id}` });
    else byId.set(address.id, address);
  }
  return byId;
}

/** @param {FlowRecord} r @returns {Edge[]} */
function recordEdges(r) {
  /** @type {Edge[]} */
  const links = r.refs.map((ref) => ({ from: r.id, to: ref.id, kind: ref.kind }));
  if (r.parent) links.push({ from: r.id, to: r.parent, kind: r.kind === 'question' ? 'parent' : 'scenario' });
  return links;
}

/** @param {string} start @param {Map<string, string>} parents */
function hasParentCycle(start, parents) {
  const seen = new Set();
  let id = start;
  while (parents.has(id)) {
    if (seen.has(id)) return true;
    seen.add(id);
    id = /** @type {string} */ (parents.get(id));
  }
  return false;
}

/** @param {FlowRecord[]} records @param {FormatProblem[]} problems */
function parentCycles(records, problems) {
  const parents = new Map(records.filter((r) => r.kind === 'question' && r.parent).map((r) => [r.id, /** @type {string} */ (r.parent)]));
  for (const r of records) {
    if (hasParentCycle(r.id, parents)) problems.push({ ...r, message: `Цикл родителей вопроса ${r.id}` });
  }
}

/** @param {string} dir @param {string} id @param {(file: string) => string | null} readFn */
function contractExists(dir, id, readFn) {
  const [relative, anchor] = id.slice('contract:'.length).split('#');
  const target = path.resolve(dir, relative);
  // Контракты v2 — документы внутри фичи; ссылки за её пределы не читают произвольные файлы.
  if (!target.startsWith(dir + path.sep)) return false;
  const md = readFn(target);
  if (md === null) return false;
  return scan(md).lines.some((line) => !line.inCode && line.text.includes(`<a id="${anchor}"></a>`));
}

/** @param {FlowGraph} graph @param {string} dir @param {(file: string) => string | null} readFn */
function missingTargets(graph, dir, readFn) {
  for (const edge of graph.edges) {
    const exists = edge.kind === 'contract' ? contractExists(dir, edge.to, readFn) : graph.byId.has(edge.to);
    if (exists) continue;
    const from = /** @type {Address} */ (graph.byId.get(edge.from));
    graph.problems.push({ ...from, message: `${edge.from}: нет цели ${edge.to} (${edge.kind})` });
  }
}

/** @param {import('./model.mjs').Feature} m @param {FlowRecord[]} records @param {(file: string) => string | null} readFn @returns {FlowGraph} */
export function buildFlowGraph(m, records, readFn) {
  /** @type {FormatProblem[]} */
  const problems = [];
  const byId = indexAddresses([...existingAddresses(m), ...records], problems);
  const graph = { byId, edges: records.flatMap(recordEdges), problems };
  missingTargets(graph, m.dir, readFn);
  parentCycles(records, problems);
  return graph;
}

// Ссылка вычисляется из актуального расположения. Перенос не меняет логический ID.
/** @param {FlowGraph} graph @param {string} id */
export function flowAddress(graph, id) {
  return graph.byId.get(id) || null;
}
/** @param {FlowGraph} graph @param {string} id */
export function flowBacklinks(graph, id) {
  return graph.edges.filter((edge) => edge.to === id);
}

/** @param {FlowRecord} record @param {import('./flow-state.mjs').FlowState} state */
export function reservedId(record, state) {
  const ref = flowRef(record.id);
  if (ref?.kind === 'question') return Number(record.id.slice(1)) < state.next.Q;
  if (ref?.kind === 'scenario') return Number(record.id.slice(3)) < state.next.SC;
  if (ref?.kind === 'step') return Number(record.id.split('-S')[1]) < state.next.STEP;
  return true;
}
