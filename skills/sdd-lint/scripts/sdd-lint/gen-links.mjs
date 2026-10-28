// gen links: проставляет и обновляет ссылки в spec и slices, переносит старые форматы.
import fs from 'node:fs';

import { usage } from './cli.mjs';
import { loadFeature } from './feature.mjs';
import { CHECKS_RE, linkReqs, linkBasis } from './links.mjs';
import { rel, uniq, noneText, scan, inSection, col, reqIds, replaceSection, setSection } from './md.mjs';
import { genReadme } from './readme.mjs';
import { SRC_RE, SRC_REF_RE, hasProtocolTraces, stripProtocol, protoHref } from './sources.mjs';
import { parseSpec } from './spec.mjs';

// Старый раздел «Трассировка» → «Из протокола:» под требованиями и в разделах. Возвращает новый md.
function migrateTrace(s) {
  const t = s.oldTraceT;
  const perReq = new Map();
  const perSection = new Map();
  const tech = [];
  if (t) {
    const ct = Math.max(1, col(t, /куда|цель|требован/i));
    for (const r of t.rows) {
      const refs = [...(r.cells[0] || '').matchAll(/П?\d+/gu)].map((x) => x[0]);
      const cell = r.cells[ct] || '';
      const ids = reqIds(cell);
      const push = (map, key) => map.set(key, uniq([...(map.get(key) || []), ...refs]));
      if (ids.length) for (const id of ids) push(perReq, id);
      else if (/вне scope/i.test(cell)) push(perSection, 'Вне scope');
      else if (/открыт/i.test(cell)) push(perSection, 'Открытые вопросы');
      else tech.push(`- ${cell.replace(/^не про поведение:\s*/i, '').trim() || 'не про поведение'} (из протокола: ${refs.join(', ')})`);
    }
  }
  // строки под блоками кода — снизу вверх, чтобы номера строк выше не сдвигались
  const ls = s.md.split('\n');
  const ends = [];
  for (const b of s.sc.blocks) {
    const ids = [...s.reqs.values()].filter((r) => r.block === b.idx).map((r) => r.id);
    const refs = uniq(ids.flatMap((id) => perReq.get(id) || []));
    if (!refs.length) continue;
    let end = b.start;
    while (end < ls.length && !/^\s*```/.test(ls[end])) end += 1; // ls[end] — закрывающий ```
    ends.push([end + 1, `Из протокола: ${refs.join(', ')}`]);
  }
  for (const [at, text] of ends.sort((a, b) => b[0] - a[0])) ls.splice(at, 0, text);
  let md = ls.join('\n');
  for (const [title, refs] of perSection) {
    const sc = scan(md);
    const body = inSection(sc, new RegExp(`^${title}`)).map((l) => l.text).join('\n').trim();
    const keep = noneText(body) ? '' : `${body}\n\n`;
    md = replaceSection(md, new RegExp(`^${title}`), title, `${keep}Из протокола: ${refs.join(', ')}`);
  }
  md = setSection(md, /^Трассировка/, tech.length ? 'Не про поведение' : null, tech.join('\n'));
  return md;
}

// spec: «Из протокола:» → ссылки на строку протокола (или убрать, если протокола нет).
export function linkSpec(m) {
  const p = m.protocol;
  let md = m.spec.md;
  if (!p) {
    if (!hasProtocolTraces(md)) return null;
    fs.writeFileSync(m.spec.file, stripProtocol(md));
    return `${rel(m.spec.file)}: протокола нет — «Из протокола:», «Протокол:» и «Не про поведение» убраны.`;
  }
  const migrated = !!m.spec.oldTraceLine;
  if (migrated) md = migrateTrace(m.spec);
  const s = parseSpec(m.spec.file, md);
  const byId = new Map([...p.rows, ...p.post].map((r) => [r.id, r]));
  const unknown = [];
  let links = 0;
  const ls = md.split('\n');
  for (const src of s.sources) {
    const l = ls[src.n - 1];
    const i = l.search(SRC_RE);
    ls[src.n - 1] =
      l.slice(0, i) +
      l.slice(i).replace(/^(из протокола:)(.*)$/iu, (_, kw, rest) =>
        kw +
        rest.replace(SRC_REF_RE, (all, a, _h, b) => {
          const row = byId.get(a || b);
          if (!row) {
            unknown.push(a || b);
            return all;
          }
          links += 1;
          return `[${a || b}](${protoHref(s.file, p.file, row)})`;
        }),
      );
  }
  fs.writeFileSync(s.file, ls.join('\n'));
  return (
    `${rel(s.file)}: ${migrated ? 'раздел «Трассировка» перенесён в «Из протокола:» под требованиями и в разделах. ' : ''}` +
    `Ссылок на строки протокола: ${links}.` +
    (unknown.length ? ` Нет в протоколе: ${uniq(unknown).join(', ')} — исправь номер руками.` : '')
  );
}

// slice: «[FR-n]» из строки AC → «Проверяет:» под блоком; FR в «Основание» и «Проверяет:» → ссылки на spec.
export function linkSlice(sl, spec) {
  const ls = sl.md.split('\n');
  const moved = [];
  for (const ac of sl.acs) {
    if (!ac.oldRefs.length) continue;
    const i = ac.n - 1;
    ls[i] = ls[i].replace(/\s*\[[^\]]*\]/, '');
    if (ac.checks) continue;
    let end = i + 1;
    while (end < ls.length && !/^\s*```/.test(ls[end])) end += 1; // закрывающий ```
    moved.push([end + 1, `Проверяет: ${ac.oldRefs.join(', ')}`]);
  }
  for (const [at, text] of moved.sort((a, b) => b[0] - a[0])) ls.splice(at, 0, text);
  const out = ls.map((t) => (/^Основание:/.test(t) ? linkBasis(t, sl.file, spec.file) : CHECKS_RE.test(t) ? linkReqs(t, sl.file, spec) : t)).join('\n');
  if (out !== sl.md) fs.writeFileSync(sl.file, out);
  return moved.length;
}

export function genLinks(m) {
  if (!m.spec) usage('Нет spec.md');
  const out = [];
  const specMsg = linkSpec(m);
  if (specMsg) out.push(specMsg);
  let f = loadFeature(m.dir);
  if (f.slices.size) {
    let moved = 0;
    for (const sl of f.slices.values()) moved += linkSlice(sl, f.spec);
    out.push(`slices: «Основание» — ссылка на spec.md, FR в «Проверяет:» — ссылки на их строки.${moved ? ` Перенесено из строк AC в «Проверяет:»: ${moved}.` : ''}`);
    f = loadFeature(m.dir);
    if (f.readme != null) {
      genReadme(f, true);
      out.push(`${rel(f.readmeFile)}: таблицы собраны заново со ссылками.`);
    }
  }
  console.log(out.join('\n'));
}
