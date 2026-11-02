// slices/README.md: покрытие, слои, gen readme. Проверки RM-* — в readme-rules.mjs.
// @ts-check
import fs from 'node:fs';
import path from 'node:path';

import { usage } from './cli.mjs';
import { linkReqs, basisPlain } from './links.mjs';
import { rel, scan, isH2, tables, replaceSection } from './md.mjs';
import { registry } from './services.mjs';

/** @typedef {import('./io.mjs').Ctx} Ctx */
/** @typedef {import('./model.mjs').Feature} Feature */
/** @typedef {import('./model.mjs').Slice} Slice */

/** @param {Feature} m */
export const coverage = (m) => {
  /** @type {Map<string, Set<string>>} */
  const covered = new Map();
  for (const [num, sl] of m.slices)
    for (const id of sl.basis) {
      if (!covered.has(id)) covered.set(id, new Set());
      /** @type {Set<string>} */ (covered.get(id)).add(num);
    }
  return covered;
};

// slices, которые делят требование: всё, кроме 001 «подготовка» — он ссылается на все FR через контракты.
/** @param {Feature} m @param {Iterable<string>} nums */
export const sharing = (m, nums) => [...nums].filter((n) => !(n === '001' && /подготов/i.test(/** @type {Slice} */ (m.slices.get(n)).type || '')));

// слои порядка работ: внутри слоя slices можно делать параллельно. items — Map номер → { deps }.
/** @param {Feature} m @param {Map<string, { deps: string[] }>} [items] */
export function layers(m, items = m.slices) {
  const left = new Set(items.keys());
  const done = new Set();
  const out = [];
  while (left.size) {
    const layer = [...left].filter((n) => /** @type {{ deps: string[] }} */ (items.get(n)).deps.every((d) => done.has(d) || !items.has(d) || d === n)).sort();
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

/** @param {Ctx} ctx @param {Feature} m */
export function genReadme(ctx, m, quiet = false) {
  if (!m.slices.size) usage(ctx, 'В slices/ нет файлов NNN-*.md');
  const spec = m.spec;
  const link = (/** @type {string} */ text) => (spec ? linkReqs(text, m.readmeFile, spec) : text);
  const row = (/** @type {Slice} */ sl) =>
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
    const shared = [...covered].map(([id, nums]) => /** @type {[string, string[]]} */ ([id, sharing(m, nums).sort()])).filter(([, nums]) => nums.length > 1);
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
  if (!quiet) ctx.io.log(`${rel(m.readmeFile)}: таблица slices, «Покрытие Dev Spec», «Порядок работ» собраны из файлов slices. Порядок: ${order}`);
}
