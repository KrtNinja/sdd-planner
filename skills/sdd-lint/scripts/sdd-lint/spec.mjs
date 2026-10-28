// Dev Spec: разбор и проверки SP-*.
import { parseData, mentionsData, unknownNames } from './data.mjs';
import { add } from './findings.mjs';
import {
  uniq, approved, noneText, scan, isH2, inSection, sectionText, header, headerLine, tables, REQ_RE, numbers,
  word,
} from './md.mjs';
import { hasProtocolTraces, protoHref, parseSources } from './sources.mjs';

const SPEC_STOP_WORDS = [
  ['эндпоинт', word('эндпоинт\\p{L}*|endpoint\\p{L}*')],
  ['БД / база данных', word('бд|баз\\p{L}* данных|database')],
  ['технология', word('kafka|rabbitmq|redis|postgres\\p{L}*|postgresql|mysql|mongo\\p{L}*|elastic\\p{L}*|outbox|websocket\\p{L}*|grpc|graphql')],
  ['формат данных', word('json|yaml|xml|sql|utf-?8|bom|base64')],
  ['хранилище или очередь', word('s3|minio|очеред\\p{L}*|брокер\\p{L}*|кэш\\p{L}*|cache')],
  ['HTTP', word('http|rest|get|post|put|patch|delete')],
  ['имя файла', /[\w-]+\.(?:ts|tsx|js|mjs|py|java|kt|go|cs|yaml|yml|json|sql)\b/],
];

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

const BOUND_RE = /(не длиннее|не короче|не больше|не более|не меньше|не менее|не позже|не раньше|максимум|минимум|до|от|≤|≥|<=|>=)\s+(\d+)(?![.,]\d)/giu;
export function checkSpec(m) {
  const s = m.spec;
  if (!s) return;
  if (!s.status) add('SP-01', s.file, 1, 'нет строки «Статус:»');
  for (const o of s.outside) add('SP-02', s.file, o.n, `${o.id} вне блока кода`);
  for (const d of s.dups) add('SP-03', s.file, d.n, `${d.id} определён повторно`);
  for (const mb of s.multi) add('SP-19', s.file, mb.n, `в блоке кода ${mb.ids.length} требования: ${mb.ids.join(', ')}`);
  if (s.reqs.size === 0) add('SP-04', s.file, null, 'не найдено ни одного FR/NFR в блоках кода');

  for (const l of s.sc.lines) {
    if (l.h2 && /^(Трассировка|Не про поведение)/.test(l.h2)) continue;
    if (/^Протокол:/.test(l.text)) continue;
    for (const [label, re] of SPEC_STOP_WORDS) {
      const mm = l.text.match(re);
      if (mm) add('SP-05', s.file, l.n, `«${mm[0]}» — ${label} в Dev Spec`);
    }
  }

  const open = sectionText(s.sc, /^Открытые вопросы/);
  if (open && !noneText(open)) {
    if (approved(s.status)) add('SP-06', s.file, null, 'статус «одобрено», но есть открытые вопросы');
    else add('SP-07', s.file, null, 'есть открытые вопросы');
  }

  // числа из рекомендаций агента, которых человек не выбирал
  const p = m.protocol;
  const decided = new Set();
  const recOnly = new Map();
  if (p) {
    for (const r of [...p.rows, ...p.post]) for (const x of numbers(r.dec)) decided.add(x);
    for (const r of p.rows) for (const x of numbers(r.rec)) if (!numbers(r.dec).includes(x)) recOnly.set(x, r.id);
  }

  for (const r of s.reqs.values()) {
    if (r.deleted) continue;
    const isNfr = r.id.startsWith('NFR');
    const body = r.text.replace(REQ_RE, ' ');
    if (!isNfr) {
      if (!/Пример/.test(r.text)) add('SP-08', s.file, r.n, `${r.id} без «Пример:»`);
      else if ((s.data.people.length || s.data.objects.size) && !mentionsData(r.text, s.data))
        add('SP-09', s.file, r.n, `${r.id}: в примере нет персонажа или объекта из «Данные для примеров»`);
      const nums = numbers(body).map((x) => Number(x.replace(',', '.')));
      for (const mm of body.matchAll(BOUND_RE)) {
        const n = Number(mm[2]);
        if (n < 2) continue;
        if (!nums.includes(n + 1) && !nums.includes(n - 1)) add('SP-11', s.file, r.n, `${r.id}: «${mm[0]}» без парного значения ${n + 1} (или ${n - 1})`);
      }
    } else if (!numbers(body).length) add('SP-10', s.file, r.n, `${r.id} без числа`);
    else if (p && p.rows.length) for (const x of uniq(numbers(body))) if (!decided.has(x)) add('SP-20', s.file, r.n, `${r.id}: числа ${x} нет в решениях протокола`);
    for (const x of uniq(numbers(body))) {
      if (Number(x.replace(',', '.')) >= 10 && recOnly.has(x) && !decided.has(x))
        add('SP-12', s.file, r.n, `${r.id}: число ${x} есть только в рекомендации агента (строка #${recOnly.get(x)} протокола)`);
    }
    for (const nm of unknownNames(r.text, s.data)) add('SP-18', s.file, r.n, `${r.id}: «${nm}» нет в «Данные для примеров»`);
  }

  // откуда пришло: каждая строка протокола куда-то ушла, у каждого требования есть источник
  if (!p) {
    if (hasProtocolTraces(s.md)) add('SP-21', s.file, s.sources[0]?.n || headerLine(s.md, 'Протокол'), 'протокола нет, а spec на него ссылается');
    return;
  }
  if (s.oldTraceLine) {
    add('SP-13', s.file, s.oldTraceLine, 'раздел «Трассировка» — старый формат');
    return;
  }
  const byId = new Map([...p.rows, ...p.post].map((r) => [r.id, r]));
  const traced = new Set();
  const sourced = new Set();
  for (const src of s.sources) {
    if (!src.target) add('SP-17', s.file, src.n, '«Из протокола:» не относится ни к требованию, ни к разделу');
    else if (src.target.kind === 'req') for (const id of src.target.ids) sourced.add(id);
    if (!src.refs.length) add('SP-15', s.file, src.n, 'после «Из протокола:» нет номеров строк');
    const plain = [];
    const stale = [];
    for (const r of src.refs) {
      const row = byId.get(r.id);
      if (!row) {
        add('SP-15', s.file, src.n, `строки ${r.id} нет в протоколе`);
        continue;
      }
      traced.add(r.id);
      if (!r.href) plain.push(r.id);
      else if (r.href !== protoHref(s.file, p.file, row)) stale.push(r.id);
    }
    if (plain.length) add('SP-21', s.file, src.n, `не ссылки: ${plain.join(', ')}`);
    if (stale.length) add('SP-21', s.file, src.n, `ссылки ведут не на ту строку протокола: ${stale.join(', ')}`);
  }
  for (const r of [...p.rows, ...p.post]) if (!traced.has(r.id)) add('SP-14', p.file, r.n, `строка #${r.id} не указана ни в одном «Из протокола:» в spec.md`);
  for (const r of s.reqs.values()) if (!r.deleted && !sourced.has(r.id)) add('SP-16', s.file, r.n, `${r.id}: под блоком нет «Из протокола:»`);
}
