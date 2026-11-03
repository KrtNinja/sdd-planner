// Находки проверок и отчёт: текст или --json.
// @ts-check
import { cmds } from './config.mjs';
import { rel, uniq } from './md.mjs';
import { RULES } from './rules.mjs';

/** @typedef {import('./io.mjs').Ctx} Ctx */
/** @typedef {import('./model.mjs').Finding} Finding */

// Находка правила rule: уровень — из каталога rules.mjs, путь — от корня репозитория.
/** @param {string} rule @param {string | null | undefined} file @param {number | null | undefined} line @param {string} msg @returns {Finding} */
export const finding = (rule, file, line, msg) => ({ rule, level: RULES[rule][0], file: rel(file), line: line || null, msg });
// add для своего массива находок: adder(list)(rule, file, line, msg).
/** @param {Finding[]} list @returns {(rule: string, file: string | null | undefined, line: number | null | undefined, msg: string) => void} */
export const adder = (list) => (rule, file, line, msg) => {
  list.push(finding(rule, file, line, msg));
};
// Сборщик находок одной проверки: const { found, add } = collect(); … return found.
export function collect() {
  /** @type {Finding[]} */
  const found = [];
  return { found, add: adder(found) };
}
// Общая проверка артефактов: нет строки «Статус:» (PR-01, SP-01, AD-01).
/** @param {string} rule @param {string} file @param {string | null | undefined} status @param {number | null} [line] */
export const noStatus = (rule, file, status, line = 1) => (status ? [] : [finding(rule, file, line, 'нет строки «Статус:»')]);
/** @param {Finding[]} list */
export const hasErrors = (list) => list.some((x) => x.level === 'err');
/** @param {Finding[]} list */
export const errorsOf = (list) => list.filter((x) => x.level === 'err');

// Находка — пункт списка markdown: в выводе MCP его рендерит GigaCode, в терминале он тоже читается.
const LEVEL = { err: 'ОШИБКА', warn: 'ВНИМАНИЕ', info: 'ИНФО' };
/** @param {Finding} x */
export const line = (x) => `**${LEVEL[x.level]}** \`${x.rule}\` \`${x.file}${x.line ? `:${x.line}` : ''}\` — ${x.msg}`;
/** @param {Finding} x */
export const item = (x) => `- ${line(x)}`;
const ORDER = { err: 0, warn: 1, info: 2 };
/** @param {Finding} a @param {Finding} b */
const compareFindings = (a, b) => ORDER[a.level] - ORDER[b.level] || a.file.localeCompare(b.file) || (a.line || 0) - (b.line || 0);

// Печатает находки (сортирует список на месте) и возвращает счётчики по уровням.
/** @param {Ctx} ctx @param {Finding[]} findings */
export function report(ctx, findings, extra = {}) {
  findings.sort(compareFindings);
  const counts = { err: 0, warn: 0, info: 0 };
  for (const x of findings) counts[x.level] += 1;
  if (ctx.args.flags.json) {
    const hints = Object.fromEntries(uniq(findings.map((x) => x.rule)).map((r) => [r, cmds(RULES[r][1])]));
    ctx.io.log(JSON.stringify({ findings, hints, counts, ...extra }, null, 2));
    return counts;
  }
  for (const x of findings) ctx.io.log(item(x));
  const fired = uniq(findings.filter((x) => x.level !== 'info').map((x) => x.rule)).sort();
  if (fired.length) {
    ctx.io.log('\nКак исправить:');
    for (const r of fired) ctx.io.log(`- \`${r}\` — ${cmds(RULES[r][1])}`);
  }
  return counts;
}
