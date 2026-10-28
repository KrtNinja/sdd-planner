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
// Форма команд в подсказках у веток-адаптеров разная; тесты закрепляют одну.
const CMD_ENV = { SDD_SKILL_PREFIX: '/', SDD_LINT_CMD: 'node scripts/sdd-lint.mjs' };
function run(cwd, ...args) {
  const r = spawnSync('node', [LINT, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...CMD_ENV, TMPDIR: path.join(cwd, '.tmp') } });
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
caught('SP-13', 'comments/spec.md', '## Открытые вопросы', '## Трассировка\n\n| Протокол | Куда |\n|---|---|\n| 1 | FR-1 |\n\n## Открытые вопросы');
caught('SP-14', 'comments/spec.md', ', [П1](brainstorming.md#L47)', '');
caught('SP-15', 'comments/spec.md', '[9](brainstorming.md#L23)', '[99](brainstorming.md#L23)');
caught('SP-16', 'comments/spec.md', '```\nИз протокола: [9](brainstorming.md#L23)\n', '```\n');
caught('SP-17', 'comments/spec.md', '## Данные для примеров', 'Из протокола: [1](brainstorming.md#L15)\n\n## Данные для примеров');
caught('SP-21', 'comments/spec.md', '[9](brainstorming.md#L23)', '9');
caught('SP-21', 'comments/spec.md', '[9](brainstorming.md#L23)', '[9](brainstorming.md#L22)');
caught('SP-18', 'comments/spec.md', 'Пример: Борис открыл TASK-42', 'Пример: Олег Ким открыл TASK-42');
caught('SP-20', 'comments/spec.md', 'p95 ≤ 2 с с момента', 'p95 ≤ 5 с с момента');
caught('SP-19', 'comments/spec.md', '```\nИз протокола: [2](brainstorming.md#L16)\n\n```\nFR-3', '\nFR-3');

// slices
caught('SL-02', 'comments/slices/003-mention-notifications.md', 'Почему отдельно: Р1 — ждёт', 'Почему отдельно: ждёт');
caught('SL-11', 'comments/slices/003-mention-notifications.md', 'Зависимости: 001, 002', 'Зависимости: 001, 004');
caught('SL-14', 'comments/slices/002-comments.md', '  WHEN Дина отправляет', '  AND Дина отправляет');
caught('SL-15', 'comments/slices/002-comments.md', '  THEN подсказок нет\n```', '  THEN подсказок нет\nпроверить руками\n```');
caught('SL-16', 'comments/slices/002-comments.md', 'Проверяет: [FR-1](../spec.md#L29)\n', '');
caught('SL-16', 'comments/slices/002-comments.md', 'AC-002-B1 Кто комментирует', 'AC-002-B1 Кто комментирует [FR-1]');
caught('SL-16', 'comments/slices/002-comments.md', '## Границы', 'Проверяет: FR-1\n\n## Границы');
caught('SL-17', 'comments/slices/002-comments.md', 'Проверяет: [FR-1](../spec.md#L29)\n', 'Проверяет: [FR-1](../spec.md#L29), [FR-8](../spec.md#L81)\n');
caught('SL-18', 'comments/slices/003-mention-notifications.md', 'Проверяет: [FR-10](../spec.md#L95)', 'Проверяет: [FR-10](../spec.md#L95), [FR-1](../spec.md#L29)');
caught('SL-19', 'comments/slices/002-comments.md', 'Проверяет: [FR-2](../spec.md#L36)', 'Проверяет: [FR-1](../spec.md#L29)');
caught('SL-28', 'comments/slices/002-comments.md', 'Проверяет: [FR-2](../spec.md#L36)', 'Проверяет: FR-2');
caught('SL-28', 'comments/slices/002-comments.md', ' ([Dev Spec](../spec.md))', '');
caught('SL-28', 'comments/slices/002-comments.md', 'Основание: FR-1,', 'Основание: [FR-1](../spec.md#L29),');
caught('SL-28', 'comments/slices/README.md', '| [FR-8](../spec.md#L81) | 003 |', '| FR-8 | 003 |');
caught('SL-20', 'comments/slices/002-comments.md', 'AC-002-F2 Удалённый', 'AC-002-B9 Удалённый');
caught('SL-22', 'comments/slices/002-comments.md', 'THEN отказ «Нет доступа к задаче», комментарий не сохранён', 'THEN мок tasks-core вернул отказ');
caught('SL-23', 'comments/slices/002-comments.md', 'на его месте «Комментарий удалён»', 'на его месте «Удалено руководителем»');
caught('SL-24', 'comments/slices/002-comments.md', 'WHEN Дина отправляет', 'WHEN Олег Ким отправляет');
caught('SL-25', 'comments/slices/002-comments.md', 'уведомления об упоминаниях (003)', 'уведомления об упоминаниях (007)');

// README и ADR
caught('RM-02', 'comments/slices/README.md', '| [FR-8](../spec.md#L81) | 003 |', '| [FR-8](../spec.md#L81) | 002 |');
caught('RM-04', 'comments/slices/README.md', '| FR-6, FR-7 |', '| FR-6 |');
caught('AD-04', 'adr/0001-mention-notifications.md', 'Выбран.', 'Хороший вариант.');
caught('AD-05', 'adr/0001-mention-notifications.md', '- минус: сбой notify-service роняет публикацию (FR-10)\n\nОтклонён: не выполняет FR-10.', '- минус: сложно\n\nОтклонён: не нравится.');
caught('AD-06', 'adr/0001-mention-notifications.md', 'FR-10 и NFR-3: уведомление', 'FR-12 и NFR-3: уведомление');
caught('AD-07', 'adr/0001-mention-notifications.md', '- Slice 003: notify-service', '- notify-service');
caught('AD-08', 'adr/0001-mention-notifications.md', ' — блокирует slice 003.', '.');

test('gen readme: README собирается заново из slices', () => {
  const cwd = workspace();
  edit(cwd, 'comments/slices/README.md', '| [FR-8](../spec.md#L81) | 003 |', '| [FR-8](../spec.md#L81) | 002 |');
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

test('gen links: номера → ссылки на строку, устаревшие обновляются', () => {
  const cwd = workspace();
  edit(cwd, 'comments/spec.md', '[9](brainstorming.md#L23)', '9');
  edit(cwd, 'comments/spec.md', '[П1](brainstorming.md#L47)', '[П1](brainstorming.md#L40)');
  assert.ok(rules(check(cwd)).includes('SP-21'));
  assert.equal(run(cwd, 'gen', 'links', 'docs/comments').code, 0);
  const res = check(cwd);
  assert.deepEqual(rules(res), []);
  const md = fs.readFileSync(file(cwd, 'comments/spec.md'), 'utf8');
  assert.match(md, /Из протокола: \[9\]\(brainstorming\.md#L23\)/);
  assert.match(md, /\[4\]\(brainstorming\.md#L18\), \[П1\]\(brainstorming\.md#L47\)/);
});

test('gen links: старый раздел «Трассировка» переносится', () => {
  const cwd = workspace();
  const f = file(cwd, 'comments/spec.md');
  const md = fs
    .readFileSync(f, 'utf8')
    .replace(/^Из протокола:.*\n/gm, '')
    .replace('## Открытые вопросы', '## Открытые вопросы')
    .replace(/\s*$/, '\n\n## Трассировка\n\n| Протокол | Куда |\n|---|---|\n| 1 | FR-1 |\n| 2 | FR-2 |\n| 3 | FR-3 |\n| 4, П1 | FR-4 |\n| 5 | FR-5 |\n| 6 | FR-6 |\n| 7 | FR-7 |\n| 8 | FR-8, FR-10 |\n| 9 | не про поведение: повтор при правке решает сервис уведомлений |\n| 10 | NFR-1, NFR-2, NFR-3 |\n');
  fs.writeFileSync(f, md);
  assert.ok(rules(check(cwd)).includes('SP-13'));
  const out = run(cwd, 'gen', 'links', 'docs/comments');
  assert.match(out.out, /раздел «Трассировка» перенесён/);
  const after = fs.readFileSync(f, 'utf8');
  assert.doesNotMatch(after, /## Трассировка/);
  assert.match(after, /## Не про поведение\n- повтор при правке решает сервис уведомлений \(из протокола: \[9\]\(brainstorming\.md#L23\)\)/);
  assert.match(after, /```\nИз протокола: \[8\]\(brainstorming\.md#L22\)\n\n## Нефункциональные/);
  // FR-9 теперь без источника — это и должен показать lint
  assert.deepEqual(rules(check(cwd)), ['SP-16']);
});

test('trace: каждая строка протокола и куда ушла, кликабельные file:line', () => {
  const cwd = workspace();
  const r = run(cwd, 'trace', 'docs/comments');
  assert.equal(r.code, 0);
  assert.match(r.out, /#4 +docs\/comments\/brainstorming\.md:18 +15 минут, пометка «изменён»\n +→ FR-4 docs\/comments\/spec\.md:\d+/);
  assert.match(r.out, /#П1 +docs\/comments\/brainstorming\.md:47/);
  edit(cwd, 'comments/spec.md', ', [П1](brainstorming.md#L47)', '');
  const lost = run(cwd, 'trace', 'docs/comments');
  assert.equal(lost.code, 1);
  assert.match(lost.out, /#П1[^\n]*\n +→ НИКУДА/);
});

test('DF-03: номера строк в ссылках на протокол не отменяют одобрение', () => {
  const cwd = gitWorkspace();
  edit(cwd, 'comments/spec.md', '[9](brainstorming.md#L23)', '[9](brainstorming.md#L24)');
  assert.ok(!diffRules(cwd).includes('DF-03'));
});

test('close: не закрывает, пока slices не одобрены', () => {
  const cwd = workspace();
  const r = run(cwd, 'close', 'docs/comments');
  assert.equal(r.code, 1);
  assert.match(r.out, /НЕ ЗАКРЫТО: slices не одобрены/);
  assert.ok(fs.existsSync(file(cwd, 'comments/brainstorming.md')));
});

test('close: удаляет протокол и следы его в spec, ссылки на FR остаются верными', () => {
  const cwd = gitWorkspace();
  assert.equal(run(cwd, 'approve', 'slices', 'docs/comments').code, 0);
  const r = run(cwd, 'close', 'docs/comments');
  assert.equal(r.code, 0, r.out);
  assert.ok(!fs.existsSync(file(cwd, 'comments/brainstorming.md')));
  const spec = fs.readFileSync(file(cwd, 'comments/spec.md'), 'utf8');
  assert.doesNotMatch(spec, /протокол/i);
  assert.match(spec, /Статус: одобрено/);
  const res = check(cwd);
  assert.deepEqual(rules(res), []);
  assert.match(res.stage, /протокол убран/);
  const slice = fs.readFileSync(file(cwd, 'comments/slices/002-comments.md'), 'utf8');
  const fr4 = spec.split('\n').findIndex((t) => t.startsWith('FR-4 ')) + 1;
  assert.match(slice, new RegExp(`\\[FR-4\\]\\(\\.\\./spec\\.md#L${fr4}\\)`));
  // по git: удаление протокола после закрытия и одобренные документы — не нарушение
  assert.deepEqual(diffRules(cwd), []);
});

test('DF-01: протокол удалён руками до закрытия', () => {
  const cwd = gitWorkspace();
  edit(cwd, 'comments/spec.md', /Статус: одобрено.*/.exec(fs.readFileSync(file(cwd, 'comments/spec.md'), 'utf8'))[0], 'Статус: на ревью');
  fs.rmSync(file(cwd, 'comments/brainstorming.md'));
  assert.ok(diffRules(cwd).includes('DF-01'));
  assert.ok(rules(check(cwd)).includes('SP-21'));
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
  edit(cwd, 'comments/slices/002-comments.md', 'AC-002-F2 Удалённый комментарий', 'AC-002-F4 Удалённый комментарий');
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

// ---------- подсказки человеку ----------
const today = () => {
  const t = new Date();
  return `${String(t.getDate()).padStart(2, '0')}.${String(t.getMonth() + 1).padStart(2, '0')}.${t.getFullYear()}`;
};
const status = (cwd, rel) => fs.readFileSync(file(cwd, rel), 'utf8').match(/^Статус:.*$/m)[0];
function runEnv(cwd, env, ...args) {
  const r = spawnSync('node', [LINT, ...args], { cwd, encoding: 'utf8', env: { ...process.env, TMPDIR: path.join(cwd, '.tmp'), ...env } });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('следующий шаг: готовые команды со slug фичи', () => {
  const cwd = workspace();
  const r = run(cwd, 'docs/comments');
  assert.match(r.out, /ревью в новой сессии: \/sdd-review comments slices/);
  assert.match(r.out, /одобрить: node scripts\/sdd-lint\.mjs approve slices docs\/comments/);
});
test('следующий шаг: форма команд задаётся окружением', () => {
  const cwd = workspace();
  const r = runEnv(cwd, { SDD_SKILL_PREFIX: '/skills ', SDD_LINT_CMD: '/skills sdd-lint' }, 'docs/comments');
  assert.match(r.out, /\/skills sdd-review comments slices/);
  assert.match(r.out, /\/skills sdd-lint approve slices docs\/comments/);
});
test('следующий шаг: spec вернули «на ревью» — сначала spec, даже если slices одобрены', () => {
  const cwd = workspace();
  edit(cwd, 'comments/slices/README.md', 'Статус: на ревью', 'Статус: одобрено 27.10.2026');
  edit(cwd, 'comments/spec.md', 'Статус: одобрено 27.10.2026', 'Статус: на ревью');
  const r = run(cwd, 'docs/comments');
  assert.match(r.out, /Dev Spec «на ревью», а slices уже есть/);
  assert.match(r.out, /approve spec docs\/comments/);
  assert.doesNotMatch(r.out, /Планирование завершено/);
});
test('нет папки фичи: короткое сообщение со списком фич', () => {
  const r = run(workspace(), 'docs/nope');
  assert.equal(r.code, 2);
  assert.match(r.out, /Нет папки docs\/nope\. Фичи в docs\/: comments\. Новая фича начинается с \/sdd-grill nope\./);
  assert.doesNotMatch(r.out, /Коды выхода/);
});
test('guard без снимка и git: «не с чем сверить», а не «изменены»', () => {
  const r = run(workspace(), 'guard', 'docs/comments/spec.md');
  assert.equal(r.code, 1);
  assert.match(r.out, /Не с чем сверить 1 файл/);
  assert.doesNotMatch(r.out, /изменены/);
});

// ---------- approve ----------
test('approve slices: ставит «одобрено <дата>» и показывает следующий шаг', () => {
  const cwd = workspace();
  const r = run(cwd, 'approve', 'slices', 'docs/comments');
  assert.equal(r.code, 0, r.out);
  assert.equal(status(cwd, 'comments/slices/README.md'), `Статус: одобрено ${today()}`);
  assert.match(r.out, /перед merge убрать протокол: node scripts\/sdd-lint\.mjs close docs\/comments/);
  assert.equal(run(cwd, 'approve', 'slices', 'docs/comments').code, 0);
});
test('approve slices: нельзя, пока spec не одобрен', () => {
  const cwd = workspace();
  edit(cwd, 'comments/spec.md', 'Статус: одобрено 27.10.2026', 'Статус: на ревью');
  const r = run(cwd, 'approve', 'slices', 'docs/comments');
  assert.equal(r.code, 3);
  assert.match(r.out, /approve spec docs\/comments/);
  assert.equal(status(cwd, 'comments/slices/README.md'), 'Статус: на ревью');
});
test('approve spec: открытые вопросы блокируют (SP-06), статус не меняется', () => {
  const cwd = workspace();
  edit(cwd, 'comments/spec.md', 'Статус: одобрено 27.10.2026', 'Статус: на ревью');
  edit(cwd, 'comments/spec.md', '## Открытые вопросы\nНет.', '## Открытые вопросы\n- Сколько хранить удалённые комментарии?');
  const r = run(cwd, 'approve', 'spec', 'docs/comments');
  assert.equal(r.code, 1);
  assert.match(r.out, /SP-06/);
  assert.equal(status(cwd, 'comments/spec.md'), 'Статус: на ревью');
});
test('approve spec: защищённые части изменились после снимка — не одобряет', () => {
  const cwd = workspace();
  edit(cwd, 'comments/spec.md', 'Статус: одобрено 27.10.2026', 'Статус: на ревью');
  assert.equal(run(cwd, 'snapshot', 'docs/comments/spec.md').code, 0);
  edit(cwd, 'comments/spec.md', '«Починить вход по SMS»', '«Исправить вход по SMS»');
  const r = run(cwd, 'approve', 'spec', 'docs/comments');
  assert.equal(r.code, 1);
  assert.match(r.out, /HG-01.*текст — стало: «Исправить вход по SMS»/);
  assert.match(r.out, /снимите новый снимок \(node scripts\/sdd-lint\.mjs snapshot docs\/comments\/spec\.md\)/);
  assert.equal(status(cwd, 'comments/spec.md'), 'Статус: на ревью');
});
test('approve adr: единственный ждущий ADR принимается без номера', () => {
  const cwd = workspace();
  edit(cwd, 'adr/0001-mention-notifications.md', 'Статус: принято 27.10.2026', 'Статус: предложено');
  assert.match(run(cwd, 'docs/comments').out, /approve adr docs\/comments 0001/);
  const r = run(cwd, 'approve', 'adr', 'docs/comments');
  assert.equal(r.code, 0, r.out);
  assert.equal(status(cwd, 'adr/0001-mention-notifications.md'), `Статус: принято ${today()}`);
});

// ---------- evals ----------
// Рабочая папка eval собирается из текущих правил и lint, а не из копий.
test('evals: place-files.sh кладёт текущие правила и lint', () => {
  const cases = fs
    .readdirSync(path.join(root, 'skills'))
    .flatMap((s) => {
      const d = path.join(root, 'skills', s, 'evals');
      return fs.existsSync(d) ? fs.readdirSync(d).map((c) => path.join(d, c)) : [];
    })
    .filter((d) => fs.existsSync(path.join(d, 'place-files.sh')));
  assert.ok(cases.length > 0, 'нет ни одного eval с place-files.sh');
  const rulesText = fs.readFileSync(path.join(root, 'rules/AGENTS.planning.md'), 'utf8');
  const lintSrc = path.join(root, 'scripts/sdd-lint.mjs');
  for (const c of cases) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-eval-'));
    execFileSync('bash', [path.join(c, 'place-files.sh')], { cwd, stdio: 'pipe' });
    const name = path.relative(root, c);
    assert.equal(fs.readFileSync(path.join(cwd, 'AGENTS.md'), 'utf8'), `# AGENTS.md\n\n${rulesText}`, `${name}: AGENTS.md не совпадает с правилами`);
    if (fs.existsSync(lintSrc))
      assert.equal(fs.readFileSync(path.join(cwd, 'scripts/sdd-lint.mjs'), 'utf8'), fs.readFileSync(lintSrc, 'utf8'), `${name}: lint не совпадает`);
    assert.ok(fs.existsSync(path.join(cwd, 'docs')), `${name}: нет docs/`);
  }
});

// ---------- файлы ревью ----------
const REVIEW = `# Ревью slices — Комментарии

Дата: 27.10.2026
Итог: блокеров 1, замечаний 1

| # | Важность | Где | Что не так | Пункт | Предложение | Решение |
|---|---|---|---|---|---|---|
| R1 | замечание | slices/002-comments.md, AC-002-B4 | нет успешного удаления руководителем | 4 | добавить AC |  |
| R2 | блокер | slices/003-mention-notifications.md | не решено, что с уведомлением, если комментарий удалили до доставки | 3 | уведомление не приходит |  |
`;
function withReview(cwd, md = REVIEW, name = 'slices.md') {
  fs.mkdirSync(file(cwd, 'comments/review'), { recursive: true });
  fs.writeFileSync(file(cwd, `comments/review/${name}`), md);
}
test('ревью: открытый блокер — RV-01 и шаг «закрыть блокеры» с готовой командой', () => {
  const cwd = workspace();
  withReview(cwd);
  const res = check(cwd);
  assert.equal(res.code, 0);
  assert.deepEqual(rules(res).filter((r) => r.startsWith('RV')), ['RV-01']);
  const out = run(cwd, 'docs/comments').out;
  assert.match(out, /закрыть блокеры ревью R2 \(docs\/comments\/review\/slices\.md\): решение — \/sdd-decide comments R2 "<решение>"/);
  assert.match(out, /ревью уже было: docs\/comments\/review\/slices\.md/);
});
test('ревью: approve не проходит, пока у блокера пустое «Решение»', () => {
  const cwd = workspace();
  withReview(cwd);
  const r = run(cwd, 'approve', 'slices', 'docs/comments');
  assert.equal(r.code, 1);
  assert.match(r.out, /RV-01.*R2: блокер без решения/);
  assert.equal(status(cwd, 'comments/slices/README.md'), 'Статус: на ревью');
  edit(cwd, 'comments/review/slices.md', '| уведомление не приходит |  |', '| уведомление не приходит | П2 |');
  assert.equal(run(cwd, 'approve', 'slices', 'docs/comments').code, 0);
});
test('ревью: файл не по шаблону — RV-02', () => {
  const cwd = workspace();
  withReview(cwd, '# Ревью\n\nВсё хорошо.\n', 'spec.md');
  assert.ok(rules(check(cwd)).includes('RV-02'));
});
test('ревью ADR: блокер в review/adr-NNNN.md держит approve adr', () => {
  const cwd = workspace();
  edit(cwd, 'adr/0001-mention-notifications.md', 'Статус: принято 27.10.2026', 'Статус: предложено');
  withReview(cwd, REVIEW.replace('# Ревью slices', '# Ревью ADR 0001'), 'adr-0001.md');
  assert.match(run(cwd, 'docs/comments').out, /ADR 0001 «предложено» — ревью уже было/);
  assert.equal(run(cwd, 'approve', 'adr', 'docs/comments').code, 1);
});

// ---------- вызов без подсказок: меню, slug, опечатки, Tab ----------
const lines = (out) => out.trim().split('\n').map((l) => l.split('\t')[0]);
test('без аргументов: меню с фичами, этапом и готовыми командами', () => {
  const r = run(workspace());
  assert.equal(r.code, 0);
  assert.match(r.out, /comments\s+Slices на ревью/);
  assert.match(r.out, /→ ревью в новой сессии: \/sdd-review comments slices/);
  assert.match(r.out, /node scripts\/sdd-lint\.mjs approve spec\|slices\|adr comments/);
});
test('без аргументов вне репозитория с доками: подсказка, откуда запускать', () => {
  const r = run(fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-lint-empty-')));
  assert.match(r.out, /Нет папки docs\/ — запускайте из корня/);
});
test('фича — slug, путь с @ или файл внутри неё', () => {
  const cwd = workspace();
  for (const arg of ['comments', '@docs/comments/', 'docs/comments/slices/002-comments.md']) {
    const r = run(cwd, arg);
    assert.equal(r.code, 0, arg);
    assert.match(r.out, /Slices на ревью/, arg);
  }
  assert.equal(run(cwd, 'next', 'FR', 'comments').out, run(cwd, 'next', 'FR', 'docs/comments').out);
});
test('не хватает варианта или фичи: варианты готовыми командами', () => {
  const cwd = workspace();
  let r = run(cwd, 'approve');
  assert.equal(r.code, 2);
  assert.match(r.out, /approve — выбери вариант/);
  assert.match(r.out, /approve slices comments\s+— одобрить slices/);
  r = run(cwd, 'gate', 'spec');
  assert.equal(r.code, 2);
  assert.match(r.out, /Укажи фичу\. Фичи в docs\/:\n.*gate spec comments/);
});
test('опечатка в команде: «Может, approve?»', () => {
  const r = run(workspace(), 'aprove', 'slices', 'comments');
  assert.equal(r.code, 2);
  assert.match(r.out, /Нет команды «aprove»\. Может, approve\? node scripts\/sdd-lint\.mjs approve slices comments/);
});
test('help <команда> — только её справка', () => {
  const r = run(workspace(), 'help', 'approve');
  assert.equal(r.code, 0);
  assert.match(r.out, /approve adr docs\/<feature> \[NNNN\]/);
  assert.doesNotMatch(r.out, /gen readme/);
});
test('Tab: команды, варианты, фичи, спуск по папкам, номера', () => {
  const cwd = workspace();
  const c = (...w) => lines(run(cwd, '__complete', ...w).out);
  assert.ok(['comments', 'docs/', 'approve', 'gate'].every((x) => c('').includes(x)));
  assert.deepEqual(c('ap'), ['approve']);
  assert.deepEqual(c('approve', ''), ['spec', 'slices', 'adr']);
  assert.deepEqual(c('approve', 'spec', 'co'), ['comments']);
  assert.deepEqual(c('approve', 'adr', 'comments', ''), ['0001']);
  assert.deepEqual(c('guard', 'docs/comments/'), ['docs/comments/brainstorming.md', 'docs/comments/slices/', 'docs/comments/spec.md']);
  assert.deepEqual(c('next', 'AC', 'comments', ''), ['001', '002', '003']);
  assert.deepEqual(c('next', 'AC', 'comments', '002', ''), ['B', 'F']);
  assert.deepEqual(c('comments', '--'), ['--json', '--snapshot']);
});
test('completion bash|zsh печатает скрипт с путём к sdd-lint', () => {
  const cwd = workspace();
  assert.match(run(cwd, 'completion', 'bash').out, /complete -F _sdd_lint sdd-lint/);
  assert.match(run(cwd, 'completion', 'zsh').out, /compdef _sdd_lint sdd-lint/);
  assert.match(run(cwd, 'completion', 'bash').out, /sdd-lint\.mjs' __complete/);
});
test('у каждого sdd-скилла есть argument-hint', () => {
  for (const d of fs.readdirSync(path.join(root, 'skills')).filter((x) => x.startsWith('sdd-'))) {
    const md = fs.readFileSync(path.join(root, 'skills', d, 'SKILL.md'), 'utf8');
    assert.match(md.split('---')[1], /\nargument-hint: '.+'/, d);
  }
});
