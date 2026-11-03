// Правила SL-* по slices: шапка, AC, хвост slice, фича целиком — списками { ids, check }.
// @ts-check
import { finding } from './findings.mjs';
import { dependencyCycles } from './graph.mjs';
import { reqRefs, BASIS_LINK_RE, specFileHref, staleReqLinks } from './links.mjs';
import { AC_ANY, AC_LIVE } from './ac-rules.mjs';
import { read, uniq, approved, noneText, scan, sectionText, header, headerLine, matched } from './md.mjs';
import { coverage } from './readme.mjs';
import { checkReadme } from './readme-rules.mjs';

// Правило — { ids, check }: ids — какие ID из rules.mjs оно выдаёт, check — его находки массивом.
// Порядок правил — порядок находок: по каждому slice шапка, затем AC, затем хвост; потом фича целиком.
// c — общие данные проверки (sliceContext): spec, slices, первый поведенческий slice, где AC определены.

/** @typedef {import('./model.mjs').Finding} Finding */
/** @typedef {import('./model.mjs').Slice} Slice */
/** @typedef {import('./model.mjs').Ac} Ac */
/** @typedef {import('./model.mjs').Feature} Feature */
/**
 * @typedef {{ m: Feature, s: import('./model.mjs').Spec | null, slices: Map<string, Slice>, firstBehaviour: string | undefined,
 *   prevDef: Map<Ac, string | undefined>, defs: Map<string, string> }} SliceContext
 * @typedef {{ ids: string[], check: (sl: Slice, c: SliceContext) => Finding[] }} SliceRule
 * @typedef {{ ids: string[], check: (c: SliceContext) => Finding[] }} FeatureRule
 */

const HEAD_KEYS = ['Тип', 'Основание', 'Зависимости', 'Половины', 'Результат'];
const WHY_RE = /^\**\s*[РP][123](?!\d)/u;
const isBehaviour = (/** @type {Slice} */ sl) => /поведение/i.test(sl.type || '');
const live = (/** @type {Slice} */ sl) => sl.acs.filter((a) => !a.deleted && !a.stub);

/** @param {Feature} m @returns {SliceContext} */
function sliceContext(m) {
  const behaviour = [...m.slices.values()].filter(isBehaviour).map((x) => x.num).sort();
  // Где AC определён до этого места: SL-05 называет предыдущее определение, SL-27 — все ID.
  /** @type {Map<Ac, string | undefined>} */
  const prevDef = new Map();
  /** @type {Map<string, string>} */
  const defs = new Map();
  for (const sl of m.slices.values())
    for (const ac of sl.acs) {
      prevDef.set(ac, defs.get(ac.id));
      defs.set(ac.id, sl.file);
    }
  return { m, s: m.spec, slices: m.slices, firstBehaviour: behaviour[0], prevDef, defs };
}

// --- шапка slice ---
/** @type {SliceRule[]} */
const SLICE_HEAD = [
  {
    ids: ['SL-01'],
    check: (sl) => HEAD_KEYS.filter((k) => header(sl.md, k) === null).map((k) => finding('SL-01', sl.file, null, `нет строки «${k}:» в шапке`)),
  },
  {
    // Без причины отдельно стоят только 001 и первый поведенческий slice: «подготовка» тоже режет фичу.
    ids: ['SL-02'],
    check: (sl, c) => {
      if (sl.num === c.firstBehaviour || sl.num === '001') return [];
      if (sl.why === null) return [finding('SL-02', sl.file, null, 'нет строки «Почему отдельно:»')];
      if (WHY_RE.test(sl.why)) return [];
      return [finding('SL-02', sl.file, headerLine(sl.md, 'Почему отдельно'), `«Почему отдельно: ${sl.why}» — нет Р1, Р2 или Р3`)];
    },
  },
  { ids: ['SL-03'], check: (sl) => sl.outside.map((o) => finding('SL-03', sl.file, o.n, `${o.id} вне блока кода`)) },
  { ids: ['SL-06'], check: (sl) => sl.multi.map((mb) => finding('SL-06', sl.file, mb.n, `в блоке кода ${mb.count} AC`)) },
  { ids: ['SL-16'], check: (sl) => sl.strayChecks.map((n) => finding('SL-16', sl.file, n, '«Проверяет:» не стоит сразу под блоком AC')) },
  {
    ids: ['SL-28'],
    check: (sl, c) => {
      const s = c.s;
      if (!s) return [];
      const basis = header(sl.md, 'Основание') || '';
      const got = (basis.match(BASIS_LINK_RE) || [])[1];
      const bad = got !== specFileHref(sl.file, s.file) || reqRefs(basis).some((r) => r.href);
      const msg = got === undefined ? '«Основание» без ссылки на spec.md' : '«Основание»: ссылка на spec.md не та или ссылки на отдельные FR';
      const links = sl.acs.flatMap((ac) => (ac.checks ? staleReqLinks(sl.file, ac.checks.n, ac.checks.text, s) : []));
      return [...(bad ? [finding('SL-28', sl.file, sl.basisLine, msg)] : []), ...links];
    },
  },
];
// --- хвост slice ---
// Покрытие считаем, когда AC дописаны: у каждого живого есть ссылки на FR (SL-16) и он не заготовка.
const acsSettled = (/** @type {Slice} */ sl) => !sl.pending && sl.acs.every((a) => a.deleted || (a.refs.length && !a.stub));
// SL-07 / SL-19: поведенческий slice с AC, и каждое FR из «Основание» проверено хотя бы одним AC.
/** @param {Slice} sl @param {SliceContext} c */
function behaviourCovered(sl, c) {
  if (!isBehaviour(sl)) return [];
  if (!sl.acs.length && !sl.pending) return [finding('SL-07', sl.file, null, 'slice типа «поведение» без AC')];
  if (!acsSettled(sl)) return [];
  const checked = new Set(live(sl).flatMap((a) => a.refs));
  return [...sl.basis]
    .filter((id) => !c.s?.reqs.get(id)?.deleted && !checked.has(id))
    .map((id) => finding('SL-19', sl.file, headerLine(sl.md, 'Основание'), `${id} из «Основание» не проверяет ни один AC`));
}
// SL-25: «Границы» ссылаются на существующие slices: «(002 и 003)», «slice 004».
/** @param {Slice} sl @param {SliceContext} c */
function boundsRefs(sl, c) {
  const bounds = sectionText(sl.sc, /^Границы/);
  const refs = [
    ...[...bounds.matchAll(/\(\d{3}(?:\s*(?:,|и)\s*\d{3})*\)/g)].flatMap(([x]) => matched(x, /\d{3}/g)),
    ...[...bounds.matchAll(/slice\s+(\d{3})/gi)].map((x) => x[1]),
  ];
  return uniq(refs).filter((r) => !c.slices.has(r)).map((r) => finding('SL-25', sl.file, null, `«Границы»: slice ${r} нет`));
}

/** @type {SliceRule[]} */
const SLICE_TAIL = [
  { ids: ['SL-07', 'SL-19'], check: behaviourCovered },
  {
    ids: ['SL-08'],
    check: (sl) =>
      ['B', 'F']
        .map((side) => /** @type {[string, number]} */ ([side, sl.acs.filter((a) => a.side === side && !a.deleted).length]))
        .filter(([, n]) => n > 10)
        .map(([side, n]) => finding('SL-08', sl.file, null, `${n} AC в ${side === 'B' ? 'серверной' : 'фронтенд'}-половине`)),
  },
  {
    ids: ['SL-09', 'SL-10'],
    check: (sl, c) => {
      const open = sectionText(sl.sc, /^Открытые вопросы/);
      if (!open || noneText(open)) return [];
      if (approved(c.m.slicesStatus)) return [finding('SL-10', sl.file, null, 'slices одобрены, но в slice есть открытые вопросы')];
      return [finding('SL-09', sl.file, null, 'есть открытые вопросы к Dev Spec')];
    },
  },
  { ids: ['SL-25'], check: boundsRefs },
];
// --- фича целиком ---
/** @param {SliceContext} c */
function depsExist(c) {
  return [...c.slices.entries()].flatMap(([num, sl]) =>
    sl.deps
      .filter((d) => d === num || !c.slices.has(d))
      .map((d) => finding('SL-11', sl.file, headerLine(sl.md, 'Зависимости'), d === num ? 'slice зависит сам от себя' : `зависимость ${d} — такого slice нет`)),
  );
}
// SL-12 / SL-13: «Основание» — из spec, и каждое FR spec покрыто каким-то slice.
/** @param {SliceContext} c */
function specCovered(c) {
  const s = c.s;
  if (!s) return [];
  const unknown = [...c.slices.values()].flatMap((sl) =>
    [...sl.basis].filter((id) => !s.reqs.has(id)).map((id) => finding('SL-12', sl.file, headerLine(sl.md, 'Основание'), `«Основание»: ${id} нет в spec.md`)),
  );
  const covered = coverage(c.m);
  const missing = [...s.reqs.values()]
    .filter((r) => !r.deleted && !covered.has(r.id))
    .map((r) => finding('SL-13', c.m.slicesDir, null, `${r.id} не покрыт ни одним slice`));
  return [...unknown, ...missing];
}
// SL-27: ссылки на AC в spec, README, slices и ADR фичи ведут на существующие AC.
/** @param {SliceContext} c */
function acLinks(c) {
  const files = uniq([c.m.specFile, c.m.readmeFile, ...[...c.slices.values()].map((x) => x.file), ...c.m.featureAdrs.map((a) => a.file)]);
  return files.flatMap((file) => {
    const md = read(file);
    if (!md) return [];
    return scan(md).lines.flatMap((l) =>
      [...l.text.matchAll(/\bAC-\d{3}-[BF]?\d+\b/g)]
        .filter((x) => !c.defs.has(x[0]))
        .map((x) => finding('SL-27', file, l.n, `ссылка на ${x[0]}, такого AC нет`)),
    );
  });
}

/** @type {FeatureRule[]} */
const FEATURE = [
  { ids: ['SL-11'], check: depsExist },
  {
    ids: ['SL-11'],
    check: (c) => dependencyCycles(c.slices).map(({ num, path }) => finding('SL-11', c.slices.get(num)?.file, null, `цикл зависимостей: ${path.join(' → ')}`)),
  },
  { ids: ['SL-12', 'SL-13'], check: specCovered },
  { ids: ['SL-26'], check: (c) => (c.slices.size > 6 ? [finding('SL-26', c.m.slicesDir, null, `${c.slices.size} slices — больше ориентира 3–6`)] : []) },
  { ids: ['SL-27'], check: acLinks },
];

/** @param {Feature} m @returns {Finding[]} */
export function checkSlices(m) {
  if (!m.slices.size) return [];
  const c = sliceContext(m);
  const perAc = (/** @type {Slice} */ sl) => (/** @type {Ac} */ ac) => [
    ...AC_ANY.flatMap((r) => r.check(ac, sl, c)),
    ...(ac.deleted || ac.stub ? [] : AC_LIVE.flatMap((r) => r.check(ac, sl, c))),
  ];
  const perSlice = (/** @type {Slice} */ sl) => [
    ...SLICE_HEAD.flatMap((r) => r.check(sl, c)),
    ...sl.acs.flatMap(perAc(sl)),
    ...SLICE_TAIL.flatMap((r) => r.check(sl, c)),
  ];
  return [...[...c.slices.values()].flatMap(perSlice), ...FEATURE.flatMap((r) => r.check(c)), ...checkReadme(m)];
}
