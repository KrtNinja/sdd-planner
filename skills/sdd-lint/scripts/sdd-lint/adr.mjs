// ADR: разбор. Проверки AD-* — в adr-rules.mjs.
// @ts-check
import path from 'node:path';

import { scan, inSection, header, matched } from './md.mjs';

/** @typedef {import('./model.mjs').Adr} Adr */
/** @typedef {import('./model.mjs').AdrVariant} AdrVariant */
/** @typedef {import('./model.mjs').Feature} Feature */
/** @typedef {import('./model.mjs').Line} Line */

// Ограничение — то, что в решении не обсуждается: решение компании, бюджет, ресурсы, сроки.
// Описывается в «Контексте» строкой «- ОГР-n что именно — кто поставил», на него ссылаются варианты.
export const LIMIT_RE = /(?<![\p{L}\d])ОГР-(\d+)(?!\d)/gu;
export const limitIds = (/** @type {string | undefined} */ s) => [...(s || '').matchAll(LIMIT_RE)].map((m) => m[0]);

/** @param {string} file @param {string} md @returns {Adr} */
export function parseAdr(file, md) {
  const sc = scan(md);
  const limits = inSection(sc, /^Контекст/)
    .filter((l) => !l.inCode && /^\s*[-*]\s*ОГР-\d+/u.test(l.text))
    .map((l) => ({ id: matched(l.text, /ОГР-\d+/u)[0], n: l.n }));
  /** @type {{ title: string, n: number, lines: Line[] }[]} */
  const heads = [];
  /** @type {{ title: string, n: number, lines: Line[] } | null} */
  let cur = null;
  for (const l of inSection(sc, /^Варианты/)) {
    if (!l.inCode && /^###\s/.test(l.text)) {
      cur = { title: l.text.replace(/^###\s+/, '').trim(), n: l.n, lines: [] };
      heads.push(cur);
    } else if (cur) cur.lines.push(l);
  }
  /** @type {AdrVariant[]} */
  const variants = heads.map((v) => {
    const text = v.lines.map((l) => l.text).join('\n');
    const m = text.match(/^\**\s*(Отклон[её]н|Выбран|Отложен)/im);
    return { ...v, text, verdict: m ? /** @type {AdrVariant['verdict']} */ (m[1].toLowerCase().replace('ё', 'е')) : null };
  });
  return {
    file,
    md,
    sc,
    num: path.basename(file).slice(0, 4),
    headNum: (md.match(/^#\s+ADR-(\d+)/m) || [])[1] || null,
    status: header(md, 'Статус'),
    variants,
    limits,
  };
}

// Где фича и что делать дальше — готовыми командами со slug.
/** @param {Feature} m */
export const pendingAdrs = (m) => m.featureAdrs.filter((a) => !/принят/i.test(a.status || ''));
