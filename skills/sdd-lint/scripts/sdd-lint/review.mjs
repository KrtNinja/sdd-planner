// Файлы ревью: разбор находок и проверки RV-*.
import { add } from './findings.mjs';
import { isEmptyCell, scan, tables, col } from './md.mjs';

// Находки /sdd-review: docs/<feature>/review/<spec|slices|adr-NNNN>.md, таблица с колонкой «Решение».
export function parseReview(file, md) {
  const sc = scan(md);
  const t = tables(sc.lines.filter((l) => !l.inCode)).find((x) => col(x, '#') >= 0 && col(x, /^Решени/i) >= 0);
  if (!t) return { file, md, table: false, rows: [] };
  const [ci, cv, cd, cw, cx, cp] = ['#', /^Важност/i, /^Решени/i, /^Где/i, /^Что не так/i, /^Предложени/i].map((m) => col(t, m));
  const cell = (r, i) => (i >= 0 ? (r.cells[i] || '').trim() : '');
  const rows = t.rows.map((r) => ({
    id: cell(r, ci),
    blocker: /блокер/i.test(cell(r, cv)),
    decision: cell(r, cd),
    where: cell(r, cw),
    what: cell(r, cx),
    proposal: cell(r, cp),
    n: r.n,
  }));
  return { file, md, table: true, rows };
}
export const openBlockers = (rv) => (rv ? rv.rows.filter((r) => r.blocker && isEmptyCell(r.decision)) : []);
export const reviewKey = (what, adrNum) => (what === 'adr' ? `adr-${adrNum}` : what);

export function checkReviews(m) {
  for (const [key, rv] of m.reviews) {
    if (!rv.table || !rv.rows.every((r) => /^R\d+$/.test(r.id))) {
      add('RV-02', rv.file, null, rv.table ? 'ID находок — R1, R2 …' : 'нет таблицы находок с колонкой «Решение»');
      continue;
    }
    for (const r of openBlockers(rv)) add('RV-01', rv.file, r.n, `${r.id}: блокер без решения (ревью ${key})`);
  }
}
