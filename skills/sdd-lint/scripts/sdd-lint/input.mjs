// Разбор того, что человек написал после /sdd-grill: задача, имя папки, источники; опись репозитория для вопроса об источниках.
// @ts-check
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { inventory } from './inventory.mjs';

import { DOCS, isDir, resolveFeature } from './pick.mjs';

/** Задача — одно из: фраза, файл или ссылка. @typedef {{ text?: string, file?: string, url?: string }} Task */
/**
 * Что пришло после /sdd-grill (classify). sources — пути и ссылки, missing — похожие на путь, но не найденные.
 * @typedef {{ kind: 'empty', slug?: undefined, sources: string[], missing: string[] }
 *   | { kind: 'feature', dir: string, slug?: undefined, sources: string[], missing: string[] }
 *   | { kind: 'need-task', slug: string | null, task?: null, sources: string[], missing: string[] }
 *   | { kind: 'task', slug: string | null, task: Task, sources: string[], missing: string[] }} Input
 */

// Имя папки фичи: латиница, цифры, дефис — его набирают в командах и видят в путях. Регистр — как дал
// человек (PROJECT-4567 — ключ тикета); имена, которые отличаются только регистром, — одна папка (caseTwin).
const SLUG_RE = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
export const SLUG_MAX = 40;
// Ключ тикета: PROJECT-4567, ABC-12.
const TICKET_RE = /^[A-Z][A-Z0-9]*-\d+$/;
// Слово, похожее на имя папки в начале /sdd-grill: строчное через дефис или ключ тикета. «E-mail …», «Wi-Fi …» — задача.
/** @param {string} w */
const nameLike = (w) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(w) || TICKET_RE.test(w);
// Значения строки «Источники:» в протоколе. Остальное — пути и ссылки.
export const REPO = 'репозиторий';
export const NEW_PROJECT = 'нет — новый проект';

const URL_RE = /https?:\/\/[^\s<>«»"'`]+/g;
const DOC_EXT = /\.(md|markdown|txt|adoc|rst|docx?|pdf|html?|ya?ml|json)$/i;
/** @param {string} p */
const expand = (p) => p.replace(/^~(?=$|[\\/])/, os.homedir());
/** @param {string} p */
const exists = (p) => fs.existsSync(expand(p));
/** @param {string} p */
const isFile = (p) => exists(p) && fs.statSync(expand(p)).isFile();
// Путь вне папки, из которой запущен агент: GigaCode может не дать его читать без /directory add.
/** @param {string} p */
export const outside = (p) => !/^https?:/.test(p) && p !== REPO && path.relative(process.cwd(), path.resolve(expand(p))).startsWith('..');
/** @param {string} t */
const clean = (t) => t.replace(/^[@«"'([]+/, '').replace(/[»"'),.;:!?\]]+$/, '');
/** @param {string} s */
const unquote = (s) => s.trim().replace(/^[«"'](.*)[»"']$/s, '$1').trim();
/** @param {string} s */
const words = (s) => (s.match(/[\p{L}\d]+/gu) || []).length;
// Служебные слова по краям: «вот», «источники:», «и» — в задачу не попадают.
const FILLER = /^(?:вот|тут|здесь|см\.?|и|а|документация:?|документы:?|источники:?|код:?|задача:?)(?:\s+|$)/i;
/** @param {string} s */
function trimFiller(s) {
  let t = s.trim().replace(/^[,;:—–-]+|[,;:—–-]+$/g, '').trim();
  for (let i = 0; i < 5 && FILLER.test(t); i++) t = t.replace(FILLER, '').trim();
  return t;
}

/** @param {string} token @param {string} cleaned */
function looksLikePath(token, cleaned) {
  return cleaned && (/[\\/]/.test(cleaned) || DOC_EXT.test(cleaned) || /^[@~.]/.test(token));
}
/** @param {string} token @param {string} cleaned */
function definitelyPath(token, cleaned) {
  return /^@|^\.{1,2}[\\/]|^~[\\/]|^\//.test(token) ||
    (/^[\w.~-]+([\\/][\w.~-]*)+$/.test(cleaned) && (DOC_EXT.test(cleaned) || /[\\/]$/.test(token)));
}

// Свободный текст → ссылки, найденные пути, похожие на путь, но не найденные, остальные слова.
/** @param {string | null | undefined} raw */
function splitInput(raw) {
  const urls = [...(raw || '').matchAll(URL_RE)].map((m) => m[0].replace(/[.,;:!?)\]]+$/, ''));
  /** @type {string[]} */
  const paths = [];
  /** @type {string[]} */
  const missing = [];
  /** @type {string[]} */
  const rest = [];
  for (const t of (raw || '').replace(URL_RE, ' ').split(/\s+/).filter(Boolean)) {
    const c = clean(t);
    const pathy = looksLikePath(t, c);
    if (pathy && exists(c)) paths.push(c.replace(/[\\/]+$/, '') || c);
    // Не найден — только если это точно путь: с @, ./, ../, ~/ или латиницей через «/» с расширением
    // или «/» в конце. «A/B-тест» и «фронт/бэк» — слова.
    else if (pathy && definitelyPath(t, c))
      missing.push(c);
    else rest.push(t);
  }
  return { urls, paths, missing, phrase: unquote(trimFiller(rest.join(' '))) };
}

/** @param {string} dir */
const hasArtifacts = (dir) => ['brainstorming.md', 'spec.md'].some((f) => fs.existsSync(path.join(dir, f)));
// «comments», «docs/comments», «@docs/comments/» — фича в docs/; файл задачи внутри docs/ фичей не считается.
/** @param {string} token */
function asFeature(token) {
  const f = resolveFeature(token);
  if (!f || path.resolve(path.dirname(f)) !== path.resolve(DOCS)) return null;
  if (hasArtifacts(f)) return f;
  return isFile(token) ? null : f;
}

/** @param {string} text */
function namedTask(text) {
  /** @type {string | null} */
  let slug = null;
  let rest = text;
  // Старая форма «/sdd-grill <feature> "фраза"»: имя первым словом — строчное с дефисом или ключ тикета,
  // задача дальше в кавычках или папка уже в docs/.
  const m = text.match(/^@?([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)\s+([\s\S]+)$/);
  if (m && ((nameLike(m[1]) && m[1].includes('-')) || /^["«]/.test(m[2]) || isDir(path.join(DOCS, m[1])))) {
    slug = m[1];
    rest = m[2];
  }
  return { slug, rest };
}

/** @param {ReturnType<typeof splitInput>} s @param {string[]} files */
function phraseIsTask(s, files) {
  return words(s.phrase) >= 3 || (s.phrase && !files.length && !(s.urls.length && words(s.phrase) < 2));
}
/** @param {ReturnType<typeof splitInput>} s */
function taskAndSources(s) {
  const files = s.paths.filter(isFile);
  /** @type {Task | null} */
  let task = null;
  let sources = [...s.paths, ...s.urls];
  // Задача — фраза; файл задачи — если он один, а слов рядом почти нет («вот задача @docs/x.md»).
  if (phraseIsTask(s, files)) task = { text: s.phrase };
  else if (files.length === 1) {
    task = { file: files[0] };
    sources = sources.filter((x) => x !== files[0]);
  } else if (!s.paths.length && s.urls.length === 1) {
    task = { url: s.urls[0] };
    sources = [];
  }
  return { task, sources };
}

/** @param {string} text @returns {Input | null} */
function singleInput(text) {
  if (/\s/.test(text)) return null;
  const f = asFeature(text.replace(/^@/, ''));
  if (f) return { kind: 'feature', dir: f, sources: [], missing: [] };
  // Старая форма «/sdd-grill <feature>»: одно имя без задачи.
  if (nameLike(text) && !exists(text)) return { kind: 'need-task', slug: text, sources: [], missing: [] };
  return null;
}

// Что пришло после /sdd-grill. kind: empty — ничего; feature — существующая фича; task — задача
// (фраза, файл или ссылка) и, возможно, имя папки; need-task — только имя папки или источники.
/** @param {string | null | undefined} raw @returns {Input} */
export function classify(raw) {
  const text = (raw || '').trim();
  if (!text) return { kind: 'empty', sources: [], missing: [] };
  const single = singleInput(text);
  if (single) return single;
  const { slug, rest } = namedTask(text);
  const s = splitInput(rest);
  if (slug) {
    const f = asFeature(slug);
    if (f && hasArtifacts(f)) return { kind: 'feature', dir: f, sources: [...s.paths, ...s.urls], missing: s.missing };
  }
  const { task, sources } = taskAndSources(s);
  return /** @type {Input} */ ({ kind: task ? 'task' : 'need-task', slug, task, sources, missing: s.missing });
}

// Имя папки из имени файла задачи, если оно уже латиницей: user-settings.md → user-settings, PROJECT-4567.md → PROJECT-4567.
const GENERIC = /^(readme|index|task|tasks|spec|prd|brief|req|requirements|doc|docs|draft|new|todo|notes?|tz|ticket|issue|story|feature)$/i;
/** @param {string} file */
export function slugFromFile(file) {
  const base = path.basename(file).replace(/\.[^.]+$/, '').replace(/[_\s.]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return SLUG_RE.test(base) && base.length <= SLUG_MAX && !GENERIC.test(base) ? base : null;
}
// Имя папки, которое написал человек. Регистр не трогаем — это его выбор; меняем только то, без чего имя
// не годится: «docs/Pay_Refund/» → Pay-Refund, «user settings» → user-settings, «давай PROJECT-4567» → PROJECT-4567
// (одно слово-имя среди прочих). Не вышло — ответ как есть: его разберёт slugProblem.
/** @param {string} s */
const toSlug = (s) =>
  s
    .replace(/^[`«"'@]+|[`»"'.,!;:]+$/g, '')
    .replace(/^\.?\/?docs\//, '')
    .replace(/\/+$/, '')
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
/** @param {string | null | undefined} answer */
export function slugFromAnswer(answer) {
  const a = (answer || '').trim();
  const whole = toSlug(a);
  if (SLUG_RE.test(whole)) return whole;
  const one = a.split(/\s+/).map(toSlug).filter((x) => SLUG_RE.test(x));
  return one.length === 1 ? one[0] : a;
}
/** @param {string | null | undefined} slug */
export function slugProblem(slug) {
  const s = slug || '';
  if (!SLUG_RE.test(s) || s.length > SLUG_MAX) return `«${s}» не подходит: латиница, цифры и дефис, до ${SLUG_MAX} знаков`;
  if (s.toLowerCase() === 'adr') return `«${s}» занято: там лежат ADR`;
  return null;
}
// Папка в docs/, имя которой отличается от slug только регистром: на macOS и Windows это одна папка,
// а git на Linux видит две. except — своя папка (переименование PROJECT → project).
/** @param {string} slug @param {string | null} [except] */
export function caseTwin(slug, except = null) {
  if (!isDir(DOCS)) return null;
  return fs.readdirSync(DOCS).find((x) => x !== slug && x !== except && x.toLowerCase() === slug.toLowerCase() && isDir(path.join(DOCS, x))) || null;
}

/** @param {Task | null | undefined} task */
function taskTitle(task) {
  let t = '';
  if (task?.text) t = task.text.split(/(?<=[.!?])\s/)[0].replace(/[.!?]+$/, '');
  else if (task?.file) t = ((fs.readFileSync(expand(task.file), 'utf8').match(/^#\s+(.+)$/m) || [])[1] || '').trim();
  return t;
}

// Заголовок протокола: первое предложение фразы или заголовок файла задачи.
/** @param {Task | null | undefined} task @param {string} slug */
export function titleOf(task, slug) {
  let t = taskTitle(task);
  t = t || slug;
  if (t.length > 70) t = `${t.slice(0, 70).replace(/\s+\S*$/, '')}…`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}
/** @param {Task} task */
export function requestOf(task) {
  if (task.text) return `«${task.text}»`;
  return task.file ? `файл ${task.file}` : `ссылка ${task.url}`;
}

/** @param {string} a */
function sourceReply(a) {
  if (/нов(ый|ая|ое)\s+(проект|сервис|продукт)|с нуля/i.test(a)) return { entries: [NEW_PROJECT], missing: [] };
  if (/^(нет|не(?!\p{L})|ничего|нечего|хватит|достаточно)/iu.test(a)) return { entries: [], none: true, missing: [] };
  if (/готов|добавил|дал доступ|открыл|повтор/i.test(a)) return { entries: [], retry: true, missing: [] };
  return { entries: [], missing: [], unclear: true };
}

// Ответ человека на вопрос об источниках → записи «Источники:» или что переспросить.
// none — источников больше нет; retry — человек дал доступ и просит изучить снова.
/** @param {string | null | undefined} answer
 * @returns {{ entries: string[], missing: string[], none?: boolean, retry?: boolean, unclear?: boolean }} */
export function parseSourcesAnswer(answer) {
  const a = (answer || '').trim();
  if (a === REPO || a === NEW_PROJECT) return { entries: [a], missing: [] };
  const s = splitInput(a);
  const entries = [...s.paths, ...s.urls];
  if (/(?<!\p{L})репозитори|в этой папке|что есть/iu.test(s.phrase) && !/^нет(?!\p{L}).*нов/iu.test(s.phrase)) entries.unshift(REPO);
  if (entries.length || s.missing.length) return { entries, missing: s.missing };
  return sourceReply(a);
}

// Опись репозитория вынесена отдельно от разбора свободного ввода.
export { inventory };
