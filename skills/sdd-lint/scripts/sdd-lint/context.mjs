// Контекст фичи _work/context.md: факты из источников для всех этапов — заготовка, задания сабагенту, проверки CX-*.
// Факты собирает сабагент, а проверяет скрипт: раздел на месте, у факта есть источник и он открывается.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { lintArgs } from './ask.mjs';
import { SKILLS_DIR } from './cmd-prompt.mjs';
import { add, findings, line } from './findings.mjs';
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

export function checkContext(ctx) {
  const f = ctx.file;
  if (!ctx.sources) add('CX-01', f, null, 'нет строки «Источники:»');
  for (const s of REQUIRED) if (!ctx.sections.has(s)) add('CX-01', f, null, `нет раздела «${s}»`);
  for (const [k, items] of ctx.sections) {
    if (FREE.includes(k)) continue;
    for (const it of items) {
      if (k === ANSWERS && /не нашёл/i.test(it.text)) continue;
      const src = sourcesOf(it.text);
      if (!src.urls.length && !src.paths.length) add('CX-02', f, it.n, it.text.slice(0, 90));
      for (const p of src.paths) {
        const why = refProblem(p);
        if (why) add('CX-03', f, it.n, why);
      }
      if (RECO.test(it.text.split(/\s[—–]\s/)[0])) add('CX-04', f, it.n, it.text.slice(0, 90));
    }
  }
  const n = visibleLength(ctx.md);
  if (n > CONTEXT_LIMIT) add('CX-05', f, null, `${n} символов при ориентире ${CONTEXT_LIMIT} (без пробелов и разметки)`);
}
// Находки CX-* отдельно от общего списка: старт и задание сабагенту показывают только их.
export function contextFindings(ctx) {
  const saved = findings.splice(0);
  checkContext(ctx);
  const own = findings.splice(0);
  findings.push(...saved);
  return own;
}

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
