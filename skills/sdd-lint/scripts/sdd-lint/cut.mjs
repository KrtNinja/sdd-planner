// Нарезка slices: причины Р1–Р3 правдивы, сервисы из реестра, кириллица в ID, заготовки (SL-31…SL-38).
// @ts-check
import { finding } from './findings.mjs';
import { checkIdTypos } from './ids.mjs';
import { placeholders, scan, header, headerLine, uniq } from './md.mjs';
import { registry, parseHalves, halvesProblem, serviceOfHeading, unknownService } from './services.mjs';

/** @typedef {import('./model.mjs').Feature} Feature */

// «Р1 — ADR: доставка событий» — ADR ещё не заведён; «Р1 — ждёт ADR-0001» — заведён.
/** @param {string | null | undefined} why @returns {string | null} */
export const adrTopic = (why) => ((why || '').match(/ADR:\s*([^;()\n]+)/u)?.[1] || '').replace(/[«»"'.,\s]+$/u, '').replace(/^[«"']+/u, '').trim() || null;
/** @param {string | null | undefined} why @returns {string[]} */
export const adrNums = (why) => uniq([...(why || '').matchAll(/(?<![\p{L}\d-])ADR-(\d+)/gu)].map((x) => x[1].padStart(4, '0')));
/** @param {string | null | undefined} why @returns {string | null} */
export const reason = (why) => ((why || '').replace(/^\**\s*/, '').match(/^[РP]([123])(?!\d)/u) || [])[1] || null;

// Где в файле заготовки: [{ n, items }] — соседние строки одного раздела (AC, строка таблицы) одной группой.
/** @typedef {{ n: number, end: number, h2: string | null, items: string[] }} StubGroup */
/** @param {string | null | undefined} md @returns {{ n: number, items: string[] }[]} */
export function stubLines(md) {
  /** @type {StubGroup[]} */
  const out = [];
  /** @type {StubGroup | null} */
  let last = null;
  for (const l of scan((md || '').replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '))).lines) {
    const items = placeholders(l.text);
    if (!items.length) continue;
    if (last && last.h2 === l.h2 && l.n - last.end <= 2 && !l.text.trim().startsWith('|')) {
      last.items.push(...items);
      last.end = l.n;
    } else {
      last = { n: l.n, end: l.n, h2: l.h2, items: [...items] };
      out.push(last);
    }
  }
  return out.map(({ n, items }) => ({ n, items }));
}
/** @param {Feature} m */
export const stubCount = (m) =>
  [...[...m.slices.values()].map((s) => s.md), m.readme].reduce((n, md) => n + stubLines(md).reduce((k, x) => k + x.items.length, 0), 0);

// ADR фичи, у которого в «Затрагивает slices:» этот slice: тема из «Р1 — ADR: <тема>» уже заведена.
/** @param {Feature} m @param {string} num */
const adrFor = (m, num) =>
  m.featureAdrs.find((a) => /** @type {string[]} */ ((header(a.md, 'Затрагивает slices') || '').match(/\b\d{3}\b/g) || []).includes(num));
// ADR, которые надо завести: «Р1 — ADR: <тема>» в slices, и ни один ADR фичи slice не затрагивает.
/** @param {Feature} m */
export function neededAdrs(m) {
  return [...m.slices.values()].filter((s) => reason(s.why) === '1' && adrTopic(s.why) && !adrFor(m, s.num)).map((s) => ({ num: s.num, topic: adrTopic(s.why) }));
}

// Правило — { ids, check }: ids — какие ID из rules.mjs оно выдаёт, check — его находки массивом.
// Порядок находок: по каждому файлу (slices, README) опечатки в ID и заготовки, затем правила по каждому slice.
/** @typedef {import('./model.mjs').Finding} Finding */
/** @typedef {import('./model.mjs').Slice} Slice */
/**
 * @typedef {{ m: Feature, reg: import('./model.mjs').Registry | null }} CutContext
 * @typedef {{ ids: string[], check: (file: string, md: string) => Finding[] }} FileRule
 * @typedef {{ ids: string[], check: (sl: Slice, c: CutContext) => Finding[] }} CutRule
 */

/** @type {FileRule[]} */
const CUT_FILE = [
  { ids: ['SL-31'], check: checkIdTypos },
  { ids: ['SL-37'], check: (file, md) => stubLines(md).map((s) => finding('SL-37', file, s.n, s.items.map((x) => `«${x}»`).join(', '))) },
];

// SL-33: сервис в заголовке «## <сервис>: …» — из реестра (фронтенд не проверяем).
/** @param {Slice} sl @param {CutContext} c */
function headingServices(sl, { reg }) {
  return sl.sc.lines
    .filter((x) => !x.inCode && /^##\s/.test(x.text))
    .flatMap((l) => {
      const svc = serviceOfHeading(l.h2);
      const bad = svc && !/^front/i.test(svc) ? unknownService(svc, reg) : null;
      return bad ? [finding('SL-33', sl.file, l.n, bad)] : [];
    });
}
// SL-34 / SL-38: Р1 ссылается на заведённый ADR; «Р1 — ADR: <тема>» — ADR ещё нужен или уже заведён.
/** @param {Slice} sl @param {CutContext} c */
function adrReason(sl, { m }) {
  if (reason(sl.why) !== '1') return [];
  const whyLine = headerLine(sl.md, 'Почему отдельно');
  const missing = adrNums(sl.why)
    .filter((num) => !m.adrs.some((a) => a.num === num))
    .map((num) => finding('SL-34', sl.file, whyLine, `ADR-${num} нет в docs/adr`));
  const topic = adrTopic(sl.why);
  if (!topic) return missing;
  const a = adrFor(m, sl.num);
  const msg = a ? `«ADR: ${topic}» — ADR-${a.num} уже затрагивает slice ${sl.num}: впиши «Р1 — ждёт ADR-${a.num}»` : `нужен ADR «${topic}»`;
  return [...missing, finding('SL-38', sl.file, whyLine, msg)];
}
// SL-35: Р2 (объём) правдив — в одной из половин больше 10 живых AC.
/** @param {Slice} sl */
function volumeReason(sl) {
  if (reason(sl.why) !== '2') return [];
  const live = sl.acs.filter((a) => !a.deleted);
  const most = Math.max(...['B', 'F'].map((side) => live.filter((a) => a.side === side).length));
  return most <= 10 ? [finding('SL-35', sl.file, headerLine(sl.md, 'Почему отдельно'), `«Почему отдельно: Р2», а в половинах не больше ${most} AC`)] : [];
}

/** @type {CutRule[]} */
const CUT_SLICE = [
  {
    // SL-32 / SL-33: «Половины» разбираются и называют сервисы из реестра.
    ids: ['SL-32', 'SL-33'],
    check: (sl, { reg }) => {
      const problem = sl.halves !== null && halvesProblem(sl.halves, reg);
      return problem ? [finding(parseHalves(sl.halves).ok ? 'SL-33' : 'SL-32', sl.file, headerLine(sl.md, 'Половины'), problem)] : [];
    },
  },
  { ids: ['SL-33'], check: headingServices },
  { ids: ['SL-34', 'SL-38'], check: adrReason },
  { ids: ['SL-35'], check: volumeReason },
  {
    // SL-36: slice только из NFR — кроме 001 «подготовка».
    ids: ['SL-36'],
    check: (sl) => {
      const ids = [...sl.basis];
      const prep001 = sl.num === '001' && /подготов/i.test(sl.type || '');
      if (!ids.length || !ids.every((id) => id.startsWith('NFR')) || prep001) return [];
      return [finding('SL-36', sl.file, headerLine(sl.md, 'Основание'), `«Основание: ${ids.join(', ')}» — только NFR`)];
    },
  },
];

/** @param {Feature} m @returns {Finding[]} */
export function checkCut(m) {
  const files = [...[...m.slices.values()].map((s) => [s.file, s.md]), ...(m.readme != null ? [[m.readmeFile, m.readme]] : [])];
  const c = { m, reg: registry(m) };
  return [
    ...files.flatMap(([file, md]) => CUT_FILE.flatMap((r) => r.check(file, md))),
    ...[...m.slices.values()].flatMap((sl) => CUT_SLICE.flatMap((r) => r.check(sl, c))),
  ];
}
