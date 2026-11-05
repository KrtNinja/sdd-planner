import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpDir, SPEC, slice, ac, commitAll, inDir, repo, JSON_ENV } from './helpers.mjs';
import { initTestFlow, reserveFlowId } from '../skills/sdd-lint/scripts/sdd-lint/flow-state.mjs';
import { loadFeature } from '../skills/sdd-lint/scripts/sdd-lint/feature.mjs';
import { applyQuestion } from '../skills/sdd-lint/scripts/sdd-lint/registry-actions.mjs';
import { flowProgress, progressText, flowDraftStep } from '../skills/sdd-lint/scripts/sdd-lint/flow-progress.mjs';
import { askOf, askView } from '../skills/sdd-lint/scripts/sdd-lint/ask.mjs';
import { stageOf } from '../skills/sdd-lint/scripts/sdd-lint/stage.mjs';
import { fingerprint, approvalMds } from '../skills/sdd-lint/scripts/sdd-lint/approval.mjs';
import { run } from '../skills/sdd-lint/scripts/sdd-lint/run.mjs';

const write = (dir, file, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
};
function setup() {
  const dir = tmpDir();
  initTestFlow(dir);
  write(dir, 'spec.md', SPEC);
  return dir;
}
function add(dir, n, status) {
  applyQuestion(dir, 'add', { key: `q${n}`, title: `Вопрос ${n}`, stage: 'grill', topic: 'экспорт',
    context: 'После ошибки', resume: 'Повтор', impact: 'known', refs: ['FR-1'] });
  if (status) applyQuestion(dir, status, { key: `state${n}`, id: `Q${n}`, ...(status === 'answer' ? { answer: 'Повтор разрешён' } : {}) });
}
const text = (args) => run(args).chunks.map((c) => c[1]).join('');

test('U-03: компактная карточка и JSON сохраняют ожидание, ответы и полезный шаг', () => {
  const dir = setup();
  for (let n = 1; n <= 5; n++) add(dir, n, 'defer');
  add(dir, 6, 'answer');
  add(dir, 7);
  const m = loadFeature(dir);
  assert.deepEqual(flowProgress(m), { ready: ['черновик требований'], waiting: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'], answers: ['Q6'], open: ['Q7'] });
  const card = progressText(m);
  assert.match(card, /Ожидание коллег: 5 \(Q1, Q2, Q3, …\)/);
  assert.doesNotMatch(card, /Вопрос 1|Q4/);
  assert.match(card, /Ответы к обработке: 1 \(Q6\)/);
  assert.equal(askView(m).lead, card);
  assert.equal(askOf(m).questions[0].options[0].id, 'questions:resume:Q6');
  assert.match(stageOf(m).tip, /ask/);
  assert.match(text(['check', dir, '--json']), /"continuation"/);
});

test('U-01: отдельные цели scenarios и tech до общего ревью', () => {
  const dir = setup();
  assert.equal(flowDraftStep(loadFeature(dir)).skill, 'sdd-scenarios');
  write(dir, 'spec.md', SPEC + '\n## Пользовательские сценарии\nПрименяется прежний путь.\n');
  assert.equal(flowDraftStep(loadFeature(dir)).skill, 'sdd-tech');
  assert.equal(askOf(loadFeature(dir)).questions[0].options[0].id, 'window:sdd-tech');
  assert.match(stageOf(loadFeature(dir)).tip, /sdd-tech/);
  write(dir, 'tech.md', '## TECH — Валидация\nСвязи: FR-1\nСуществующий механизм.\n');
  assert.equal(flowDraftStep(loadFeature(dir)), null);
  assert.match(progressText(loadFeature(dir)), /Ответы к обработке: нет/);
  fs.unlinkSync(path.join(dir, '.sdd-flow.json'));
  assert.equal(flowProgress(loadFeature(dir)), null);
  assert.equal(progressText(loadFeature(dir)), null);
});

test('U-05/U-06: trace Q и FR включает транзитивные SC/STEP/TECH/AC и не согласует их', () => {
  const dir = setup();
  reserveFlowId(dir, 'SC');
  reserveFlowId(dir, 'STEP', 'SC-1');
  write(dir, 'spec.md', SPEC + '\n## Пользовательские сценарии\n### SC-1 — Экспорт\nТребования: FR-1\n#### SC-1-S1 — Скачать\n');
  write(dir, 'tech.md', '## TECH — Экспорт\nСвязи: SC-1-S1\nСуществующий сервис.\n');
  write(dir, 'slices/001-export.md', slice('001', {}, ...ac('AC-001-1')));
  add(dir, 1);
  const before = fs.readFileSync(path.join(dir, 'spec.md'), 'utf8');
  for (const id of ['Q1', 'FR-1', 'TECH', 'SC-1-S1', 'AC-001-1']) {
    const out = text(['trace', dir, id, '--json']);
    for (const expected of ['Q1:', 'FR-1:', 'TECH:', 'SC-1:', 'SC-1-S1:', 'AC-001-1:']) assert.ok(out.includes(expected), out);
    assert.match(out, /не доказывает смысловую достаточность/);
  }
  assert.equal(fs.readFileSync(path.join(dir, 'spec.md'), 'utf8'), before);
  assert.notEqual(run(['trace', dir, 'Q999']).code, 0);
});

test('U-06: diff выдаёт пересмотр связей изменённого одобренного FR в JSON', () => {
  const dir = setup();
  write(dir, 'tech.md', '## TECH — Валидация\nСвязи: FR-1\nПроверяет существующий сервис.\n');
  const m = loadFeature(dir);
  const fp = fingerprint(approvalMds(m, 'spec', m.specFile));
  write(dir, 'spec.md', SPEC.replace('Статус: черновик', `Статус: одобрено 04.11.2026 · ${fp}`));
  commitAll(dir);
  assert.doesNotMatch(text(['diff', dir, '--json']), /"review"/);
  const before = fs.readFileSync(path.join(dir, 'spec.md'), 'utf8');
  write(dir, 'spec.md', before.replace('FR-1  Текст.', 'FR-1  Новое правило.'));
  const review = JSON.parse(text(['diff', dir, '--json'])).review;
  assert.deepEqual(review.changed, ['FR-1']);
  assert.deepEqual(review.related, ['FR-1', 'TECH']);
  assert.match(text(['diff', dir]), /не согласованы автоматически/);
});

test('U-03: готовность опирается на действительное одобрение, не на голый статус', () => {
  const dir = setup();
  write(dir, 'brainstorming.md', '# Обсуждение\nСтатус: готов\n');
  write(dir, 'tech.md', '## TECH — Валидация\nСуществующий сервис.\n');
  write(dir, 'slices/001-validation.md', slice('001', {}, ...ac('AC-001-1')));
  write(dir, 'slices/README.md', '# Части\nСтатус: черновик\n');
  let m = loadFeature(dir);
  assert.deepEqual(flowProgress(m).ready, ['первичное обсуждение', 'черновик требований', 'черновик частей работы']);
  write(dir, 'spec.md', SPEC.replace('Статус: черновик', `Статус: одобрено 04.11.2026 · ${fingerprint(approvalMds(m, 'spec', m.specFile))}`));
  m = loadFeature(dir);
  const fp = fingerprint(approvalMds(m, 'slices', m.readmeFile));
  write(dir, 'slices/README.md', `# Части\nСтатус: одобрено 04.11.2026 · ${fp}\n`);
  assert.deepEqual(flowProgress(loadFeature(dir)).ready, ['первичное обсуждение', 'поведение и tech согласованы', 'части работы согласованы']);
  fs.unlinkSync(path.join(dir, 'spec.md'));
  assert.equal(flowDraftStep(loadFeature(dir)), null);
});

test('U-09: каждый скилл получает только контракт своей цели, legacy не включается', () => {
  const root = repo();
  const dir = path.join(root, 'docs', 'validation');
  fs.mkdirSync(dir);
  initTestFlow(dir);
  inDir(root, JSON_ENV, () => {
    const grill = text(['prompt', 'sdd-grill', 'validation']);
    assert.match(grill, /Первичное обсуждение выясняет цель/);
    assert.doesNotMatch(grill, /# Техническое обеспечение|# Пользовательские сценарии/);
    const spec = text(['prompt', 'sdd-spec', 'validation']);
    assert.doesNotMatch(spec, /# Техническое обеспечение|# Пользовательские сценарии/);
    const scenarios = text(['prompt', 'sdd-scenarios', 'validation']);
    assert.match(scenarios, /# Пользовательские сценарии/);
    assert.doesNotMatch(scenarios, /# Техническое обеспечение/);
    const tech = text(['prompt', 'sdd-tech', 'validation']);
    assert.match(tech, /# Техническое обеспечение/);
    assert.doesNotMatch(tech, /# Пользовательские сценарии/);
    assert.match(progressText(loadFeature(dir)), /пока нет завершённых результатов/);
  });
});

test('U-01/U-04: входы scenarios/tech доступны для v2-черновика и закрыты для legacy', () => {
  const dir = setup();
  for (const task of ['scenarios', 'tech']) {
    assert.equal(run(['gate', 'spec', dir, task]).code, 0);
  }
  fs.unlinkSync(path.join(dir, '.sdd-flow.json'));
  assert.equal(run(['gate', 'spec', dir, 'tech']).code, 3);
  const empty = tmpDir();
  initTestFlow(empty);
  assert.equal(run(['gate', 'spec', empty, 'scenarios']).code, 3);
});
