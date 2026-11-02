// План нарезки _work/plan.md: разбор и превью для человека в вопросе этапа. Проверки PL-* — в plan-rules.mjs.
import { adrNums, adrTopic, reason } from './cut.mjs';
import { rel, uniq, approved, scan, reqIds } from './md.mjs';
import { layers } from './readme.mjs';
import { parseHalves } from './services.mjs';

// План — временный артефакт этапа slices: агент пишет его, человек согласует, gen slices создаёт по нему файлы и удаляет его.
export const KEYS = ['Основание', 'Зависимости', 'Половины', 'Результат', 'Почему отдельно'];
// «## 002-comments — Комментарии в задаче», «## 002 — Комментарии в задаче», «## 002 Комментарии в задаче»
const HEAD = /^##\s+(\d{3})(?:-(\S+))?(?:\s+(?:[—–-]\s+)?(.+?))?\s*$/u;
const KV = /^\s*(?:[-*]\s+)?\**([А-ЯЁA-Z][^:*]{1,30}?)\**\s*:\s*\**\s*(.*)$/u;

const RU = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export function slugify(s) {
  const words = (s || '').toLowerCase().replace(/[а-яё]/g, (c) => RU[c]).replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  let out = '';
  for (const w of words) if (!out || out.length + w.length < 40) out = out ? `${out}-${w}` : w;
  return out;
}
const slugOf = (raw, title) => (raw && /^[a-z0-9][a-z0-9-]*$/i.test(raw) ? raw.toLowerCase() : slugify(raw) || slugify(title) || 'slice');

export function parsePlan(file, md) {
  if (md == null) return null;
  const sc = scan(md);
  const slices = [];
  const bad = [];
  let cur = null;
  for (const l of sc.lines) {
    if (l.inCode) continue;
    if (/^##\s/.test(l.text)) {
      const mm = l.text.trim().match(HEAD);
      cur = mm && mm[3] ? { num: mm[1], slugRaw: mm[2] || '', title: mm[3].trim(), n: l.n, head: {}, headN: {} } : null;
      if (cur) slices.push(cur);
      else bad.push({ n: l.n, text: l.text.trim() });
      continue;
    }
    const kv = cur && l.text.match(KV);
    if (kv && !(kv[1].trim() in cur.head)) {
      cur.head[kv[1].trim()] = kv[2].trim();
      cur.headN[kv[1].trim()] = l.n;
    }
  }
  for (const s of slices) {
    s.slug = slugOf(s.slugRaw, s.title);
    s.basisRaw = s.head['Основание'] ?? null;
    s.basis = new Set(reqIds(s.basisRaw));
    s.depsRaw = s.head['Зависимости'] ?? null;
    s.deps = /^(нет|—|-)?$/i.test((s.depsRaw || '').trim()) ? [] : uniq([...(s.depsRaw || '').matchAll(/\b\d{3}\b/g)].map((x) => x[0]));
    s.halves = s.head['Половины'] ?? null;
    s.result = s.head['Результат'] ?? null;
    s.why = s.head['Почему отдельно'] ?? null;
    // Тип можно не писать: без FR и NFR в «Основание» это подготовка (контракты), иначе поведение.
    const t = s.head['Тип'];
    s.type = t ? (/подготов/i.test(t) ? 'подготовка' : 'поведение') : s.basis.size ? 'поведение' : 'подготовка';
  }
  return { file, md, sc, slices, bad };
}

// slices, которые делят требование (без 001 «подготовка»: он ссылается на все FR через контракты).
export function sharedReqs(p) {
  const by = new Map();
  for (const s of p.slices) {
    if (s.num === '001' && s.type === 'подготовка') continue;
    for (const id of s.basis) by.set(id, [...(by.get(id) || []), s.num]);
  }
  return [...by].filter(([, nums]) => nums.length > 1);
}
export const nfrOnly = (s) => s.basis.size > 0 && [...s.basis].every((id) => id.startsWith('NFR'));

// «FR-1, FR-2, FR-3, FR-7» → «FR-1…FR-3, FR-7»: план читают в терминале.
export function compactIds(ids) {
  const groups = new Map();
  for (const id of ids) {
    const [pre, n] = [id.replace(/-\d+$/, ''), Number(id.split('-').pop())];
    groups.set(pre, [...(groups.get(pre) || []), n]);
  }
  const out = [];
  for (const [pre, ns] of [...groups].sort((a, b) => (a[0] === 'FR' ? -1 : b[0] === 'FR' ? 1 : a[0].localeCompare(b[0])))) {
    const sorted = uniq(ns).sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; ) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j += 1;
      out.push(j - i >= 2 ? `${pre}-${sorted[i]}…${pre}-${sorted[j]}` : sorted.slice(i, j + 1).map((x) => `${pre}-${x}`).join(', '));
      i = j + 1;
    }
  }
  return out.join(', ');
}

// План для человека: вложенный список, а не широкая таблица — терминал её переносит,
// а список читается одинаково и как текст, и как отрисованный markdown.
export function planPreview(m) {
  const p = m.plan;
  const order = layers(m, new Map(p.slices.map((s) => [s.num, s])))
    .map((l) => l.join(', '))
    .join(' → ');
  const out = [`План нарезки (${rel(p.file)}): ${p.slices.length} slices, порядок ${order}`, ''];
  for (const s of p.slices) {
    out.push(`- ${s.num} ${s.title} — ${s.type}${s.deps.length ? `, после ${s.deps.join(', ')}` : ''}`);
    if (s.basis.size) out.push(`  - Основание: ${compactIds([...s.basis])}`);
    const svc = parseHalves(s.halves).services;
    out.push(`  - Половины: ${svc.length ? svc.join(' + ') : s.halves || '—'}`);
    if (s.result) out.push(`  - Результат: ${s.result}`);
    if (reason(s.why)) {
      const adrs = adrNums(s.why).map((num) => m.adrs.find((a) => a.num === num)).filter(Boolean);
      const note = adrs.map((a) => `ADR-${a.num} «${a.status || '—'}»`).join(', ');
      out.push(`  - Почему отдельно: ${s.why.replace(/^(\**\s*)P/u, '$1Р')}${note ? ` (${note})` : ''}`);
    }
  }
  const all = m.spec ? [...m.spec.reqs.values()].filter((r) => !r.deleted).map((r) => r.id) : [];
  const covered = new Set(p.slices.flatMap((s) => [...s.basis]));
  if (all.length) out.push('', all.every((id) => covered.has(id)) ? `Покрыты все ${all.length} требований: ${compactIds(all)}.` : `Не покрыты: ${all.filter((id) => !covered.has(id)).join(', ')}.`);
  const notes = [
    ...sharedReqs(p).map(([id, ns]) => `${id} — в ${ns.join(' и ')}: склеить или описать границу`),
    ...p.slices.filter(nfrOnly).map((s) => `${s.num} — только NFR: склеить с путём, к которому он относится?`),
    ...p.slices.filter((s) => reason(s.why) === '1' && adrTopic(s.why)).map((s) => `${s.num} ждёт ADR «${adrTopic(s.why)}» — предложу написать после нарезки`),
    ...p.slices
      .filter((s) => reason(s.why) === '1')
      .flatMap((s) => adrNums(s.why).map((num) => [s, m.adrs.find((a) => a.num === num)]))
      .filter(([, a]) => a && approved(a.status))
      .map(([s, a]) => `${s.num} отделён по Р1, но ADR-${a.num} уже принят — часть его не ждёт: склеить?`),
    ...(p.slices.length > 6 ? [`${p.slices.length} slices — больше ориентира 3–6`] : []),
  ];
  if (notes.length) out.push('', 'Обратите внимание:', ...notes.map((x) => `- ${x}`));
  return out.join('\n');
}
