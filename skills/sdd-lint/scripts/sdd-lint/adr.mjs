// ADR: разбор и проверки AD-*.
import path from 'node:path';

import { add } from './findings.mjs';
import { rel, uniq, approved, scan, inSection, hasSection, sectionText, header, reqIds } from './md.mjs';

export function parseAdr(file, md) {
  const sc = scan(md);
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
  };
}

export function checkAdrs(m) {
  const seen = new Map();
  for (const a of m.adrs) {
    if (seen.has(a.num)) add('AD-09', a.file, null, `номер ${a.num} уже у ${rel(seen.get(a.num))}`);
    seen.set(a.num, a.file);
  }
  for (const a of m.featureAdrs) {
    const f = a.file;
    if (!a.status) add('AD-01', f, null, 'нет строки «Статус:»');
    if (a.headNum && a.headNum.padStart(4, '0') !== a.num) add('AD-09', f, 1, `файл ${a.num}, в заголовке ADR-${a.headNum}`);
    for (const sec of ['Контекст', 'Варианты', 'Решение', 'Последствия', 'Не выяснено'])
      if (!hasSection(a.sc, new RegExp(`^${sec}`))) add('AD-02', f, null, `нет раздела «${sec}»`);
    if (hasSection(a.sc, /^Варианты/)) {
      if (a.variants.length < 2) add('AD-03', f, null, `вариантов: ${a.variants.length}`);
      for (const v of a.variants) {
        if (!v.verdict) add('AD-04', f, v.n, `«${v.title}» без строки «Отклонён | Выбран | Отложен»`);
        else if (v.verdict.startsWith('отклон') && !reqIds(v.text).length) add('AD-05', f, v.n, `«${v.title}» отклонён без ссылки на FR/NFR`);
      }
      const chosen = a.variants.filter((v) => v.verdict === 'выбран').length;
      if (a.variants.length && chosen !== 1) add('AD-04', f, null, `выбрано вариантов: ${chosen}, нужен ровно один`);
    }
    if (hasSection(a.sc, /^Контекст/)) {
      const ids = reqIds(sectionText(a.sc, /^Контекст/));
      if (!ids.length) add('AD-06', f, null, '«Контекст» без FR/NFR');
      if (m.spec) for (const id of ids) if (!m.spec.reqs.has(id)) add('AD-06', f, null, `«Контекст»: ${id} нет в spec.md`);
    }
    const touched = (header(a.md, 'Затрагивает slices') || '').match(/\b\d{3}\b/g) || [];
    const consNums = [...sectionText(a.sc, /^Последствия/).matchAll(/slices?\s+(\d{3})/gi)].map((x) => x[1]);
    if (m.slices.size) {
      for (const n of uniq([...touched, ...consNums])) if (!m.slices.has(n)) add('AD-07', f, null, `slice ${n} нет`);
      for (const n of touched) if (!consNums.includes(n)) add('AD-07', f, null, `slice ${n} из шапки не описан в «Последствия»`);
    }
    for (const l of inSection(a.sc, /^Не выяснено/).filter((x) => !x.inCode && /^\s*[-*]\s+\S/.test(x.text)))
      if (!/блокир/i.test(l.text) && !/блокир/i.test(l.h2)) add('AD-08', f, l.n, 'не сказано, блокирует ли пункт slices');
    if (approved(m.slicesStatus) && !/принят/i.test(a.status || '')) add('AD-10', f, null, `статус «${a.status || '—'}», slices уже одобрены`);
  }
}

// Где фича и что делать дальше — готовыми командами со slug.
export const pendingAdrs = (m) => m.featureAdrs.filter((a) => !/принят/i.test(a.status || ''));
