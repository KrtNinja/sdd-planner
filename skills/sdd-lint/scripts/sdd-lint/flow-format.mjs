// Компактный Markdown-контракт нового процесса: сущности и типизированные связи, без маршрутизации.
// @ts-check
import { scan } from './md.mjs';

/** @typedef {'question' | 'scenario' | 'step' | 'tech' | 'fr' | 'nfr' | 'ac' | 'adr' | 'contract'} RefKind */
/** @typedef {{ kind: RefKind, id: string }} FlowRef */
/** @typedef {{ id: string, kind: RefKind, title: string, file: string, n: number,
 * fields: Record<string, string>, refs: FlowRef[], parent: string | null }} FlowRecord */
/** @typedef {{ file: string, n: number, message: string }} FormatProblem */

/** @type {[RefKind, RegExp][]} */
const IDS = [
  ['question', /^Q[1-9]\d*$/], ['step', /^SC-[1-9]\d*-S[1-9]\d*$/], ['scenario', /^SC-[1-9]\d*$/],
  ['tech', /^TECH$/], ['fr', /^FR-[1-9]\d*$/], ['nfr', /^NFR-[1-9]\d*$/],
  ['ac', /^AC-\d{3}-[BF]?[1-9]\d*$/], ['adr', /^ADR-\d{4}$/], ['contract', /^contract:[^\s#]+#[^\s#]+$/],
];
const FIELDS = ['Этап', 'Тема', 'Статус', 'Элементы', 'Родитель', 'Требования', 'Связи'];
const STAGES = ['grill', 'spec', 'scenarios', 'tech', 'slices', 'adr', 'review', 'decide'];
const STATUSES = ['open', 'deferred', 'answered', 'resolved', 'excluded'];
/** @type {Record<string, RefKind[]>} */
const TARGETS = {
  Элементы: ['fr', 'nfr', 'scenario', 'step', 'tech', 'ac', 'adr', 'contract'],
  Требования: ['fr', 'nfr'],
  Связи: ['scenario', 'step', 'fr', 'nfr', 'adr', 'contract'],
};

/** @param {string} id @returns {FlowRef | null} */
export function flowRef(id) {
  const pair = IDS.find(([, re]) => re.test(id));
  return pair ? { kind: pair[0], id } : null;
}

/** @param {FlowRecord} record @param {FormatProblem[]} problems @param {string} message */
const problem = (record, problems, message) => problems.push({ file: record.file, n: record.n, message: `${record.id}: ${message}` });

/** @param {FlowRecord} record @param {FormatProblem[]} problems */
function recordLinks(record, problems) {
  for (const [field, allowed] of Object.entries(TARGETS)) {
    if (!(field in record.fields)) continue;
    for (const id of record.fields[field].split(',').map((s) => s.trim())) {
      const ref = flowRef(id);
      if (!ref || !allowed.includes(ref.kind)) problem(record, problems, `недопустимая ссылка «${id}» в ${field}`);
      else record.refs.push(ref);
    }
  }
}

/** @param {FlowRecord} record @param {FormatProblem[]} problems */
function questionFields(record, problems) {
  const f = record.fields;
  if (!STAGES.includes(f.Этап)) problem(record, problems, 'нужен известный Этап');
  if (!f.Тема) problem(record, problems, 'нужна Тема');
  if (!STATUSES.includes(f.Статус)) problem(record, problems, 'нужен известный Статус');
  if ('Родитель' in f) {
    record.parent = f.Родитель;
    if (flowRef(record.parent)?.kind !== 'question') problem(record, problems, 'Родитель должен быть Q<n>');
  }
}

/** @param {FlowRecord} record @param {FormatProblem[]} problems */
function validateRecord(record, problems) {
  if (!record.title) problem(record, problems, 'нет названия');
  if (record.kind === 'question') questionFields(record, problems);
  if (record.kind === 'step') record.parent = record.id.replace(/-S\d+$/, '');
  recordLinks(record, problems);
}

/** @param {FlowRecord} record @param {string} text @param {FormatProblem[]} problems */
function readField(record, text, problems) {
  const match = text.match(/^([^:]+):\s*(.*)$/u);
  if (!match || !FIELDS.includes(match[1])) return;
  const [, key, value] = match;
  if (key in record.fields) problem(record, problems, `поле ${key} повторено`);
  record.fields[key] = value.trim();
}

/** @param {string} file @param {string} md */
export function parseFlowDocument(file, md) {
  /** @type {FlowRecord[]} */
  const records = [];
  /** @type {FormatProblem[]} */
  const problems = [];
  /** @type {FlowRecord | null} */
  let current = null;
  for (const line of scan(md).lines) {
    if (line.inCode) continue;
    if (/^#{1,6}\s/.test(line.text)) {
      current = recordHeading(file, line, problems);
      if (current) records.push(current);
    } else if (current) readField(current, line.text, problems);
  }
  for (const record of records) validateRecord(record, problems);
  return { records, problems };
}

/** @param {string} file @param {import('./model.mjs').Line} line @param {FormatProblem[]} problems @returns {FlowRecord | null} */
function recordHeading(file, line, problems) {
  const match = line.text.match(/^#{2,4}\s+((?:Q|SC-|TECH)\S*)\s+—\s*(.*)$/u);
  if (!match) return null;
  const [, id, title] = match;
  const ref = flowRef(id);
  if (!ref) {
    problems.push({ file, n: line.n, message: `Некорректный ID ${id}` });
    return null;
  }
  return { ...ref, file, n: line.n, title: title.trim(), fields: {}, refs: [], parent: null };
}
