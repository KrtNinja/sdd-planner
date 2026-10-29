// Slices: разбор файлов NNN-*.md и проверки SL-*.
import path from 'node:path';

import { unknownNames } from './data.mjs';
import { add } from './findings.mjs';
import { CHECKS_RE, reqRefs, BASIS_LINK_RE, specFileHref, staleReqLinks } from './links.mjs';
import {
  read, rel, uniq, approved, noneText, scan, sectionText, header, headerLine, reqIds, quotes, word,
} from './md.mjs';
import { coverage, checkReadme } from './readme.mjs';
import { underBlocks } from './sources.mjs';

const AC_STOP_WORDS = [
  ['мок или заглушка', word('мок\\p{L}*|mock\\p{L}*|stub\\p{L}*|заглушк\\p{L}*|фикстур\\p{L}*|fixture\\p{L}*')],
  ['стенд', word('стенд\\p{L}*')],
  ['класс', word('класс\\p{L}*')],
  ['«через сервис»', word('через сервис\\p{L}*')],
  // имена файлов и пути — CD-01, ошибкой
  ['имя класса', /\b[A-Z][a-z]+[A-Z][A-Za-z]*\b/],
];

const AC_LINE = /^\s*(AC-(\d{3})-([BF]?)(\d+))\b(.*)$/;
export function parseSlice(file, md) {
  const sc = scan(md);
  const num = path.basename(file).slice(0, 3);
  const basisRaw = header(md, 'Основание') ?? '';
  const depsRaw = header(md, 'Зависимости') ?? '';
  const acs = [];
  const outside = [];
  const multi = [];
  const checks = underBlocks(sc, CHECKS_RE);
  for (const b of sc.blocks) {
    const idLines = b.lines.filter((l) => AC_LINE.test(l.text));
    if (idLines.length > 1) multi.push({ n: b.start, count: idLines.length });
    for (const l of idLines) {
      const [, id, acNum, side, k, rest] = l.text.match(AC_LINE);
      acs.push({
        id,
        acNum,
        side,
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
  for (const l of sc.lines) if (!l.inCode && AC_LINE.test(l.text)) outside.push({ id: l.text.match(AC_LINE)[1], n: l.n });
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
    outside,
    multi,
  };
}

const KW = /^(WHEN|AND|THEN|OR|BUT)\b/;
const indent = (t) => t.match(/^\s*/)[0].length;
const sideOfHeading = (h) => {
  if (!h) return null;
  if (/общ/i.test(h)) return '';
  if (/front|фронт/i.test(h)) return 'F';
  if (/половин/i.test(h)) return 'B';
  return null;
};

export function checkSlices(m) {
  const s = m.spec;
  const slices = m.slices;
  if (!slices.size) return;
  const behaviour = [...slices.values()].filter((x) => /поведение/i.test(x.type || '')).map((x) => x.num).sort();
  const firstBehaviour = behaviour[0];
  const acDefs = new Map();

  for (const sl of slices.values()) {
    const f = sl.file;
    for (const key of ['Тип', 'Основание', 'Зависимости', 'Половины', 'Результат'])
      if (header(sl.md, key) === null) add('SL-01', f, null, `нет строки «${key}:» в шапке`);
    const isPrep = /подготов/i.test(sl.type || '');
    if (!isPrep && sl.num !== firstBehaviour && sl.num !== '001') {
      if (sl.why === null) add('SL-02', f, null, 'нет строки «Почему отдельно:»');
      else if (!/^\**\s*Р[123](?!\d)/u.test(sl.why)) add('SL-02', f, headerLine(sl.md, 'Почему отдельно'), `«Почему отдельно: ${sl.why}» — нет Р1, Р2 или Р3`);
    }

    for (const o of sl.outside) add('SL-03', f, o.n, `${o.id} вне блока кода`);
    for (const mb of sl.multi) add('SL-06', f, mb.n, `в блоке кода ${mb.count} AC`);
    for (const n of sl.strayChecks) add('SL-16', f, n, '«Проверяет:» не стоит сразу под блоком AC');
    if (s) {
      const basis = header(sl.md, 'Основание') || '';
      const want = specFileHref(f, s.file);
      const got = (basis.match(BASIS_LINK_RE) || [])[1];
      if (got !== want || reqRefs(basis).some((r) => r.href))
        add('SL-28', f, sl.basisLine, got === undefined ? '«Основание» без ссылки на spec.md' : '«Основание»: ссылка на spec.md не та или ссылки на отдельные FR');
      for (const ac of sl.acs.filter((x) => x.checks)) staleReqLinks(f, ac.checks.n, ac.checks.text, s);
    }

    // FR зависимостей (транзитивно)
    const depBasis = new Set();
    const seen = new Set();
    const walk = (num) => {
      for (const d of slices.get(num)?.deps || []) {
        if (seen.has(d) || !slices.has(d)) continue;
        seen.add(d);
        for (const id of slices.get(d).basis) depBasis.add(id);
        walk(d);
      }
    };
    walk(sl.num);
    const checked = new Set();

    for (const ac of sl.acs) {
      if (ac.acNum !== sl.num) add('SL-04', f, ac.n, `${ac.id} — номер не совпадает с файлом ${sl.num}`);
      if (acDefs.has(ac.id)) add('SL-05', f, ac.n, `${ac.id} уже определён в ${rel(acDefs.get(ac.id))}`);
      acDefs.set(ac.id, f);
      if (ac.deleted) continue;

      const side = sideOfHeading(ac.h2);
      if (side !== ac.side) {
        const where = ac.side === '' ? '«Общая приёмка»' : ac.side === 'F' ? '«Frontend-половина»' : '«<Сервис>-половина»';
        add('SL-20', f, ac.n, `${ac.id} стоит в разделе «${ac.h2 || '—'}», его место — ${where}`);
      }
      if (ac.side === 'B' && ac.h2 && sl.halves) {
        const svc = ac.h2.replace(/[-–—\s]*половина.*$/i, '').trim().toLowerCase();
        if (svc && !sl.halves.toLowerCase().includes(svc)) add('SL-21', f, ac.n, `раздел «${ac.h2}», а в «Половины:» — «${sl.halves}»`);
      }

      // структура WHEN / AND / THEN
      const content = ac.body.filter((l) => l.text.trim());
      if (!content.length || !/^WHEN\b/.test(content[0].text.trim())) add('SL-14', f, ac.n, `${ac.id}: первая строка после имени — не WHEN`);
      else if (!content.some((l) => /^THEN\b/.test(l.text.trim()))) add('SL-14', f, ac.n, `${ac.id}: нет THEN`);
      let lastKw = null;
      for (const l of content) {
        if (KW.test(l.text.trim())) lastKw = indent(l.text);
        else if (lastKw === null || indent(l.text) <= lastKw) add('SL-15', f, l.n, `${ac.id}: строка без WHEN / AND / THEN`);
      }

      // AC выводится из FR
      if (ac.oldRefs.length) add('SL-16', f, ac.n, `${ac.id}: [${ac.oldRefs.join(', ')}] в строке AC — старый формат`);
      else if (!ac.refs.length) add('SL-16', f, ac.n, `${ac.id}: под блоком нет «Проверяет:»`);
      for (const id of ac.refs) {
        checked.add(id);
        if (s && !s.reqs.has(id)) add('SL-17', f, ac.n, `${ac.id} ссылается на ${id}, его нет в spec.md`);
        else if (sl.basis.has(id)) continue;
        else if (depBasis.has(id)) add('SL-18', f, ac.n, `${ac.id} проверяет ${id} из зависимости`);
        else add('SL-17', f, ac.n, `${ac.id} ссылается на ${id}, а в «Основание» slice его нет`);
      }

      const plain = ac.text.replace(/«[^«»]*»/g, ' ').replace(/\[[^\]]*\]/g, ' ');
      for (const [label, re] of AC_STOP_WORDS) {
        const mm = plain.match(re);
        if (mm) add('SL-22', f, ac.n, `${ac.id}: «${mm[0]}» — ${label}`);
      }
      if (s) {
        const specFlat = s.md.replace(/\s+/g, ' ');
        for (const q of quotes(ac.text)) if (!q.includes('<') && !specFlat.includes(q)) add('SL-23', f, ac.n, `${ac.id}: «${q}» нет в Dev Spec`);
        for (const nm of unknownNames(ac.text, s.data)) add('SL-24', f, ac.n, `${ac.id}: «${nm}» нет в «Данные для примеров»`);
      }
    }

    if (/поведение/i.test(sl.type || '')) {
      if (!sl.acs.length) add('SL-07', f, null, 'slice типа «поведение» без AC');
      // пока у части AC нет ссылок на FR (SL-16), покрытие по ним не считаем
      else if (sl.acs.every((a) => a.deleted || a.refs.length))
        for (const id of sl.basis) {
          if (s?.reqs.get(id)?.deleted) continue;
          if (!checked.has(id)) add('SL-19', f, headerLine(sl.md, 'Основание'), `${id} из «Основание» не проверяет ни один AC`);
        }
    }
    for (const side of ['B', 'F']) {
      const n = sl.acs.filter((a) => a.side === side && !a.deleted).length;
      if (n > 10) add('SL-08', f, null, `${n} AC в ${side === 'B' ? 'серверной' : 'фронтенд'}-половине`);
    }

    const open = sectionText(sl.sc, /^Открытые вопросы/);
    if (open && !noneText(open)) {
      if (approved(m.slicesStatus)) add('SL-10', f, null, 'slices одобрены, но в slice есть открытые вопросы');
      else add('SL-09', f, null, 'есть открытые вопросы к Dev Spec');
    }

    const bounds = sectionText(sl.sc, /^Границы/);
    const refs = [
      ...[...bounds.matchAll(/\((\d{3}(?:\s*(?:,|и)\s*\d{3})*)\)/g)].flatMap((x) => x[1].match(/\d{3}/g)),
      ...[...bounds.matchAll(/slice\s+(\d{3})/gi)].map((x) => x[1]),
    ];
    for (const r of uniq(refs)) if (!slices.has(r)) add('SL-25', f, null, `«Границы»: slice ${r} нет`);
  }

  // зависимости
  for (const [num, sl] of slices) {
    for (const d of sl.deps) {
      if (d === num) add('SL-11', sl.file, headerLine(sl.md, 'Зависимости'), 'slice зависит сам от себя');
      else if (!slices.has(d)) add('SL-11', sl.file, headerLine(sl.md, 'Зависимости'), `зависимость ${d} — такого slice нет`);
    }
  }
  const state = new Map();
  const cycle = (num, stack) => {
    if (state.get(num) === 'done') return;
    if (state.get(num) === 'visiting') {
      add('SL-11', slices.get(num).file, null, `цикл зависимостей: ${[...stack, num].join(' → ')}`);
      return;
    }
    state.set(num, 'visiting');
    for (const d of slices.get(num).deps) if (slices.has(d) && d !== num) cycle(d, [...stack, num]);
    state.set(num, 'done');
  };
  for (const num of slices.keys()) cycle(num, []);

  // покрытие spec ↔ slices
  if (s) {
    for (const sl of slices.values())
      for (const id of sl.basis) if (!s.reqs.has(id)) add('SL-12', sl.file, headerLine(sl.md, 'Основание'), `«Основание»: ${id} нет в spec.md`);
    const covered = coverage(m);
    for (const r of s.reqs.values()) if (!r.deleted && !covered.has(r.id)) add('SL-13', m.slicesDir, null, `${r.id} не покрыт ни одним slice`);
  }
  if (slices.size > 6) add('SL-26', m.slicesDir, null, `${slices.size} slices — больше ориентира 3–6`);

  // ссылки на AC
  const refFiles = [m.specFile, m.readmeFile, ...[...slices.values()].map((x) => x.file), ...m.featureAdrs.map((a) => a.file)];
  for (const file of uniq(refFiles)) {
    const md = read(file);
    if (!md) continue;
    for (const l of scan(md).lines)
      for (const x of l.text.matchAll(/\bAC-\d{3}-[BF]?\d+\b/g)) if (!acDefs.has(x[0])) add('SL-27', file, l.n, `ссылка на ${x[0]}, такого AC нет`);
  }

  checkReadme(m);
}
