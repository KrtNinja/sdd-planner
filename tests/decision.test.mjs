import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpDir, SPEC } from './helpers.mjs';
import { initTestFlow } from '../skills/sdd-lint/scripts/sdd-lint/flow-state.mjs';
import { applyQuestion } from '../skills/sdd-lint/scripts/sdd-lint/registry-actions.mjs';
import { loadFeature } from '../skills/sdd-lint/scripts/sdd-lint/feature.mjs';
import { decisionAction } from '../skills/sdd-lint/scripts/sdd-lint/decision-actions.mjs';
import { questionDigest } from '../skills/sdd-lint/scripts/sdd-lint/registry-format.mjs';
import { questionContext } from '../skills/sdd-lint/scripts/sdd-lint/registry-context.mjs';
import { draftWork } from '../skills/sdd-lint/scripts/sdd-lint/registry-view.mjs';

const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');
const question = (dir) => loadFeature(dir).flow.records.find((r) => r.id === 'Q1');
const hash = (dir) => questionDigest(question(dir).fields.Пакет);
const act = (dir, verb, fields) => decisionAction(dir, verb, { key: verb, id: 'Q1', ...fields });

function setup() {
  const dir = tmpDir();
  initTestFlow(dir);
  fs.writeFileSync(path.join(dir, 'spec.md'), SPEC);
  applyQuestion(dir, 'add', { key: 'q', title: 'Разрешить экспорт?', stage: 'grill', topic: 'экспорт',
    context: 'Роли уже согласованы', resume: 'Лимиты, ожидание, сбои', impact: 'known', refs: ['FR-1'] });
  applyQuestion(dir, 'answer', { key: 'a', id: 'Q1', answer: 'разрешаем', origin: 'analyst' });
  return dir;
}
function proposal(dir, overrides = {}) {
  return { summary: 'Уточнение согласованного поведения', assessment: 'Ответ полон, FR проверены',
    tradeoffs: 'Нет', remaining: 'Нет', ready: true, conflicts: [], obligations: 'changed',
    context: questionContext(loadFeature(dir), ['FR-1']).map((c) => ({ id: c.id, file: c.file, hash: c.hash })),
    changes: [{ file: 'spec.md', before: SPEC, after: SPEC.replace('FR-1  Текст.', 'FR-1  Экспорт разрешён.') }], ...overrides };
}
function accept(dir) {
  act(dir, 'accept', { packageHash: hash(dir), origin: 'analyst', decision: 'Согласовано целиком' });
}

test('R-08–R-10: согласованный пакет, проверка происхождения, повтор без дубликатов и блокировки дочернего Q', () => {
  const dir = setup();
  applyQuestion(dir, 'add', { key: 'child', parent: 'Q1', title: 'Лимит?', stage: 'grill', topic: 'экспорт',
    context: 'Собственное разрешение родителя принято', resume: 'Предел', impact: 'known', refs: ['FR-1'] });
  applyQuestion(dir, 'defer', { key: 'later', id: 'Q2' });
  const input = proposal(dir, { remaining: 'Q2: лимит уточняется отдельно' });
  const card = act(dir, 'prepare', input);
  assert.match(card, /Что меняется и почему/);
  assert.equal(read(dir, 'spec.md'), SPEC);
  assert.throws(() => act(dir, 'apply', { packageHash: hash(dir) }), /согласуйте/);
  assert.throws(() => act(dir, 'accept', { packageHash: hash(dir), origin: 'colleague', decision: 'Коллега сказал да' }), /аналитика/);
  accept(dir);
  act(dir, 'apply', { packageHash: hash(dir) });
  assert.equal(question(dir).fields.Статус, 'resolved');
  assert.match(read(dir, 'spec.md'), /Статус: на ревью/);
  assert.throws(() => draftWork(loadFeature(dir), ['FR-1']), /Q2/);
  const saved = read(dir, 'spec.md');
  act(dir, 'apply', { packageHash: hash(dir) });
  assert.equal(read(dir, 'spec.md'), saved);
  assert.equal(loadFeature(dir).flow.state.next.Q, 3);
});

test('R-05/R-08: частичный ответ, противоречие FR и техническое уточнение не проводятся', () => {
  const dir = setup();
  assert.throws(() => act(dir, 'prepare', proposal(dir, { ready: false })), /Частичный/);
  assert.throws(() => act(dir, 'prepare', proposal(dir, { conflicts: ['FR запрещает экспорт'] })), /противоречие/);
  assert.throws(() => act(dir, 'prepare', proposal(dir, { obligations: 'unchanged' })), /не может менять FR/);
  assert.equal(question(dir).fields.Статус, 'answered');
  assert.equal(read(dir, 'spec.md'), SPEC);
});

test('R-07: устаревший контекст до подготовки и конфликт до проведения не перезаписываются', () => {
  const dir = setup();
  const input = proposal(dir);
  fs.appendFileSync(path.join(dir, 'spec.md'), '\nИзменение коллеги\n');
  assert.throws(() => act(dir, 'prepare', input), /Контекст FR-1 изменился/);
  fs.writeFileSync(path.join(dir, 'spec.md'), SPEC);
  act(dir, 'prepare', input);
  accept(dir);
  fs.appendFileSync(path.join(dir, 'spec.md'), '\nНовое изменение\n');
  assert.throws(() => act(dir, 'apply', { packageHash: hash(dir) }), /Конфликт проведения/);
  assert.match(read(dir, 'spec.md'), /Новое изменение/);
  assert.equal(question(dir).fields.Статус, 'answered');
});

test('R-10: прерывание после первого документа, новая сессия и повтор без дубликатов', () => {
  const dir = setup();
  const input = proposal(dir);
  input.changes.push({ file: 'tech.md', before: null, after: '# Техническое обеспечение\n\n## TECH — Экспорт\nСвязи: FR-1\nОчередь.\n' });
  act(dir, 'prepare', input);
  accept(dir);
  const original = fs.renameSync;
  const stub = mock.method(fs, 'renameSync', (from, to) => {
    if (String(to).endsWith('/tech.md')) throw new Error('disk interrupted');
    return original(from, to);
  });
  assert.throws(() => act(dir, 'apply', { packageHash: hash(dir) }), /disk interrupted/);
  stub.mock.restore();
  assert.match(read(dir, 'spec.md'), /Экспорт разрешён/);
  assert.equal(question(dir).fields.Статус, 'answered');
  assert.equal(fs.existsSync(path.join(dir, 'tech.md')), false);
  act(dir, 'apply', { packageHash: hash(dir) });
  assert.equal(question(dir).fields.Статус, 'resolved');
  assert.equal((read(dir, 'spec.md').match(/^FR-1  /gm) || []).length, 1);
  assert.match(read(dir, 'tech.md'), /Очередь/);
});

test('подготовка требует точные данные и безопасные пути; ошибочный пакет не сохраняется', () => {
  const dir = setup();
  const bad = [
    { context: [] }, { context: undefined }, { summary: '' }, { assessment: null },
    { changes: [] }, { changes: [{ file: '../outside.md', before: null, after: 'oops' }] },
    { changes: [{ file: 'spec.md', before: 12, after: 'oops' }] },
    { changes: [{ file: 'spec.md', before: SPEC, after: '' }] },
    { changes: [{ file: 'spec.md', before: SPEC, after: SPEC }] },
    { changes: [{ file: 'spec.md', before: SPEC, after: 'FR-? test' }] },
    { changes: [{ file: 'spec.md', before: 'stale', after: SPEC }] },
    { obligations: 'automatic' },
  ];
  for (const input of bad) assert.throws(() => act(dir, 'prepare', proposal(dir, input)));
  const duplicate = proposal(dir); duplicate.changes.push(duplicate.changes[0]);
  assert.throws(() => act(dir, 'prepare', duplicate), /повторяется/);
  fs.unlinkSync(path.join(dir, 'spec.md'));
  assert.throws(() => act(dir, 'prepare', proposal(dir)), /нет цели/);
  assert.equal(question(dir).fields.Пакет, undefined);
});

test('протокол дополняется один раз; существующая строка не переписывается', () => {
  const dir = setup();
  const protocol = '# Обсуждение\nСтатус: идёт\n\n## Решения\n\n| # | Ветка | Вопрос | Рекомендация | Ответ |\n|---|---|---|---|---|\n| 1 | Роли | Кто? | Аналитик | Аналитик |\n';
  fs.writeFileSync(path.join(dir, 'brainstorming.md'), protocol);
  const input = proposal(dir);
  input.changes.push({ file: 'brainstorming.md', before: protocol, after: protocol.replace('| Аналитик | Аналитик |', '| Все | Все |') });
  assert.throws(() => act(dir, 'prepare', input), /только дополнять/);
  input.changes[1].after = protocol + '\n## Решения после обсуждения\n\n| # | Когда | Вопрос | Решение |\n|---|---|---|---|\n| П1 | Сегодня | Экспорт | Разрешаем |\n';
  input.changes[0].after = input.changes[0].after.replace(/(```\n[^`]+\n```)/g, '$1\nИз протокола: 1, П1');
  act(dir, 'prepare', input);
  accept(dir);
  act(dir, 'apply', { packageHash: hash(dir) });
  act(dir, 'apply', { packageHash: hash(dir) });
  assert.equal(read(dir, 'brainstorming.md'), input.changes[1].after);
  assert.equal((read(dir, 'brainstorming.md').match(/П1/g) || []).length, 1);
});

test('пакет и ключ неизменны; принятие ответа не даёт согласия пакету, исключение закрывается отдельно', () => {
  const dir = setup();
  applyQuestion(dir, 'exclude', { key: 'exclude', id: 'Q1', decision: 'Исключаем экспорт', consequences: 'Нет больших выгрузок' });
  const input = proposal(dir);
  const first = act(dir, 'prepare', input);
  assert.equal(act(dir, 'prepare', input), first);
  assert.throws(() => act(dir, 'prepare', { ...input, summary: 'иное' }), /Ключ действия/);
  assert.throws(() => act(dir, 'prepare', { ...input, key: 'second' }), /уже сохранён/);
  assert.throws(() => act(dir, 'accept', { packageHash: 'wrong', origin: 'analyst', decision: 'Да' }), /изменился/);
  assert.throws(() => applyQuestion(dir, 'answer', { key: 'new', id: 'Q1', answer: 'Другой' }), /завершите проведение/);
  accept(dir);
  act(dir, 'apply', { packageHash: hash(dir) });
  assert.equal(question(dir).fields.Статус, 'excluded');
});

test('пакет можно исправить до проведения; частично проведённый пакет нельзя скрыть сбросом', () => {
  const dir = setup();
  act(dir, 'prepare', proposal(dir));
  accept(dir);
  assert.match(act(dir, 'revise', { packageHash: hash(dir) }), /исправленный пакет/);
  assert.equal(question(dir).fields.Пакет, undefined);
  assert.equal(question(dir).fields.Согласование, undefined);
  assert.equal(question(dir).fields.Статус, 'answered');
  act(dir, 'prepare', { ...proposal(dir), key: 'new-package' });
  const pack = JSON.parse(question(dir).fields.Пакет);
  fs.writeFileSync(path.join(dir, 'spec.md'), pack.changes[0].after);
  assert.throws(() => act(dir, 'revise', { key: 'second-revise', packageHash: hash(dir) }), /частично проведён/);
  assert.ok(question(dir).fields.Пакет);
});

test('R-10: аварийный pending и временный документ восстанавливаются явно, Q не закрывается раньше записи', async () => {
  const { run } = await import('../skills/sdd-lint/scripts/sdd-lint/run.mjs');
  const dir = setup();
  act(dir, 'prepare', proposal(dir));
  accept(dir);
  fs.writeFileSync(path.join(dir, 'questions.md.pending'), '{');
  fs.writeFileSync(path.join(dir, 'spec.md.decision-writing'), 'часть документа');
  assert.throws(() => act(dir, 'apply', { packageHash: hash(dir) }), /EEXIST/);
  assert.equal(run(['questions', 'recover', dir, '{}']).code, 0);
  assert.equal(fs.existsSync(path.join(dir, 'spec.md.decision-writing')), false);
  assert.equal(question(dir).fields.Статус, 'answered');
  act(dir, 'apply', { packageHash: hash(dir) });
  assert.equal(question(dir).fields.Статус, 'resolved');
});

test('R-11: ответ после настоящего close, без восстановления протокола', async () => {
  const { run } = await import('../skills/sdd-lint/scripts/sdd-lint/run.mjs');
  const dir = setup();
  fs.writeFileSync(path.join(dir, 'brainstorming.md'), '# Обсуждение\nСтатус: идёт\n');
  const version = read(dir, '.sdd-flow.json');
  run(['close', dir, '--yes']);
  assert.equal(fs.existsSync(path.join(dir, 'brainstorming.md')), false);
  assert.equal(read(dir, '.sdd-flow.json'), version);
  assert.equal(question(dir).fields.Ответ, 'разрешаем');
  act(dir, 'prepare', proposal(dir));
  accept(dir);
  act(dir, 'apply', { packageHash: hash(dir) });
  assert.equal(question(dir).fields.Статус, 'resolved');
  assert.equal(fs.existsSync(path.join(dir, 'brainstorming.md')), false);
});

test('подготовка пакета не мигрирует legacy даже при оставшемся questions.md', () => {
  const dir = setup();
  fs.unlinkSync(path.join(dir, '.sdd-flow.json'));
  assert.throws(() => act(dir, 'prepare', proposal(dir)), /только в новом/);
  assert.equal(read(dir, 'spec.md'), SPEC);
});
