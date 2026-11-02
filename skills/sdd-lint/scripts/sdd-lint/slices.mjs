// Slices: разбор файлов NNN-*.md. Проверки SL-* — в slice-rules.mjs.
import path from 'node:path';

import { latinAc } from './ids.mjs';
import { CHECKS_RE } from './links.mjs';
import { scan, header, headerLine, reqIds, placeholders, uniq } from './md.mjs';
import { underBlocks } from './sources.mjs';

// AC-ID и с кириллическими «А», «С», «В»: такой AC не пропадает из проверок, а SL-31 просит поправить букву.
const AC_LINE = /^\s*([AА][CС]-(\d{3})-([BВF]?)(\d+))\b(.*)$/u;
// «AC-002-?» — AC без номера: его пронумерует fix.
const AC_PENDING = /^\s*[AА][CС]-(?:\d{3}-)?[BВF]?\?(?=\s|$)/u;
/** @param {string} file @param {string} md */
export function parseSlice(file, md) {
  const sc = scan(md);
  const num = path.basename(file).slice(0, 3);
  const basisRaw = header(md, 'Основание') ?? '';
  const depsRaw = header(md, 'Зависимости') ?? '';
  const acs = [];
  const outside = [];
  const multi = [];
  let pending = 0;
  const checks = underBlocks(sc, CHECKS_RE);
  for (const b of sc.blocks) {
    const idLines = b.lines.filter((l) => AC_LINE.test(l.text));
    if (idLines.length > 1) multi.push({ n: b.start, count: idLines.length });
    pending += b.lines.filter((l) => AC_PENDING.test(l.text)).length;
    for (const l of idLines) {
      const [, raw, acNum, rawSide, k, rest] = l.text.match(AC_LINE);
      const id = latinAc(raw);
      const side = latinAc(rawSide);
      const stub = placeholders(b.lines.map((x) => x.text).join('\n')).length + placeholders(checks.get(b.idx)?.text).length > 0;
      acs.push({
        id,
        acNum,
        side,
        stub,
        k: Number(k),
        n: l.n,
        h2: b.h2,
        deleted: /\(удал[её]н/i.test(rest),
        oldRefs: reqIds((rest.match(/\[([^\]]*)\]/) || [])[1]),
        refs: uniq([...reqIds((rest.match(/\[([^\]]*)\]/) || [])[1]), ...reqIds(checks.get(b.idx)?.text)]),
        checks: checks.get(b.idx) || null,
        block: b.idx,
        body: b.lines.slice(b.lines.indexOf(l) + 1),
        text: b.lines.map((x) => x.text).join('\n'),
      });
    }
  }
  for (const l of sc.lines) if (!l.inCode && AC_LINE.test(l.text)) outside.push({ id: latinAc(l.text.match(AC_LINE)[1]), n: l.n });
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
    depsRaw,
    deps: /^(нет|—|-)?$/i.test(depsRaw.trim()) ? [] : uniq([...depsRaw.matchAll(/\b\d{3}\b/g)].map((m) => m[0])),
    halves: header(md, 'Половины'),
    why: header(md, 'Почему отдельно'),
    acs,
    pending,
    outside,
    multi,
  };
}

/** @typedef {ReturnType<typeof parseSlice>} Slice */
/** @typedef {Slice['acs'][number]} Ac */
