import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flowRef, parseFlowDocument } from '../skills/sdd-lint/scripts/sdd-lint/flow-format.mjs';

const parse = (md) => parseFlowDocument('/docs/test/spec.md', md);
const question = '## Q12 — Как уведомлять?\nЭтап: grill\nТема: уведомления\nСтатус: deferred';

test('F-05/F-06: минимальные вопросы, сценарии, шаги и tech с типизированными связями', () => {
  const result = parse(`${question}\nРодитель: Q2\nЭлементы: SC-1-S9, TECH\n` +
    '## SC-1 — Создать\nТребования: FR-1, NFR-2\n### SC-1-S9 — Пользователь нажимает кнопку\n' +
    '## TECH — Обеспечение\nСвязи: SC-1, ADR-0001, contract:api.md#create\n');
  assert.deepEqual(result.problems, []);
  const [q, sc, step, tech] = result.records;
  assert.deepEqual(q.refs, [{ kind: 'step', id: 'SC-1-S9' }, { kind: 'tech', id: 'TECH' }]);
  assert.equal(q.parent, 'Q2');
  assert.deepEqual(sc.refs, [{ kind: 'fr', id: 'FR-1' }, { kind: 'nfr', id: 'NFR-2' }]);
  assert.equal(step.parent, 'SC-1');
  assert.deepEqual(tech.refs.map((r) => r.kind), ['scenario', 'adr', 'contract']);
  assert.equal(q.n, 1);
  assert.equal(q.title, 'Как уведомлять?');
  assert.equal(step.file, '/docs/test/spec.md');
});

test('формат: необязательные поля отсутствуют, кодовые примеры не становятся сущностями', () => {
  const result = parse('# Документ\n```md\n## Q1 — пример\n```\n## SC-2 — Путь\nТекст\n# Прочее\nСвязи: BAD');
  assert.deepEqual(result.problems, []);
  assert.equal(result.records.length, 1);
  assert.deepEqual(result.records[0].fields, {});
  assert.equal(result.records[0].parent, null);
  assert.deepEqual(parse('').records, []);
});

test('формат: неизвестный этап/статус, пустая тема, неверные ссылки и повтор поля диагностируются', () => {
  const result = parse('## Q1 — \nЭтап: unknown\nСтатус: closed\nРодитель: SC-1\n' +
    'Элементы: BAD\nТребования: Q1\nТребования: TECH\n## SC-0 — неверный номер');
  assert.equal(result.problems.length, 10);
  assert.ok(result.problems.every((p) => p.file === '/docs/test/spec.md'));
  assert.match(result.problems.map((p) => p.message).join('\n'), /Некорректный ID SC-0/);
  const valid = parse(`${question}\nЭлементы: AC-001-B1, ADR-0002\n`);
  assert.deepEqual(valid.problems, []);
});

test('тип ссылки не зависит от пути файла или позиции', () => {
  for (const [id, kind] of [['Q1', 'question'], ['SC-22', 'scenario'], ['SC-22-S3', 'step'], ['TECH', 'tech']])
    assert.deepEqual(flowRef(id), { id, kind });
  for (const id of ['Q0', 'Q-1', 'SC-01', 'SC-1-S0', 'ADR-1', 'contract:x', 'contract:x#', 'OTHER'])
    assert.equal(flowRef(id), null);
});


test('схема не принимает поля другого вида и заголовки без разделителя', () => {
  const result = parse('## Q1\n# TECH — Реализация\n## SC-1 — Путь\nЭлементы: FR-1');
  assert.equal(result.problems.length, 3);
  assert.match(result.problems[2].message, /недопустимо для scenario/);
});
