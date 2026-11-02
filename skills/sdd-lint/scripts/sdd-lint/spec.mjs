// Dev Spec: разбор spec.md. Проверки SP-* — в spec-rules.mjs.
import { parseData } from './data.mjs';
import { scan, isH2, inSection, header, tables } from './md.mjs';
import { parseSources } from './sources.mjs';

/** @param {string} file @param {string | null | undefined} md */
export function parseSpec(file, md) {
  if (md == null) return null;
  const sc = scan(md);
  const reqs = new Map();
  const dups = [];
  const outside = [];
  const multi = [];
  for (const b of sc.blocks) {
    const idLines = b.lines.filter((l) => /^\s*N?FR-\d+\b/.test(l.text));
    if (idLines.length > 1) multi.push({ n: b.start, ids: idLines.map((l) => l.text.trim().split(/\s/)[0]) });
    for (const l of idLines) {
      const id = l.text.trim().match(/^N?FR-\d+/)[0];
      if (reqs.has(id)) {
        dups.push({ id, n: l.n });
        continue;
      }
      const text = b.lines.map((x) => x.text).join('\n');
      reqs.set(id, { id, n: l.n, text, first: l.text, deleted: /\(удал[её]н/i.test(l.text), h2: b.h2, block: b.idx });
    }
  }
  for (const l of sc.lines) {
    if (!l.inCode && /^\s*N?FR-\d+\b/.test(l.text)) outside.push({ id: l.text.trim().match(/^N?FR-\d+/)[0], n: l.n });
  }
  const traceH = sc.lines.find((l) => isH2(l) && /^Трассировка/.test(l.h2));
  return {
    file,
    md,
    sc,
    status: header(md, 'Статус'),
    reqs,
    dups,
    outside,
    multi,
    data: parseData(sc),
    sources: parseSources(sc, reqs),
    oldTraceT: tables(inSection(sc, /^Трассировка/))[0] || null,
    oldTraceLine: traceH ? traceH.n : null,
    title: ((md.match(/^#\s+(.*)$/m) || [])[1] || '').replace(/\s+—\s+Dev Spec\s*$/i, '').trim(),
  };
}

/** @typedef {NonNullable<ReturnType<typeof parseSpec>>} Spec */
