// Правила PL-* по плану нарезки _work/plan.md: план целиком, каждый slice плана, связи между ними — списками { ids, check }.
// @ts-check
import { adrNums, reason, stubLines } from './cut.mjs';
import { finding } from './findings.mjs';
import { dependencyCycles } from './graph.mjs';
import { approved } from './md.mjs';
import { KEYS, sharedReqs, nfrOnly } from './plan.mjs';
import { registry, halvesProblem } from './services.mjs';

/** @typedef {import('./model.mjs').Feature} Feature */

// Правило — { ids, check }: ids — какие ID из rules.mjs оно выдаёт, check — его находки массивом.
// Порядок правил — порядок находок: шапка плана, затем по каждому slice, затем связи между slices.
/** @typedef {import('./model.mjs').Finding} Finding */
/** @typedef {import('./model.mjs').Plan} Plan */
/** @typedef {import('./model.mjs').PlanSlice} PlanSlice */
/**
 * @typedef {{ m: Feature, p: Plan, f: string, nums: Set<string>, first: string | undefined, reg: import('./model.mjs').Registry | null }} PlanContext
 * @typedef {{ ids: string[], check: (c: PlanContext) => Finding[] }} PlanRule
 * @typedef {{ ids: string[], check: (s: PlanSlice, c: PlanContext) => Finding[] }} PlanSliceRule
 */

// Строка ключа в шапке slice, а без неё — заголовок slice.
const at = (/** @type {PlanSlice} */ s, /** @type {string} */ k) => s.headN[k] || s.n;

// PL-03: номер и slug у каждого slice свои.
/** @param {PlanContext} c */
function uniqueNames({ p, f }) {
  /** @type {Record<string, Map<string, string>>} */
  const seen = { num: new Map(), slug: new Map() };
  return p.slices.flatMap((s) =>
    [['num', s.num], ['slug', s.slug]].flatMap(([k, v]) => {
      if (!seen[k].has(v)) {
        seen[k].set(v, s.title);
        return [];
      }
      return [finding('PL-03', f, s.n, `${k === 'num' ? 'номер' : 'slug'} «${v}» уже у «${seen[k].get(v)}»`)];
    }),
  );
}

/** @type {PlanRule[]} */
const PLAN_HEAD = [
  { ids: ['PL-14'], check: ({ p, f }) => stubLines(p.md).map((s) => finding('PL-14', f, s.n, s.items.map((x) => `«${x}»`).join(', '))) },
  { ids: ['PL-03'], check: uniqueNames },
];

// PL-07: зависимость не на себя и на slice из плана.
/** @param {PlanSlice} s @param {PlanContext} c */
function depsKnown(s, { f, nums }) {
  return s.deps.flatMap((/** @type {string} */ d) => {
    if (d === s.num) return [finding('PL-07', f, at(s, 'Зависимости'), `${s.num} зависит сам от себя`)];
    return nums.has(d) ? [] : [finding('PL-07', f, at(s, 'Зависимости'), `${s.num}: зависимости ${d} в плане нет`)];
  });
}
// PL-09: Р1 ссылается на ADR, который есть и ещё не принят.
/** @param {PlanSlice} s @param {PlanContext} c */
function adrRefs(s, { m, f }) {
  if (reason(s.why) !== '1') return [];
  return adrNums(s.why).flatMap((num) => {
    const a = m.adrs.find((x) => x.num === num);
    if (!a) return [finding('PL-09', f, at(s, 'Почему отдельно'), `${s.num}: ADR-${num} нет в docs/adr`)];
    return approved(a.status) ? [finding('PL-09', f, at(s, 'Почему отдельно'), `${s.num}: ADR-${num} уже «${a.status}»`)] : [];
  });
}

/** @type {PlanSliceRule[]} */
const PLAN_SLICE = [
  { ids: ['PL-02'], check: (s, { f }) => KEYS.filter((k) => s.head[k] === undefined).map((k) => finding('PL-02', f, s.n, `${s.num}: нет строки «${k}:»`)) },
  {
    ids: ['PL-05'],
    check: (s, { m: { spec }, f }) =>
      spec ? [...s.basis].filter((id) => !spec.reqs.has(id)).map((id) => finding('PL-05', f, at(s, 'Основание'), `${s.num}: ${id} нет в spec.md`)) : [],
  },
  {
    // Без причины отдельно стоят только 001 и первый поведенческий slice.
    ids: ['PL-06'],
    check: (s, { f, first }) =>
      s.num !== '001' && s.num !== first && s.why !== null && !reason(s.why)
        ? [finding('PL-06', f, at(s, 'Почему отдельно'), `${s.num} «${s.title}»: «Почему отдельно: ${s.why}» — нет Р1, Р2 или Р3`)]
        : [],
  },
  { ids: ['PL-07'], check: depsKnown },
  {
    ids: ['PL-08'],
    check: (s, { f, reg }) => {
      const problem = s.halves !== null && halvesProblem(s.halves, reg);
      return problem ? [finding('PL-08', f, at(s, 'Половины'), `${s.num}: ${problem}`)] : [];
    },
  },
  { ids: ['PL-09'], check: adrRefs },
  { ids: ['PL-11'], check: (s, { f }) => (nfrOnly(s) ? [finding('PL-11', f, at(s, 'Основание'), `${s.num}: только ${[...s.basis].join(', ')}`)] : []) },
];

/** @type {PlanRule[]} */
const PLAN_TAIL = [
  {
    ids: ['PL-07'],
    check: ({ p, f }) =>
      dependencyCycles(new Map(p.slices.map((s) => [s.num, s]))).map(({ path }) => finding('PL-07', f, null, `цикл зависимостей: ${path.join(' → ')}`)),
  },
  {
    // PL-04: каждое живое требование spec попало в «Основание» какого-нибудь slice.
    ids: ['PL-04'],
    check: ({ m, p, f }) => {
      if (!m.spec) return [];
      const covered = new Set(p.slices.flatMap((s) => [...s.basis]));
      const missing = [...m.spec.reqs.values()].filter((r) => !r.deleted && !covered.has(r.id)).map((r) => r.id);
      return missing.length ? [finding('PL-04', f, null, `не покрыты: ${missing.join(', ')}`)] : [];
    },
  },
  { ids: ['PL-10'], check: ({ p, f }) => sharedReqs(p).map(([id, ns]) => finding('PL-10', f, null, `${id} — в ${ns.join(', ')}`)) },
  { ids: ['PL-12'], check: ({ p, f }) => (p.slices.length > 6 ? [finding('PL-12', f, null, `${p.slices.length} slices`)] : []) },
];

// Плана нет — проверять нечего; slices уже нарезаны — план лишний (PL-13); плохие заголовки и пустой план — PL-01.
/** @param {Feature} m @returns {Finding[]} */
export function checkPlan(m) {
  const p = m.plan;
  if (!p) return [];
  const f = p.file;
  if (m.slices.size) return [finding('PL-13', f, null, `в slices/ уже ${m.slices.size} файл(ов) slices`)];
  const bad = p.bad.map((b) => finding('PL-01', f, b.n, `«${b.text}» — не заголовок slice`));
  if (!p.slices.length) return [...bad, finding('PL-01', f, null, 'нет ни одного slice')];
  const first = p.slices.filter((s) => s.type === 'поведение').map((s) => s.num).sort()[0];
  /** @type {PlanContext} */
  const c = { m, p, f, nums: new Set(p.slices.map((s) => s.num)), first, reg: registry(m) };
  return [
    ...bad,
    ...PLAN_HEAD.flatMap((r) => r.check(c)),
    ...p.slices.flatMap((s) => PLAN_SLICE.flatMap((r) => r.check(s, c))),
    ...PLAN_TAIL.flatMap((r) => r.check(c)),
  ];
}
