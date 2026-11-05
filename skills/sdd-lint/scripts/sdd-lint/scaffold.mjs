// gen slices: файлы slices по согласованному плану — шапка из плана, заготовки AC по сервисам, README; план удаляется.
// @ts-check
import fs from 'node:fs';
import path from 'node:path';

import { gateClosed } from './cmd-check.mjs';
import { stubLines } from './cut.mjs';
import { loadFeature, runChecks } from './feature.mjs';
import { item } from './findings.mjs';
import { linkBasis } from './links.mjs';
import { planChoiceId } from './plan.mjs';
import { rel } from './md.mjs';
import { genReadme } from './readme.mjs';
import { G, screen } from './screen.mjs';
import { parseHalves, halvesLine, halfHeading } from './services.mjs';

/** @typedef {import('./io.mjs').Ctx} Ctx */
/** @typedef {import('./model.mjs').Feature} Feature */
/** @typedef {import('./model.mjs').Plan} Plan */
/** @typedef {import('./model.mjs').PlanSlice} PlanSlice */

// Заготовки в «<…>»: агент заменяет их текстом, SL-37 не даёт забыть ни одну.
/** @param {string} num @param {string} side */
const acStub = (num, side) => ['```', `AC-${num}-${side}? <имя>`, '  WHEN <условие>', '  THEN <наблюдаемый исход>', '```', 'Проверяет: <FR-n>', ''];

/** @param {PlanSlice} s @param {string} key @param {string} prefix @param {string[]} [tail] */
function planLines(s, key, prefix, tail = []) {
  return s.head[key] ? [`${prefix}${s.head[key]}`, ...tail] : [];
}

/** @param {Feature} m @param {Plan} plan @param {PlanSlice} s */
function sliceText(m, plan, s) {
  const prep = s.type === 'подготовка';
  const services = parseHalves(s.halves).services;
  const { outside, shared } = sliceNeighbours(plan, s);
  const md = sliceHeader(m, s, services);
  if (!prep) md.push(...acceptanceStubs(s.num, services));
  md.push(
    '## Границы',
    ...planLines(s, 'Границы', '- Согласовано: '),
    `- Вне slice: ${outside || 'нет'}.`,
    ...(prep ? [] : [`- Пересечения с соседями: ${shared.length ? `<что делит с ${shared.map((o) => o.num).join(', ')} и где граница>` : 'нет'}.`]),
    '',
    '## Открытые вопросы к требованиям',
    'Нет.',
    '',
    '## Definition of Done',
    ...(prep
      ? ['- Контракты из раздела «Контракты» опубликованы у владельцев, все стороны их приняли']
      : [`- Все AC-${s.num}-* закрыты тестами: в названии теста — ссылка ${m.name}/AC-ID`, '- Изменения во всех сервисах влиты, общая приёмка пройдена']),
    '',
  );
  return md.join('\n');
}

/** @param {Feature} m @param {PlanSlice} s @param {string[]} services */
function sliceHeader(m, s, services) {
  const prep = s.type === 'подготовка';
  return [
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
    ...planLines(s, 'Приёмка', 'Условия приёмки: ', ['']),
    `Почему отдельно: ${(s.why || '—').replace(/^(\**\s*)P(?=[123])/u, '$1Р')}`,
    '',
    '## Контракты',
    '- <сервис-владелец>: <контракт по смыслу> — <не меняется или МЕНЯЕТ КОНТРАКТ: что именно>',
    '',
  ];
}

/** @param {Ctx} ctx @param {Feature} m */
export function genSlices(ctx, m) {
  const dir = rel(m.dir);
  /** @type {(msg: string) => never} */
  const stop = (msg) => {
    ctx.io.log(msg);
    return ctx.io.exit(1);
  };
  const plan = m.plan;
  if (!plan) stop(`Нет ${rel(m.planFile)} — сначала план разбиения работы (скилл sdd-slices).`);
  if (m.slices.size) stop(`В ${dir}/slices/ уже есть файлы частей работы — по плану создаются только новые. Меняйте файлы; решения — через sdd-decide.`);
  const findings = runChecks(m);
  const closed = gateClosed(m, 'slices', findings);
  if (closed) stop(`Файлы не созданы: ${closed[0]}. ${closed[1]}.`);
  const errs = findings.filter((x) => x.level === 'err' && x.rule.startsWith('PL'));
  if (errs.length) stop(screen(`${errs.map(item).join('\n')}\n\nФайлы не созданы: в плане ошибки.`, `исправь ${rel(m.planFile)}`, G.then(['plan', dir])));

  requirePlanChoice(ctx, m, stop);

  /** @type {string[]} */
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
  genReadme(ctx, f, true);
  const after = loadFeature(m.dir);
  const count = (/** @type {string} */ file) => stubLines(fs.readFileSync(file, 'utf8')).reduce((k, x) => k + x.items.length, 0);
  const stubs = [...made, after.readmeFile].map((file) => `${path.basename(file)} — ${count(file)}`).join(', ');
  ctx.io.log(
    [
      `Созданы по плану в \`${dir}/slices/\`: ${made.map((x) => path.basename(x)).join(', ')}; ` +
        `README.md ${hadReadme ? 'собран заново' : 'создан'}. План удалён.`,
      `Заготовок «<…>» к заполнению: ${stubs}.`,
    ].join('\n\n'),
  );
  ctx.io.exit(0);
}

/** @param {Plan} plan @param {PlanSlice} s */
function sliceNeighbours(plan, s) {
  const prep = s.type === 'подготовка';
  // «Вне slice» — соседи из плана: агент поправит, если граница другая.
  const others = plan.slices.filter((o) => o.num !== s.num && (prep ? true : o.type === 'поведение'));
  const outside = prep
    ? `поведение (${others.map((o) => o.num).join(', ')})`
    : others.map((o) => `${o.title[0].toLowerCase()}${o.title.slice(1)} (${o.num})`).join('; ');
  const shared = plan.slices.filter((o) => o.num !== s.num && o.type === 'поведение' && [...o.basis].some((id) => s.basis.has(id)));
  return { outside, shared };
}

/** @param {string} num @param {string[]} services */
function acceptanceStubs(num, services) {
  const back = services.filter((x) => !/^front/i.test(x));
  const front = services.filter((x) => /^front/i.test(x));
  const md = [];
  if (services.length > 1) md.push('## Общая приёмка (собранное приложение)', ...acStub(num, ''));
  for (const svc of back) md.push(`## ${halfHeading(svc)}`, ...acStub(num, 'B'));
  if (front.length) md.push('## Frontend-половина', ...acStub(num, 'F'));
  return md;
}

/** @param {Ctx} ctx @param {Feature} m @param {(msg: string) => never} stop */
function requirePlanChoice(ctx, m, stop) {
  if (m.flow.state && ctx.args.pos[2] !== planChoiceId(m))
    stop(`Файлы не созданы: подтвердите актуальный план в ask ${rel(m.dir)}; затем choose с ID показанного варианта.`);
}
