// Контекст фичи _work/context.md: факты из источников для всех этапов — заготовка, задания сабагенту, проверки CX-*.
// Факты собирает сабагент, а проверяет скрипт: раздел на месте, у факта есть источник и он открывается.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { lintArgs } from './question.mjs';
import { SKILLS_DIR } from './cmd-prompt.mjs';
import { finding, line } from './findings.mjs';
import { REPO, outside } from './input.mjs';
import { dropHeader, header, isH2, read, rel, scan, setHeader } from './md.mjs';
import { visibleLength } from './read-size.mjs';

// Контекст читают целиком в окне flash-модели: факты, а не пересказ источников.
export const CONTEXT_LIMIT = 6000;
const PROJECT = ['Как устроено сейчас', 'Роли и доступ', 'Данные и объекты', 'Сервисы и связи', 'Ограничения'];
const TASK = ['Задача', 'Уже решено в задаче'];
const FREE = ['Не нашёл', 'Не удалось прочитать'];
const ANSWERS = 'Ответы на вопросы';
const REQUIRED = [...TASK, ...PROJECT, ...FREE];
const RECO = /(рекоменд|предлага|советую|лучше (бы )?(сделать|использовать|выбрать|взять)|стоит (сделать|использовать|добавить|выбрать)|следует|имеет смысл)/i;

const tpl = (name) => read(path.join(SKILLS_DIR, 'sdd-lint', 'assets', name)) || '';
const fill = (t, vars) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
export const contextFile = (m) => path.join(m.workDir, 'context.md');
const blank = (t) => /^\s*[-*]\s*[-—–]?\s*$/.test(t);

/** @param {string} file @param {string | null | undefined} md */
export function parseContext(file, md) {
  if (md == null) return null;
  const sections = new Map();
  for (const l of scan(md).lines) {
    if (isH2(l)) {
      if (!sections.has(l.h2)) sections.set(l.h2, []);
    } else if (l.h2 && !l.inCode && /^\s*[-*]\s/.test(l.text) && !blank(l.text)) sections.get(l.h2)?.push({ text: l.text.trim(), n: l.n });
  }
  const list = (k) => sections.get(k) || [];
  return {
    file,
    md,
    sources: header(md, 'Источники'),
    checked: !!header(md, 'Проверено'),
    accepted: !!header(md, 'Принято'),
    sections,
    facts: PROJECT.reduce((n, k) => n + list(k).length, 0),
    filled: [...sections.values()].some((x) => x.length),
    decided: list('Уже решено в задаче'),
    unread: list('Не удалось прочитать'),
  };
}
export const loadContext = (m) => parseContext(contextFile(m), read(contextFile(m)));

// Источник факта — после последнего « — »: `путь:строка`, [текст](путь#L12) или ссылка.
// Имена в теле факта (`task.updated`) источником не считаются.
function sourcesOf(text) {
  const parts = text.split(/\s[—–]\s/);
  const tail = parts.length > 1 ? parts[parts.length - 1] : '';
  const urls = tail.match(/https?:\/\/\S+/g) || [];
  const paths = [
    ...[...tail.matchAll(/`([^`\s]+)`/g)].map((x) => x[1]),
    ...[...tail.matchAll(/\]\(([^)\s]+)\)/g)].map((x) => x[1].replace(/#L(\d+)(?:-L?(\d+))?$/, (_, a, b) => `:${a}${b ? `-${b}` : ''}`)),
  ].filter((p) => !/^https?:/.test(p));
  return { urls, paths };
}
function refProblem(ref) {
  const m = ref.match(/^(.+?)(?::(\d+)(?:-(\d+))?)?$/);
  const f = m[1].replace(/^~(?=[\\/])/, os.homedir());
  if (!fs.existsSync(f)) return `нет файла ${m[1]}`;
  if (m[2] && fs.statSync(f).isFile()) {
    const n = fs.readFileSync(f, 'utf8').split('\n').length;
    const last = Number(m[3] || m[2]);
    if (last > n) return `в ${m[1]} строк ${n}, а ссылка на ${last}`;
  }
  return null;
}

// Правило — { ids, check }: ids — какие ID из rules.mjs оно выдаёт, check — его находки массивом.
// Порядок находок: шапка и разделы, затем по каждому факту (CX-02…04), затем объём.
/** @typedef {import('./findings.mjs').Finding} Finding */
/** @typedef {NonNullable<ReturnType<typeof parseContext>>} Context */
/** @typedef {{ text: string, n: number }} Fact */

/** @type {{ ids: string[], check: (it: Fact, file: string) => Finding[] }[]} */
const CONTEXT_FACT = [
  {
    // CX-02: у факта есть источник — путь или ссылка после « — ».
    ids: ['CX-02'],
    check: (it, file) => {
      const src = sourcesOf(it.text);
      return src.urls.length || src.paths.length ? [] : [finding('CX-02', file, it.n, it.text.slice(0, 90))];
    },
  },
  {
    // CX-03: путь-источник существует, строка в нём есть.
    ids: ['CX-03'],
    check: (it, file) =>
      sourcesOf(it.text)
        .paths.map(refProblem)
        .filter((why) => why !== null)
        .map((why) => finding('CX-03', file, it.n, String(why))),
  },
  // CX-04: факт, а не совет.
  { ids: ['CX-04'], check: (it, file) => (RECO.test(it.text.split(/\s[—–]\s/)[0]) ? [finding('CX-04', file, it.n, it.text.slice(0, 90))] : []) },
];

// Факты — пункты разделов, кроме «Не нашёл», «Не удалось прочитать» и «не нашёл» в ответах на вопросы.
/** @param {Context} ctx @returns {Fact[]} */
const factsOf = (ctx) =>
  [...ctx.sections].filter(([k]) => !FREE.includes(k)).flatMap(([k, items]) => items.filter((it) => !(k === ANSWERS && /не нашёл/i.test(it.text))));

/** @type {{ ids: string[], check: (ctx: Context) => Finding[] }[]} */
const CONTEXT = [
  { ids: ['CX-01'], check: (ctx) => (ctx.sources ? [] : [finding('CX-01', ctx.file, null, 'нет строки «Источники:»')]) },
  { ids: ['CX-01'], check: (ctx) => REQUIRED.filter((s) => !ctx.sections.has(s)).map((s) => finding('CX-01', ctx.file, null, `нет раздела «${s}»`)) },
  { ids: ['CX-02', 'CX-03', 'CX-04'], check: (ctx) => factsOf(ctx).flatMap((it) => CONTEXT_FACT.flatMap((r) => r.check(it, ctx.file))) },
  {
    ids: ['CX-05'],
    check: (ctx) => {
      const n = visibleLength(ctx.md);
      return n > CONTEXT_LIMIT ? [finding('CX-05', ctx.file, null, `${n} символов при ориентире ${CONTEXT_LIMIT} (без пробелов и разметки)`)] : [];
    },
  },
];

/** @param {Context} ctx @returns {Finding[]} */
export function checkContext(ctx) {
  return CONTEXT.flatMap((r) => r.check(ctx));
}
// Находки CX-* — отдельно от проверок фичи: их показывают старт и задание сабагенту.
export const contextFindings = (ctx) => checkContext(ctx);

// Заготовка: шапку пишет скрипт. Источники поменялись — отметки «Проверено» и «Принято» снимаются.
export function syncContext(m, key, taskLine) {
  const file = contextFile(m);
  const old = read(file);
  let md = old ?? tpl('context.md').replace(/^# .*$/m, `# Контекст: ${m.name}`);
  if (!new RegExp(`^## ${ANSWERS}\\s*$`, 'm').test(md)) md = `${md.trimEnd()}\n\n## ${ANSWERS}\n\n-\n`;
  const changed = header(md, 'Источники') !== key;
  md = setHeader(md, 'Задача', taskLine, []);
  md = setHeader(md, 'Источники', key, ['Задача']);
  if (changed) md = dropHeader(dropHeader(md, 'Проверено'), 'Принято');
  if (md !== old) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, md);
  }
  return { ctx: parseContext(file, md), changed, created: old == null };
}
// «Проверено: да» — после чистой проверки; «Принято: да» — человек решил идти с тем, что нашлось.
export function markContext(ctx, name) {
  fs.writeFileSync(ctx.file, setHeader(ctx.md, name, 'да', ['Источники', 'Проверено']));
}

const sourceLine = (x) =>
  `- ${x === REPO ? 'репозиторий — текущая папка целиком' : x}${outside(x) ? ' — вне папки проекта: не откроется — запиши в «Не удалось прочитать» с причиной «вне папки проекта»' : ''}`;

// Задание сабагенту: изучить источники и заполнить контекст. Файл уже есть — что исправить или дописать.
export function researchTask(m, list, taskLine, stage) {
  const d = rel(m.dir);
  const { ctx, changed, created } = syncContext(m, list.join('; '), taskLine);
  const out = rel(ctx.file);
  let tail = '';
  if (!created && changed && ctx.filled) tail = '\n## Файл уже заполнен\n\nИсточники поменялись: допиши факты из новых, старые оставь, «Не удалось прочитать» обнови.\n';
  else if (ctx.filled) {
    const own = contextFindings(ctx).filter((x) => x.level === 'err');
    if (own.length) tail = `\n## Исправь в файле\n\n${own.map((x) => `- ${line(x).replace(/^\S+\s+/, '')}`).join('\n')}\n\nОстальное в файле не трогай.\n`;
  }
  return fill(tpl('research.md'), { feature: d, out, stage, task: taskLine, sources: list.map(sourceLine).join('\n'), check: `sdd_lint ${lintArgs(['research', 'check', d])}` }) + tail;
}
export function factTask(m, list, taskLine, question, stage) {
  const d = rel(m.dir);
  const { ctx } = syncContext(m, list.join('; '), taskLine);
  const where = list.length ? list.map((x) => (x === REPO ? 'репозиторий' : x)).join(', ') : 'репозиторий';
  return fill(tpl('research-fact.md'), { feature: d, adr: rel(m.adrDir), out: rel(ctx.file), stage, question, sources: where, check: `sdd_lint ${lintArgs(['research', 'check', d])}` });
}
