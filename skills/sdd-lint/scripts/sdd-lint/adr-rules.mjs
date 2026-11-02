// Правила AD-* по ADR: номера всех ADR, затем каждый ADR фичи — списком { ids, check }.
// @ts-check
import { limitIds } from './adr.mjs';
import { finding, noStatus } from './findings.mjs';
import { rel, uniq, approved, inSection, hasSection, sectionText, header, reqIds } from './md.mjs';

/** @typedef {import('./model.mjs').Feature} Feature */

// Правило — { ids, check }: ids — какие ID из rules.mjs оно выдаёт, check — его находки массивом.
// Порядок правил — порядок находок: сначала номера всех ADR, затем по каждому ADR фичи правила по очереди.
/** @typedef {import('./model.mjs').Finding} Finding */
/** @typedef {import('./model.mjs').Adr} Adr */
/** @typedef {{ ids: string[], check: (a: Adr, m: Feature) => Finding[] }} AdrRule */

const SECTIONS = ['Контекст', 'Варианты', 'Решение', 'Последствия', 'Не выяснено'];

// AD-09: у каждого ADR в docs/adr свой номер.
/** @param {Feature} m */
function uniqueNums(m) {
  const seen = new Map();
  return m.adrs.flatMap((/** @type {Adr} */ a) => {
    const was = seen.get(a.num);
    seen.set(a.num, a.file);
    return was ? [finding('AD-09', a.file, null, `номер ${a.num} уже у ${rel(was)}`)] : [];
  });
}

// AD-03 / AD-04 / AD-05: не меньше двух вариантов, у каждого вердикт, отклонение — со ссылкой, выбран ровно один.
/** @param {Adr} a */
function variants(a) {
  if (!hasSection(a.sc, /^Варианты/)) return [];
  const verdicts = a.variants.flatMap((v) => {
    if (!v.verdict) return [finding('AD-04', a.file, v.n, `«${v.title}» без строки «Отклонён | Выбран | Отложен»`)];
    if (!v.verdict.startsWith('отклон') || reqIds(v.text).length || limitIds(v.text).length) return [];
    return [finding('AD-05', a.file, v.n, `«${v.title}» отклонён без ссылки на FR/NFR или ограничение ОГР-n`)];
  });
  const chosen = a.variants.filter((v) => v.verdict === 'выбран').length;
  return [
    ...(a.variants.length < 2 ? [finding('AD-03', a.file, null, `вариантов: ${a.variants.length}`)] : []),
    ...verdicts,
    ...(a.variants.length && chosen !== 1 ? [finding('AD-04', a.file, null, `выбрано вариантов: ${chosen}, нужен ровно один`)] : []),
  ];
}

// AD-11: ограничение ОГР-n описано в «Контексте» один раз, и только описанные упоминаются.
/** @param {Adr} a */
function limits(a) {
  const defined = new Map();
  const dups = a.limits.flatMap((x) => {
    if (defined.has(x.id)) return [finding('AD-11', a.file, x.n, `${x.id} уже описано в строке ${defined.get(x.id)}`)];
    defined.set(x.id, x.n);
    return [];
  });
  const unknown = a.sc.lines.flatMap((l) =>
    uniq(limitIds(l.text))
      .filter((id) => !defined.has(id))
      .map((id) => finding('AD-11', a.file, l.n, `${id} нет в «Контексте»`)),
  );
  return [...dups, ...unknown];
}

// AD-06: «Контекст» ссылается на FR/NFR, и они есть в spec.
/** @param {Adr} a @param {Feature} m */
function contextReqs(a, { spec }) {
  if (!hasSection(a.sc, /^Контекст/)) return [];
  const ids = reqIds(sectionText(a.sc, /^Контекст/));
  return [
    ...(ids.length ? [] : [finding('AD-06', a.file, null, '«Контекст» без FR/NFR')]),
    ...(spec ? ids.filter((id) => !spec.reqs.has(id)).map((id) => finding('AD-06', a.file, null, `«Контекст»: ${id} нет в spec.md`)) : []),
  ];
}

// AD-07: slices из шапки и «Последствий» существуют, а из шапки — описаны в «Последствиях».
/** @param {Adr} a @param {Feature} m */
function touchedSlices(a, m) {
  if (!m.slices.size) return [];
  const touched = (header(a.md, 'Затрагивает slices') || '').match(/\b\d{3}\b/g) || [];
  const consNums = [...sectionText(a.sc, /^Последствия/).matchAll(/slices?\s+(\d{3})/gi)].map((x) => x[1]);
  return [
    ...uniq([...touched, ...consNums]).filter((n) => !m.slices.has(n)).map((n) => finding('AD-07', a.file, null, `slice ${n} нет`)),
    ...touched.filter((n) => !consNums.includes(n)).map((n) => finding('AD-07', a.file, null, `slice ${n} из шапки не описан в «Последствия»`)),
  ];
}

/** @type {AdrRule[]} */
const ADR = [
  { ids: ['AD-01'], check: (a) => noStatus('AD-01', a.file, a.status, null) },
  {
    ids: ['AD-09'],
    check: (a) => (a.headNum && a.headNum.padStart(4, '0') !== a.num ? [finding('AD-09', a.file, 1, `файл ${a.num}, в заголовке ADR-${a.headNum}`)] : []),
  },
  {
    ids: ['AD-02'],
    check: (a) => SECTIONS.filter((sec) => !hasSection(a.sc, new RegExp(`^${sec}`))).map((sec) => finding('AD-02', a.file, null, `нет раздела «${sec}»`)),
  },
  { ids: ['AD-03', 'AD-04', 'AD-05'], check: variants },
  { ids: ['AD-11'], check: limits },
  { ids: ['AD-06'], check: contextReqs },
  { ids: ['AD-07'], check: touchedSlices },
  {
    // AD-08: у каждого пункта «Не выяснено» сказано, блокирует ли он slices (в строке или в заголовке).
    ids: ['AD-08'],
    check: (a) =>
      inSection(a.sc, /^Не выяснено/)
        .filter((x) => !x.inCode && /^\s*[-*]\s+\S/.test(x.text) && !/блокир/i.test(x.text) && !/блокир/i.test(x.h2))
        .map((l) => finding('AD-08', a.file, l.n, 'не сказано, блокирует ли пункт slices')),
  },
  {
    ids: ['AD-10'],
    check: (a, m) =>
      approved(m.slicesStatus) && !/принят/i.test(a.status || '') ? [finding('AD-10', a.file, null, `статус «${a.status || '—'}», slices уже одобрены`)] : [],
  },
];

/** @param {Feature} m @returns {Finding[]} */
export function checkAdrs(m) {
  return [...uniqueNums(m), ...m.featureAdrs.flatMap((/** @type {Adr} */ a) => ADR.flatMap((r) => r.check(a, m)))];
}
