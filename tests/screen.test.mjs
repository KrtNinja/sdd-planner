// Тесты вывода на экран: GigaCode показывает человеку вывод sdd_lint целиком, как markdown.
// Каждый вывод для агента — карточка человеку и одна строка «⚙ sdd: …» последней; карточка не разваливается
// в markdown (абзацы через пустую строку, перечни списком) и не содержит инструкций модели.
// Запуск из корня репозитория: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { GEAR, codePaths, cmdCode, mdProblems, splitGear } from '../skills/sdd-lint/scripts/sdd-lint/screen.mjs';
import { SCREEN_ENV, workspace, runner, repo, REVIEW_ROWS, writeReview } from './helpers.mjs';

// Без SDD_VIEW: то, что видит человек в GigaCode.
const run = runner(SCREEN_ENV);

// Слова, которыми говорят с моделью: в карточке человека их быть не должно.
const AGENT_WORDS = /sdd_lint|instruction|preview|Скажи человеку|Передай человеку|Задай вопрос|выведи |Запусти сабагента|остановись|Сабагентов у тебя/i;

function assertScreen(name, out, { gear = true } = {}) {
  const lines = out.trimEnd().split('\n');
  const gears = lines.filter((l) => l.startsWith(GEAR));
  if (gear) {
    assert.equal(gears.length, 1, `${name}: строк ⚙ ${gears.length}\n${out}`);
    assert.ok(lines[lines.length - 1].startsWith(GEAR), `${name}: строка ⚙ не последняя\n${out}`);
  } else assert.equal(gears.length, 0, `${name}: лишняя строка ⚙\n${out}`);
  const { card } = splitGear(out);
  assert.deepEqual(mdProblems(card), [], `${name}: markdown развалится\n${card}`);
  assert.doesNotMatch(card, AGENT_WORDS, `${name}: в карточке — инструкция модели`);
  assert.doesNotMatch(card, /^\s*[{[]"?/m, `${name}: в карточке JSON`);
}

test('выводы для агента: одна строка ⚙ последней, карточка — чистый markdown без инструкций модели', () => {
  const cwd = workspace();
  const flows = [
    ['ask', 'docs/comments'],
    ['choose', 'docs/comments', 'review-here:slices'],
    ['choose', 'docs/comments', 'review-here:slices', '--fallback'],
    ['choose', 'docs/comments', 'review-window:slices'],
    ['choose', 'docs/comments', 'humanize:slices'],
    ['choose', 'docs/comments', 'nope'],
    ['gate', 'spec', 'docs/comments'],
    ['gate', 'slices', 'docs/comments'],
    ['gate', 'build', 'docs/comments'],
    ['gate', 'adr', 'docs/comments'],
    ['gate', 'review', 'docs/comments'],
    ['gate', 'decide', 'docs/comments', 'R9'],
    ['close', 'docs/comments', '--json'],
    ['done', 'docs/comments'],
  ];
  for (const args of flows) assertScreen(args.join(' '), run(cwd, ...args).out);
  writeReview(cwd, REVIEW_ROWS.slice(0, 3));
  const walk = [
    ['ask', 'docs/comments'],
    ['choose', 'docs/comments', 'rv:slices:R2:write'],
    ['choose', 'docs/comments', 'rv:slices:R2:write', 'уведомление не приходит'],
    ['choose', 'docs/comments', 'rv:slices:R2:accept'],
    ['gate', 'decide', 'docs/comments', 'R1'],
    ['choose', 'docs/comments', 'rv:slices:R2:open'],
    ['ask', 'docs/comments'],
    ['choose', 'docs/comments', 'remarks:slices:some'],
    ['choose', 'docs/comments', 'remarks:slices:some', 'R7'],
    ['choose', 'docs/comments', 'remarks:slices:all'],
    ['ask', 'docs/comments'],
    ['choose', 'docs/comments', 'approve:slices'],
  ];
  for (const args of walk) assertScreen(args.join(' '), run(cwd, ...args).out);
});

test('старт /sdd-grill: каждый шаг — карточка и строка ⚙', () => {
  const cwd = repo({ 'services/tasks-core/README.md': '# tasks-core\n' });
  const steps = [
    ['start'],
    ['start', 'добавить панель настроек'],
    ['start', 'добавить панель настроек', '--name', 'name:own'],
    ['start', 'добавить панель настроек', '--name', 'Панель'],
    ['start', 'добавить панель настроек', '--name', 'name:auto'],
    ['start', 'добавить панель настроек', '--slug', 'Панель'],
    ['start', 'добавить панель настроек', '--slug', 'settings'],
    ['start', 'панель @nope/x.md'],
    ['choose', 'docs/settings', 'src:give'],
    ['start', 'docs/settings', '--sources', 'ну спросите у Пети'],
    ['start', 'docs/settings', '--rename', 'Bad Name'],
    ['start', 'docs/settings', '--sources', 'нет'],
    ['choose', 'docs/settings', 'src:new'],
  ];
  for (const args of steps) assertScreen(args.join(' '), run(cwd, ...args).out);
});

test('проверки и справочные выводы — без строки ⚙ (её добавит MCP-сервер), markdown не разваливается', () => {
  const cwd = workspace();
  for (const args of [[], ['docs/comments'], ['fix', 'docs/comments'], ['trace', 'docs/comments'], ['trace', 'docs/comments', 'FR-9', 'AC-002-B4'], ['close', 'docs/comments'], ['approve'], ['approve', 'slices', 'docs/comments']]) {
    assertScreen(args.join(' ') || 'меню', run(cwd, ...args).out, { gear: false });
  }
  fs.appendFileSync(path.join(cwd, 'docs/comments/spec.md'), '\nСм. `src/app.ts`.\n');
  const bad = run(cwd, 'docs/comments');
  assert.equal(bad.code, 1);
  assertScreen('check с ошибками', bad.out, { gear: false });
  assert.match(bad.out, /^- \*\*ОШИБКА\*\* `CD-\d+` `docs\/comments\/spec\.md:\d+` — /m);
  assert.match(bad.out, /\nКак исправить:\n(- `[A-Z]+-\d+` — .*\n)*- `CD-\d+` — /);
});

test('mdProblems: что развалит markdown — отступ без маркера, текст сразу после списка, строки абзаца подряд', () => {
  assert.deepEqual(mdProblems('**A**\n\n- a\n- b\n  - c\n\nтекст'), []);
  assert.deepEqual(mdProblems('a\n  b'), [[2, 'отступ без маркера списка']]);
  assert.deepEqual(mdProblems('- a\nтекст'), [[2, 'текст сразу после списка — приклеится к пункту']]);
  assert.deepEqual(mdProblems('строка\nстрока'), [[2, 'две строки абзаца подряд — склеятся']]);
  assert.deepEqual(mdProblems('```\nкод\n  код\n```'), []);
});

test('codePaths и cmdCode: пути и команды — кодом, уже закодированное не трогают, ссылки не ломают', () => {
  assert.equal(codePaths('в docs/comments/_work/review/slices.md и docs/'), 'в `docs/comments/_work/review/slices.md` и `docs/`');
  assert.equal(codePaths('`docs/x.md` и docs/y.md:12'), '`docs/x.md` и `docs/y.md:12`');
  assert.equal(codePaths('https://wiki.example.ru/a/b.md'), 'https://wiki.example.ru/a/b.md');
  assert.equal(codePaths('A/B-тест и фронт/бэк'), 'A/B-тест и фронт/бэк');
  assert.equal(cmdCode('через /sdd-decide'), 'через `/sdd-decide`');
  assert.equal(cmdCode('/sdd-review comments slices — запускаете сами'), '`/sdd-review comments slices` — запускаете сами');
});

test('mdProblems: ограждения сбрасывают предыдущую строку; вложенный пункт требует родителя', () => {
  assert.deepEqual(mdProblems('  - сирота\n- родитель\n  + ребёнок\n```js\n  текст\n```\nпосле\n| таблица |\nпосле'),
    [[1, 'вложенный пункт без родителя']]);
});
