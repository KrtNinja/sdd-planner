// План нарезки _work/plan.md: разбор и превью для человека в вопросе этапа. Проверки PL-* — в plan-rules.mjs.
// @ts-check
import { adrNums, adrTopic, reason } from './cut.mjs';
import { rel, uniq, approved, scan, reqIds, depNums } from './md.mjs';
import { layers } from './readme.mjs';
import { parseHalves } from './services.mjs';

/** @typedef {import('./model.mjs').Feature} Feature */
/** @typedef {import('./model.mjs').Plan} Plan */
/** @typedef {import('./model.mjs').PlanSlice} PlanSlice */
/** @typedef {Pick<PlanSlice, 'num' | 'slugRaw' | 'title' | 'n' | 'head' | 'headN'>} PlanHead */

// План — временный артефакт этапа slices: агент пишет его, человек согласует, gen slices создаёт по нему файлы и удаляет его.
export const KEYS = ['Основание', 'Зависимости', 'Половины', 'Результат', 'Почему отдельно'];
// «## 002-comments — Комментарии в задаче», «## 002 — Комментарии в задаче», «## 002 Комментарии в задаче»
const HEAD = /^##\s+(\d{3})(?:-(\S+))?(?:\s+(?:[—–-]\s+)?(.+?))?\s*$/u;
const KV = /^\s*(?:[-*]\s+)?\**([А-ЯЁA-Z][^:*]{1,30}?)\**\s*:\s*\**\s*(.*)$/u;

/** @type {Record<string, string>} */
const RU = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};
/** @param {string | null | undefined} s */
export function slugify(s) {
  const words = (s || '').toLowerCase().replace(/[а-яё]/g, (c) => RU[c]).replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  let out = '';
  for (const w of words) if (!out || out.length + w.length < 40) out = out ? `${out}-${w}` : w;
  return out;
}
/** @param {string} raw @param {string} title */
const slugOf = (raw, title) => (raw && /^[a-z0-9][a-z0-9-]*$/i.test(raw) ? raw.toLowerCase() : slugify(raw) || slugify(title) || 'slice');

// Тип можно не писать: без FR и NFR в «Основание» это подготовка (контракты), иначе поведение.
/** @param {string | undefined} t @param {Set<string>} basis @returns {PlanSlice['type']} */
function typeOf(t, basis) {
  if (t) return /подготов/i.test(t) ? 'подготовка' : 'поведение';
  return basis.size ? 'поведение' : 'подготовка';
}
// Раздел плана: поля slice из строк «Ключ: значение».
/** @param {PlanHead} h @returns {PlanSlice} */
function planSlice(h) {
  const basisRaw = h.head['Основание'] ?? null;
  const basis = new Set(reqIds(basisRaw));
  return {
    ...h,
    slug: slugOf(h.slugRaw, h.title),
    basisRaw,
    basis,
    deps: depNums(h.head['Зависимости']),
    halves: h.head['Половины'] ?? null,
    result: h.head['Результат'] ?? null,
    why: h.head['Почему отдельно'] ?? null,
    type: typeOf(h.head['Тип'], basis),
  };
}

/** @param {import('./model.mjs').Line} l @returns {PlanHead | null} */
function parseHead(l) {
  const mm = l.text.trim().match(HEAD);
  return mm && mm[3] ? { num: mm[1], slugRaw: mm[2] || '', title: mm[3].trim(), n: l.n, head: {}, headN: {} } : null;
}

/** @param {PlanHead} cur @param {import('./model.mjs').Line} l */
function readField(cur, l) {
  const kv = l.text.match(KV);
  if (kv && !(kv[1].trim() in cur.head)) {
    cur.head[kv[1].trim()] = kv[2].trim();
    cur.headN[kv[1].trim()] = l.n;
  }
}

/** @param {string} file @param {string | null | undefined} md @returns {Plan | null} */
export function parsePlan(file, md) {
  if (md == null) return null;
  const sc = scan(md);
  /** @type {PlanHead[]} */
  const heads = [];
  /** @type {Plan['bad']} */
  const bad = [];
  /** @type {PlanHead | null} */
  let cur = null;
  for (const l of sc.lines) {
    if (l.inCode) continue;
    if (/^##\s/.test(l.text)) {
      cur = parseHead(l);
      if (cur) heads.push(cur);
      else bad.push({ n: l.n, text: l.text.trim() });
      continue;
    }
    if (!cur) continue;
    readField(cur, l);
  }
  return { file, md, sc, slices: heads.map(planSlice), bad };
}

// slices, которые делят требование (без 001 «подготовка»: он ссылается на все FR через контракты).
/** @param {Plan} p @returns {[string, string[]][]} */
export function sharedReqs(p) {
  /** @type {Map<string, string[]>} */
  const by = new Map();
  for (const s of p.slices) {
    if (s.num === '001' && s.type === 'подготовка') continue;
    for (const id of s.basis) by.set(id, [...(by.get(id) || []), s.num]);
  }
  return [...by].filter(([, nums]) => nums.length > 1);
}
/** @param {PlanSlice} s */
export const nfrOnly = (s) => s.basis.size > 0 && [...s.basis].every((id) => id.startsWith('NFR'));

// Порядок групп ID: FR первым (пустая строка раньше любой), остальные (NFR…) — по алфавиту.
/** @param {string} pre */
const groupKey = (pre) => (pre === 'FR' ? '' : pre);
// «FR-1, FR-2, FR-3, FR-7» → «FR-1…FR-3, FR-7»: план читают в терминале.
/** @param {string[]} ids */
export function compactIds(ids) {
  /** @type {Map<string, number[]>} */
  const groups = new Map();
  for (const id of ids) {
    const [pre, n] = [id.replace(/-\d+$/, ''), Number(id.split('-').pop())];
    groups.set(pre, [...(groups.get(pre) || []), n]);
  }
  const out = [];
  for (const [pre, ns] of [...groups].sort((a, b) => groupKey(a[0]).localeCompare(groupKey(b[0])))) {
    const sorted = uniq(ns).sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; ) {
      let j = i;
      // За концом массива undefined: сравнение само останавливает цикл.
      while (sorted[j + 1] === sorted[j] + 1) j += 1;
      out.push(j - i >= 2 ? `${pre}-${sorted[i]}…${pre}-${sorted[j]}` : sorted.slice(i, j + 1).map((x) => `${pre}-${x}`).join(', '));
      i = j + 1;
    }
  }
  return out.join(', ');
}

// Slice в превью плана: строка с типом и зависимостями, под ней — основание, половины, результат, причина.
/** @param {Feature} m @param {PlanSlice} s */
function previewSlice(m, s) {
  const out = [`- ${s.num} ${s.title} — ${s.type}${s.deps.length ? `, после ${s.deps.join(', ')}` : ''}`];
  if (s.basis.size) out.push(`  - Основание: ${compactIds([...s.basis])}`);
  const svc = parseHalves(s.halves).services;
  out.push(`  - Половины: ${svc.length ? svc.join(' + ') : s.halves || '—'}`);
  if (s.result) out.push(`  - Результат: ${s.result}`);
  if (reason(s.why)) out.push(whyLine(m, /** @type {string} */ (s.why)));
  return out;
}
// «Почему отдельно» в превью: причина с кириллической Р и статусы ADR, на которые она ссылается.
/** @param {Feature} m @param {string} why */
function whyLine(m, why) {
  const adrs = adrNums(why).map((num) => m.adrs.find((a) => a.num === num)).filter((a) => a !== undefined);
  const note = adrs.map((a) => `ADR-${a.num} «${a.status || '—'}»`).join(', ');
  return `  - Почему отдельно: ${why.replace(/^(\**\s*)P/u, '$1Р')}${note ? ` (${note})` : ''}`;
}

// План для человека: вложенный список, а не широкая таблица — терминал её переносит,
// а список читается одинаково и как текст, и как отрисованный markdown.
/** @param {Feature & { plan: Plan }} m */
export function planPreview(m) {
  const p = m.plan;
  const order = layers(m, new Map(p.slices.map((s) => [s.num, s])))
    .map((l) => l.join(', '))
    .join(' → ');
  const out = [`План нарезки (${rel(p.file)}): ${p.slices.length} slices, порядок ${order}`, ''];
  for (const s of p.slices) out.push(...previewSlice(m, s));
  const all = m.spec ? [...m.spec.reqs.values()].filter((r) => !r.deleted).map((r) => r.id) : [];
  const covered = new Set(p.slices.flatMap((s) => [...s.basis]));
  if (all.length)
    out.push(
      '',
      all.every((id) => covered.has(id))
        ? `Покрыты все ${all.length} требований: ${compactIds(all)}.`
        : `Не покрыты: ${all.filter((id) => !covered.has(id)).join(', ')}.`,
    );
  const notes = [
    ...sharedReqs(p).map(([id, ns]) => `${id} — в ${ns.join(' и ')}: склеить или описать границу`),
    ...p.slices.filter(nfrOnly).map((s) => `${s.num} — только NFR: склеить с путём, к которому он относится?`),
    ...p.slices.filter((s) => reason(s.why) === '1' && adrTopic(s.why)).map((s) => `${s.num} ждёт ADR «${adrTopic(s.why)}» — предложу написать после нарезки`),
    ...p.slices
      .filter((s) => reason(s.why) === '1')
      .flatMap((s) => adrNums(s.why).map((num) => /** @type {const} */ ([s, m.adrs.find((a) => a.num === num)])))
      .filter(/** @returns {x is readonly [PlanSlice, import('./model.mjs').Adr]} */ (x) => !!x[1] && approved(x[1].status))
      .map(([s, a]) => `${s.num} отделён по Р1, но ADR-${a.num} уже принят — часть его не ждёт: склеить?`),
    ...(p.slices.length > 6 ? [`${p.slices.length} slices — больше ориентира 3–6`] : []),
  ];
  if (notes.length) out.push('', 'Обратите внимание:', ...notes.map((x) => `- ${x}`));
  return out.join('\n');
}
