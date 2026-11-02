// Правила RM-* по slices/README.md: таблица, «Покрытие», «Порядок работ», «Пересечения», «Проверка фичи» — списком { ids, check }.
import { finding } from './findings.mjs';
import { staleReqLinks } from './links.mjs';
import { uniq, inSection, sectionText, tables, col, reqIds } from './md.mjs';
import { coverage, sharing } from './readme.mjs';

// Правило — { ids, check }: ids — какие ID из rules.mjs оно выдаёт, check — его находки массивом.
// Порядок правил — порядок находок. c — README и покрытие FR по slices, посчитанное один раз.
/** @typedef {import('./findings.mjs').Finding} Finding */
/**
 * @typedef {{ m: any, f: string, sc: any, covered: Map<string, Set<string>> }} ReadmeContext
 * @typedef {{ ids: string[], check: (c: ReadmeContext) => Finding[] }} ReadmeRule
 */

const sameSet = (/** @type {Iterable<string>} */ a, /** @type {Iterable<string>} */ b) => {
  const A = new Set(a);
  const B = new Set(b);
  return A.size === B.size && [...A].every((x) => B.has(x));
};
const nums3 = (/** @type {string | undefined} */ s) => (s || '').match(/\b\d{3}\b/g) || [];

// Таблица slices: строка на каждый файл, «Основание» и «Зависит от» как в файле, лишних строк нет.
/** @param {any} t @param {Map<string, any>} rows @param {string} f */
const rowProblems = (t, rows, f) => (/** @type {[string, any]} */ [num, sl]) => {
  const r = rows.get(num);
  if (!r) return [finding('RM-02', f, t.start, `в таблице нет slice ${num}`)];
  const cb = col(t, /основани/i);
  const cd = col(t, /завис/i);
  return [
    ...(cb >= 0 && !sameSet(reqIds(r.cells[cb]), sl.basis) ? [finding('RM-02', f, r.n, `${num}: «Основание» в README не совпадает со slice`)] : []),
    ...(cd >= 0 && !sameSet(uniq(nums3(r.cells[cd])), sl.deps) ? [finding('RM-02', f, r.n, `${num}: «Зависит от» в README не совпадает со slice`)] : []),
  ];
};
/** @param {ReadmeContext} c */
function sliceTable({ m, f, sc }) {
  const t = tables(sc.lines.filter((/** @type {any} */ l) => !l.inCode)).find((/** @type {any} */ x) => /^slice$/i.test(x.header[0] || ''));
  if (!t) return [finding('RM-02', f, null, 'нет таблицы slices')];
  /** @type {Map<string, any>} */
  const rows = new Map();
  for (const r of t.rows) {
    const num = nums3(r.cells[0])[0];
    if (num) rows.set(num, r);
  }
  return [
    ...[...m.slices].flatMap(rowProblems(t, rows, f)),
    ...[...rows].filter(([num]) => !m.slices.has(num)).map(([num, r]) => finding('RM-02', f, r.n, `в таблице slice ${num}, файла нет`)),
  ];
}

// «Покрытие Dev Spec»: ссылки на FR живые, строка на каждое FR из «Основание», slices те же.
/** @param {ReadmeContext} c */
function coverageTable({ m, f, sc, covered }) {
  const cov = tables(inSection(sc, /^Покрытие/))[0];
  if (!cov) return [finding('RM-02', f, null, 'нет раздела «Покрытие Dev Spec»')];
  const rows = cov.rows.map((/** @type {any} */ r) => ({ r, id: reqIds(r.cells[0])[0] })).filter((x) => x.id);
  const inReadme = new Map(rows.map(({ r, id }) => [id, { set: nums3(r.cells.slice(1).join(' ')), n: r.n }]));
  const links = m.spec ? rows.flatMap(({ r }) => staleReqLinks(f, r.n, r.cells[0], m.spec)) : [];
  const mismatch = [...covered].flatMap(([id, nums]) => {
    const x = inReadme.get(id);
    if (!x) return [finding('RM-02', f, cov.start, `«Покрытие»: нет строки ${id}`)];
    if (sameSet(x.set, nums)) return [];
    return [finding('RM-02', f, x.n, `«Покрытие» ${id}: в README ${uniq(x.set).join(', ') || '—'}, по «Основание» ${[...nums].join(', ')}`)];
  });
  return [...links, ...mismatch];
}

// «Порядок работ»: каждый slice упомянут и стоит после своих зависимостей.
/** @param {ReadmeContext} c */
function workOrder({ m, f, sc }) {
  const order = sectionText(sc, /^Порядок/);
  if (!order) return [finding('RM-02', f, null, 'нет раздела «Порядок работ»')];
  const pos = new Map();
  for (const x of order.matchAll(/\b\d{3}\b/g)) if (!pos.has(x[0])) pos.set(x[0], x.index);
  return [...m.slices].flatMap(([/** @type {string} */ num, /** @type {any} */ sl]) => [
    ...(pos.has(num) ? [] : [finding('RM-02', f, null, `«Порядок работ»: нет ${num}`)]),
    ...sl.deps
      .filter((/** @type {string} */ d) => pos.has(d) && pos.has(num) && pos.get(d) > pos.get(num))
      .map((/** @type {string} */ d) => finding('RM-02', f, null, `«Порядок работ»: ${num} раньше своей зависимости ${d}`)),
  ]);
}

/** @type {ReadmeRule[]} */
const README = [
  { ids: ['RM-02'], check: sliceTable },
  { ids: ['RM-02', 'SL-28'], check: coverageTable },
  { ids: ['RM-02'], check: workOrder },
  {
    // FR в нескольких поведенческих slices — граница описана в «Пересечения».
    ids: ['RM-03'],
    check: ({ m, f, sc, covered }) => {
      const cross = reqIds(sectionText(sc, /^Пересечения/));
      return [...covered]
        .map(([id, nums]) => [id, sharing(m, nums)])
        .filter(([id, beh]) => beh.length > 1 && !cross.includes(id))
        .map(([id, beh]) => finding('RM-03', f, null, `${id} в slices ${beh.join(', ')}, в «Пересечения» не описан`));
    },
  },
  {
    // Каждое живое FR проверяется в «Проверка фичи».
    ids: ['RM-04'],
    check: ({ m, f, sc }) => {
      if (!m.spec) return [];
      const inCheck = new Set(reqIds(sectionText(sc, /^Проверка фичи/)));
      return [...m.spec.reqs.values()]
        .filter((r) => !r.deleted && r.id.startsWith('FR') && !inCheck.has(r.id))
        .map((r) => finding('RM-04', f, null, `${r.id} не встречается в «Проверка фичи»`));
    },
  },
];

/** @param {any} m @returns {Finding[]} */
export function checkReadme(m) {
  if (m.readme == null) return [finding('RM-01', m.readmeFile, null, 'нет README со списком slices, покрытием и порядком')];
  const c = { m, f: m.readmeFile, sc: m.readmeSc, covered: coverage(m) };
  return README.flatMap((r) => r.check(c));
}
