// Нарезка slices: причины Р1–Р3 правдивы, сервисы из реестра, кириллица в ID, заготовки (SL-31…SL-38).
import { add } from './findings.mjs';
import { checkIdTypos } from './ids.mjs';
import { placeholders, scan, header, headerLine, uniq } from './md.mjs';
import { registry, parseHalves, halvesProblem, serviceOfHeading, unknownService } from './services.mjs';

// «Р1 — ADR: доставка событий» — ADR ещё не заведён; «Р1 — ждёт ADR-0001» — заведён.
export const adrTopic = (why) => ((why || '').match(/ADR:\s*([^;()\n]+)/u)?.[1] || '').replace(/[«»"'.,\s]+$/u, '').replace(/^[«"']+/u, '').trim() || null;
export const adrNums = (why) => uniq([...(why || '').matchAll(/(?<![\p{L}\d-])ADR-(\d+)/gu)].map((x) => x[1].padStart(4, '0')));
export const reason = (why) => ((why || '').replace(/^\**\s*/, '').match(/^[РP]([123])(?!\d)/u) || [])[1] || null;

// Где в файле заготовки: [{ n, items }] — соседние строки одного раздела (AC, строка таблицы) одной группой.
export function stubLines(md) {
  const out = [];
  let last = null;
  for (const l of scan((md || '').replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '))).lines) {
    const items = placeholders(l.text);
    if (!items.length) continue;
    const near = last && last.h2 === l.h2 && l.n - last.end <= 2 && !l.text.trim().startsWith('|');
    if (near) {
      last.items.push(...items);
      last.end = l.n;
    } else {
      last = { n: l.n, end: l.n, h2: l.h2, items: [...items] };
      out.push(last);
    }
  }
  return out.map(({ n, items }) => ({ n, items }));
}
export const stubCount = (m) =>
  [...[...m.slices.values()].map((s) => s.md), m.readme].reduce((n, md) => n + stubLines(md).reduce((k, x) => k + x.items.length, 0), 0);

// ADR фичи, у которого в «Затрагивает slices:» этот slice: тема из «Р1 — ADR: <тема>» уже заведена.
const adrFor = (m, num) => m.featureAdrs.find((a) => ((header(a.md, 'Затрагивает slices') || '').match(/\b\d{3}\b/g) || []).includes(num));
// ADR, которые надо завести: «Р1 — ADR: <тема>» в slices, и ни один ADR фичи slice не затрагивает.
export function neededAdrs(m) {
  return [...m.slices.values()].filter((s) => reason(s.why) === '1' && adrTopic(s.why) && !adrFor(m, s.num)).map((s) => ({ num: s.num, topic: adrTopic(s.why) }));
}

export function checkCut(m) {
  const reg = registry(m);
  const files = [...[...m.slices.values()].map((s) => [s.file, s.md]), ...(m.readme != null ? [[m.readmeFile, m.readme]] : [])];
  for (const [file, md] of files) {
    checkIdTypos(file, md);
    for (const s of stubLines(md)) add('SL-37', file, s.n, s.items.map((x) => `«${x}»`).join(', '));
  }

  for (const sl of m.slices.values()) {
    const f = sl.file;
    const prep = /подготов/i.test(sl.type || '');
    if (sl.halves !== null) {
      const problem = halvesProblem(sl.halves, reg);
      if (problem) add(parseHalves(sl.halves).ok ? 'SL-33' : 'SL-32', f, headerLine(sl.md, 'Половины'), problem);
    }
    for (const l of sl.sc.lines.filter((x) => !x.inCode && /^##\s/.test(x.text))) {
      const svc = serviceOfHeading(l.h2);
      const bad = svc && !/^front/i.test(svc) ? unknownService(svc, reg) : null;
      if (bad) add('SL-33', f, l.n, bad);
    }

    const r = reason(sl.why);
    const whyLine = headerLine(sl.md, 'Почему отдельно');
    if (r === '1') {
      for (const num of adrNums(sl.why)) if (!m.adrs.some((a) => a.num === num)) add('SL-34', f, whyLine, `ADR-${num} нет в docs/adr`);
      const topic = adrTopic(sl.why);
      const a = topic && adrFor(m, sl.num);
      if (a) add('SL-38', f, whyLine, `«ADR: ${topic}» — ADR-${a.num} уже затрагивает slice ${sl.num}: впиши «Р1 — ждёт ADR-${a.num}»`);
      else if (topic) add('SL-38', f, whyLine, `нужен ADR «${topic}»`);
    }
    if (r === '2') {
      const live = sl.acs.filter((a) => !a.deleted);
      const most = Math.max(...['B', 'F'].map((side) => live.filter((a) => a.side === side).length));
      if (most <= 10) add('SL-35', f, whyLine, `«Почему отдельно: Р2», а в половинах не больше ${most} AC`);
    }
    const ids = [...sl.basis];
    if (ids.length && ids.every((id) => id.startsWith('NFR')) && !(sl.num === '001' && prep)) add('SL-36', f, headerLine(sl.md, 'Основание'), `«Основание: ${ids.join(', ')}» — только NFR`);
  }
}
