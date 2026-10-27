// Тесты sdd-lint: эталонная фича проходит чисто, каждая порча ловится своим правилом.
// Запуск из корня репозитория: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LINT =
  process.env.SDD_LINT ||
  ['scripts/sdd-lint.mjs', 'skills/sdd-lint/scripts/sdd-lint.mjs'].map((p) => path.join(root, p)).find((p) => fs.existsSync(p));
const GOOD = path.join(root, 'tests/fixtures/good');

function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-lint-test-'));
  fs.cpSync(GOOD, dir, { recursive: true });
  return dir;
}
function run(cwd, ...args) {
  const r = spawnSync('node', [LINT, ...args], { cwd, encoding: 'utf8', env: { ...process.env, TMPDIR: path.join(cwd, '.tmp') } });
  return { code: r.status, out: r.stdout + r.stderr };
}
function check(cwd) {
  const r = run(cwd, 'check', 'docs/comments', '--json');
  return { code: r.code, ...JSON.parse(r.out) };
}
const rules = (res) => res.findings.map((f) => f.rule);
const file = (cwd, rel) => path.join(cwd, 'docs', rel);
function edit(cwd, rel, from, to) {
  const f = file(cwd, rel);
  const s = fs.readFileSync(f, 'utf8');
  assert.ok(s.includes(from), `в ${rel} нет «${from}»`);
  fs.writeFileSync(f, s.replace(from, to));
}
function caught(rule, rel, from, to) {
  test(`${rule}: ${rel} — «${from.slice(0, 40)}»`, () => {
    const cwd = workspace();
    edit(cwd, rel, from, to);
    const res = check(cwd);
    assert.ok(rules(res).includes(rule), `ожидалось ${rule}, получено: ${rules(res).join(', ') || 'ничего'}`);
  });
}

test('эталонная фича: ни ошибок, ни предупреждений', () => {
  const res = check(workspace());
  assert.equal(res.code, 0);
  assert.deepEqual(res.findings.filter((f) => f.level !== 'info'), []);
});

// протокол
caught('PR-02', 'comments/brainstorming.md', '| 3 | Продукт и UI | Порядок', '| 4 | Продукт и UI | Порядок');
caught('PR-03', 'comments/brainstorming.md', '| Только новых упомянутых |', '| — |');
caught('PR-04', 'comments/brainstorming.md', '| Каждая правка — повторный спам |', '|  |');
caught('PR-05', 'comments/brainstorming.md', '| 9 | Уведомить снова | Только новых упомянутых | Каждая правка — повторный спам |\n', '');

// Dev Spec
caught('SP-05', 'comments/spec.md', 'оставил комментарий.', 'оставил комментарий через эндпоинт.');
caught('SP-08', 'comments/spec.md', 'Пример: Анна написала в 10:00', 'Так: Анна написала в 10:00');
caught('SP-10', 'comments/spec.md', 'NFR-2 Подсказки упоминаний: p95 ≤ 200 мс в проекте до 500 участников.', 'NFR-2 Подсказки упоминаний быстрые.');
caught('SP-11', 'comments/spec.md', 'При 11 подходящих участниках показываются 10.', '');
caught('SP-12', 'comments/spec.md', 'показываются до 10 подсказок', 'показываются до 20 подсказок');
caught('SP-14', 'comments/spec.md', '| 9 | FR-9 |\n', '');
caught('SP-15', 'comments/spec.md', '| 9 | FR-9 |', '| 9 | FR-99 |');
caught('SP-16', 'comments/spec.md', '| 8 | FR-8, FR-10 |', '| 8 | FR-8 |');
caught('SP-18', 'comments/spec.md', 'Пример: Борис открыл TASK-42', 'Пример: Олег Ким открыл TASK-42');
caught('SP-20', 'comments/spec.md', 'p95 ≤ 2 с с момента', 'p95 ≤ 5 с с момента');
caught('SP-19', 'comments/spec.md', '```\n\n```\nFR-3', '\nFR-3');

// slices
caught('SL-02', 'comments/slices/003-mention-notifications.md', 'Почему отдельно: Р1 — ждёт', 'Почему отдельно: ждёт');
caught('SL-11', 'comments/slices/003-mention-notifications.md', 'Зависимости: 001, 002', 'Зависимости: 001, 004');
caught('SL-14', 'comments/slices/002-comments.md', '  WHEN Дина отправляет', '  AND Дина отправляет');
caught('SL-15', 'comments/slices/002-comments.md', '  THEN подсказок нет\n```\n\n```\nAC-002-B6', '  THEN подсказок нет\nпроверить руками\n```\n\n```\nAC-002-B6');
caught('SL-16', 'comments/slices/002-comments.md', 'AC-002-B1 Кто комментирует [FR-1]', 'AC-002-B1 Кто комментирует');
caught('SL-17', 'comments/slices/002-comments.md', 'AC-002-B1 Кто комментирует [FR-1]', 'AC-002-B1 Кто комментирует [FR-1, FR-8]');
caught('SL-18', 'comments/slices/003-mention-notifications.md', 'AC-003-B1 Без дублей [FR-10]', 'AC-003-B1 Без дублей [FR-10, FR-1]');
caught('SL-19', 'comments/slices/002-comments.md', 'AC-002-B2 Длина текста [FR-2]', 'AC-002-B2 Длина текста [FR-1]');
caught('SL-20', 'comments/slices/002-comments.md', 'AC-002-F2 Удалённый', 'AC-002-B9 Удалённый');
caught('SL-22', 'comments/slices/002-comments.md', 'THEN отказ «Нет доступа к задаче», комментарий не сохранён', 'THEN мок tasks-core вернул отказ');
caught('SL-23', 'comments/slices/002-comments.md', 'на его месте «Комментарий удалён»', 'на его месте «Удалено руководителем»');
caught('SL-24', 'comments/slices/002-comments.md', 'WHEN Дина отправляет', 'WHEN Олег Ким отправляет');
caught('SL-25', 'comments/slices/002-comments.md', 'уведомления об упоминаниях (003)', 'уведомления об упоминаниях (007)');

// README и ADR
caught('RM-02', 'comments/slices/README.md', '| FR-8 | 003 |', '| FR-8 | 002 |');
caught('RM-04', 'comments/slices/README.md', '| FR-6, FR-7 |', '| FR-6 |');
caught('AD-04', 'adr/0001-mention-notifications.md', 'Выбран.', 'Хороший вариант.');
caught('AD-05', 'adr/0001-mention-notifications.md', '- минус: сбой notify-service роняет публикацию (FR-10)\n\nОтклонён: не выполняет FR-10.', '- минус: сложно\n\nОтклонён: не нравится.');
caught('AD-06', 'adr/0001-mention-notifications.md', 'FR-10 и NFR-3: уведомление', 'FR-12 и NFR-3: уведомление');
caught('AD-07', 'adr/0001-mention-notifications.md', '- Slice 003: notify-service', '- notify-service');
caught('AD-08', 'adr/0001-mention-notifications.md', ' — блокирует slice 003.', '.');

test('gen readme: README собирается заново из slices', () => {
  const cwd = workspace();
  edit(cwd, 'comments/slices/README.md', '| FR-8 | 003 |', '| FR-8 | 002 |');
  assert.equal(run(cwd, 'gen', 'readme', 'docs/comments').code, 0);
  const res = check(cwd);
  assert.ok(!rules(res).includes('RM-02'), rules(res).join(', '));
  assert.match(fs.readFileSync(file(cwd, 'comments/slices/README.md'), 'utf8'), /## Пересечения\n- 002 и 003 делят/);
});

test('gen guessed: строит таблицу и сохраняет «Чем плоха догадка»', () => {
  const cwd = workspace();
  edit(cwd, 'comments/brainstorming.md', '| 9 | Уведомить снова | Только новых упомянутых | Каждая правка — повторный спам |\n', '');
  const out = run(cwd, 'gen', 'guessed', 'docs/comments');
  assert.equal(out.code, 0);
  assert.match(out.out, /Заполни «Чем плоха догадка» в строках: 9/);
  const md = fs.readFileSync(file(cwd, 'comments/brainstorming.md'), 'utf8');
  assert.match(md, /\| 1 \| Любой участник проекта \| Любой, кто видит задачу \| Участник без доступа/);
  assert.doesNotMatch(md, /\| 7 \| Только тех/);
});

test('gate: ворота открываются и закрываются по статусам', () => {
  const cwd = workspace();
  assert.equal(run(cwd, 'gate', 'spec', 'docs/comments').code, 0);
  assert.equal(run(cwd, 'gate', 'slices', 'docs/comments').code, 0);
  assert.equal(run(cwd, 'gate', 'build', 'docs/comments').code, 3);
  edit(cwd, 'comments/spec.md', 'Статус: одобрено 27.10.2026', 'Статус: на ревью');
  const r = run(cwd, 'gate', 'slices', 'docs/comments');
  assert.equal(r.code, 3);
  assert.match(r.out, /Сначала одобрите spec.md/);
  edit(cwd, 'comments/brainstorming.md', 'Статус: готов', 'Статус: идёт');
  assert.equal(run(cwd, 'gate', 'spec', 'docs/comments').code, 3);
});

test('next: следующие свободные номера', () => {
  const cwd = workspace();
  const next = (...a) => run(cwd, 'next', ...a).out.trim();
  assert.equal(next('FR', 'docs/comments'), 'FR-11');
  assert.equal(next('NFR', 'docs/comments'), 'NFR-4');
  assert.equal(next('AC', 'docs/comments', '002', 'B'), 'AC-002-B7');
  assert.equal(next('AC', 'docs/comments', '002'), 'AC-002-2');
  assert.equal(next('slice', 'docs/comments'), '004');
  assert.equal(next('adr', 'docs/comments'), '0002');
});

function gitWorkspace() {
  const cwd = workspace();
  const g = (...a) => execFileSync('git', a, { cwd, stdio: 'ignore' });
  g('init', '-q');
  g('add', '.');
  g('-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'base');
  return cwd;
}
const diffRules = (cwd) => {
  const r = run(cwd, 'diff', 'docs/comments', '--json');
  return JSON.parse(r.out).findings.map((f) => f.rule);
};

test('diff: без изменений чисто', () => {
  assert.deepEqual(diffRules(gitWorkspace()), []);
});
test('DF-01: протокол только дописывается', () => {
  const cwd = gitWorkspace();
  edit(cwd, 'comments/brainstorming.md', '| Старые сверху |', '| Новые сверху |');
  assert.ok(diffRules(cwd).includes('DF-01'));
});
test('DF-01: дописать строку можно', () => {
  const cwd = gitWorkspace();
  edit(cwd, 'comments/brainstorming.md', '| Все, кто видит задачу |', '| Все, кто видит задачу |\n| П2 | 28.10.2026 | Ещё вопрос | Ещё решение |');
  assert.ok(!diffRules(cwd).includes('DF-01'));
});
test('DF-02: ID не пропадают', () => {
  const cwd = gitWorkspace();
  edit(cwd, 'comments/slices/002-comments.md', 'AC-002-F2 Удалённый комментарий [FR-5]', 'AC-002-F4 Удалённый комментарий [FR-5]');
  assert.ok(diffRules(cwd).includes('DF-02'));
});
test('DF-03: одобренный spec не меняется без сброса статуса', () => {
  const cwd = gitWorkspace();
  edit(cwd, 'comments/spec.md', 'не длиннее 5000 символов', 'не длиннее 6000 символов');
  assert.ok(diffRules(cwd).includes('DF-03'));
  edit(cwd, 'comments/spec.md', 'Статус: одобрено 27.10.2026', 'Статус: на ревью');
  assert.ok(!diffRules(cwd).includes('DF-03'));
});

test('guard: humanizer может менять прозу, но не защищённые части', () => {
  const cwd = workspace();
  const spec = 'docs/comments/spec.md';
  assert.equal(run(cwd, 'snapshot', spec).code, 0);
  edit(cwd, 'comments/spec.md', 'обсуждать задачу прямо в её карточке', 'обсуждать задачу в карточке');
  assert.equal(run(cwd, 'guard', spec).code, 0);
  edit(cwd, 'comments/spec.md', '- Реакции и ответы в ветке.', '- Реакции и ответы в ветке, до 3 уровней.');
  const r = run(cwd, 'guard', spec);
  assert.equal(r.code, 1);
  assert.match(r.out, /HG-01.*число — стало: 3/);
});
test('guard: без снимка сверяется с git', () => {
  const cwd = gitWorkspace();
  edit(cwd, 'comments/spec.md', '## Вне scope', '## За рамками');
  const r = run(cwd, 'guard', 'docs/comments/spec.md');
  assert.equal(r.code, 1);
  assert.match(r.out, /заголовок — было: ## Вне scope/);
});

test('pre-commit: пропускает чистый коммит и останавливает сломанный', () => {
  const cwd = workspace();
  fs.mkdirSync(path.join(cwd, 'scripts'));
  fs.copyFileSync(LINT, path.join(cwd, 'scripts/sdd-lint.mjs'));
  fs.copyFileSync(path.join(path.dirname(LINT), 'pre-commit'), path.join(cwd, 'scripts/pre-commit'));
  fs.chmodSync(path.join(cwd, 'scripts/pre-commit'), 0o755);
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  const git = (...a) => spawnSync('git', ['-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8', env });
  git('init', '-q');
  fs.symlinkSync('../../scripts/pre-commit', path.join(cwd, '.git/hooks/pre-commit'));
  git('add', '.');
  assert.equal(git('commit', '-qm', 'base').status, 0);
  edit(cwd, 'comments/brainstorming.md', '| Старые сверху |', '| Новые сверху |');
  git('add', '.');
  const r = git('commit', '-qm', 'broken');
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /DF-01/);
});
