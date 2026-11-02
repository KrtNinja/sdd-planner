// Правила SL-* по AC slice: место в разделах, WHEN / THEN, «Проверяет:», FR из «Основание», стоп-слова, «тексты».
// @ts-check
import { unknownNames } from './data.mjs';
import { finding } from './findings.mjs';
import { quotes, rel, word, matched } from './md.mjs';

/** @typedef {import('./model.mjs').Finding} Finding */
/** @typedef {import('./model.mjs').Slice} Slice */
/** @typedef {import('./model.mjs').Ac} Ac */
/** @typedef {import('./slice-rules.mjs').SliceContext} SliceContext */
/** @typedef {{ ids: string[], check: (ac: Ac, sl: Slice, c: SliceContext) => Finding[] }} AcRule */

const AC_STOP_WORDS = [
  ['мок или заглушка', word('мок\\p{L}*|mock\\p{L}*|stub\\p{L}*|заглушк\\p{L}*|фикстур\\p{L}*|fixture\\p{L}*')],
  ['стенд', word('стенд\\p{L}*')],
  ['класс', word('класс\\p{L}*')],
  ['«через сервис»', word('через сервис\\p{L}*')],
  // имена файлов и пути — CD-01, ошибкой
  ['имя класса', /\b[A-Z][a-z]+[A-Z][A-Za-z]*\b/],
];

const KW = /^(WHEN|AND|THEN|OR|BUT)\b/;
const indent = (/** @type {string} */ t) => matched(t, /^\s*/)[0].length;
const sideOfHeading = (/** @type {string | null | undefined} */ h) => {
  if (!h) return null;
  if (/общ/i.test(h)) return '';
  if (/front|фронт/i.test(h)) return 'F';
  if (/половин/i.test(h)) return 'B';
  return null;
};

// FR из «Основание» зависимостей slice, транзитивно.
/** @param {Map<string, Slice>} slices @param {Slice} sl */
function depBasisOf(slices, sl) {
  const out = new Set();
  const seen = new Set();
  const walk = (/** @type {string} */ num) => {
    for (const d of slices.get(num)?.deps || []) {
      if (seen.has(d) || !slices.has(d)) continue;
      seen.add(d);
      for (const id of /** @type {Slice} */ (slices.get(d)).basis) out.add(id);
      walk(d);
    }
  };
  walk(sl.num);
  return out;
}
// --- каждый AC, и удалённый, и заготовка ---
/** @type {AcRule[]} */
export const AC_ANY = [
  { ids: ['SL-04'], check: (ac, sl) => (ac.acNum !== sl.num ? [finding('SL-04', sl.file, ac.n, `${ac.id} — номер не совпадает с файлом ${sl.num}`)] : []) },
  {
    ids: ['SL-05'],
    check: (ac, sl, c) => (c.prevDef.get(ac) ? [finding('SL-05', sl.file, ac.n, `${ac.id} уже определён в ${rel(c.prevDef.get(ac))}`)] : []),
  },
];
// --- AC с текстом: не удалён и не заготовка (заготовку ловит SL-37) ---
const sectionWhere = (/** @type {string} */ side) => (side === '' ? '«Общая приёмка»' : side === 'F' ? '«Frontend-половина»' : '«<Сервис>-половина»');
const serviceOfH2 = (/** @type {string} */ h2) => h2.replace(/[-–—\s]*половина.*$/i, '').trim().toLowerCase();

// SL-14: первая строка после имени — WHEN, где-то есть THEN.
/** @param {Ac} ac @param {Slice} sl */
function whenThen(ac, sl) {
  const content = ac.body.filter((l) => l.text.trim());
  if (!content.length || !/^WHEN\b/.test(content[0].text.trim())) return [finding('SL-14', sl.file, ac.n, `${ac.id}: первая строка после имени — не WHEN`)];
  if (!content.some((l) => /^THEN\b/.test(l.text.trim()))) return [finding('SL-14', sl.file, ac.n, `${ac.id}: нет THEN`)];
  return [];
}
// SL-15: строка без ключевого слова — только продолжение предыдущей, с отступом больше.
/** @param {Ac} ac @param {Slice} sl */
function keywordLines(ac, sl) {
  const out = [];
  let lastKw = null;
  for (const l of ac.body.filter((x) => x.text.trim())) {
    if (KW.test(l.text.trim())) lastKw = indent(l.text);
    else if (lastKw === null || indent(l.text) <= lastKw) out.push(finding('SL-15', sl.file, l.n, `${ac.id}: строка без WHEN / AND / THEN`));
  }
  return out;
}
// SL-16: под AC — «Проверяет:» в новом формате.
/** @param {Ac} ac @param {Slice} sl */
function checksLine(ac, sl) {
  if (ac.oldRefs.length) return [finding('SL-16', sl.file, ac.n, `${ac.id}: [${ac.oldRefs.join(', ')}] в строке AC — старый формат`)];
  if (!ac.refs.length) return [finding('SL-16', sl.file, ac.n, `${ac.id}: под блоком нет «Проверяет:»`)];
  return [];
}
// SL-17 / SL-18: AC проверяет FR из spec и из «Основание» своего slice, а не зависимости.
/** @param {Ac} ac @param {Slice} sl @param {SliceContext} c */
function refsInBasis(ac, sl, c) {
  const deps = depBasisOf(c.slices, sl);
  return ac.refs.flatMap((id) => {
    if (c.s && !c.s.reqs.has(id)) return [finding('SL-17', sl.file, ac.n, `${ac.id} ссылается на ${id}, его нет в spec.md`)];
    if (sl.basis.has(id)) return [];
    if (deps.has(id)) return [finding('SL-18', sl.file, ac.n, `${ac.id} проверяет ${id} из зависимости`)];
    return [finding('SL-17', sl.file, ac.n, `${ac.id} ссылается на ${id}, а в «Основание» slice его нет`)];
  });
}
// SL-23 / SL-24: «тексты» и персонажи — из Dev Spec.
/** @param {Ac} ac @param {Slice} sl @param {SliceContext} c */
function fromSpec(ac, sl, c) {
  if (!c.s) return [];
  const specFlat = c.s.md.replace(/\s+/g, ' ');
  const texts = quotes(ac.text)
    .filter((q) => !q.includes('<') && !specFlat.includes(q))
    .map((q) => finding('SL-23', sl.file, ac.n, `${ac.id}: «${q}» нет в Dev Spec`));
  const names = unknownNames(ac.text, c.s.data).map((nm) => finding('SL-24', sl.file, ac.n, `${ac.id}: «${nm}» нет в «Данные для примеров»`));
  return [...texts, ...names];
}

/** @type {AcRule[]} */
export const AC_LIVE = [
  {
    ids: ['SL-20'],
    check: (ac, sl) => {
      if (sideOfHeading(ac.h2) === ac.side) return [];
      return [finding('SL-20', sl.file, ac.n, `${ac.id} стоит в разделе «${ac.h2 || '—'}», его место — ${sectionWhere(ac.side)}`)];
    },
  },
  {
    ids: ['SL-21'],
    check: (ac, sl) => {
      if (ac.side !== 'B' || !ac.h2 || !sl.halves) return [];
      const svc = serviceOfH2(ac.h2);
      return svc && !sl.halves.toLowerCase().includes(svc) ? [finding('SL-21', sl.file, ac.n, `раздел «${ac.h2}», а в «Половины:» — «${sl.halves}»`)] : [];
    },
  },
  { ids: ['SL-14'], check: whenThen },
  { ids: ['SL-15'], check: keywordLines },
  { ids: ['SL-16'], check: checksLine },
  { ids: ['SL-17', 'SL-18'], check: refsInBasis },
  {
    ids: ['SL-22'],
    check: (ac, sl) => {
      const plain = ac.text.replace(/«[^«»]*»/g, ' ').replace(/\[[^\]]*\]/g, ' ');
      return AC_STOP_WORDS.flatMap(([label, re]) => {
        const mm = plain.match(re);
        return mm ? [finding('SL-22', sl.file, ac.n, `${ac.id}: «${mm[0]}» — ${label}`)] : [];
      });
    },
  },
  { ids: ['SL-23', 'SL-24'], check: fromSpec },
];
