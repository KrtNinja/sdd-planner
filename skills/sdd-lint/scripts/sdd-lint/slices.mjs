// Slices: разбор файлов NNN-*.md. Проверки SL-* — в slice-rules.mjs.
// @ts-check
import path from 'node:path';

import { latinAc } from './ids.mjs';
import { CHECKS_RE } from './links.mjs';
import { scan, header, headerLine, reqIds, placeholders, uniq, matched, depNums } from './md.mjs';
import { underBlocks } from './sources.mjs';

/** @typedef {import('./model.mjs').Slice} Slice */
/** @typedef {import('./model.mjs').Ac} Ac */

// AC-ID и с кириллическими «А», «С», «В»: такой AC не пропадает из проверок, а SL-31 просит поправить букву.
const AC_LINE = /^\s*([AА][CС]-(\d{3})-([BВF]?)(\d+))\b(.*)$/u;
// «AC-002-?» — AC без номера: его пронумерует fix.
// Старая форма ссылок на FR — в [ … ] после ID: «AC-002-1 [FR-3, FR-4]».
const OLD_REFS = /\[[^\]]*\]/;
const AC_PENDING = /^\s*[AА][CС]-(?:\d{3}-)?[BВF]?\?(?=\s|$)/u;
/** @typedef {Map<number, import('./model.mjs').ChecksLine>} Checks */
/** @param {import('./model.mjs').CodeBlock} b @param {import('./model.mjs').Line} l @param {Checks} checks @returns {Ac} */
function parseAc(b, l, checks) {
  const [, raw, acNum, rawSide, k, rest] = matched(l.text, AC_LINE);
  const id = latinAc(raw);
  const side = latinAc(rawSide);
  const stub = placeholders(b.lines.map((x) => x.text).join('\n')).length + placeholders(checks.get(b.idx)?.text).length > 0;
  return {
    id,
    acNum,
    side,
    stub,
    k: Number(k),
    n: l.n,
    h2: b.h2,
    deleted: /\(удал[её]н/i.test(rest),
    oldRefs: reqIds(rest.match(OLD_REFS)?.[0]),
    refs: uniq([...reqIds(rest.match(OLD_REFS)?.[0]), ...reqIds(checks.get(b.idx)?.text)]),
    checks: checks.get(b.idx) || null,
    block: b.idx,
    body: b.lines.slice(b.lines.indexOf(l) + 1),
    text: b.lines.map((x) => x.text).join('\n'),
  };
}

/** @param {import('./model.mjs').Scan} sc @param {Checks} checks */
function blockAcs(sc, checks) {
  /** @type {Ac[]} */
  const acs = [];
  /** @type {Slice['multi']} */
  const multi = [];
  let pending = 0;
  for (const b of sc.blocks) {
    const idLines = b.lines.filter((l) => AC_LINE.test(l.text));
    if (idLines.length > 1) multi.push({ n: b.start, count: idLines.length });
    pending += b.lines.filter((l) => AC_PENDING.test(l.text)).length;
    for (const l of idLines) {
      acs.push(parseAc(b, l, checks));
    }
  }
  return { acs, multi, pending };
}

/** @param {string} file @param {string} md @returns {Slice} */
export function parseSlice(file, md) {
  const sc = scan(md);
  const num = path.basename(file).slice(0, 3);
  const basisRaw = header(md, 'Основание', '');
  const checks = underBlocks(sc, CHECKS_RE);
  const { acs, multi, pending } = blockAcs(sc, checks);
  /** @type {Slice['outside']} */
  const outside = [];
  for (const l of sc.lines) if (!l.inCode && AC_LINE.test(l.text)) outside.push({ id: latinAc(matched(l.text, AC_LINE)[1]), n: l.n });
  const used = new Set([...checks.values()].map((x) => x.n));
  const strayChecks = sc.lines.filter((l) => !l.inCode && CHECKS_RE.test(l.text) && !used.has(l.n)).map((l) => l.n);
  return {
    strayChecks,
    basisLine: headerLine(md, 'Основание'),
    file,
    md,
    sc,
    num,
    name: path.basename(file),
    title: ((md.match(/^#\s+\d{3}\s+[—-]\s+(.*)$/m) || [])[1] || '').trim(),
    type: header(md, 'Тип'),
    basisRaw,
    basis: new Set(reqIds(basisRaw)),
    deps: depNums(header(md, 'Зависимости', '')),
    halves: header(md, 'Половины'),
    why: header(md, 'Почему отдельно'),
    acs,
    pending,
    outside,
    multi,
  };
}
