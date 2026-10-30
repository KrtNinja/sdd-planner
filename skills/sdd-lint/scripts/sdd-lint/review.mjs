// Файлы ревью: разбор находок, их решения (колонка «Решение») и проверки RV-*.
import { add } from './findings.mjs';
import { isEmptyCell, scan, tables, col } from './md.mjs';

// Находки /sdd-review: docs/<feature>/_work/review/<spec|slices|adr-NNNN>.md, таблица с колонкой «Решение».
export function parseReview(file, md) {
  const sc = scan(md);
  const t = tables(sc.lines.filter((l) => !l.inCode)).find((x) => col(x, '#') >= 0 && col(x, /^Решени/i) >= 0);
  if (!t) return { file, md, table: false, rows: [] };
  const [ci, cv, cd, cw, cx, cpt, cp] = ['#', /^Важност/i, /^Решени/i, /^Где/i, /^Что не так/i, /^Пункт/i, /^Предложени/i].map((m) => col(t, m));
  const cell = (r, i) => (i >= 0 ? (r.cells[i] || '').trim() : '');
  const rows = t.rows.map((r) => ({
    id: cell(r, ci),
    level: cell(r, cv),
    blocker: /блокер/i.test(cell(r, cv)),
    decision: cell(r, cd),
    where: cell(r, cw),
    what: cell(r, cx),
    point: cell(r, cpt),
    proposal: cell(r, cp),
    cells: r.cells,
    n: r.n,
  }));
  return { file, md, table: true, decisionCol: cd, rows };
}
export const reviewKey = (what, adrNum) => (what === 'adr' ? `adr-${adrNum}` : what);

// Решения, которые ставит скрипт по выбору человека в разборе находок (sdd-lint triage).
// П<n> и «исправлено» пишет /sdd-decide — тоже через triage.
export const DECISION = { open: 'открытый вопрос', ignore: 'отклонено: не исправлять', queue: 'к разбору' };
export const isQueued = (r) => r.decision.trim().toLowerCase() === DECISION.queue;
// Нет решения: пусто или замечание стоит в очереди «к разбору».
export const undecided = (r) => isEmptyCell(r.decision) || isQueued(r);
export const openBlockers = (rv) => (rv ? rv.rows.filter((r) => r.blocker && undecided(r)) : []);
// Замечания, о которых человека ещё не спрашивали, и те, что он взял в разбор.
export const untriagedRemarks = (rv) => (rv ? rv.rows.filter((r) => !r.blocker && isEmptyCell(r.decision)) : []);
export const queuedRemarks = (rv) => (rv ? rv.rows.filter((r) => !r.blocker && isQueued(r)) : []);
// После ревью артефакт менялся: решение провёл decide (П<n>) или файл поправили — повторное ревью имеет смысл.
export const changedByReview = (rv) => !!rv && rv.rows.some((r) => /^(П\d+|исправлено)/i.test(r.decision.trim()));
export const findRow = (rv, id) => rv?.rows.find((r) => r.id.toUpperCase() === String(id || '').trim().toUpperCase()) || null;

// Решения в колонку «Решение»: Map id → текст. Остальные ячейки строки не трогаем.
export function withDecisions(rv, decisions) {
  const ls = rv.md.split('\n');
  for (const r of rv.rows) {
    if (!decisions.has(r.id)) continue;
    const cells = [...r.cells];
    while (cells.length <= rv.decisionCol) cells.push('');
    cells[rv.decisionCol] = decisions.get(r.id).replace(/\|/g, '/');
    ls[r.n - 1] = `| ${cells.join(' | ')} |`;
  }
  return ls.join('\n');
}

export function checkReviews(m) {
  for (const [key, rv] of m.reviews) {
    if (!rv.table || !rv.rows.every((r) => /^R\d+$/.test(r.id))) {
      add('RV-02', rv.file, null, rv.table ? 'ID находок — R1, R2 …' : 'нет таблицы находок с колонкой «Решение»');
      continue;
    }
    for (const r of openBlockers(rv)) add('RV-01', rv.file, r.n, `${r.id}: блокер без решения (ревью ${key})`);
  }
}
