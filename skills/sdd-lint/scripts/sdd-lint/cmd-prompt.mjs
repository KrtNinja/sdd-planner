// Команда prompt: скилл sdd-* и его файлы одним текстом.
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lintCmd } from './config.mjs';
import { loadFeature } from './feature.mjs';
import { read, uniq } from './md.mjs';
import { DOCS, isDir, pickFeature, needDir } from './pick.mjs';

/** @typedef {import('./io.mjs').Ctx} Ctx */

// Скилл одним текстом: SKILL.md без шапки и файлы, на которые он ссылается.
// Агент получает его через MCP и не читает файлы расширения вне проекта; disable-model-invocation
// не снимается — скилл попадает к агенту только через вариант, который выбрал человек.
// Точка входа lint — по месту этого модуля, а не по process.argv: тот же файл, что запущен (и через симлинк).
export const SELF = fileURLToPath(new URL('../sdd-lint.mjs', import.meta.url));
export const SKILLS_DIR = path.resolve(path.dirname(SELF), '..', '..');
export const promptSkills = () =>
  isDir(SKILLS_DIR)
    ? fs.readdirSync(SKILLS_DIR).filter((x) => /^sdd-[a-z]+$/.test(x) && x !== 'sdd-lint' && fs.existsSync(path.join(SKILLS_DIR, x, 'SKILL.md')))
    : [];
// Аргументы с пробелами — в кавычках: у /sdd-decide вопрос и решение не должны слиться в одну строку.
/** @param {string[]} args */
const shownArgs = (args) => args.map((a) => (/\s/.test(a) || a === '' ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ');
// Скилл в сабагенте (--sub): человек его не видит, итог — последним сообщением.
const SUB =
  'Ты сабагент: человеку вопросов не задавай. Когда done вернёт вопрос этапа, не задавай его — последним сообщением выведи ' +
  'список изменений (файл → ID → что изменилось). Без ответа человека дальше нельзя — выведи вопрос последним сообщением и остановись.';

// Номер ADR для ревью: назван — он; не назван — единственный ADR фичи; иначе нет.
/** @param {string | undefined} arg @param {string[]} nums */
function adrNum(arg, nums) {
  if (arg) return arg.padStart(4, '0');
  return nums.length === 1 ? nums[0] : null;
}

// Задача сабагенту убрать AI стиль: humanizer, затем guard скриптом. target — spec.md, ADR или папка фичи (slices).
/** @param {string} target */
export function humanizeTask(target) {
  const files = /\.md$/.test(target) ? target : `каждому файлу в ${target.replace(/\/$/, '')}/slices/`;
  return [
    `# Убрать AI стиль: ${target}`,
    '',
    `Загрузи скилл humanizer и примени его к ${files}: меняй только прозу вне блоков кода; ID, строки шапки, заголовки,`,
    'таблицы, тексты в «ёлочках», числа и сроки не трогай.',
    `Затем вызови sdd_lint с args ${JSON.stringify(['guard', target])}; при ошибках верни защищённые части как были и повтори guard.`,
    'Последним сообщением — итог guard.',
  ].join('\n');
}
// name — скилл из списка promptSkills: SKILL.md у него есть.
/** @param {Ctx} ctx @param {string} name @param {string[]} args */
export function skillPrompt(ctx, name, args) {
  const { flags } = ctx.args;
  const dir = path.join(SKILLS_DIR, name);
  const body = /** @type {string} */ (read(path.join(dir, 'SKILL.md'))).replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  let links = uniq([...body.matchAll(/\]\(((?:references|assets)\/[^)\s]+\.md)\)/g)].map((x) => x[1]));
  // Ревьюеру — только чеклист своего режима.
  if (name === 'sdd-review') links = links.filter((f) => !f.startsWith('references/') || f === `references/${args[1]}.md`);
  const note = flags.note ? ['', flags.note] : [];
  const head =
    name === 'sdd-review'
      ? [
          `# Ревью SDD: ${shownArgs(args)}`,
          '',
          'Ты ревьюер-сабагент в чистом контексте: как писали артефакт, тебе не передано. Суди только по файлам',
          `в ${DOCS}/${args[0]}/ и ${DOCS}/adr/; корень репозитория — текущая папка.`,
          'Последним сообщением выведи таблицу находок и итог из шага 5 — его прочитает человек;',
          'свои шаги не пересказывай. Шаг 6 не выполняй: находки с человеком разберёт основное окно.',
        ]
      : [`# Скилл ${name}: ${shownArgs(args)}`, '', flags.sub ? SUB : 'Человек выбрал этот шаг — выполняй скилл ниже здесь, в этом окне.', ...note];
  return [
    ...head,
    `Аргументы скилла: \`${shownArgs(args)}\`. Lint — инструмент MCP \`sdd_lint\`. Нет его в списке — найди поиском инструментов; ` +
      `вызов не удался — вопрос из «Если sdd_lint не отвечает» в правилах планирования; скрипт для вариантов 2 и 3 — \`${SELF}\`.`,
    links.length ? 'Файлы, на которые ссылается скилл, приложены в конце — их не открывай.' : null,
    '',
    '---',
    '',
    body,
    ...links.flatMap((f) => {
      const t = read(path.join(dir, f));
      return t == null ? [] : ['', '---', '', `Файл скилла ${f}:`, '', t.trim()];
    }),
  ]
    .filter((x) => x !== null)
    .join('\n');
}
/** @param {Ctx} ctx */
export function cmdPrompt(ctx) {
  const { pos } = ctx.args;
  const known = promptSkills();
  const name = pos[0];
  if (name === 'humanize' && pos[1]) {
    ctx.io.log(humanizeTask(pos[1]));
    ctx.io.exit(0);
  }
  if (!known.includes(name)) {
    ctx.io.error(`${name ? `Нет скилла «${name}»` : 'Укажи скилл'}. Скиллы: ${known.join(', ')}`);
    ctx.io.exit(2);
  }
  const args = pos.slice(1);
  if (args.length) {
    const m = loadFeature(needDir(ctx, args[0], 1));
    args[0] = m.name;
    if (name === 'sdd-review') {
      if (!['spec', 'slices', 'adr'].includes(args[1])) {
        ctx.io.error(`Режим ревью: ${['spec', 'slices', 'adr'].map((x) => lintCmd('prompt', name, m.name, x)).join(', ')}`);
        ctx.io.exit(2);
      }
      if (args[1] === 'adr') {
        const nums = m.featureAdrs.map((a) => a.num);
        const num = adrNum(args[2], nums);
        if (!num || !nums.includes(num)) {
          const list = nums.length ? nums.map((n) => `  ${lintCmd('prompt', name, m.name, 'adr', n)}`).join('\n') : '  у фичи нет ADR';
          ctx.io.error(`${args[2] ? `ADR ${args[2]} у фичи нет` : 'Укажи номер ADR'}:\n${list}`);
          ctx.io.exit(2);
        }
        args[2] = num;
      }
    }
  } else if (name !== 'sdd-grill') pickFeature(ctx, 'Укажи фичу', 1);
  ctx.io.log(skillPrompt(ctx, name, args));
  ctx.io.exit(0);
}
