// prompt напрямую: полный текст ревьюера и результат humanize/выбора фичи.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cmdPrompt, skillPrompt, SKILLS_DIR, SELF } from '../skills/sdd-lint/scripts/sdd-lint/cmd-prompt.mjs';
import { createIo, Exit } from '../skills/sdd-lint/scripts/sdd-lint/io.mjs';
import { parseArgs } from '../skills/sdd-lint/scripts/sdd-lint/args.mjs';
import { repo, inDir, JSON_ENV } from './helpers.mjs';

const context = (...argv) => ({ args: parseArgs(['prompt', ...argv]), io: createIo() });

test('skillPrompt: ревьюеру переданы фича, режим, полный скилл и только его чеклист', () => {
  const read = (f) => fs.readFileSync(path.join(SKILLS_DIR, 'sdd-review', f), 'utf8').trim();
  const body = read('SKILL.md').split('\n').slice(7).join('\n').trim();
  const expected = [
    '# Ревью SDD: search spec', '',
    'Ты ревьюер-сабагент в чистом контексте: как писали артефакт, тебе не передано. Суди только по файлам',
    'в docs/search/ и docs/adr/; корень репозитория — текущая папка.',
    'Последним сообщением выведи таблицу находок и итог из шага 5 — его прочитает человек;',
    'свои шаги не пересказывай. Шаг 6 не выполняй: находки с человеком разберёт основное окно.',
    'Аргументы скилла: `search spec`. Lint — инструмент MCP `sdd_lint`. Нет его в списке — найди поиском инструментов; ' +
      `вызов не удался — вопрос из «Если sdd_lint не отвечает» в правилах планирования; скрипт для вариантов 2 и 3 — \`${SELF}\`.`,
    'Файлы, на которые ссылается скилл, приложены в конце — их не открывай.', '', '---', '', body,
    '', '---', '', 'Файл скилла references/spec.md:', '', read('references/spec.md'),
    '', '---', '', 'Файл скилла assets/review.md:', '', read('assets/review.md'),
  ].join('\n');
  assert.equal(skillPrompt(context(), 'sdd-review', ['search', 'spec']), expected);
});

test('cmdPrompt: humanize — целевой файл и код 0', () => {
  const ctx = context('humanize', 'docs/search/spec.md');
  assert.throws(() => cmdPrompt(ctx), (e) => e instanceof Exit && e.code === 0);
  assert.deepEqual(ctx.io.chunks, [[1, [
    '# Убрать AI стиль: docs/search/spec.md', '',
    'Загрузи скилл humanizer и примени его к docs/search/spec.md: меняй только прозу вне блоков кода; ID, строки шапки, заголовки,',
    'таблицы, тексты в «ёлочках», числа и сроки не трогай.',
    'Затем вызови sdd_lint с args ["guard","docs/search/spec.md"]; при ошибках верни защищённые части как были и повтори guard.',
    'Последним сообщением — итог guard.', '',
  ].join('\n')]]);
});

test('cmdPrompt: пустая фича сохраняет имя скилла в предлагаемой команде', () => {
  inDir(repo({ 'docs/search/spec.md': '' }), JSON_ENV, () => {
    const ctx = context('sdd-review', '');
    assert.throws(() => cmdPrompt(ctx), (e) => e instanceof Exit && e.code === 2);
    assert.deepEqual(ctx.io.chunks, [[2, 'Укажи фичу. Фичи в `docs/`:\n\n- `node scripts/sdd-lint.mjs prompt sdd-review search`\n']]);
  });
});

test('cmdPrompt: humanize без цели не запускает задание', () => {
  const ctx = context('humanize');
  assert.throws(() => cmdPrompt(ctx), (e) => e instanceof Exit && e.code === 2);
  assert.deepEqual(ctx.io.chunks, [[2,
    'Нет скилла «humanize». Скиллы: sdd-adr, sdd-close, sdd-decide, sdd-grill, sdd-review, sdd-slices, sdd-spec\n']]);
});

test('cmdPrompt: ошибки режима и отсутствующего ADR возвращают полный выбор', () => {
  inDir(repo({ 'docs/search/spec.md': '# Search\n' }), JSON_ENV, () => {
    for (const [args, text] of [
      [['sdd-review', 'search', 'bad'], 'Режим ревью: node scripts/sdd-lint.mjs prompt sdd-review search spec, node scripts/sdd-lint.mjs prompt sdd-review search slices, node scripts/sdd-lint.mjs prompt sdd-review search adr'],
      [['sdd-review', 'search', 'adr'], 'Укажи номер ADR:\n  у фичи нет ADR'],
      [['sdd-review', 'search', 'adr', '9'], 'ADR 9 у фичи нет:\n  у фичи нет ADR'],
    ]) {
      const ctx = context(...args);
      assert.throws(() => cmdPrompt(ctx), (e) => e instanceof Exit && e.code === 2);
      assert.deepEqual(ctx.io.chunks, [[2, `${text}\n`]]);
    }
  });
});
