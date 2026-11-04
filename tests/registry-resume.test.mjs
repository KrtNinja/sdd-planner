import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpDir, SPEC } from './helpers.mjs';
import { initTestFlow } from '../skills/sdd-lint/scripts/sdd-lint/flow-state.mjs';
import { applyQuestion } from '../skills/sdd-lint/scripts/sdd-lint/registry-actions.mjs';
import { loadFeature } from '../skills/sdd-lint/scripts/sdd-lint/feature.mjs';
import { contextChanges, originalAnswer } from '../skills/sdd-lint/scripts/sdd-lint/registry-context.mjs';
import { resumeQuestion, questionHistory } from '../skills/sdd-lint/scripts/sdd-lint/registry-resume.mjs';
import { git } from '../skills/sdd-lint/scripts/sdd-lint/git.mjs';
import { run } from '../skills/sdd-lint/scripts/sdd-lint/run.mjs';

function setup() {
  const dir = tmpDir();
  initTestFlow(dir);
  fs.writeFileSync(path.join(dir, 'spec.md'), SPEC);
  applyQuestion(dir, 'add', { key: 'export', title: 'Разрешаем большие экспорты?', stage: 'grill',
    topic: 'экспорт', context: 'Роли уже согласованы', resume: 'Ожидание результата экспорта',
    followup: 'Ограничения и сбои', impact: 'known', refs: ['FR-1'] });
  return dir;
}
const q = (dir) => loadFeature(dir).flow.records.find((r) => r.id === 'Q1');

test('R-01/R-03/R-04: Q-ID, дословный многострочный ответ и ветка grill в новой сессии', () => {
  const dir = setup();
  const answer = '  Разрешаем\n\nНо ждём решения коллег.\r\n';
  applyQuestion(dir, 'answer', { key: 'answer', id: 'Q1', answer, origin: 'colleague' });
  assert.equal(originalAnswer(q(dir)), answer);
  assert.equal(q(dir).fields.Происхождение, 'colleague');
  const resumed = resumeQuestion(loadFeature(dir), { id: 'Q1' });
  assert.match(resumed, /Роли уже согласованы/);
  assert.match(resumed, /Ожидание результата экспорта/);
  assert.match(resumed, /Не запускай start/);
  assert.match(resumed, /ограничения и сбои/);
  assert.match(resumed, /name: grilling/);
  assert.equal(q(dir).fields.Статус, 'answered');
  assert.equal(run(['questions', 'resume', dir, '{"id":"Q1"}', '--json']).code, 0);
  assert.throws(() => resumeQuestion(loadFeature(dir), { id: 'Q99' }), /не найден/);
});

test('R-02: два смысловых кандидата — только уточнение, без записи', () => {
  const dir = setup();
  applyQuestion(dir, 'add', { key: 'other', title: 'Разрешаем повтор?', stage: 'spec', topic: 'повтор',
    context: 'Второй экспорт', resume: 'Ожидание', impact: 'unknown' });
  const before = fs.readFileSync(path.join(dir, 'questions.md'), 'utf8');
  assert.match(resumeQuestion(loadFeature(dir), { candidates: ['Q1', 'Q2'] }), /уточни у человека/);
  assert.match(resumeQuestion(loadFeature(dir), { candidates: ['Q1'] }), /Предложение сопоставления/);
  assert.throws(() => resumeQuestion(loadFeature(dir), { candidates: ['Q99'] }), /Неизвестный/);
  assert.equal(fs.readFileSync(path.join(dir, 'questions.md'), 'utf8'), before);
});

test('R-07: изменение и удаление точного элемента без переноса на похожий', () => {
  const dir = setup();
  assert.equal(contextChanges(loadFeature(dir), q(dir)).changes.length, 0);
  fs.appendFileSync(path.join(dir, 'spec.md'), '\nИзменившийся контекст.\n');
  assert.equal(contextChanges(loadFeature(dir), q(dir)).changes.length, 1);
  fs.unlinkSync(path.join(dir, 'spec.md'));
  const change = contextChanges(loadFeature(dir), q(dir)).changes[0];
  assert.equal(change.id, 'FR-1');
  assert.equal(change.file, null);
  assert.equal(change.text, null);
});

test('R-11: проверенная Git-ревизия после удаления обсуждения; Q-ID не используется повторно', () => {
  const dir = setup();
  assert.throws(() => questionHistory(loadFeature(dir)), /не Git/);
  git(['init'], dir);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'add', '.'], dir);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'discussion'], dir);
  const revision = git(['rev-parse', 'HEAD'], dir).trim();
  fs.unlinkSync(path.join(dir, 'questions.md'));
  assert.equal(questionHistory(loadFeature(dir)), `${revision}:questions.md`);
  applyQuestion(dir, 'add', { key: 'new', title: 'Новый ответ?', stage: 'decide', topic: 'после close',
    context: 'Новые сведения', resume: 'Уточнить', impact: 'unknown' });
  assert.equal(loadFeature(dir).flow.records[0].id, 'Q2');
  assert.equal(loadFeature(dir).flow.state.version, 2);
});

test('продолжение существующей записи без снимка и неизвестная область влияния', () => {
  const dir = setup();
  const file = path.join(dir, 'questions.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^Снимок:.*\n/m, '').replace('Влияние: known', 'Влияние: unknown'));
  const text = resumeQuestion(loadFeature(dir), { id: 'Q1' });
  assert.match(text, /Снимка до откладывания нет/);
  assert.match(text, /явно расширь контекст/);
  assert.match(text, /Ответ человека \(JSON, дословно\): ""/);
  assert.match(resumeQuestion(loadFeature(dir), {}), /Предложение сопоставления/);
});

test('R-07: ответ сохраняется и при удалённой связи; конфликт остаётся видимым', () => {
  const dir = setup();
  fs.unlinkSync(path.join(dir, 'spec.md'));
  applyQuestion(dir, 'answer', { key: 'late', id: 'Q1', answer: 'Разрешаем' });
  assert.equal(originalAnswer(q(dir)), 'Разрешаем');
  assert.match(resumeQuestion(loadFeature(dir), { id: 'Q1' }), /"file":null/);
  assert.equal(q(dir).fields.Статус, 'answered');
});

test('дополнение частичного ответа сохраняет все дословные сообщения без повторов', () => {
  const dir = setup();
  applyQuestion(dir, 'answer', { key: 'first', id: 'Q1', answer: '  разрешаем\n' });
  applyQuestion(dir, 'answer', { key: 'more', id: 'Q1', answer: 'Ждём не дольше 1 минуты', origin: 'analyst' });
  applyQuestion(dir, 'answer', { key: 'more', id: 'Q1', answer: 'Ждём не дольше 1 минуты', origin: 'analyst' });
  assert.deepEqual(JSON.parse(q(dir).fields.ОтветыJSON).map((r) => r.answer), ['  разрешаем\n', 'Ждём не дольше 1 минуты']);
  assert.match(resumeQuestion(loadFeature(dir), { id: 'Q1' }), /История ответов/);
});

test('исходные этапы используют актуальные правила; отсутствующие Q и legacy не угадываются', () => {
  const dir = setup();
  const file = path.join(dir, 'questions.md');
  const before = fs.readFileSync(file, 'utf8');
  for (const stage of ['spec', 'scenarios', 'tech', 'slices', 'adr', 'review', 'decide']) {
    fs.writeFileSync(file, before.replace('Этап: grill', `Этап: ${stage}`));
    assert.match(resumeQuestion(loadFeature(dir), { id: 'Q1' }), new RegExp(`Исходный этап: ${stage}`));
  }
  fs.unlinkSync(path.join(dir, '.sdd-flow.json'));
  assert.throws(() => resumeQuestion(loadFeature(dir), { id: 'Q1' }), /только в новом/);
});

test('контекст SC содержит только выбранную ветку и сохраняет блоки кода', async () => {
  const { reserveFlowId } = await import('../skills/sdd-lint/scripts/sdd-lint/flow-state.mjs');
  const { questionContext } = await import('../skills/sdd-lint/scripts/sdd-lint/registry-context.mjs');
  const dir = setup();
  reserveFlowId(dir, 'SC');
  reserveFlowId(dir, 'SC');
  fs.appendFileSync(path.join(dir, 'spec.md'), '\n## SC-1 — Экспорт\nТребования: FR-1\n```text\n## Не заголовок\n```\n## SC-2 — Поиск\nДругая ветка\n');
  const selected = questionContext(loadFeature(dir), ['SC-1'])[0];
  assert.match(selected.text, /## SC-1 — Экспорт/);
  assert.match(selected.text, /```text\n## Не заголовок\n```/);
  assert.doesNotMatch(selected.text, /SC-2|Другая ветка/);
  assert.match(questionContext(loadFeature(dir), ['SC-2'])[0].text, /Другая ветка/);
});
