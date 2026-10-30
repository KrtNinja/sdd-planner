// gen slices: файлы slices по согласованному плану — шапка из плана, заготовки AC по сервисам, README; план удаляется.
import fs from 'node:fs';
import path from 'node:path';

import { gateClosed } from './cmd-check.mjs';
import { stubLines } from './cut.mjs';
import { loadFeature, runChecks } from './feature.mjs';
import { findings, line } from './findings.mjs';
import { linkBasis } from './links.mjs';
import { rel } from './md.mjs';
import { genReadme } from './readme.mjs';
import { parseHalves, halvesLine, halfHeading } from './services.mjs';

// Заготовки в «<…>»: агент заменяет их текстом, SL-37 не даёт забыть ни одну.
const acStub = (num, side) => ['```', `AC-${num}-${side}? <имя>`, '  WHEN <условие>', '  THEN <наблюдаемый исход>', '```', 'Проверяет: <FR-n>', ''];

function sliceText(m, plan, s) {
  const prep = s.type === 'подготовка';
  const services = parseHalves(s.halves).services;
  const back = services.filter((x) => !/^front/i.test(x));
  const front = services.filter((x) => /^front/i.test(x));
  // «Вне slice» — соседи из плана: агент поправит, если граница другая.
  const others = plan.slices.filter((o) => o.num !== s.num && (prep ? true : o.type === 'поведение'));
  const outside = prep ? `поведение (${others.map((o) => o.num).join(', ')})` : others.map((o) => `${o.title[0].toLowerCase()}${o.title.slice(1)} (${o.num})`).join('; ');
  const shared = plan.slices.filter((o) => o.num !== s.num && o.type === 'поведение' && [...o.basis].some((id) => s.basis.has(id)));
  const md = [
    `# ${s.num} — ${s.title}`,
    '',
    `Тип: ${s.type}`,
    '',
    linkBasis(`Основание: ${s.basisRaw}`, path.join(m.slicesDir, `${s.num}-${s.slug}.md`), m.specFile),
    '',
    `Зависимости: ${s.deps.length ? s.deps.join(', ') : 'нет'}`,
    '',
    `Половины: ${halvesLine(services, prep)}`,
    '',
    `Результат: ${s.result}`,
    '',
    `Почему отдельно: ${(s.why || '—').replace(/^(\**\s*)P(?=[123])/u, '$1Р')}`,
    '',
    '## Контракты',
    '- <сервис-владелец>: <контракт по смыслу> — <не меняется или МЕНЯЕТ КОНТРАКТ: что именно>',
    '',
  ];
  if (!prep) {
    if (services.length > 1) md.push('## Общая приёмка (собранное приложение)', ...acStub(s.num, ''));
    for (const svc of back) md.push(`## ${halfHeading(svc)}`, ...acStub(s.num, 'B'));
    if (front.length) md.push('## Frontend-половина', ...acStub(s.num, 'F'));
  }
  md.push(
    '## Границы',
    `- Вне slice: ${outside || 'нет'}.`,
    ...(prep ? [] : [`- Пересечения с соседями: ${shared.length ? `<что делит с ${shared.map((o) => o.num).join(', ')} и где граница>` : 'нет'}.`]),
    '',
    '## Открытые вопросы к Dev Spec',
    'Нет.',
    '',
    '## Definition of Done',
    ...(prep
      ? ['- Контракты из раздела «Контракты» опубликованы у владельцев, все стороны их приняли']
      : [`- Все AC-${s.num}-* закрыты тестами: в названии теста — ссылка ${m.name}/AC-ID`, '- Все половины влиты, общая приёмка пройдена']),
    '',
  );
  return md.join('\n');
}

export function genSlices(m) {
  const dir = rel(m.dir);
  const stop = (msg) => {
    console.log(msg);
    process.exit(1);
  };
  if (!m.plan) stop(`Нет ${rel(m.planFile)} — сначала план нарезки (скилл sdd-slices).`);
  if (m.slices.size) stop(`В ${dir}/slices/ уже есть файлы slices — по плану создаются только новые. Меняйте файлы; решения — через sdd-decide.`);
  findings.length = 0;
  runChecks(m);
  const closed = gateClosed(m, 'slices');
  if (closed) stop(`Файлы не созданы: ${closed[0]}. ${closed[1]}.`);
  const errs = findings.filter((x) => x.level === 'err' && x.rule.startsWith('PL'));
  if (errs.length) stop(`${errs.map(line).join('\n')}\n\nФайлы не созданы: в плане ошибки. Исправь ${rel(m.planFile)} и проверь: sdd_lint ["plan","${dir}"].`);

  const plan = m.plan;
  const made = [];
  // План лежит в _work/, папки slices/ до этой минуты может не быть.
  fs.mkdirSync(m.slicesDir, { recursive: true });
  for (const s of plan.slices) {
    const file = path.join(m.slicesDir, `${s.num}-${s.slug}.md`);
    fs.writeFileSync(file, sliceText(m, plan, s));
    made.push(file);
  }
  fs.rmSync(m.planFile);
  const f = loadFeature(m.dir);
  const hadReadme = f.readme != null;
  genReadme(f, true);
  const after = loadFeature(m.dir);
  const count = (file) => stubLines(fs.readFileSync(file, 'utf8')).reduce((k, x) => k + x.items.length, 0);
  const stubs = [...made, after.readmeFile].map((file) => `${path.basename(file)} — ${count(file)}`).join(', ');
  console.log(
    [
      `Созданы по плану в ${dir}/slices/: ${made.map((x) => path.basename(x)).join(', ')}; README.md ${hadReadme ? 'собран заново' : 'создан'}. План удалён.`,
      `Заготовок «<…>» к заполнению: ${stubs}.`,
    ].join('\n'),
  );
  process.exit(0);
}
