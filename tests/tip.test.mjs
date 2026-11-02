// Тесты строки Tip: одна рекомендуемая команда последней строкой вывода — по ней GigaCode
// подставляет команду в поле ввода (followup suggestions). Очерёдность — как у вопроса этапа.
// Запуск из корня репозитория: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { tipOk, tipLine } from '../skills/sdd-lint/scripts/sdd-lint/stage.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LINT = process.env.SDD_LINT || path.join(root, 'skills/sdd-lint/scripts/sdd-lint.mjs');
const GOOD = path.join(root, 'tests/fixtures/good');
const CMD_ENV = { SDD_SKILL_PREFIX: '/', SDD_LINT_CMD: '/sdd-lint', SDD_VIEW: 'json' };

function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-tip-test-'));
  fs.cpSync(GOOD, dir, { recursive: true });
  return dir;
}
function gitWorkspace() {
  const cwd = workspace();
  const g = (...a) => execFileSync('git', a, { cwd, stdio: 'pipe' });
  g('init', '-q');
  g('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A');
  g('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');
  return cwd;
}
function run(cwd, ...args) {
  const r = spawnSync('node', [LINT, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...CMD_ENV, TMPDIR: path.join(cwd, '.tmp') } });
  return { code: r.status, out: r.stdout + r.stderr };
}
const lastLine = (out) => out.trimEnd().split('\n').pop();
const tipOf = (cwd) => JSON.parse(run(cwd, 'check', 'docs/comments', '--json').out).tip;
function withReview(cwd, rows) {
  const d = path.join(cwd, 'docs/comments/_work/review');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(
    path.join(d, 'slices.md'),
    `# Ревью slices — Комментарии\n\nИтог: блокеров 1, замечаний 0\n\n| # | Важность | Где | Что не так | Пункт | Предложение | Решение |\n|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`,
  );
}
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
  withReview(cwd, [BLOCKER]);
  assert.equal(tipOf(cwd), 'Tip: Введите /sdd-lint ask docs/comments чтобы продолжить');
});

test('tip: ревью разобрано — одобрить; меню с одной фичей ведёт туда же', () => {
  const cwd = workspace();
  withReview(cwd, [FIXED]);
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
  withReview(cwd, [BLOCKER]);
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
