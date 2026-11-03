// Вывод на экран: карточка человеку (markdown) и одна строка «⚙ sdd: …» агенту — последней.
// @ts-check
//
// GigaCode показывает человеку вывод MCP-инструмента целиком и рендерит его как markdown: канала
// «только для модели» нет. Поэтому всё, что человек читает, — готовая карточка, её пишет скрипт.
// Модель карточку не перепечатывает: flash-модель склеивает строки и теряет форматирование.
// Агенту остаётся одна строка ⚙: что сделать дальше и с какими args. Что значит каждая её часть —
// в правилах планирования (rules/AGENTS.planning.md, «Вывод sdd_lint»).
//
// Карточка устойчива к любому markdown-рендеру: абзацы через пустую строку, поля и перечни —
// списком, без отступов пробелами. Проверка — mdProblems: её гоняют тесты на всех выводах.
import { lintBase } from './config.mjs';

export const GEAR = '⚙ sdd:';
// args для sdd_lint в строке ⚙ — массив JSON, как его передают в инструмент.
/** @param {string[]} args */
export const A = (args) => JSON.stringify(args);
/** @typedef {string | null | undefined | false} Part */
/** @param {(Part | Part[])[]} parts */
export const gearLine = (...parts) => `${GEAR} ${parts.flat().filter(Boolean).join(' · ')}`;
// Блоки карточки — через пустую строку.
/** @param {(string | null | undefined | (string | null | undefined)[])[]} xs */
export const blocks = (...xs) => xs.flat().filter((x) => x != null && String(x).trim() !== '').map((x) => String(x).trim()).join('\n\n');
/** @param {string | null | undefined} card @param {(Part | Part[])[]} parts */
export const screen = (card, ...parts) => blocks(card, gearLine(...parts));
// Карточка и строка ⚙ из готового вывода — когда choose показывает вывод другой команды.
/** @param {string} text */
export function splitGear(text) {
  const lines = String(text).trimEnd().split('\n');
  const i = lines.findLastIndex((l) => l.startsWith(GEAR));
  return i < 0 ? { card: lines.join('\n').trim(), gear: null } : { card: lines.slice(0, i).join('\n').trim(), gear: lines[i] };
}

// Части строки ⚙. Словарь закрытый: новый вид действия — сначала в правила, потом сюда.
export const G = {
  // Вопрос с вариантами: заголовки — для инструмента выбора, ids по номерам карточки.
  /** @param {string[]} headers @param {string[]} then @param {string[]} ids */
  ask: (headers, then, ids, free = false) => [
    `${headers.length > 1 ? 'вопросы' : 'вопрос'} ${headers.map((h) => `«${h}»`).join(', ')} → ${A(then)}`,
    `варианты: ${ids.map((id, i) => `${i + 1}=${id}`).join(', ')}`,
    free ? 'своими словами — вместо <id>' : null,
  ],
  wait: (/** @type {string[]} */ then) => `жди ответ → ${A(then)}`,
  call: (/** @type {string[]} */ args) => `вызови ${A(args)}`,
  sub: (/** @type {string[]} */ args) => `сабагент ${A(args)}`,
  then: (/** @type {string[]} */ args) => `затем ${A(args)}`,
  report: 'отчёт сабагента — человеку',
  quiet: 'отчёт сабагента не пересказывай',
  same: 'без сабагентов — то же здесь',
  noSub: (/** @type {string} */ text) => `без сабагентов — скажи «${text}»`,
  say: (/** @type {string} */ text) => `скажи «${text}»`,
  skill: 'дальше по скиллу',
  stop: 'стоп',
};

/** @param {string} s */
export const bold = (s) => `**${s}**`;
/** @param {string} k @param {string | null | undefined} v */
export const field = (k, v) => `- **${k}:** ${v || '—'}`;
/** @param {(string | null | undefined | false)[]} items */
export const list = (items) => items.filter(Boolean).map((x) => `- ${x}`).join('\n');

// Пути к файлам и папкам доков — inline-кодом; то, что уже в бэктиках, не трогаем.
const PATH_RE =
  /(?<![`\w./:@-])((?:[\w.@-]+\/)*[\w.@-]+\.(?:md|json|ya?ml)(?::\d+)?|(?:[\w.@-]+\/)+[\w@-]+\.[A-Za-z0-9]{1,6}(?::\d+)?|(?:[\w.@-]+\/)+)(?![`\w])/g;
/** @param {string | null | undefined} s @param {(part: string) => string} f */
const outsideCode = (s, f) =>
  String(s ?? '')
    .split(/(`[^`\n]*`)/)
    .map((part, i) => (i % 2 ? part : f(part)))
    .join('');
/** @param {string | null | undefined} s */
export const codePaths = (s) => outsideCode(s, (x) => x.replace(PATH_RE, '`$1`'));
// Команды скиллов и lint в описаниях вариантов — inline-кодом: в карточке их видно, в инструменте
// выбора описание остаётся текстом без бэктиков.
/** @param {string} s */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Команда lint берётся из окружения на каждый вызов — регулярное выражение тоже.
const cmdRe = () =>
  new RegExp(`(?<![\\w/\`])((?:\\/(?:sdd-[a-z]+|humanizer)\\b|${esc(lintBase())}(?=\\s|$))(?: (?:"[^"]*"|[A-Za-z0-9_.@/:|<>-]+))*)`, 'g');
/** @param {string | null | undefined} s */
export const cmdCode = (s) => outsideCode(s, (x) => x.replace(cmdRe(), '`$1`'));

// Вид строки для mdProblems: пустая, пункт списка, строка таблицы, заголовок или текст абзаца.
/** @param {string} l */
function lineKind(l) {
  if (!l.trim()) return 'blank';
  if (/^\s*([-*+]|\d+\.)\s/.test(l)) return 'item';
  if (/^\s*\|/.test(l)) return 'table';
  return /^#{1,6}\s/.test(l) ? 'head' : 'text';
}
/** @param {string} l @param {string} kind @param {string} prev */
function lineProblem(l, kind, prev) {
  if (kind === 'item' && /^\s+/.test(l) && prev !== 'item') return 'вложенный пункт без родителя';
  if (kind !== 'text') return null;
  if (/^\s/.test(l)) return 'отступ без маркера списка';
  if (prev === 'item') return 'текст сразу после списка — приклеится к пункту';
  if (prev === 'text') return 'две строки абзаца подряд — склеятся';
  return null;
}

// Где markdown развалится: строка с отступом без маркера списка, абзац сразу после пункта списка
// (ленивое продолжение приклеит его к пункту), строки абзаца подряд без пустой строки.
// Таблицы и блоки кода не проверяются. Возвращает [номер строки, что не так].
/** @param {string} text @returns {[number, string][]} */
export function mdProblems(text) {
  /** @type {[number, string][]} */
  const out = [];
  let fence = false;
  let prev = 'blank';
  const lines = String(text).split('\n');
  lines.forEach((l, i) => {
    if (/^\s*```/.test(l)) {
      fence = !fence;
      prev = 'blank';
      return;
    }
    if (fence) return;
    const kind = lineKind(l);
    const problem = lineProblem(l, kind, prev);
    if (problem) out.push([i + 1, problem]);
    prev = kind;
  });
  return out;
}
