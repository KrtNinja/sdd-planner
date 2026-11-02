// Тесты строки Tip: одна рекомендуемая команда последней строкой вывода — по ней GigaCode
// подставляет команду в поле ввода (followup suggestions). Очерёдность — как у вопроса этапа.
// Запуск из корня репозитория: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { tipOk, tipLine } from '../skills/sdd-lint/scripts/sdd-lint/stage.mjs';
import { JSON_ENV, workspace, commitAll, runner, writeReview } from './helpers.mjs';

// Вопросы структурой, команды lint — как их видит человек в GigaCode.
const run = runner({ ...JSON_ENV, SDD_LINT_CMD: '/sdd-lint' });
const gitWorkspace = () => commitAll(workspace());
const lastLine = (out) => out.trimEnd().split('\n').pop();
const tipOf = (cwd) => JSON.parse(run(cwd, 'check', 'docs/comments', '--json').out).tip;
const BLOCKER = '| R1 | блокер | slices/002-comments.md, AC-002-B2 | граница длины без пары 5000 / 5001 | 2 | добавить AC на 5001 |  |';
const FIXED = '| R1 | блокер | slices/002-comments.md, AC-002-B2 | граница длины без пары 5000 / 5001 | 2 | добавить AC на 5001 | исправлено |';

test('tip: ревью не было — последняя строка check рекомендует ревью; в JSON та же строка', () => {
  const cwd = workspace();
  const r = run(cwd, 'docs/comments');
  assert.equal(r.code, 0, r.out);
  assert.equal(lastLine(r.out), 'Tip: Введите /sdd-review comments slices чтобы продолжить');
  assert.equal(tipOf(cwd), 'Tip: Введите /sdd-review comments slices чтобы продолжить');
  assert.equal(lastLine(run(cwd, 'fix', 'docs/comments').out), 'Tip: Введите /sdd-review comments slices чтобы продолжить');
});

test('tip: открытый блокер ревью — разбор через вопрос этапа, а не одобрение', () => {
  const cwd = workspace();
  writeReview(cwd, [BLOCKER]);
  assert.equal(tipOf(cwd), 'Tip: Введите /sdd-lint ask docs/comments чтобы продолжить');
});

test('tip: ревью разобрано — одобрить; меню с одной фичей ведёт туда же', () => {
  const cwd = workspace();
  writeReview(cwd, [FIXED]);
  assert.equal(tipOf(cwd), 'Tip: Введите /sdd-lint approve slices docs/comments чтобы продолжить');
  const menu = run(cwd).out;
  assert.equal(lastLine(menu), 'Tip: Введите /sdd-lint approve slices docs/comments чтобы продолжить');
  assert.match(menu, /→ одобрить: `\/sdd-lint approve slices docs\/comments`/);
});

test('tip: после approve — закрыть фичу; после close — строки нет', () => {
  const cwd = gitWorkspace();
  const a = run(cwd, 'approve', 'slices', 'docs/comments');
  assert.equal(a.code, 0, a.out);
  assert.equal(lastLine(a.out), 'Tip: Введите /sdd-close comments чтобы продолжить');
  assert.equal(run(cwd, 'close', 'docs/comments', '--yes').code, 0);
  assert.doesNotMatch(run(cwd, 'docs/comments').out, /^Tip:/m);
  assert.equal(tipOf(cwd), null);
});

test('tip: команда, которую CLI отбросит или нельзя отправить как есть, не печатается', () => {
  assert.equal(tipOk('/sdd-lint approve spec docs/multi-tab-telephony'), true);
  assert.equal(tipOk('/sdd-decide comments R1 "<решение>"'), false);
  assert.equal(tipOk(`/sdd-review ${'x'.repeat(90)} spec`), false);
  assert.equal(tipOk('/sdd-adr comments "a b c d e f g h i j k"'), false);
  assert.equal(tipOk('/sdd-adr comments "Хранилище. Очередь"'), false);
  assert.equal(tipOk(null), false);
  assert.equal(tipLine('/sdd-close comments'), 'Tip: Введите /sdd-close comments чтобы продолжить');
});

test('tip: при ошибках lint строки нет — сначала исправить', () => {
  const cwd = workspace();
  const f = path.join(cwd, 'docs/comments/slices/002-comments.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('AC-002-F2 Удалённый комментарий', 'AC-002-F2 Удалённый комментарий\n\nAC-002-F2 Дубль'));
  const r = run(cwd, 'docs/comments');
  assert.equal(r.code, 1, r.out);
  assert.doesNotMatch(r.out, /^Tip:/m);
  assert.equal(tipOf(cwd), null);
});

// Команда вне бэктиков — «/» в начале слова, перед которым нет «`».
const bare = (text) => text.split('\n').filter((l) => !l.startsWith('Tip:') && /(^|[^`\w/])\/(sdd-|humanizer)/.test(l));

test('команды в тексте для человека — inline-кодом, строка Tip — без бэктиков', () => {
  const cwd = workspace();
  writeReview(cwd, [BLOCKER]);
  const r = run(cwd, 'docs/comments');
  assert.deepEqual(bare(r.out.split('Следующий шаг')[1]), []);
  assert.match(r.out, /одобрить: `\/sdd-lint approve slices docs\/comments`/);
  assert.doesNotMatch(lastLine(r.out), /`/);
  assert.deepEqual(bare(run(cwd).out), []);
  assert.deepEqual(bare(run(cwd, 'approve').out), []);
});

test('choose: команду для нового окна — кодом, строка Tip последней в карточке, за ней только ⚙', () => {
  const r = run(workspace(), 'choose', 'docs/comments', 'review-window:slices');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /`\/sdd-review comments slices`/);
  assert.equal(lastLine(r.out), '⚙ sdd: стоп');
  assert.match(r.out, /\nTip: Введите \/sdd-review comments slices чтобы продолжить\n\n⚙ sdd: стоп\n$/);
});
