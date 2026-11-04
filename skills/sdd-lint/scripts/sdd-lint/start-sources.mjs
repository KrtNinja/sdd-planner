// Старт /sdd-grill, источники: строки «Источники:» и «Запрос:» протокола, вопросы об источниках, шаг старта по контексту.
// @ts-check
import fs from 'node:fs';

import { contextFindings, loadContext, markContext, syncContext } from './context.mjs';
import { NEW_PROJECT, REPO, inventory, outside } from './input.mjs';
import { header, rel, setHeader } from './md.mjs';
import { ANSWER } from './question.mjs';
import { blocks, codePaths, list } from './screen.mjs';

/** @typedef {import('./model.mjs').Feature} Feature */
/** @typedef {import('./model.mjs').Protocol} Protocol */
/** @typedef {import('./context.mjs').Context} Context */
/** @typedef {import('./question.mjs').Question} Question */
/** @typedef {import('./question.mjs').Option} Option */
/** Задача из «Запрос:» протокола и сама строка. @typedef {import('./input.mjs').Task & { line: string }} ProtocolTask */
/**
 * Шаг старта по фиче с протоколом «идёт»: sources — спросить источники, research — изучить, fix — контекст
 * не прошёл проверку, after — спросить, что делать с ненайденным, ready — к brainstorming.
 * @typedef {{ step: 'sources', question: Question }
 *   | { step: 'research', src: string[], task: ProtocolTask, ctx: Context | null, question?: undefined }
 *   | { step: 'fix', src: string[], task: ProtocolTask, ctx: Context, errs: import('./model.mjs').Finding[], question?: undefined }
 *   | { step: 'after', src: string[], task: ProtocolTask, ctx: Context, question: Question }
 *   | { step: 'ready', src: string[], task: ProtocolTask, ctx?: Context, question?: undefined }} StartState
 */


// «нет» — источников нет, но проект не новый: о том, как устроено сейчас, спрашиваем человека.
export const NONE = 'нет';
export const SPECIAL = [NEW_PROJECT, NONE];
export const GIVE =
  'Пришлите пути или ссылки — можно несколько, через пробел. Надёжнее пути на этом компьютере: начните с @, Tab дополнит. ' +
  'Внутренние сайты (вики, GitLab) агент может не открыть — тогда сохраните страницу в файл и дайте путь.';
const MORE = 'Пришлите ещё пути или ссылки. Дали доступ к папке (/directory add <путь>) — напишите «готово», изучу заново.';

/** @param {Protocol | null} p */
export function sourcesOf(p) {
  const v = header(p?.md, 'Источники');
  if (!v || /^<.*>$/.test(v) || /^[—–-]?$/.test(v)) return null;
  return v.split(/\s*;\s*/).filter(Boolean);
}
/** @param {Protocol} p @returns {ProtocolTask} */
export function taskOf(p) {
  const q = header(p.md, 'Запрос') || '';
  const f = q.match(/^файл\s+(.+)$/);
  if (f) return { file: f[1].trim(), line: q };
  const u = q.match(/^ссылка\s+(\S+)/);
  if (u) return { url: u[1], line: q };
  return { text: q.replace(/^«|»$/g, ''), line: q };
}
/** @param {string[]} src */
export const projectSources = (src) => src.filter((x) => !SPECIAL.includes(x));
// Что изучать: файл или ссылку задачи, затем источники проекта.
/** @param {import('./input.mjs').Task} task @param {string[]} src @returns {string[]} */
export const researchList = (task, src) => [...[task.file || task.url].filter((x) => x !== undefined), ...projectSources(src)];
/** @param {Feature} m @param {string[]} list */
export const writeSources = (m, list) =>
  fs.writeFileSync(m.protocolFile, setHeader(/** @type {Protocol} */ (m.protocol).md, 'Источники', list.join('; '), ['Запрос', 'Статус']));

/** @param {Feature} m @returns {Question} */
function sourcesQuestion(m) {
  const d = rel(m.dir);
  const inv = inventory(m.name);
  /** @type {Option} */
  const repo = {
    id: 'src:repo',
    label: 'Нет, хватит того, что в этой папке',
    description: 'сабагент изучит то, что уже здесь',
    action: { lint: ['start', d, '--sources', REPO] },
  };
  /** @type {Option} */
  const give = {
    id: 'src:give',
    label: 'Да, пришлю пути или ссылки',
    description: 'следующим сообщением',
    action: { wait: GIVE, then: ['start', d, '--sources', ANSWER] },
  };
  /** @type {Option} */
  const fresh = {
    id: 'src:new',
    label: 'Нет, это новый проект',
    description: 'изучать нечего: спрошу, как должно быть',
    action: { lint: ['start', d, '--sources', NEW_PROJECT] },
  };
  // Есть код или несколько документов — изучить их и не мучить человека; почти пусто — попросить источники.
  const options = sourceOptions(inv, { repo, give, fresh });
  options[0].recommended = true;
  const seen = inv.empty ? 'В этой папке, кроме задачи, ничего нет.' : `В этой папке уже вижу:\n${list(inv.items.map(codePaths))}`;
  return {
    header: 'Источники',
    question: 'Есть дополнительная документация или код, которые помогут понять, как устроен проект?',
    preview: blocks(`Папка задачи: \`${d}\` (другое имя — напишите, какое).`, seen),
    options,
  };
}
// Порядок вариантов «Есть документация?»: рекомендованный — первым. Пусто — прислать источники; есть код или
// несколько документов — изучить то, что здесь; почти пусто — всё же попросить источники.
/** @param {{ empty: boolean, code: number, docs: number }} inv @param {{ repo: Option, give: Option, fresh: Option }} o */
function sourceOptions(inv, { repo, give, fresh }) {
  if (inv.empty) return [give, fresh];
  return inv.code > 0 || inv.docs >= 2 ? [repo, give, fresh] : [give, repo, fresh];
}
// После исследования: ничего не нашлось или не всё открылось — спросить, а не молча идти дальше.
// Что изучено и что не открылось; /directory add — только для папок вне проекта, которые сабагент не открыл.
/** @param {Context} ctx @param {string[]} src */
function afterPreview(ctx, src) {
  const outs = projectSources(src).filter((x) => outside(x) && !/^https?:/.test(x) && ctx.unread.some((u) => u.text.includes(x)));
  const lines = [`Изучил источники: фактов о проекте — ${ctx.facts}.`];
  if (ctx.unread.length) lines.push(`Не прочитал:\n${list(ctx.unread.map((x) => x.text.replace(/^\s*[-*]\s+/, '')))}`);
  if (outs.length) lines.push(`Папки вне проекта GigaCode читает после команды: ${outs.map((x) => `\`/directory add ${x}\``).join(', ')}`);
  return blocks(lines);
}
/** @param {Feature} m @param {Context} ctx @param {string[]} src @returns {Question | null} */
function afterQuestion(m, ctx, src) {
  const d = rel(m.dir);
  const nothing = projectSources(src).length > 0 && ctx.facts === 0;
  if (ctx.accepted || (!nothing && !ctx.unread.length)) return null;
  /** @type {Option} */
  const go = {
    id: 'ctx:go',
    label: 'Продолжаем с тем, что есть',
    description: 'чего нет в источниках, спрошу у вас',
    action: { lint: ['start', d, '--accept'] },
  };
  /** @type {Option} */
  const more = {
    id: 'ctx:more',
    label: 'Дам доступ или пришлю ещё',
    description: 'пути, ссылки или «готово» после /directory add',
    action: { wait: MORE, then: ['start', d, '--sources', ANSWER] },
  };
  const options = nothing ? [more, go] : [go, more];
  options[0].recommended = true;
  return {
    header: 'Источники',
    question: nothing ? 'По задаче в источниках ничего не нашёл. Есть ещё документация или код?' : 'Часть источников не открылась. Как продолжим?',
    preview: afterPreview(ctx, src),
    options,
  };
}

// Контекст фичи. Сабагент переписал шапку — вернуть её, а не изучать всё заново.
/** @param {Feature} m @param {string} key @param {string} taskLine */
function currentContext(m, key, taskLine) {
  const ctx = loadContext(m);
  return ctx && ctx.sources == null && ctx.filled ? syncContext(m, key, taskLine).ctx : ctx;
}
// Контекст ещё не проверен: ошибки — сабагенту на исправление; чисто — отметка «Проверено» и контекст заново.
/** @param {Feature} m @param {Context} ctx @returns {{ ctx: Context, errs: import('./model.mjs').Finding[] }} */
function verifyContext(m, ctx) {
  if (ctx.checked) return { ctx, errs: [] };
  const errs = contextFindings(ctx).filter((x) => x.level === 'err');
  if (errs.length) return { ctx, errs };
  markContext(ctx, 'Проверено');
  return { ctx: /** @type {Context} */ (loadContext(m)), errs: [] };
}

// Что сделать сейчас по фиче с протоколом «идёт». Одно место для start и choose.
// Зовут при протоколе «идёт»: m.protocol есть.
/** @param {Feature} m @returns {StartState} */
export function startState(m) {
  const src = sourcesOf(m.protocol);
  if (!src) return { step: 'sources', question: sourcesQuestion(m) };
  const task = taskOf(/** @type {Protocol} */ (m.protocol));
  const list = researchList(task, src);
  if (!list.length) return { step: 'ready', src, task };
  const key = list.join('; ');
  const ctx = currentContext(m, key, task.line);
  if (!ctx || ctx.sources !== key || (!ctx.checked && !ctx.filled)) return { step: 'research', src, task, ctx };
  const v = verifyContext(m, ctx);
  if (v.errs.length) return { step: 'fix', src, task, ctx: v.ctx, errs: v.errs };
  const question = afterQuestion(m, v.ctx, src);
  return question ? { step: 'after', src, task, ctx: v.ctx, question } : { step: 'ready', src, task, ctx: v.ctx };
}
/** @param {Feature} m @returns {Question | null} */
export const startQuestion = (m) => (m.protocol && !/готов/i.test(m.protocol.status || '') ? startState(m).question || null : null);
