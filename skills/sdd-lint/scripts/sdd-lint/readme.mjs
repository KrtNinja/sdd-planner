// slices/README.md: покрытие, слои, проверки RM-*, gen readme.
import fs from 'node:fs';
import path from 'node:path';

import { usage } from './cli.mjs';
import { add } from './findings.mjs';
import { linkReqs, basisPlain, staleReqLinks } from './links.mjs';
import { rel, uniq, scan, isH2, inSection, sectionText, tables, col, reqIds, replaceSection } from './md.mjs';
import { registry } from './services.mjs';

export const coverage = (m) => {
  const covered = new Map();
  for (const [num, sl] of m.slices)
    for (const id of sl.basis) {
      if (!covered.has(id)) covered.set(id, new Set());
      covered.get(id).add(num);
    }
  return covered;
};
const sameSet = (a, b) => {
  const A = new Set(a);
  const B = new Set(b);
  return A.size === B.size && [...A].every((x) => B.has(x));
};

// slices, которые делят требование: всё, кроме 001 «подготовка» — он ссылается на все FR через контракты.
export const sharing = (m, nums) => [...nums].filter((n) => !(n === '001' && /подготов/i.test(m.slices.get(n).type || '')));

// слои порядка работ: внутри слоя slices можно делать параллельно. items — Map номер → { deps }.
export function layers(m, items = m.slices) {
  const left = new Set(items.keys());
  const done = new Set();
  const out = [];
  while (left.size) {
    const layer = [...left].filter((n) => items.get(n).deps.every((d) => done.has(d) || !items.has(d) || d === n)).sort();
    if (!layer.length) {
      out.push([...left].sort());
      break;
    }
    layer.forEach((n) => {
      left.delete(n);
      done.add(n);
    });
    out.push(layer);
  }
  return out;
}

export function checkReadme(m) {
  const f = m.readmeFile;
  if (m.readme == null) {
    add('RM-01', f, null, 'нет README со списком slices, покрытием и порядком');
    return;
  }
  const sc = m.readmeSc;
  const t = tables(sc.lines.filter((l) => !l.inCode)).find((x) => /^slice$/i.test(x.header[0] || ''));
  if (!t) add('RM-02', f, null, 'нет таблицы slices');
  else {
    const cb = col(t, /основани/i);
    const cd = col(t, /завис/i);
    const rows = new Map();
    for (const r of t.rows) {
      const num = ((r.cells[0] || '').match(/\b\d{3}\b/) || [])[0];
      if (num) rows.set(num, r);
    }
    for (const [num, sl] of m.slices) {
      const r = rows.get(num);
      if (!r) {
        add('RM-02', f, t.start, `в таблице нет slice ${num}`);
        continue;
      }
      if (cb >= 0 && !sameSet(reqIds(r.cells[cb]), sl.basis)) add('RM-02', f, r.n, `${num}: «Основание» в README не совпадает со slice`);
      const deps = uniq((r.cells[cd] || '').match(/\b\d{3}\b/g) || []);
      if (cd >= 0 && !sameSet(deps, sl.deps)) add('RM-02', f, r.n, `${num}: «Зависит от» в README не совпадает со slice`);
    }
    for (const num of rows.keys()) if (!m.slices.has(num)) add('RM-02', f, rows.get(num).n, `в таблице slice ${num}, файла нет`);
  }

  const covered = coverage(m);
  const cov = tables(inSection(sc, /^Покрытие/))[0];
  if (!cov) add('RM-02', f, null, 'нет раздела «Покрытие Dev Spec»');
  else {
    const inReadme = new Map();
    for (const r of cov.rows) {
      const id = reqIds(r.cells[0])[0];
      if (id) inReadme.set(id, { set: r.cells.slice(1).join(' ').match(/\b\d{3}\b/g) || [], n: r.n });
      if (id && m.spec) staleReqLinks(f, r.n, r.cells[0], m.spec);
    }
    for (const [id, nums] of covered) {
      const x = inReadme.get(id);
      if (!x) add('RM-02', f, cov.start, `«Покрытие»: нет строки ${id}`);
      else if (!sameSet(x.set, nums)) add('RM-02', f, x.n, `«Покрытие» ${id}: в README ${uniq(x.set).join(', ') || '—'}, по «Основание» ${[...nums].join(', ')}`);
    }
  }

  const order = sectionText(sc, /^Порядок/);
  if (!order) add('RM-02', f, null, 'нет раздела «Порядок работ»');
  else {
    const pos = new Map();
    for (const x of order.matchAll(/\b\d{3}\b/g)) if (!pos.has(x[0])) pos.set(x[0], x.index);
    for (const [num, sl] of m.slices) {
      if (!pos.has(num)) add('RM-02', f, null, `«Порядок работ»: нет ${num}`);
      for (const d of sl.deps) if (pos.has(d) && pos.has(num) && pos.get(d) > pos.get(num)) add('RM-02', f, null, `«Порядок работ»: ${num} раньше своей зависимости ${d}`);
    }
  }

  const cross = sectionText(sc, /^Пересечения/);
  for (const [id, nums] of covered) {
    const beh = sharing(m, nums);
    if (beh.length > 1 && !reqIds(cross).includes(id)) add('RM-03', f, null, `${id} в slices ${beh.join(', ')}, в «Пересечения» не описан`);
  }

  if (m.spec) {
    const inCheck = new Set(reqIds(sectionText(sc, /^Проверка фичи/)));
    for (const r of m.spec.reqs.values())
      if (!r.deleted && r.id.startsWith('FR') && !inCheck.has(r.id)) add('RM-04', f, null, `${r.id} не встречается в «Проверка фичи»`);
  }
}

export function genReadme(m, quiet = false) {
  if (!m.slices.size) usage('В slices/ нет файлов NNN-*.md');
  const link = (text) => (m.spec ? linkReqs(text, m.readmeFile, m.spec) : text);
  const row = (sl) =>
    `| [${sl.num} ${sl.title || sl.name}](${sl.name}) | ${sl.type || '—'} | ${sl.halves || '—'} | ${basisPlain(sl.basisRaw) || '—'} | ${sl.deps.join(', ') || '—'} | ${sl.why || '—'} |`;
  const table = ['| Slice | Тип | Стороны | Основание | Зависит от | Почему отдельно |', '|---|---|---|---|---|---|', ...[...m.slices.values()].map(row)].join('\n');
  const covered = coverage(m);
  const ids = m.spec ? [...m.spec.reqs.values()].filter((r) => !r.deleted).map((r) => r.id) : [...covered.keys()];
  const covTable = ['| Требование | Slice |', '|---|---|', ...ids.map((id) => `| ${link(id)} | ${[...(covered.get(id) || [])].sort().join(', ') || '—'} |`)].join('\n');
  const order = layers(m).map((l) => l.join(', ')).join(' → ');
  const orderText = `${order}\n\nЧерез запятую — slices, которые можно делать параллельно.`;

  let md = m.readme;
  if (md == null) {
    const adrs = m.featureAdrs.map((a) => `[${a.num}](../../adr/${path.basename(a.file)})`).join(', ') || 'нет';
    const reg = registry(m);
    // Заготовки: какие FR делят slices и сквозной шаг на каждый поведенческий slice — смысл допишет агент.
    const shared = [...covered].map(([id, nums]) => [id, sharing(m, nums).sort()]).filter(([, nums]) => nums.length > 1);
    const behaviour = [...m.slices.values()].filter((s) => /поведение/i.test(s.type || '') && [...s.basis].some((id) => id.startsWith('FR')));
    md = [
      `# ${m.spec?.title || m.name} — slices`,
      '',
      'Статус: черновик',
      '',
      'Dev Spec: [../spec.md](../spec.md)',
      '',
      `ADR: ${adrs}`,
      '',
      ...(reg ? [`Сервисы: ${reg.list.join(', ')}`, ''] : []),
      '<!-- Таблицу, «Покрытие Dev Spec» и «Порядок работ» собирает sdd-lint fix: руками не правь. -->',
      '',
      table,
      '',
      '## Покрытие Dev Spec',
      covTable,
      '',
      '## Порядок работ',
      orderText,
      '',
      '## Пересечения',
      ...(shared.length ? shared.map(([id, nums]) => `- ${id} — ${nums.join(', ')}: <где граница>`) : ['Нет.']),
      '',
      '## Проверка фичи (после всех slices)',
      '| Шаг | Действие | Ожидание | Требования |',
      '|---|---|---|---|',
      ...(behaviour.length
        ? behaviour.map((s, i) => `| ${i + 1} | <действие> | <ожидание> | ${[...s.basis].filter((id) => id.startsWith('FR')).join(', ')} |`)
        : ['| 1 | <действие> | <ожидание> | <FR-n> |']),
      '',
    ].join('\n');
  } else {
    const sc = scan(md);
    const t = tables(sc.lines.filter((l) => !l.inCode)).find((x) => /^slice$/i.test(x.header[0] || ''));
    const ls = md.split('\n');
    if (t) md = [...ls.slice(0, t.start - 1), table, ...ls.slice(t.end)].join('\n');
    else {
      const firstH2 = sc.lines.find(isH2);
      const at = firstH2 ? firstH2.n - 1 : ls.length;
      md = [...ls.slice(0, at), table, '', ...ls.slice(at)].join('\n');
    }
    md = replaceSection(md, /^Покрытие/, 'Покрытие Dev Spec', covTable);
    md = replaceSection(md, /^Порядок/, 'Порядок работ', orderText);
  }
  fs.writeFileSync(m.readmeFile, md.endsWith('\n') ? md : `${md}\n`);
  if (!quiet) console.log(`${rel(m.readmeFile)}: таблица slices, «Покрытие Dev Spec», «Порядок работ» собраны из файлов slices. Порядок: ${order}`);
}
