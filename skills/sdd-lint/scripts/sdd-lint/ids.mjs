// Кириллица в ID (SL-31): «АС-003-В2» выглядит как AC-003-B2, но скрипт его не видит — fix заменяет буквы.
// @ts-check
import { collect } from './findings.mjs';
import { scan } from './md.mjs';

// В ID буквы латинские (AC, B, F, ADR), а в «Р1–Р3» — кириллическая «Р».
/** @type {Record<string, string>} */
const TO_LAT = { А: 'A', С: 'C', В: 'B' };
const AC_ANY = /(?<![\p{L}\d_-])([AА][CС]-(?:\d{3}-)?[BВF]?(?:\d+|\?))(?![\p{L}\d_])/gu;
const ADR_ANY = /(?<![\p{L}\d_-])([AА]DR-\d+)/gu;
const WHY_P = /^(Почему отдельно:\s*\**\s*)P(?=[123](?!\d))/gmu;
const CYR = /[АСВ]/u;

/** @param {string} s */
const lat = (s) => s.replace(/[АСВ]/gu, (c) => TO_LAT[c]);
// AC-ID в любом виде → латиница: так его видят разбор slices, ссылки и export.
/** @param {string} id */
export const latinAc = (id) => lat(id);

// Что в тексте не так: [{ n, from, to, why }].
/** @typedef {{ n: number, from: string, to: string, why: string }} IdTypo */
/** @param {string} md @returns {IdTypo[]} */
export function idTypos(md) {
  /** @type {IdTypo[]} */
  const out = [];
  for (const l of scan(md).lines) {
    for (const re of [AC_ANY, ADR_ANY])
      for (const m of l.text.matchAll(re)) if (CYR.test(m[1])) out.push({ n: l.n, from: m[1], to: lat(m[1]), why: 'кириллица в ID' });
    const p = l.text.match(/^Почему отдельно:\s*\**\s*(P[123])(?!\d)/u);
    if (p) out.push({ n: l.n, from: p[1], to: `Р${p[1].slice(1)}`, why: 'латинская P вместо кириллической Р' });
  }
  return out;
}

// fix: заменить и вернуть новый текст и список замен.
/** @param {string} md */
export function fixIdTypos(md) {
  const typos = idTypos(md);
  if (!typos.length) return { md, typos };
  const out = md
    .replace(AC_ANY, (all, id) => (CYR.test(id) ? all.replace(id, lat(id)) : all))
    .replace(ADR_ANY, (all, id) => (CYR.test(id) ? all.replace(id, lat(id)) : all))
    .replace(WHY_P, '$1Р');
  return { md: out, typos };
}

/** @param {string} file @param {string} md */
export function checkIdTypos(file, md) {
  const { found, add } = collect();
  for (const t of idTypos(md)) add('SL-31', file, t.n, `«${t.from}» — ${t.why}; верно «${t.to}»`);
  return found;
}
