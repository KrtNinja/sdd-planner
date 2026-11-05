import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpDir, SPEC, GOOD, slice, ac, run as cli } from './helpers.mjs';
import { initTestFlow, reserveFlowId } from '../skills/sdd-lint/scripts/sdd-lint/flow-state.mjs';
import { loadFeature, runChecks } from '../skills/sdd-lint/scripts/sdd-lint/feature.mjs';
import { checkTech } from '../skills/sdd-lint/scripts/sdd-lint/tech.mjs';
import { checkAdrs } from '../skills/sdd-lint/scripts/sdd-lint/adr-rules.mjs';
import { visibleLength } from '../skills/sdd-lint/scripts/sdd-lint/read-size.mjs';
import { applyQuestion } from '../skills/sdd-lint/scripts/sdd-lint/registry-actions.mjs';
import { resumeQuestion } from '../skills/sdd-lint/scripts/sdd-lint/registry-resume.mjs';
import { fileQuestionBlockers } from '../skills/sdd-lint/scripts/sdd-lint/registry-view.mjs';
import { questionContext } from '../skills/sdd-lint/scripts/sdd-lint/registry-context.mjs';
import { questionDigest } from '../skills/sdd-lint/scripts/sdd-lint/registry-format.mjs';
import { decisionAction } from '../skills/sdd-lint/scripts/sdd-lint/decision-actions.mjs';
import { checkDecisionMeaning, candidateFeature } from '../skills/sdd-lint/scripts/sdd-lint/decision-files.mjs';

const simple = '## TECH — Проверка названия\nСвязи: FR-1\n\n' +
  'Факт: форма и сервис каталога используют существующую проверку — [контракт](catalog.md#name).\n' +
  'Принятое решение: пустое название отклоняется существующим механизмом FR-1 до сохранения.\n' +
  'ADR не нужен: дорогого необратимого выбора нет.\n';
const scenario = '## Пользовательские сценарии\n\n### SC-1 — Экспорт\nТребования: FR-1\n' +
  'Анна запрашивает файл и получает его в том же запросе.\n';
const write = (dir, file, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
};
const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');
function setup(separate = false) {
  const dir = path.join(tmpDir(), 'docs', 'export');
  fs.mkdirSync(dir, { recursive: true });
  initTestFlow(dir);
  reserveFlowId(dir, 'SC');
  write(dir, 'spec.md', SPEC + (separate ? '' : scenario));
  if (separate) write(dir, 'scenarios.md', scenario);
  write(dir, 'tech.md', simple);
  write(dir, 'catalog.md', '# Контракт\n<a id="name"></a>\nПроверка названия.');
  return dir;
}
const state = (dir) => loadFeature(dir).flow.records.find((r) => r.id === 'Q1');
function question(dir, stage = 'tech', refs = ['TECH']) {
  applyQuestion(dir, 'add', { key: 'hypothesis', title: 'Выдержит ли очередь нагрузку?', stage,
    topic: 'экспорт', context: 'Нагрузка не проверена; без подтверждения обещание невыполнимо',
    resume: 'Проверить результат нагрузочного прогона или согласовать изменение объёма', impact: 'known', refs });
}
function proposal(dir, after) {
  return { key: 'prepare', id: 'Q1', summary: 'Результат проверки очереди', assessment: 'Прогон подтверждает профиль',
    tradeoffs: 'Существующая очередь', remaining: 'Нет', ready: true, conflicts: [], obligations: 'unchanged',
    context: questionContext(loadFeature(dir), state(dir).refs.map((r) => r.id)).map(({ id, file, hash }) => ({ id, file, hash })),
    changes: [{ file: 'tech.md', before: read(dir, 'tech.md'), after }] };
}

test('T-01/T-10: короткое обеспечение без ADR; отсутствие, пустая форма и один линк недостаточны', () => {
  const dir = setup();
  assert.deepEqual(checkTech(loadFeature(dir)), []);
  assert.ok(visibleLength(simple) < 500);
  assert.equal(loadFeature(dir).featureAdrs.length, 0);
  for (const md of ['', '# Tech\n', '## TECH — Название\nСвязи: FR-1\n[ADR](../adr/0001-a.md)\n',
    'Вводный текст\n## TECH — Название\n', '## TECH — Название\n```\nТолько схема\n```\n']) {
    write(dir, 'tech.md', md);
    assert.equal(checkTech(loadFeature(dir))[0].rule, 'TE-01');
  }
  fs.unlinkSync(path.join(dir, 'tech.md'));
  assert.match(checkTech(loadFeature(dir))[0].msg, /до согласования/);
  fs.unlinkSync(path.join(dir, '.sdd-flow.json'));
  assert.deepEqual(checkTech(loadFeature(dir)), []);
});

test('T-01: tech входит в одобрение spec; отсутствие блокирует, правка снимает одобрение, legacy не меняется', () => {
  const cwd = tmpDir();
  const dir = path.join(cwd, 'docs', 'comments');
  fs.mkdirSync(dir, { recursive: true });
  initTestFlow(dir);
  fs.cpSync(path.join(GOOD, 'docs'), path.join(cwd, 'docs'), { recursive: true });
  assert.equal(cli(cwd, 'approve', 'spec', dir).code, 3);
  write(dir, 'tech.md', simple);
  const approved = cli(cwd, 'approve', 'spec', dir);
  assert.equal(approved.code, 0, approved.out);
  assert.equal(loadFeature(dir).approvals.find((a) => a.kind === 'spec').state, 'ok');
  fs.appendFileSync(path.join(dir, 'tech.md'), '\nПредложение: другой механизм.\n');
  assert.equal(loadFeature(dir).approvals.find((a) => a.kind === 'spec').state, 'changed');
  assert.notEqual(cli(cwd, 'gate', 'slices', dir).code, 0);
});

for (const separate of [false, true]) {
  test(`T-07: техническое уточнение не заменяет синхронный сценарий; отдельный файл: ${separate}`, () => {
    const dir = setup(separate);
    const file = separate ? 'scenarios.md' : 'spec.md';
    const m = loadFeature(dir);
    const before = read(dir, file);
    const after = before.replace('получает его в том же запросе', 'ожидает фоновую задачу');
    const next = candidateFeature(dir, [{ file, before, after }]);
    assert.throws(() => checkDecisionMeaning(m, next, 'unchanged'), /сценарии/);
    assert.doesNotThrow(() => checkDecisionMeaning(m, next, 'changed'));
    assert.equal(read(dir, file), before);
  });
}

test('T-04/T-08: критичная гипотеза остаётся открытой; отложенный и неподтверждённый ответ блокируют', () => {
  const dir = setup();
  question(dir);
  fs.appendFileSync(path.join(dir, 'tech.md'), '\nГипотеза: очередь выдержит нагрузку. Проверка: нагрузочный прогон. ' +
    'Неподтверждение требует пересмотра обещания — [Q1](questions.md#q1).\n');
  applyQuestion(dir, 'defer', { key: 'later', id: 'Q1' });
  assert.equal(state(dir).fields.Статус, 'deferred');
  assert.equal(fileQuestionBlockers(loadFeature(dir), [path.join(dir, 'spec.md')])[0].id, 'Q1');
  applyQuestion(dir, 'answer', { key: 'answer', id: 'Q1', answer: 'Кажется, выдержит', origin: 'unconfirmed' });
  assert.throws(() => decisionAction(dir, 'prepare', { ...proposal(dir, simple + '\nНе проверено.\n'), ready: false }), /Частичный/);
  assert.equal(state(dir).fields.Статус, 'answered');
  assert.equal(fileQuestionBlockers(loadFeature(dir), [path.join(dir, 'tech.md')]).length, 1);
});

for (const stage of ['tech', 'adr']) {
  test(`T-08: ${stage} Q — единый реестр, resume и согласованный пакет`, () => {
    const dir = setup();
    question(dir, stage);
    const text = resumeQuestion(loadFeature(dir), { id: 'Q1' });
    assert.match(text, new RegExp(`Исходный этап: ${stage}`));
    assert.match(text, /Исходный скилл: sdd-/);
    assert.match(text, /tech.md/);
    applyQuestion(dir, 'answer', { key: 'answer', id: 'Q1', answer: 'Прогон подтверждает профиль', origin: 'colleague' });
    decisionAction(dir, 'prepare', proposal(dir, simple + '\nФакт: прогон подтвердил профиль — [результат](load.md).\n'));
    const hash = questionDigest(state(dir).fields.Пакет);
    assert.throws(() => decisionAction(dir, 'apply', { key: 'apply', id: 'Q1', packageHash: hash }), /согласуйте/);
    decisionAction(dir, 'accept', { key: 'accept', id: 'Q1', packageHash: hash, origin: 'analyst', decision: 'Принимаю пакет' });
    decisionAction(dir, 'apply', { key: 'apply', id: 'Q1', packageHash: hash });
    assert.equal(state(dir).fields.Статус, 'resolved');
    assert.match(read(dir, 'tech.md'), /прогон подтвердил/);
    assert.equal(loadFeature(dir).flow.state.next.Q, 2);
  });
}

for (const separate of [false, true]) {
  test(`T-06: ранний ADR по SC и реальные slices позже; отдельный файл: ${separate}`, () => {
    const dir = setup(separate);
    const adr = '# ADR-0001 — Экспорт\nФича: export/\nСтатус: предложено\n' +
      '## Контекст\nSC-1\n## Варианты\n### A. Очередь\nВыбран: независимый запуск\n' +
      '### B. Запрос\nОтложен: требует обсуждения\n## Решение\nОчередь\n## Последствия\nОжидание\n## Не выяснено\nНет\n';
    write(dir, '../adr/0001-export.md', adr);
    let m = loadFeature(dir);
    assert.equal(checkAdrs(m).filter((f) => f.level === 'err').length, 0);
    assert.ok(m.flow.graph.edges.some((e) => e.from === 'ADR-0001' && e.to === 'SC-1'));
    fs.unlinkSync(path.join(dir, 'tech.md'));
    const accepted = cli(path.dirname(path.dirname(dir)), 'approve', 'adr', dir, '0001');
    assert.equal(accepted.code, 0, accepted.out);
    write(dir, 'tech.md', simple);
    write(dir, '../adr/0001-export.md', adr.replace('Статус:', 'Затрагивает slices: 999\nСтатус:'));
    assert.ok(checkAdrs(loadFeature(dir)).some((f) => /999/.test(f.msg)));
    write(dir, '../adr/0001-export.md', adr);
    question(dir, 'tech', ['SC-1']);
    assert.equal(fileQuestionBlockers(loadFeature(dir), [path.join(dir, '../adr/0001-export.md')])[0].id, 'Q1');
    write(dir, 'slices/001-export.md', slice('001', {}, ...ac('AC-001-1')));
    assert.ok(checkAdrs(loadFeature(dir)).some((f) => f.rule === 'AD-07'));
    write(dir, '../adr/0001-export.md', adr.replace('Статус:', 'Затрагивает slices: 001\nСтатус:').replace('Ожидание', 'slice 001 — ожидание'));
    m = loadFeature(dir);
    assert.equal(checkAdrs(m).filter((f) => f.rule === 'AD-07').length, 0);
    write(dir, '../adr/0001-export.md', adr.replace('SC-1', 'SC-99'));
    assert.ok(runChecks(loadFeature(dir)).some((f) => /SC-99/.test(f.msg)));
  });
}

test('T-02/размер: экспорт связан с поведением; tech использует прежний visibleLength', () => {
  const dir = setup();
  write(dir, 'tech.md', '## TECH — Экспорт\nСвязи: FR-1, NFR-1, SC-1\n' +
    'Предложение: API передаёт задание работнику; работник читает данные и сохраняет файл.\n' +
    'Форма показывает ожидание, готовность или ошибку; при сбое доступен повтор.\n');
  assert.equal(runChecks(loadFeature(dir)).filter((f) => f.rule === 'FL-01').length, 0);
  const base = read(dir, 'tech.md');
  for (const n of [9999, 10000, 10001]) {
    write(dir, 'tech.md', base + 'я'.repeat(n - visibleLength(base)));
    assert.equal(runChecks(loadFeature(dir)).filter((f) => f.rule === 'FL-02').length, Number(n > 10000));
  }
});

test('TECH в spec не заменяет обязательную структуру технического документа', () => {
  const dir = setup();
  write(dir, 'spec.md', '## TECH — Ошибочно в требованиях\n\n' + read(dir, 'spec.md'));
  write(dir, 'tech.md', '# Обеспечение\n\nСуществующий сервис проверяет название до сохранения.\n');
  const findings = checkTech(loadFeature(dir));
  assert.equal(findings.length, 1);
  assert.match(findings[0].msg, /Нужен один заголовок TECH/);
});
