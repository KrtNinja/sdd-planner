import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadFeature, runChecks } from '../skills/sdd-lint/scripts/sdd-lint/feature.mjs';
import { flowAddress, flowBacklinks } from '../skills/sdd-lint/scripts/sdd-lint/flow-graph.mjs';
import { initTestFlow, reserveFlowId } from '../skills/sdd-lint/scripts/sdd-lint/flow-state.mjs';
import { run } from '../skills/sdd-lint/scripts/sdd-lint/run.mjs';
import { read } from '../skills/sdd-lint/scripts/sdd-lint/md.mjs';
import { tmpDir, feature, SPEC, workspace } from './helpers.mjs';

function setup(files = {}) {
  const dir = tmpDir();
  initTestFlow(dir);
  for (const kind of ['Q', 'SC']) for (let i = 0; i < 4; i++) reserveFlowId(dir, kind);
  for (let i = 0; i < 3; i++) reserveFlowId(dir, 'STEP', 'SC-1');
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return loadFeature(dir);
}
const q = (id, extra = '') => `## ${id} — Вопрос\nЭтап: grill\nТема: доступ\nСтатус: open\n${extra}\n`;
const sc = '## SC-1 — Войти\nТребования: FR-1\n### SC-1-S1 — Ввести код\n### SC-1-S2 — Получить доступ\n';
const issues = (m) => runChecks(m).filter((f) => f.rule === 'FL-01').map((f) => f.msg);
const output = (r) => r.chunks.map((c) => c[1]).join('');

test('F-04: перестановка и перенос сценариев/шагов сохраняют адресацию и обратные связи', () => {
  const m = setup({ 'spec.md': SPEC + sc, 'questions.md': q('Q1', 'Элементы: SC-1-S1') });
  assert.deepEqual(issues(m), []);
  assert.equal(flowAddress(m.flow.graph, 'SC-1-S1').file, m.specFile);
  assert.deepEqual(flowBacklinks(m.flow.graph, 'SC-1-S1'), [{ from: 'Q1', to: 'SC-1-S1', kind: 'step' }]);
  assert.equal(flowAddress(m.flow.graph, 'UNKNOWN'), null);
  fs.writeFileSync(m.specFile, SPEC);
  fs.writeFileSync(path.join(m.dir, 'scenarios.md'), sc.split('\n').filter(Boolean).reverse().join('\n'));
  const after = loadFeature(m.dir);
  assert.deepEqual(issues(after), []);
  assert.equal(flowAddress(after.flow.graph, 'SC-1-S1').file, path.join(m.dir, 'scenarios.md'));
  assert.equal(flowAddress(after.flow.graph, 'SC-1-S1').n, 2);
  assert.deepEqual(flowBacklinks(after.flow.graph, 'SC-1-S1'), flowBacklinks(m.flow.graph, 'SC-1-S1'));
});

test('F-06/F-07: дубликаты, отсутствующие цели и цикл родителей диагностируются', () => {
  const m = setup({ 'spec.md': SPEC + sc, 'scenarios.md': sc,
    'questions.md': q('Q1', 'Родитель: Q2\nЭлементы: FR-9, SC-9') + q('Q2', 'Родитель: Q1') + q('Q3', 'Родитель: Q4') });
  const messages = issues(m).join('\n');
  assert.match(messages, /Дубликат ID SC-1/);
  for (const id of ['FR-9', 'SC-9', 'Q4']) assert.ok(messages.includes(`нет цели ${id}`));
  assert.match(messages, /Цикл родителей вопроса Q1/);
  assert.match(messages, /Цикл родителей вопроса Q2/);
  assert.doesNotMatch(messages, /Цикл родителей вопроса Q3/);
});

test('tech: ADR остаётся общим для docs, контракт требует существующий файл и якорь', () => {
  const m = setup({ 'tech.md': '## TECH — Реализация\nСвязи: contract:api.md#create, contract:missing.md#x, contract:../secret.md#x\n',
    'api.md': '<a id="create"></a>\nPOST /sessions' });
  assert.equal(issues(m).length, 2);
  fs.writeFileSync(path.join(m.dir, 'api.md'), '<a id="other"></a>');
  assert.equal(issues(loadFeature(m.dir)).length, 3);
  const old = workspace();
  const dir = path.join(old, 'docs', 'new-flow');
  fs.mkdirSync(dir);
  initTestFlow(dir);
  fs.writeFileSync(path.join(dir, 'tech.md'), '## TECH — Решение\nСвязи: ADR-0001\n');
  assert.deepEqual(issues(loadFeature(dir)), []);
});

test('новая сессия: readFn читает выбранный снимок, а не состояние с диска', () => {
  const m = setup({ 'questions.md': q('Q1'), 'spec.md': SPEC });
  const old = loadFeature(m.dir, (file) => file.endsWith('.sdd-flow.json') ? null : read(file));
  assert.equal(old.flow.state, null);
  assert.deepEqual(old.flow.records, []);
  const damaged = loadFeature(m.dir, (file) => file.endsWith('.sdd-flow.json') ? '{}' : read(file));
  assert.match(issues(damaged).join(), /Неподдерживаемая версия/);
  fs.writeFileSync(path.join(m.dir, '.sdd-flow.json.pending'), '{');
  assert.match(issues(loadFeature(m.dir)).join(), /Незавершённая запись/);
});

test('ID резервирует next; неизвестный родитель, ошибки формата и legacy не меняют счётчики', () => {
  const m = setup({ 'spec.md': SPEC + sc });
  const next = (...args) => run(['next', ...args]);
  assert.match(output(next('Q', m.dir)), /Q5/);
  assert.match(output(next('SC', m.dir)), /SC-5/);
  assert.match(output(next('STEP', m.dir, 'SC-1')), /SC-1-S4/);
  assert.equal(next('STEP', m.dir, 'SC-99').code, 1);
  fs.writeFileSync(path.join(m.dir, 'questions.md'), q('Q99'));
  assert.match(issues(loadFeature(m.dir)).join(), /не зарезервирован/);
  assert.equal(next('Q', m.dir).code, 1);
  const legacy = feature({ 'spec.md': SPEC, 'tech.md': '## SC-1 — случайный файл' });
  assert.equal(next('Q', legacy.dir).code, 1);
  assert.equal(fs.existsSync(path.join(legacy.dir, '.sdd-flow.json')), false);
});

test('счётчики SC/STEP и структурные ошибки попадают в общий check --json', () => {
  const m = setup({ 'scenarios.md': '## SC-9 — Путь\n### SC-9-S9 — Шаг\n', 'questions.md': '## Q1 — Неполный вопрос\n' });
  const messages = issues(m).join('\n');
  assert.match(messages, /SC-9: ID не зарезервирован/);
  assert.match(messages, /SC-9-S9: ID не зарезервирован/);
  assert.match(messages, /нужен известный Этап/);
  const checked = run(['check', m.dir, '--json']);
  assert.equal(checked.code, 1);
  assert.match(output(checked), /FL-01/);
});

test('C-16: scenarios/tech используют visibleLength и прежний READ_LIMIT, временные вопросы — нет', () => {
  const m = setup({ 'scenarios.md': 'a'.repeat(10000), 'tech.md': 'b'.repeat(10001),
    'questions.md': 'c'.repeat(12000) });
  const sizes = runChecks(m).filter((f) => f.rule === 'FL-02');
  assert.equal(sizes.length, 1);
  assert.ok(sizes[0].file.endsWith('tech.md'));
  assert.equal(sizes[0].level, 'warn');
  fs.writeFileSync(path.join(m.dir, 'tech.md'), '[коротко](https://example.com/' + 'x'.repeat(12000) + ')');
  assert.deepEqual(runChecks(loadFeature(m.dir)).filter((f) => f.rule === 'FL-02'), []);
});


test('ссылка на контракт не разрешается по якорю внутри примера кода', () => {
  const m = setup({ 'tech.md': '## TECH — Решение\nСвязи: contract:api.md#x',
    'api.md': '```html\n<a id="x"></a>\n```' });
  assert.match(issues(m).join(), /нет цели contract:api.md#x/);
});
