// ADR: разбор. Проверки AD-* — в adr-rules.mjs.
import path from 'node:path';

import { scan, inSection, header } from './md.mjs';

// Ограничение — то, что в решении не обсуждается: решение компании, бюджет, ресурсы, сроки.
// Описывается в «Контексте» строкой «- ОГР-n что именно — кто поставил», на него ссылаются варианты.
export const LIMIT_RE = /(?<![\p{L}\d])ОГР-(\d+)(?!\d)/gu;
export const limitIds = (/** @type {string | undefined} */ s) => [...(s || '').matchAll(LIMIT_RE)].map((m) => m[0]);

/** @param {string} file @param {string} md */
export function parseAdr(file, md) {
  const sc = scan(md);
  const limits = inSection(sc, /^Контекст/)
    .filter((l) => !l.inCode && /^\s*[-*]\s*ОГР-\d+/u.test(l.text))
    .map((l) => ({ id: l.text.match(/ОГР-\d+/u)[0], n: l.n }));
  const variants = [];
  let cur = null;
  for (const l of inSection(sc, /^Варианты/)) {
    if (!l.inCode && /^###\s/.test(l.text)) {
      cur = { title: l.text.replace(/^###\s+/, '').trim(), n: l.n, lines: [] };
      variants.push(cur);
    } else if (cur) cur.lines.push(l);
  }
  for (const v of variants) {
    v.text = v.lines.map((l) => l.text).join('\n');
    const m = v.text.match(/^\**\s*(Отклон[её]н|Выбран|Отложен)/im);
    v.verdict = m ? m[1].toLowerCase().replace('ё', 'е') : null;
  }
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
export const pendingAdrs = (m) => m.featureAdrs.filter((a) => !/принят/i.test(a.status || ''));

/** @typedef {ReturnType<typeof parseAdr>} Adr */
