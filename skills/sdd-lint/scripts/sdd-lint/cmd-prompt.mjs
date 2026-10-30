// Команда prompt: скилл sdd-* и его файлы одним текстом.
import fs from 'node:fs';
import path from 'node:path';

import { flags, pos } from './args.mjs';
import { lintCmd } from './config.mjs';
import { loadFeature } from './feature.mjs';
import { read, uniq } from './md.mjs';
import { DOCS, isDir, pickFeature, needDir } from './pick.mjs';

// Скилл одним текстом: SKILL.md без шапки и файлы, на которые он ссылается.
// Агент получает его через MCP и не читает файлы расширения вне проекта; disable-model-invocation
// не снимается — скилл попадает к агенту только через вариант, который выбрал человек.
export const SELF = fs.realpathSync(process.argv[1]);
export const SKILLS_DIR = path.resolve(path.dirname(SELF), '..', '..');
export const promptSkills = () => (isDir(SKILLS_DIR) ? fs.readdirSync(SKILLS_DIR).filter((x) => /^sdd-[a-z]+$/.test(x) && x !== 'sdd-lint' && fs.existsSync(path.join(SKILLS_DIR, x, 'SKILL.md'))) : []);
// Аргументы с пробелами — в кавычках: у /sdd-decide вопрос и решение не должны слиться в одну строку.
const shownArgs = (args) => args.map((a) => (/\s/.test(a) || a === '' ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ');
export function skillPrompt(name, args) {
  const dir = path.join(SKILLS_DIR, name);
  const body = read(path.join(dir, 'SKILL.md')).replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  let links = uniq([...body.matchAll(/\]\(((?:references|assets)\/[^)\s]+\.md)\)/g)].map((x) => x[1]));
  // Ревьюеру — только чеклист своего режима.
  if (name === 'sdd-review') links = links.filter((f) => !f.startsWith('references/') || f === `references/${args[1]}.md`);
  const head =
    name === 'sdd-review'
      ? [
          `# Ревью SDD: ${shownArgs(args)}`,
          '',
          'Ты ревьюер в чистом контексте: как писали артефакт, тебе не передано. Суди только по файлам',
          `в ${DOCS}/${args[0]}/ и ${DOCS}/adr/; корень репозитория — текущая папка.`,
          'Последним сообщением выведи таблицу находок и итог из шага 5 — его прочитает человек;',
          'свои шаги не пересказывай.',
        ]
      : [`# Скилл ${name}: ${shownArgs(args)}`, '', 'Человек выбрал этот шаг — выполняй скилл ниже здесь, в этом окне.'];
  return [
    ...head,
    `Аргументы скилла: \`${shownArgs(args)}\`. Lint — инструмент MCP \`sdd_lint\`. Нет его или не отвечает — вопрос из «Если sdd_lint не отвечает» в правилах планирования; скрипт для вариантов 2 и 3 — \`${SELF}\`.`,
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
export function cmdPrompt() {
  const known = promptSkills();
  const name = pos[0];
  if (!known.includes(name)) {
    console.error(`${name ? `Нет скилла «${name}»` : 'Укажи скилл'}. Скиллы: ${known.join(', ')}`);
    process.exit(2);
  }
  const args = pos.slice(1);
  if (args.length && !flags.raw) {
    const m = loadFeature(needDir(args[0], 1));
    args[0] = m.name;
    if (name === 'sdd-review') {
      if (!['spec', 'slices', 'adr'].includes(args[1])) {
        console.error(`Режим ревью: ${['spec', 'slices', 'adr'].map((x) => lintCmd('prompt', name, m.name, x)).join(', ')}`);
        process.exit(2);
      }
      if (args[1] === 'adr') {
        const nums = m.featureAdrs.map((a) => a.num);
        const num = args[2] ? args[2].padStart(4, '0') : nums.length === 1 ? nums[0] : null;
        if (!num || !nums.includes(num)) {
          const list = nums.length ? nums.map((n) => `  ${lintCmd('prompt', name, m.name, 'adr', n)}`).join('\n') : '  у фичи нет ADR';
          console.error(`${args[2] ? `ADR ${args[2]} у фичи нет` : 'Укажи номер ADR'}:\n${list}`);
          process.exit(2);
        }
        args[2] = num;
      }
    }
  } else if (name !== 'sdd-grill' && !flags.raw) pickFeature('Укажи фичу', 1);
  console.log(skillPrompt(name, args));
  process.exit(0);
}
