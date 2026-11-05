// Правила SP-* по Dev Spec: spec целиком, каждое требование, связь с протоколом — списками { ids, check }.
// @ts-check
import { mentionsData, unknownNames } from './data.mjs';
import { finding, noStatus } from './findings.mjs';
import { uniq, approved, noneText, sectionText, headerLine, REQ_RE, numbers, word } from './md.mjs';
import { hasProtocolTraces, protoHref } from './sources.mjs';

// Правило — { ids, check }: ids — какие ID из rules.mjs оно выдаёт, check — его находки массивом.
// Порядок правил — порядок находок: spec целиком, затем каждое живое требование, затем связь с протоколом.
/** @typedef {import('./model.mjs').Finding} Finding */
/** @typedef {import('./model.mjs').Spec} Spec */
/** @typedef {import('./model.mjs').Req} Req */
/** @typedef {import('./model.mjs').SourceLine} Source */
/** @typedef {import('./model.mjs').Feature} Feature */
/** @typedef {import('./model.mjs').Protocol} Protocol */
/**
 * @typedef {{ m: Feature, s: Spec, p: Protocol | null, decided: Set<string>, recOnly: Map<string, string>,
 *   byId: Map<string, Protocol['rows'][number] | Protocol['post'][number]> }} SpecContext
 * @typedef {{ ids: string[], check: (c: SpecContext) => Finding[] }} SpecRule
 * @typedef {{ ids: string[], check: (r: Req, c: SpecContext) => Finding[] }} ReqRule
 * @typedef {SpecContext & { p: Protocol }} TraceContext связь с протоколом проверяется, только когда он есть
 * @typedef {{ ids: string[], check: (src: Source, c: TraceContext) => Finding[] }} SourceRule
 * @typedef {{ ids: string[], check: (c: TraceContext) => Finding[] }} TraceRule
 */

const SPEC_STOP_WORDS = [
  ['эндпоинт', word('эндпоинт\\p{L}*|endpoint\\p{L}*')],
  ['БД / база данных', word('бд|баз\\p{L}* данных|database')],
  ['технология', word('kafka|rabbitmq|redis|postgres\\p{L}*|postgresql|mysql|mongo\\p{L}*|elastic\\p{L}*|outbox|websocket\\p{L}*|grpc|graphql')],
  ['формат данных', word('json|yaml|xml|sql|utf-?8|bom|base64')],
  ['хранилище или очередь', word('s3|minio|очеред\\p{L}*|брокер\\p{L}*|кэш\\p{L}*|cache')],
  ['HTTP', word('http|rest|get|post|put|patch|delete')],
  // имена файлов и пути — CD-01, ошибкой
];
const BOUND_RE = /(не длиннее|не короче|не больше|не более|не меньше|не менее|не позже|не раньше|максимум|минимум|до|от|≤|≥|<=|>=)\s+(\d+)(?![.,]\d)/giu;

// Числа из протокола: decided — в решениях человека, recOnly — только в рекомендации агента (число → номер строки).
/** @param {Feature} m @param {Spec} s @returns {SpecContext} */
function specContext(m, s) {
  const p = m.protocol;
  /** @type {Set<string>} */
  const decided = new Set();
  /** @type {Map<string, string>} */
  const recOnly = new Map();
  if (p) {
    for (const r of [...p.rows, ...p.post]) for (const x of numbers(r.dec)) decided.add(x);
    for (const r of p.rows) for (const x of numbers(r.rec)) if (!numbers(r.dec).includes(x)) recOnly.set(x, r.id);
  }
  const byId = new Map(p ? [...p.rows, ...p.post].map((r) => [r.id, r]) : []);
  return { m, s, p, decided, recOnly, byId };
}

// --- spec целиком ---
// SP-05: слова реализации вне «Трассировка», «Не про поведение» и строки «Протокол:».
/** @param {SpecContext} c */
function stopWords({ s }) {
  return s.sc.lines
    .filter((l) => !(l.h2 && /^(Трассировка|Не про поведение)/.test(l.h2)) && !/^Протокол:/.test(l.text))
    .flatMap((l) =>
      SPEC_STOP_WORDS.flatMap(([label, re]) => {
        const mm = l.text.match(re);
        return mm ? [finding('SP-05', s.file, l.n, `«${mm[0]}» — ${label} в требованиях`)] : [];
      }),
    );
}
// SP-06 / SP-07: открытые вопросы — ошибка у одобренной spec, напоминание у остальных.
/** @param {SpecContext} c */
function openQuestions({ s }) {
  const open = sectionText(s.sc, /^Открытые вопросы/);
  if (!open || noneText(open)) return [];
  if (approved(s.status)) return [finding('SP-06', s.file, null, 'статус «одобрено», но есть открытые вопросы')];
  return [finding('SP-07', s.file, null, 'есть открытые вопросы')];
}

/** @type {SpecRule[]} */
const SPEC = [
  { ids: ['SP-01'], check: ({ s }) => noStatus('SP-01', s.file, s.status) },
  { ids: ['SP-02'], check: ({ s }) => s.outside.map((o) => finding('SP-02', s.file, o.n, `${o.id} вне блока кода`)) },
  { ids: ['SP-03'], check: ({ s }) => s.dups.map((d) => finding('SP-03', s.file, d.n, `${d.id} определён повторно`)) },
  {
    ids: ['SP-19'],
    check: ({ s }) => s.multi.map((mb) => finding('SP-19', s.file, mb.n, `в блоке кода ${mb.ids.length} требования: ${mb.ids.join(', ')}`)),
  },
  { ids: ['SP-04'], check: ({ s }) => (s.reqs.size ? [] : [finding('SP-04', s.file, null, 'не найдено ни одного FR/NFR в блоках кода')]) },
  { ids: ['SP-05'], check: stopWords },
  { ids: ['SP-06', 'SP-07'], check: openQuestions },
];

// --- каждое требование ---
const isNfr = (/** @type {Req} */ r) => r.id.startsWith('NFR');
const bodyOf = (/** @type {Req} */ r) => r.text.replace(REQ_RE, ' ');

// SP-08 / SP-09: у FR есть «Пример:», и он опирается на «Данные для примеров».
/** @param {Req} r @param {SpecContext} c */
function example(r, { s }) {
  if (!/Пример/.test(r.text)) return [finding('SP-08', s.file, r.n, `${r.id} без «Пример:»`)];
  if (!(s.data.people.length || s.data.objects.size) || mentionsData(r.text, s.data)) return [];
  return [finding('SP-09', s.file, r.n, `${r.id}: в примере нет персонажа или объекта из «Данные для примеров»`)];
}
// SP-11: у границы «не больше N» есть парное значение N+1 или N−1.
/** @param {Req} r @param {SpecContext} c */
function boundPairs(r, { s }) {
  const body = bodyOf(r);
  const nums = numbers(body).map((x) => Number(x.replace(',', '.')));
  return [...body.matchAll(BOUND_RE)]
    .filter((mm) => Number(mm[2]) >= 2 && !nums.includes(Number(mm[2]) + 1) && !nums.includes(Number(mm[2]) - 1))
    .map((mm) => finding('SP-11', s.file, r.n, `${r.id}: «${mm[0]}» без парного значения ${Number(mm[2]) + 1} (или ${Number(mm[2]) - 1})`));
}
// SP-10 / SP-20: в NFR есть число, и оно из решений протокола.
/** @param {Req} r @param {SpecContext} c */
function nfrNumbers(r, { s, p, decided }) {
  const nums = numbers(bodyOf(r));
  if (!nums.length) return [finding('SP-10', s.file, r.n, `${r.id} без числа`)];
  if (!p?.rows.length) return [];
  return uniq(nums).filter((x) => !decided.has(x)).map((x) => finding('SP-20', s.file, r.n, `${r.id}: числа ${x} нет в решениях протокола`));
}
// SP-12: число от 10 есть только в рекомендации агента, человек его не выбирал.
/** @param {Req} r @param {SpecContext} c */
function agentNumbers(r, { s, decided, recOnly }) {
  return uniq(numbers(bodyOf(r)))
    .filter((x) => Number(x.replace(',', '.')) >= 10 && recOnly.has(x) && !decided.has(x))
    .map((x) => finding('SP-12', s.file, r.n, `${r.id}: число ${x} есть только в рекомендации агента (строка #${recOnly.get(x)} протокола)`));
}

/** @type {ReqRule[]} */
const REQ = [
  { ids: ['SP-08', 'SP-09'], check: (r, c) => (isNfr(r) ? [] : example(r, c)) },
  { ids: ['SP-11'], check: (r, c) => (isNfr(r) ? [] : boundPairs(r, c)) },
  { ids: ['SP-10', 'SP-20'], check: (r, c) => (isNfr(r) ? nfrNumbers(r, c) : []) },
  { ids: ['SP-12'], check: agentNumbers },
  {
    ids: ['SP-18'],
    check: (r, { s }) => unknownNames(r.text, s.data).map((nm) => finding('SP-18', s.file, r.n, `${r.id}: «${nm}» нет в «Данные для примеров»`)),
  },
];

// --- связь с протоколом: каждая строка протокола куда-то ушла, у каждого требования есть источник ---
// SP-21: номера в «Из протокола:» — ссылки, и ведут на нужную строку протокола.
/** @param {Source} src @param {TraceContext} c */
function refLinks(src, { s, p, byId }) {
  const known = src.refs.filter((r) => byId.has(r.id));
  const plain = known.filter((r) => !r.href).map((r) => r.id);
  const stale = known.filter((r) => r.href && r.href !== protoHref(s.file, p.file, /** @type {{ n: number }} */ (byId.get(r.id)))).map((r) => r.id);
  return [
    ...(plain.length ? [finding('SP-21', s.file, src.n, `не ссылки: ${plain.join(', ')}`)] : []),
    ...(stale.length ? [finding('SP-21', s.file, src.n, `ссылки ведут не на ту строку протокола: ${stale.join(', ')}`)] : []),
  ];
}

/** @type {SourceRule[]} */
const SOURCE = [
  {
    ids: ['SP-17'],
    check: (src, { s }) => (src.target ? [] : [finding('SP-17', s.file, src.n, '«Из протокола:» не относится ни к требованию, ни к разделу')]),
  },
  { ids: ['SP-15'], check: (src, { s }) => (src.refs.length ? [] : [finding('SP-15', s.file, src.n, 'после «Из протокола:» нет номеров строк')]) },
  {
    ids: ['SP-15'],
    check: (src, { s, byId }) => src.refs.filter((r) => !byId.has(r.id)).map((r) => finding('SP-15', s.file, src.n, `строки ${r.id} нет в протоколе`)),
  },
  { ids: ['SP-21'], check: refLinks },
];

/** @param {TraceContext} c */
function lostRows({ s, p, byId }) {
  const traced = new Set(s.sources.flatMap((src) => src.refs.map((r) => r.id)).filter((id) => byId.has(id)));
  return [...p.rows, ...p.post]
    .filter((r) => !traced.has(r.id))
    .map((r) => finding('SP-14', p.file, r.n, `строка #${r.id} не указана ни в одном «Из протокола:» в spec.md`));
}
/** @param {SpecContext} c */
function unsourced({ s }) {
  const sourced = new Set(s.sources.flatMap((src) => (src.target?.kind === 'req' ? src.target.ids : [])));
  return [...s.reqs.values()]
    .filter((r) => !r.deleted && !sourced.has(r.id))
    .map((r) => finding('SP-16', s.file, r.n, `${r.id}: под блоком нет «Из протокола:»`));
}

/** @type {TraceRule[]} */
const TRACE = [
  { ids: ['SP-14'], check: lostRows },
  { ids: ['SP-16'], check: unsourced },
];

// Без протокола и при старом разделе «Трассировка» связь не проверяем: сначала нужен протокол или fix.
/** @param {SpecContext} c @returns {Finding[]} */
function traceFindings(c) {
  const { s, p } = c;
  if (!p) {
    if (!hasProtocolTraces(s.md)) return [];
    return [finding('SP-21', s.file, s.sources[0]?.n || headerLine(s.md, 'Протокол'), 'протокола нет, а spec на него ссылается')];
  }
  if (s.oldTraceLine) return [finding('SP-13', s.file, s.oldTraceLine, 'раздел «Трассировка» — старый формат')];
  const t = { ...c, p };
  return [...s.sources.flatMap((src) => SOURCE.flatMap((r) => r.check(src, t))), ...TRACE.flatMap((r) => r.check(t))];
}

/** @param {Feature} m @returns {Finding[]} */
export function checkSpec(m) {
  if (!m.spec) return [];
  const c = specContext(m, m.spec);
  const live = [...c.s.reqs.values()].filter((r) => !r.deleted);
  return [...SPEC.flatMap((r) => r.check(c)), ...live.flatMap((req) => REQ.flatMap((r) => r.check(req, c))), ...traceFindings(c)];
}
