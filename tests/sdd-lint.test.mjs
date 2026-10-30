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
const LINT = process.env.SDD_LINT || path.join(root, 'skills/sdd-lint/scripts/sdd-lint.mjs');
const GOOD = path.join(root, 'tests/fixtures/good');
// Статусы эталона: «одобрено» и «принято» с отметкой approve (отпечаток содержимого).
const SPEC_OK = 'Статус: одобрено 27.10.2026 · 67e1fb';
const ADR_OK = 'Статус: принято 27.10.2026 · 9aebc0';
const FP = '[0-9a-f]{6}';

function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-lint-test-'));
  fs.cpSync(GOOD, dir, { recursive: true });
  return dir;
}
// Форма команд в подсказках настраивается окружением; тесты закрепляют одну.
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
caught('SP-22', 'comments/spec.md', 'FR-2  Текст комментария', 'FR-2  (изменено 28.10.2026 после ревью R2) Текст комментария');
caught('SP-22', 'comments/spec.md', 'FR-2  Текст комментария', 'FR-2  Текст комментария (добавлено после ревью)');
test('SP-22: дата в примере, «(удалён: причина)» и «после обсуждения» — не пометка правки', () => {
  const cwd = workspace();
  edit(cwd, 'comments/spec.md', '## Данные для примеров', 'Комментарий обновлён после обсуждения; Анна изменила комментарий 28.10.2026.\n\n## Данные для примеров');
  assert.ok(!rules(check(cwd)).includes('SP-22'));
});

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
caught('SL-29', 'comments/slices/002-comments.md', 'AC-002-B2 Длина текста', 'AC-002-B2 Длина текста (уточнено по находке R2)');
caught('SL-29', 'comments/slices/README.md', '# ', '_Обновлено 28.10.2026_\n\n# ');
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
// ограничения: отказ по ОГР-n — законная причина, если ограничение описано в «Контексте»
const ADR = 'adr/0001-mention-notifications.md';
caught('AD-05', ADR, 'Отклонён: нарушает ОГР-1.', 'Отклонён: дорого.');
caught('AD-11', ADR, 'Отклонён: нарушает ОГР-1.', 'Отклонён: нарушает ОГР-2.');
caught('AD-11', ADR, '(решение архитектурного комитета).', '(решение архитектурного комитета).\n- ОГР-1 Бюджет на инфраструктуру заморожен.');
caught('AD-11', ADR, '- ОГР-1 Новой инфраструктуры', '- Новой инфраструктуры');
test('AD-05: вариант, отклонённый только по ограничению, — без находок AD', () => {
  const res = check(workspace());
  assert.deepEqual(rules(res).filter((r) => r.startsWith('AD')), []);
});
test('guard: humanizer не меняет номер ограничения', () => {
  const cwd = workspace();
  const adr = `docs/${ADR}`;
  assert.equal(run(cwd, 'snapshot', adr).code, 0);
  edit(cwd, ADR, 'Отклонён: нарушает ОГР-1.', 'Отклонён: нарушает ОГР-2.');
  const r = run(cwd, 'guard', adr);
  assert.equal(r.code, 1);
  assert.match(r.out, /HG-01.*ОГР-/);
});

// ссылки на код: требования не врут после переименований в коде
const C001 = 'comments/slices/001-contracts.md';
const C002 = 'comments/slices/002-comments.md';
caught('CD-01', C001, 'tasks-core: контракт комментариев', 'tasks-core: src/comments/comment.controller.ts');
caught('CD-01', C001, 'tasks-core: контракт комментариев', 'tasks-core: comments.openapi.yaml');
caught('CD-01', C001, 'tasks-core: событие об упоминании', 'tasks-core: tests/fixtures/comments/');
caught('CD-01', 'comments/spec.md', 'оставил комментарий.', 'оставил комментарий (domain/errors/CommentErrors.ts).');
caught('CD-01', 'adr/0001-mention-notifications.md', '- Slice 003: notify-service', '- Slice 003: notify-service в src/mentions/consumer.ts');
caught('CD-02', C002, '## Границы', '[код](https://github.com/org/tasks-core/blob/main/src/comments.ts#L10)\n\n## Границы');
caught('CD-02', C002, '## Границы', 'Как сейчас: [обработчик](../../../../tasks-core/src/comments.ts#L42)\n\n## Границы');
caught('CD-02', C002, '## Границы', 'См. https://gitlab.example.ru/team/tasks-core/-/blob/main/app/comments.rb\n\n## Границы');
caught('CD-02', C002, '## Границы', 'См. https://gitverse.ru/team/tasks-core/content/master/comments\n\n## Границы');
caught('CD-03', C002, 'WHEN Дина отправляет комментарий к TASK-42', 'WHEN Дина вызывает createComment(TASK-42)');
caught('CD-03', 'comments/spec.md', 'оставил комментарий.', 'оставил комментарий: comments.create() вернул 201.');
caught('CD-04', C002, '## Границы', '```ts\nexport type Comment = { text: string };\n```\n\n## Границы');
caught('CD-04', C001, '## Границы', '```json\n{ "text": "…" }\n```\n\n## Границы');
caught('CD-05', C001, 'tasks-core: событие об упоминании', 'tasks-core: MentionService публикует событие об упоминании');
caught('CD-05', 'comments/spec.md', 'оставил комментарий.', 'оставил комментарий через CommentRepository.');
caught('CD-05', 'comments/slices/README.md', '# ', 'Порядок задаёт CommentsController.\n\n# ');
// ADR фиксирует выбор и причины; соглашения о коде — в репозитории сервиса
caught('CD-05', ADR, 'через outbox в брокер компании', 'через MentionOutboxAdapter в брокер компании');
test('CD: протокол и ревью — леса, их не проверяем', () => {
  const cwd = workspace();
  edit(cwd, 'comments/brainstorming.md', '## Решения', 'Сейчас: src/comments/comment.controller.ts, create(dto), CommentService.\n\n```ts\nconst x = 1;\n```\n\n## Решения');
  fs.mkdirSync(file(cwd, 'comments/review'), { recursive: true });
  fs.writeFileSync(file(cwd, 'comments/review/slices.md'), '# Ревью slices\n\nСм. src/comments.ts#L42, deleteComment(id).\n');
  assert.deepEqual(rules(check(cwd)).filter((r) => r.startsWith('CD')), []);
});
test('CD: внешние контракты, имена продуктов, схемы и маршруты API — не код', () => {
  const cwd = workspace();
  // коды ошибок, поля ответа, DTO и события — внешний контракт: в AC они наблюдаемы на границе
  edit(cwd, C002, '  THEN отказ «Нет доступа к задаче», комментарий не сохранён', '  THEN ошибка TASK_FORBIDDEN, в ответе нет поля commentId, комментарий не сохранён');
  edit(cwd, C001, '- tasks-core: событие об упоминании', '- tasks-core: POST /tasks/{id}/comments, CommentDto, событие comment.mentioned, таблица task_comments (поле edited_at)\n- tasks-core: событие об упоминании');
  edit(cwd, 'comments/spec.md', 'оставил комментарий.', 'оставил комментарий (клиенты на Node.js и Vue.js, SLA(99,9%)).');
  edit(cwd, C002, '## Границы', '```mermaid\nflowchart LR\n  A --> B\n```\n\n![схема](flow.png)\n\n## Границы');
  assert.deepEqual(check(cwd).findings.filter((f) => f.rule.startsWith('CD')), []);
});

// объём для чтения: Dev Spec, slice и README — до 10 000 видимых символов
const prose = (n) => 'Анна читает Dev Spec. '.repeat(n); // 18 видимых символов на повтор
caught('SP-23', 'comments/spec.md', '## Открытые вопросы', `${prose(500)}\n\n## Открытые вопросы`);
caught('SL-30', 'comments/slices/002-comments.md', '## Границы', `${prose(500)}\n\n## Границы`);
caught('RM-05', 'comments/slices/README.md', '## Пересечения', `## Пересечения\n\n${prose(500)}`);
const READ_RULES = ['SP-23', 'SL-30', 'RM-05'];
const sized = (res) => rules(res).filter((r) => READ_RULES.includes(r));
test('объём: адреса ссылок, HTML-комментарии и пробелы не считаются', () => {
  const cwd = workspace();
  const url = `https://example.com/${'x'.repeat(9000)}`;
  edit(cwd, 'comments/spec.md', '## Данные для примеров', `[Анна](${url}) <!-- ${'скрыто '.repeat(1500)} -->\n\n## Данные для примеров`);
  edit(cwd, 'comments/slices/002-comments.md', '## Границы', `${' \n'.repeat(9000)}\n## Границы`);
  assert.deepEqual(sized(check(cwd)), []);
});
test('объём: леса не считаются — следы протокола в spec и сам протокол', () => {
  const cwd = workspace();
  edit(cwd, 'comments/spec.md', '## Открытые вопросы', `## Не про поведение\n\n- ${prose(500)} (из протокола: 1)\n\n## Открытые вопросы`);
  fs.appendFileSync(file(cwd, 'comments/brainstorming.md'), `\n${prose(2000)}\n`);
  assert.deepEqual(sized(check(cwd)), []);
});

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

test('AP-02: номера строк в ссылках и пробелы в конце строк одобрение не отменяют', () => {
  const cwd = workspace();
  edit(cwd, 'comments/spec.md', '[9](brainstorming.md#L23)', '[9](brainstorming.md#L24)');
  edit(cwd, 'comments/spec.md', '## Вне scope', '## Вне scope  ');
  assert.ok(!rules(check(cwd)).includes('AP-02'));
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
  assert.match(res.stage, /леса убраны/);
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
  edit(cwd, 'comments/spec.md', SPEC_OK, 'Статус: на ревью');
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
test('AP-02: правка после одобрения — одобрение недействительно, без git', () => {
  const cwd = workspace();
  edit(cwd, 'comments/spec.md', 'не длиннее 5000 символов', 'не длиннее 6000 символов');
  const res = check(cwd);
  assert.ok(rules(res).includes('AP-02'), rules(res).join(', '));
  assert.equal(res.stage.startsWith('Dev Spec «на ревью (файл менялся после approve)»'), true, res.stage);
  assert.doesNotMatch(run(cwd, 'docs/comments').out, /67e1fb/);
  const g = run(cwd, 'gate', 'slices', 'docs/comments');
  assert.equal(g.code, 3, g.out);
});
test('AP-01: «одобрено» без отметки approve — не одобрение; approve переодобряет', () => {
  const cwd = workspace();
  edit(cwd, 'comments/spec.md', SPEC_OK, 'Статус: одобрено 27.10.2026');
  const res = check(cwd);
  assert.ok(rules(res).includes('AP-01'), rules(res).join(', '));
  assert.ok(!res.findings.some((f) => /67e1fb/.test(f.msg)), 'ожидаемый отпечаток не печатается');
  assert.equal(run(cwd, 'gate', 'slices', 'docs/comments').code, 3);
  assert.deepEqual(ids(ask(cwd)).slice(-1), ['approve:spec']);
  const r = run(cwd, 'approve', 'spec', 'docs/comments');
  assert.equal(r.code, 0, r.out);
  assert.equal(status(cwd, 'comments/spec.md'), `Статус: одобрено ${today()} · 67e1fb`);
  assert.ok(!rules(check(cwd)).includes('AP-01'));
});
test('AP-02: slices — правка AC после одобрения снимает одобрение с README, fix возвращает «на ревью»', () => {
  const cwd = workspace();
  assert.equal(run(cwd, 'approve', 'slices', 'docs/comments').code, 0);
  assert.ok(!rules(check(cwd)).includes('AP-02'));
  edit(cwd, 'comments/slices/002-comments.md', 'AC-002-B2 Длина текста', 'AC-002-B2 Длина');
  assert.ok(check(cwd).findings.some((f) => f.rule === 'AP-02' && f.file === 'docs/comments/slices/README.md'));
  const res = fix(cwd);
  assert.equal(status(cwd, 'comments/slices/README.md'), 'Статус: на ревью');
  assert.ok(res.notes.some((n) => /approve slices docs\/comments/.test(n)), res.notes.join('\n'));
});
test('AP-01: отметка не к тому статусу — «принято» со строкой от другого файла', () => {
  const cwd = workspace();
  edit(cwd, 'adr/0001-mention-notifications.md', ADR_OK, 'Статус: принято 27.10.2026 · 67e1fb');
  assert.ok(rules(check(cwd)).includes('AP-02'));
});

// ---------- fix ----------
const fix = (cwd, ...flags) => {
  const r = run(cwd, 'fix', 'docs/comments', '--json', ...flags);
  return { code: r.code, ...JSON.parse(r.out) };
};
const read = (cwd, rel) => fs.readFileSync(file(cwd, rel), 'utf8');
test('fix: на чистой фиче ничего не меняет', () => {
  const cwd = workspace();
  const r = run(cwd, 'fix', 'docs/comments');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^Скрипту поправлять нечего\./);
  assert.match(r.out, /сверка с git \(DF-\*\) пропущена/);
  for (const f of ['comments/brainstorming.md', 'comments/spec.md', 'comments/slices/README.md', 'comments/slices/002-comments.md'])
    assert.equal(read(cwd, f), fs.readFileSync(path.join(GOOD, 'docs', f), 'utf8'), f);
});
test('fix: номера вместо FR-? и AC-NNN-?, ссылки на сдвинутые строки обновлены', () => {
  const cwd = workspace();
  edit(cwd, 'comments/spec.md', '```\nNFR-1', '```\nFR-?  Автор видит число комментариев.\n      Пример: Анна видит «2 комментария».\n```\nИз протокола: [2](brainstorming.md#L16)\n\n```\nNFR-1');
  edit(cwd, 'comments/slices/002-comments.md', '```\nAC-002-B2 Длина текста', '```\nAC-B? Первый новый\nWHEN Анна открыла задачу\nTHEN видит ленту\n```\nПроверяет: FR-2\n\n```\nAC-002-B? Второй новый\nWHEN Анна открыла задачу\nTHEN видит ленту\n```\nПроверяет: FR-2\n\n```\nAC-002-B2 Длина текста');
  const res = fix(cwd);
  assert.match(read(cwd, 'comments/spec.md'), /^FR-11  Автор видит число комментариев\./m);
  assert.match(read(cwd, 'comments/slices/002-comments.md'), /^AC-002-B7 Первый новый\n[\s\S]*^AC-002-B8 Второй новый$/m);
  assert.ok(res.fixed.some((x) => /spec\.md: FR-\? → FR-11/.test(x)), res.fixed.join('\n'));
  assert.ok(res.fixed.some((x) => /002-comments\.md: AC-B\? → AC-002-B7, AC-002-B\? → AC-002-B8/.test(x)), res.fixed.join('\n'));
  for (const r of ['SP-03', 'SP-21', 'SL-05', 'SL-28', 'RM-02']) assert.ok(!rules(res).includes(r), `${r}: ${rules(res).join(', ')}`);
  assert.ok(rules(res).includes('SL-13'), 'новый FR ещё не в «Основание» — это решает агент');
});
test('fix: README создаётся, «угадал бы» собирается до ссылок на протокол', () => {
  const cwd = workspace();
  fs.rmSync(file(cwd, 'comments/slices/README.md'));
  edit(cwd, 'comments/brainstorming.md', '| 9 | Уведомить снова | Только новых упомянутых | Каждая правка — повторный спам |\n', '');
  const res = fix(cwd);
  assert.ok(res.fixed.includes('docs/comments/slices/README.md — создан'), res.fixed.join('\n'));
  assert.match(read(cwd, 'comments/brainstorming.md'), /\| 9 \| Уведомить снова \| Только новых упомянутых \|/);
  for (const r of ['RM-01', 'PR-05', 'SP-21']) assert.ok(!rules(res).includes(r), `${r}: ${rules(res).join(', ')}`);
});
test('fix: сверяет с git — протокол только дописывается, одобренное не меняется молча', () => {
  const cwd = gitWorkspace();
  edit(cwd, 'comments/brainstorming.md', '| Старые сверху |', '| Новые сверху |');
  edit(cwd, 'comments/spec.md', 'не длиннее 5000 символов', 'не длиннее 6000 символов');
  const res = fix(cwd);
  assert.equal(res.code, 1);
  assert.ok(rules(res).includes('DF-01'), rules(res).join(', '));
  assert.ok(!rules(res).includes('AP-02'), 'fix сам вернул «на ревью»');
  assert.equal(status(cwd, 'comments/spec.md'), 'Статус: на ревью');
  assert.ok(res.notes.some((n) => /spec\.md: менялся после одобрения \(«одобрено 27\.10\.2026»\) — статус «на ревью»\. Одобрить заново: node scripts\/sdd-lint\.mjs approve spec docs\/comments/.test(n)), res.notes.join('\n'));
  assert.ok(!res.notes.some((n) => /git/.test(n)));
});
test('fix: без протокола ссылки на него не трогает — это делает close', () => {
  const cwd = workspace();
  fs.rmSync(file(cwd, 'comments/brainstorming.md'));
  const res = fix(cwd);
  assert.match(read(cwd, 'comments/spec.md'), /^Из протокола:/m);
  assert.ok(res.notes.some((n) => /ссылки не тронуты.*\/sdd-close comments/.test(n)), res.notes.join('\n'));
});
test('fix --snapshot: снимок после правок скрипта', () => {
  const cwd = workspace();
  fix(cwd, '--snapshot');
  assert.ok(fs.readdirSync(path.join(cwd, '.tmp/sdd-lint-snapshots')).length >= 6);
  assert.equal(run(cwd, 'guard', 'docs/comments').code, 0);
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
  fs.cpSync(path.join(path.dirname(LINT), 'sdd-lint'), path.join(cwd, 'scripts/sdd-lint'), { recursive: true });
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
  assert.match(r.out, /ревью в чистом контексте: \/sdd-review comments slices/);
  assert.match(r.out, /одобрить: node scripts\/sdd-lint\.mjs approve slices docs\/comments/);
});
test('следующий шаг: по умолчанию скилл вызывается сразу по имени, без /skills', () => {
  const cwd = workspace();
  const env = { ...process.env, TMPDIR: path.join(cwd, '.tmp') };
  delete env.SDD_SKILL_PREFIX; delete env.SDD_LINT_CMD;
  const r = spawnSync('node', [LINT, 'docs/comments'], { cwd, encoding: 'utf8', env });
  const out = r.stdout + r.stderr;
  assert.match(out, /(^|\s)\/sdd-review comments slices/);
  assert.match(out, /(^|\s)\/sdd-lint approve slices docs\/comments/);
  assert.doesNotMatch(out, /\/skills /);
});
test('следующий шаг: форма команд задаётся окружением', () => {
  const cwd = workspace();
  const r = runEnv(cwd, { SDD_SKILL_PREFIX: '/skills ', SDD_LINT_CMD: '/skills sdd-lint' }, 'docs/comments');
  assert.match(r.out, /\/skills sdd-review comments slices/);
  assert.match(r.out, /\/skills sdd-lint approve slices docs\/comments/);
});
test('следующий шаг: spec вернули «на ревью» — сначала spec, даже если slices одобрены', () => {
  const cwd = workspace();
  assert.equal(run(cwd, 'approve', 'slices', 'docs/comments').code, 0);
  edit(cwd, 'comments/spec.md', SPEC_OK, 'Статус: на ревью');
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
  assert.match(status(cwd, 'comments/slices/README.md'), new RegExp(`^Статус: одобрено ${today()} · ${FP}$`));
  assert.match(r.out, /перед merge убрать леса \(docs\/comments\/brainstorming\.md\): \/sdd-close comments/);
  assert.equal(run(cwd, 'approve', 'slices', 'docs/comments').code, 0);
});
// ---------- export: интерфейс для зоны реализации ----------
const exported = (cwd) => {
  const r = run(cwd, 'export', 'comments');
  return { code: r.code, ...JSON.parse(r.out) };
};
test('export: ворота build закрыты — код 3, причина и подсказка в JSON', () => {
  const e = exported(workspace());
  assert.equal(e.code, 3);
  assert.deepEqual(e.gate, { build: 'closed', reason: 'slices не одобрены', hint: 'Сначала одобрите slices: node scripts/sdd-lint.mjs approve slices docs/comments' });
});
test('export: после одобрения — slices, слои, сервисы и ссылки на AC для тестов', () => {
  const cwd = workspace();
  assert.equal(run(cwd, 'approve', 'slices', 'docs/comments').code, 0);
  const e = exported(cwd);
  assert.equal(e.code, 0);
  assert.equal(e.gate.build, 'open');
  assert.deepEqual(e.ref, { format: 'comments/<AC-ID>', pattern: 'comments/AC-\\d{3}-[BF]?\\d+' });
  assert.deepEqual(e.slices.map((s) => [s.num, s.layer, s.services]), [
    ['001', 1, ['tasks-core', 'notify-service', 'frontend']],
    ['002', 2, ['tasks-core', 'frontend']],
    ['003', 3, ['tasks-core', 'notify-service', 'frontend']],
  ]);
  const acs = e.slices.flatMap((s) => s.acs);
  assert.equal(acs.length, 14);
  assert.deepEqual(acs.find((a) => a.id === 'AC-003-B1'), {
    id: 'AC-003-B1', ref: 'comments/AC-003-B1', name: 'Без дублей', half: 'backend', service: 'notify-service', checks: ['FR-10'], line: 25, deleted: false,
  });
  assert.deepEqual(acs.filter((a) => a.half === 'common').map((a) => [a.id, a.service]), [['AC-002-1', null], ['AC-003-1', null]]);
  assert.ok(acs.filter((a) => a.half === 'frontend').every((a) => a.service === 'frontend'));
  for (const a of acs) assert.match(a.ref, new RegExp(`^${e.ref.pattern}$`));
  assert.deepEqual(e.adrs.map((a) => [a.num, a.title]), [['0001', 'Доставка уведомлений об упоминаниях через брокер']]);
});
test('export: статус ворот тот же, что у gate build', () => {
  const cwd = workspace();
  assert.equal(run(cwd, 'gate', 'build', 'docs/comments').code, exported(cwd).code);
  assert.equal(run(cwd, 'approve', 'slices', 'docs/comments').code, 0);
  assert.equal(run(cwd, 'gate', 'build', 'docs/comments').code, exported(cwd).code);
});

test('approve slices: нельзя, пока spec не одобрен', () => {
  const cwd = workspace();
  edit(cwd, 'comments/spec.md', SPEC_OK, 'Статус: на ревью');
  const r = run(cwd, 'approve', 'slices', 'docs/comments');
  assert.equal(r.code, 3);
  assert.match(r.out, /approve spec docs\/comments/);
  assert.equal(status(cwd, 'comments/slices/README.md'), 'Статус: на ревью');
});
test('approve spec: открытые вопросы блокируют (SP-06), статус не меняется', () => {
  const cwd = workspace();
  edit(cwd, 'comments/spec.md', SPEC_OK, 'Статус: на ревью');
  edit(cwd, 'comments/spec.md', '## Открытые вопросы\nНет.', '## Открытые вопросы\n- Сколько хранить удалённые комментарии?');
  const r = run(cwd, 'approve', 'spec', 'docs/comments');
  assert.equal(r.code, 1);
  assert.match(r.out, /SP-06/);
  assert.equal(status(cwd, 'comments/spec.md'), 'Статус: на ревью');
});
test('approve spec: защищённые части изменились после снимка — не одобряет', () => {
  const cwd = workspace();
  edit(cwd, 'comments/spec.md', SPEC_OK, 'Статус: на ревью');
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
  edit(cwd, 'adr/0001-mention-notifications.md', ADR_OK, 'Статус: предложено');
  assert.match(run(cwd, 'docs/comments').out, /approve adr docs\/comments 0001/);
  const r = run(cwd, 'approve', 'adr', 'docs/comments');
  assert.equal(r.code, 0, r.out);
  assert.match(status(cwd, 'adr/0001-mention-notifications.md'), new RegExp(`^Статус: принято ${today()} · 9aebc0$`));
});

// ---------- evals ----------
// Рабочая папка eval собирается из текущих правил, а не из копий.
test('evals: place-files.sh кладёт текущие правила', () => {
  const cases = fs
    .readdirSync(path.join(root, 'skills'))
    .flatMap((s) => {
      const d = path.join(root, 'skills', s, 'evals');
      return fs.existsSync(d) ? fs.readdirSync(d).map((c) => path.join(d, c)) : [];
    })
    .filter((d) => fs.existsSync(path.join(d, 'place-files.sh')));
  assert.ok(cases.length > 0, 'нет ни одного eval с place-files.sh');
  const rulesText = fs.readFileSync(path.join(root, 'rules/AGENTS.planning.md'), 'utf8');
  for (const c of cases) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-eval-'));
    execFileSync('bash', [path.join(c, 'place-files.sh')], { cwd, stdio: 'pipe' });
    const name = path.relative(root, c);
    assert.equal(fs.readFileSync(path.join(cwd, 'AGENTS.md'), 'utf8'), `# AGENTS.md\n\n${rulesText}`, `${name}: AGENTS.md не совпадает с правилами`);
    assert.ok(fs.existsSync(path.join(cwd, 'docs')), `${name}: нет docs/`);
  }
});

// ---------- манифест расширения ----------
// GigaCode ставит пул по манифесту: правила и lint должны лежать там, куда он указывает.
test('манифест: sdd-planner, файл правил и MCP-сервер lint на месте', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, 'gigacode-extension.json'), 'utf8'));
  assert.equal(m.name, 'sdd-planner');
  assert.match(m.version, /^\d+\.\d+\.\d+$/);
  assert.ok(fs.existsSync(path.join(root, m.contextFileName)), `нет ${m.contextFileName}`);
  const srv = m.mcpServers?.['sdd-lint'];
  assert.ok(srv, 'нет mcpServers.sdd-lint');
  for (const a of srv.args.filter((x) => x.includes('${extensionPath}'))) {
    const rel = a.replace('${extensionPath}/', '');
    assert.ok(fs.existsSync(path.join(root, rel)), `MCP указывает на несуществующий ${rel}`);
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
  edit(cwd, 'adr/0001-mention-notifications.md', ADR_OK, 'Статус: предложено');
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
  assert.match(r.out, /→ ревью в чистом контексте: \/sdd-review comments slices/);
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

const ask = (cwd) => JSON.parse(run(cwd, 'ask', 'docs/comments').out);
const ids = (a) => a.questions.flatMap((q) => q.options.map((o) => o.id));
test('ask: вопрос этапа с вариантами без действий, рекомендация — ревью', () => {
  const a = ask(workspace());
  assert.equal(a.stage, 'Slices на ревью');
  assert.deepEqual(a.choose, ['choose', 'docs/comments', '<id>']);
  assert.deepEqual(ids(a), ['review-here:slices', 'review-window:slices', 'humanize:slices', 'approve:slices']);
  assert.equal(a.questions[0].options.find((o) => o.recommended).id, 'review-here:slices');
  assert.ok(a.questions.every((q) => q.options.every((o) => !('action' in o))));
});
test('ask: после ревью без блокеров рекомендуется одобрить, с блокером — закрыть его', () => {
  const cwd = workspace();
  const rv = path.join(cwd, 'docs/comments/review');
  fs.mkdirSync(rv, { recursive: true });
  const table = (decision) => `# Ревью slices — comments\n\nИтог: блокеров 1, замечаний 0\n\n| # | Важность | Где | Что не так | Пункт | Предложение | Решение |\n|---|---|---|---|---|---|---|\n| R1 | блокер | slices/002-comments.md | … | 3 | … | ${decision} |\n`;
  fs.writeFileSync(path.join(rv, 'slices.md'), table('исправлено'));
  let a = ask(cwd);
  assert.equal(a.questions[0].options.find((o) => o.recommended).id, 'approve:slices');
  assert.equal(a.questions[0].options[0].label, 'Повторить ревью здесь');
  fs.writeFileSync(path.join(rv, 'slices.md'), table(''));
  a = ask(cwd);
  assert.ok(ids(a).includes('blockers:slices') && !ids(a).includes('approve:slices'));
  const r = run(cwd, 'choose', 'docs/comments', 'blockers:slices');
  assert.match(r.out, /Передай человеку дословно и остановись:\n\nзакрыть блокеры ревью R1/);
});
test('ask: инструкция в выводе, варианты с номерами, рекомендация в label, text — для агента без инструмента выбора', () => {
  const a = ask(workspace());
  assert.match(a.instruction, /инструментом выбора как есть/);
  assert.match(a.instruction, /выведи text дословно/);
  assert.match(a.instruction, /sdd_lint с args \["choose","docs\/comments","<id>"\]/);
  const opts = a.questions.flatMap((q) => q.options);
  assert.deepEqual(opts.map((o) => o.n), [1, 2, 3, 4]);
  assert.equal(opts[0].label, 'Ревью здесь, в сабагенте (рекомендую)');
  assert.ok(opts.slice(1).every((o) => !o.label.includes('рекомендую')));
  assert.match(a.text, /^Slices «на ревью»\. Что дальше\?\n1\. Ревью здесь, в сабагенте \(рекомендую\) — /);
  assert.match(a.text, /\n4\. Одобрить — /);
});
test('choose: ревью — задача сабагенту без пересказа скилла, без сабагентов — команда человеку', () => {
  const r = run(workspace(), 'choose', 'docs/comments', 'review-here:slices');
  assert.equal(r.code, 0);
  assert.match(r.out, /Вызови инструмент sdd_lint с args \["prompt","sdd-review","comments","slices"\] и выполни то, что он вернёт\./);
  assert.match(r.out, /Следующий вопрос: sdd_lint с args \["ask","docs\/comments"\]/);
  assert.match(r.out, /Сабагентов у тебя нет — задание сам не выполняй: передай человеку дословно «\/sdd-review comments slices» и остановись\./);
});
test('choose: humanizer — снимок снимает скрипт, сабагенту остаются humanizer и guard', () => {
  const cwd = workspace();
  const r = run(cwd, 'choose', 'docs/comments', 'humanize:slices');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /"snapshot"/);
  assert.match(r.out, /sdd_lint с args \["guard","docs\/comments"\]/);
  assert.match(r.out, /передай человеку дословно «\/humanizer по каждому файлу в docs\/comments\/slices\/, затем node scripts\/sdd-lint\.mjs guard docs\/comments»/);
  assert.ok(fs.readdirSync(path.join(cwd, '.tmp/sdd-lint-snapshots')).length > 0, 'снимок не снят');
  edit(cwd, 'comments/slices/002-comments.md', 'AC-002-B2 Длина текста', 'AC-002-B2 Длина');
  const g = run(cwd, 'guard', 'docs/comments');
  assert.equal(g.code, 1, g.out);
  assert.match(g.out, /HG-01/);
});
test('choose: одобрить — выполняет approve сам, устаревший id — подсказка', () => {
  const cwd = workspace();
  const r = run(cwd, 'choose', 'docs/comments', 'approve:slices');
  assert.equal(r.code, 0, r.out);
  assert.match(status(cwd, 'comments/slices/README.md'), /одобрено/);
  const again = run(cwd, 'choose', 'docs/comments', 'approve:slices');
  assert.equal(again.code, 2);
  assert.match(again.out, /Варианта «approve:slices» сейчас нет — этап изменился/);
  assert.deepEqual(ids(ask(cwd)), ['close', 'later']);
});
test('prompt: скилл, свой чеклист и шаблон одним текстом; без шапки скилла', () => {
  const cwd = workspace();
  const r = run(cwd, 'prompt', 'sdd-review', 'docs/comments', 'slices');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^# Ревью SDD: comments slices/);
  assert.match(r.out, /Файл скилла references\/slices\.md:\n\n# Чеклист: slices/);
  assert.match(r.out, /Файл скилла assets\/review\.md:/);
  assert.doesNotMatch(r.out, /# Чеклист: spec/);
  assert.doesNotMatch(r.out, /^disable-model-invocation/m);
  const adr = run(cwd, 'prompt', 'sdd-review', 'comments', 'adr');
  assert.match(adr.out, /^# Ревью SDD: comments adr 0001/);
  const bad = run(cwd, 'prompt', 'sdd-review', 'comments', 'adr', '9999');
  assert.equal(bad.code, 2);
  assert.match(bad.out, /ADR 9999 у фичи нет/);
  const sl = run(cwd, 'prompt', 'sdd-slices', 'comments');
  assert.match(sl.out, /^# Скилл sdd-slices: comments\n\nЧеловек выбрал этот шаг/);
  assert.match(sl.out, /Файл скилла references\/calibration\.md:/);
  assert.equal(run(cwd, 'prompt', 'sdd-lint').code, 2);
});
test('prompt: аргументы с пробелами — в кавычках, вопрос и решение не сливаются', () => {
  const r = run(workspace(), 'prompt', 'sdd-decide', 'comments', 'Что видит автор?', 'Ничего');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^# Скилл sdd-decide: comments "Что видит автор\?" Ничего\n/);
  assert.match(r.out, /Аргументы скилла: `comments "Что видит автор\?" Ничего`/);
});

// ---------- устройство скрипта ----------
// Модули читают по одному, поэтому у каждого есть строка-назначение (grep -m1 . sdd-lint/*.mjs — карта)
// и потолок размера: разрастание видно сразу, а не когда файл уже не помещается в контекст.
test('модули sdd-lint: строка-назначение и не больше 300 строк', () => {
  const dir = path.join(path.dirname(LINT), 'sdd-lint');
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.mjs'))) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
    assert.match(lines[0], /^\/\/ \S/, `${f}: первая строка — комментарий о назначении модуля`);
    assert.ok(lines.length <= 300, `${f}: ${lines.length} строк — раздели модуль`);
  }
});
test('sdd-lint работает через симлинк без расширения (~/.local/bin/sdd-lint)', () => {
  const cwd = workspace();
  const bin = path.join(cwd, '.tmp', 'sdd-lint');
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  fs.symlinkSync(LINT, bin);
  const r = spawnSync('node', [bin, 'docs/comments'], { cwd, encoding: 'utf8', env: { ...process.env, ...CMD_ENV, TMPDIR: path.join(cwd, '.tmp') } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('ask: новый этап — рекомендация «В новом контексте/окне», продолжение — здесь', () => {
  const cwd = workspace();
  fs.rmSync(path.join(cwd, 'docs/comments/slices'), { recursive: true, force: true });
  fs.rmSync(path.join(cwd, 'docs/comments/spec.md'), { force: true });
  let q = ask(cwd).questions[0];
  assert.deepEqual(q.options.map((o) => o.id), ['window:sdd-spec', 'here:sdd-spec']);
  assert.equal(q.options.find((o) => o.recommended).id, 'window:sdd-spec');
  assert.equal(q.options[0].label, 'В новом контексте/окне (рекомендую)');
  edit(cwd, 'comments/brainstorming.md', 'Статус: готов', 'Статус: идёт');
  q = ask(cwd).questions[0];
  assert.equal(q.options.find((o) => o.recommended).id, 'here:sdd-grill');
});

// ---------- close: все леса этапа ----------
const oneFinding = (decision, level = 'блокер') => `# Ревью slices — comments

| # | Важность | Где | Что не так | Пункт | Предложение | Решение |
|---|---|---|---|---|---|---|
| R1 | ${level} | slices/002-comments.md | что-то | 3 | поправить | ${decision} |
`;
test('close: удаляет review/ и забытый plan.md вместе с протоколом', () => {
  const cwd = gitWorkspace();
  withReview(cwd, oneFinding('исправлено'));
  fs.writeFileSync(file(cwd, 'comments/slices/plan.md'), '# План нарезки — Комментарии\n');
  assert.equal(run(cwd, 'approve', 'slices', 'docs/comments').code, 0);
  const st = run(cwd, 'comments').out;
  assert.match(st, /перед merge убрать леса \(docs\/comments\/brainstorming\.md, docs\/comments\/review\/, docs\/comments\/slices\/plan\.md\): \/sdd-close comments/);
  const r = run(cwd, 'close', 'comments');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Удалено: docs\/comments\/brainstorming\.md, docs\/comments\/review\/, docs\/comments\/slices\/plan\.md/);
  for (const f of ['comments/brainstorming.md', 'comments/review', 'comments/slices/plan.md']) assert.ok(!fs.existsSync(file(cwd, f)), f);
  assert.match(check(cwd).stage, /леса убраны/);
  assert.deepEqual(diffRules(cwd), []);
});
test('close: блокер ревью без решения — ничего не удаляет', () => {
  const cwd = workspace();
  assert.equal(run(cwd, 'approve', 'slices', 'docs/comments').code, 0);
  withReview(cwd, oneFinding(''));
  const r = run(cwd, 'close', 'comments');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /НЕ ЗАКРЫТО: блокеры ревью без решения: R1 \(docs\/comments\/review\/slices\.md\).*Ничего не удалено/);
  assert.ok(fs.existsSync(file(cwd, 'comments/brainstorming.md')));
  assert.ok(fs.existsSync(file(cwd, 'comments/review/slices.md')));
});
test('close: замечание без решения не мешает, но названо в выводе', () => {
  const cwd = workspace();
  assert.equal(run(cwd, 'approve', 'slices', 'docs/comments').code, 0);
  withReview(cwd, oneFinding('', 'замечание'));
  const r = run(cwd, 'close', 'comments');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Замечания ревью без решения ушли в историю git: R1/);
});
test('ask: перед merge — вопрос про леса, вариант ведёт на /sdd-close', () => {
  const cwd = workspace();
  assert.equal(run(cwd, 'approve', 'slices', 'docs/comments').code, 0);
  const q = ask(cwd).questions[0];
  assert.match(q.question, /Убрать леса этапа: docs\/comments\/brainstorming\.md\?/);
  assert.equal(q.options[0].description, '/sdd-close comments');
  assert.equal(run(cwd, 'choose', 'docs/comments', 'close').code, 0);
  assert.ok(!fs.existsSync(file(cwd, 'comments/brainstorming.md')));
});
