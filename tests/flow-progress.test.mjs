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
  assert.match(stageOf(loadFeature(dir)).tip, /ask/);
  assert.deepEqual(stageOf(loadFeature(dir)).questions, askOf(loadFeature(dir)).questions);
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

const PROTOCOL = '# Обсуждение\nСтатус: готов\n\n## Решения\n' +
  '| # | Ветка | Вопрос | Рекомендация агента | Решение |\n|---|---|---|---|---|\n' +
  '| 1 | Продукт | Поведение | — | Пустое название не сохраняется |\n';
const BEHAVIOR = '# Проверка\nСтатус: черновик\n\n## Требования\n```\n' +
  'FR-1  Пустое название не сохраняется.\nПример: Анна видит ошибку.\n```\nИз протокола: 1\n';
const SCENARIOS = '\n## Пользовательские сценарии\nПрименяется существующая форма: Анна видит ошибку и исправляет название.\n';
const TECH = '## TECH — Проверка\nСвязи: FR-1\nСуществующая проверка отклоняет пустое название до сохранения.\n';

function routeCall(args, expected = 0) {
  const r = run(args);
  const out = r.chunks.map((c) => c[1]).join('');
  assert.equal(r.code, expected, out);
  return out;
}
function assertRoute(dir, id) {
  const m = loadFeature(dir);
  const options = askOf(m).questions.flatMap((q) => q.options);
  assert.equal(options.find((o) => o.recommended).id, id);
  const ask = routeCall(['ask', dir]);
  const check = run(['check', dir]).chunks.map((c) => c[1]).join('');
  for (const o of options) {
    assert.ok(ask.includes(o.id), ask);
    assert.ok(check.includes(o.id), check);
  }
  assert.deepEqual(stageOf(m).questions, askOf(m).questions);
  const report = JSON.parse(routeCall(['check', dir, '--json']));
  assert.deepEqual(report.questions, askView(m).questions);
  return options;
}

test('блок 4: полный start/done — grill, требования, сценарии, tech и существующее согласование', () => {
  const root = repo();
  inDir(root, { ...JSON_ENV, SDD_VIEW: '' }, () => {
    const dir = 'docs/validation';
    fs.mkdirSync(dir);
    initTestFlow(path.resolve(dir));
    routeCall(['start', 'проверять название', '--slug', 'validation']);
    const started = routeCall(['start', dir, '--sources', 'нет']);
    assert.match(started, /старт готов/);
    assert.ok(fs.existsSync(`${dir}/brainstorming.md`));
    // Включение нового процесса обычным start относится к блоку 07.
    assertRoute(dir, 'here:sdd-grill');
    write(dir, 'brainstorming.md', PROTOCOL);
    let done = routeCall(['done', dir]);
    assert.match(done, /window:sdd-spec/);
    assertRoute(dir, 'window:sdd-spec');
    routeCall(['gate', 'spec', dir]);
    assert.equal(fs.existsSync(`${dir}/tech.md`), false);
    write(dir, 'spec.md', BEHAVIOR);
    done = routeCall(['done', dir]);
    assert.match(done, /window:sdd-scenarios/);
    assertRoute(dir, 'window:sdd-scenarios');
    assert.match(fs.readFileSync(`${dir}/spec.md`, 'utf8'), /Статус: черновик/);
    write(dir, 'spec.md', fs.readFileSync(`${dir}/spec.md`, 'utf8') + SCENARIOS);
    done = routeCall(['done', dir]);
    assert.match(done, /window:sdd-tech/);
    assertRoute(dir, 'window:sdd-tech');
    routeCall(['gate', 'slices', dir], 3);
    assert.equal(fs.existsSync(`${dir}/scenarios.md`), false);
    write(dir, 'tech.md', TECH);
    done = routeCall(['done', dir]);
    assert.match(done, /approve:spec/);
    assert.match(fs.readFileSync(`${dir}/spec.md`, 'utf8'), /Статус: на ревью/);
    routeCall(['gate', 'slices', dir], 3);
    routeCall(['approve', 'spec', dir]);
    assertRoute(dir, 'window:sdd-slices');
    routeCall(['gate', 'slices', dir]);
    assert.match(routeCall(['done', dir]), /window:sdd-slices/);
    assert.equal(fs.existsSync(`${dir}/slices`), false);
  });
});

test('блок 4: ошибки существующих документов не скрываются будущим шагом', () => {
  const dir = setup();
  write(dir, 'brainstorming.md', PROTOCOL.replace('| 1 |', '| 7 |'));
  fs.unlinkSync(path.join(dir, 'spec.md'));
  assert.equal(askOf(loadFeature(dir)).questions[0].options[0].id, 'flow:check');
  routeCall(['gate', 'spec', dir], 3);
  routeCall(['done', dir], 1);
  write(dir, 'brainstorming.md', PROTOCOL);
  write(dir, 'spec.md', BEHAVIOR + SCENARIOS);
  write(dir, 'tech.md', '## TECH — Пустое решение\n');
  routeCall(['done', dir], 1);
  assert.equal(askOf(loadFeature(dir)).questions[0].options[0].id, 'window:sdd-tech');
  assert.match(routeCall(['done', dir]), /window:sdd-tech/);
  assert.match(fs.readFileSync(path.join(dir, 'spec.md'), 'utf8'), /Статус: черновик/);
});

test('блок 4: ошибка протокола после согласования запрещает рекомендацию slices и gate', () => {
  const dir = setup();
  write(dir, 'spec.md', BEHAVIOR + SCENARIOS);
  write(dir, 'brainstorming.md', PROTOCOL);
  write(dir, 'tech.md', TECH);
  routeCall(['gen', 'links', dir]);
  routeCall(['approve', 'spec', dir]);
  write(dir, 'brainstorming.md', PROTOCOL.replace('| 1 |', '| 7 |'));
  assert.equal(askOf(loadFeature(dir)).questions[0].options[0].id, 'flow:check');
  routeCall(['gate', 'slices', dir], 3);
});

test('блок 4: независимый черновик и возврат к grill не подменяют актуальный маршрут', () => {
  const dir = setup();
  write(dir, 'spec.md', SPEC + SCENARIOS);
  write(dir, 'tech.md', TECH);
  add(dir, 1, 'defer');
  let options = askOf(loadFeature(dir)).questions[0].options;
  assert.equal(options[0].id, 'questions:work:FR-2');
  assert.equal(options[0].recommended, true);
  routeCall(['gate', 'spec', dir, 'draft:FR-2']);
  routeCall(['questions', 'answer', dir, JSON.stringify({ key: 'route-answer', id: 'Q1', answer: 'Разрешено' })]);
  assert.match(routeCall(['questions', 'resume', dir, '{"id":"Q1"}']), /Исходный этап: grill/);
  options = askOf(loadFeature(dir)).questions[0].options;
  assert.equal(options[0].id, 'questions:resume:Q1');
  assert.ok(options.some((o) => o.id === 'questions:work:FR-2'));
  assert.ok(!options.some((o) => /sdd-grill|sdd-slices/.test(o.id)));
});

const CUT_PLAN = `# План проверки

## 001-validation — Проверка названия
Основание: FR-1
Зависимости: нет
Половины: только tasks-core
Результат: пустое название не сохраняется
Границы: проверка названия; изменение остальных полей вне этой части
Приёмка: пустое название отклонено, запись не создана
Почему отдельно: —
`;
function bundleWorkspace() {
  const dir = setup();
  write(dir, 'spec.md', BEHAVIOR + SCENARIOS);
  write(dir, 'brainstorming.md', PROTOCOL);
  write(dir, 'tech.md', TECH);
  routeCall(['gen', 'links', dir]);
  return dir;
}
const contents = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');
const optionsOf = (dir) => askOf(loadFeature(dir)).questions.flatMap((q) => q.options);
const choiceOfPlan = (dir) => optionsOf(dir).find((o) => o.id.startsWith('plan:yes:'));

test('блок 5: согласование требует сценарии и tech; ИИ-ревью не нужно, подтверждение комплекта одно', () => {
  const dir = bundleWorkspace();
  const spec = contents(dir, 'spec.md');
  for (const missing of ['scenarios', 'tech']) {
    if (missing === 'scenarios') write(dir, 'spec.md', BEHAVIOR + '\n## Пользовательские сценарии\n');
    else fs.unlinkSync(path.join(dir, 'tech.md'));
    routeCall(['approve', 'spec', dir], 3);
    assert.equal(loadFeature(dir).approvals.length, 0);
    write(dir, 'spec.md', spec);
    write(dir, 'tech.md', TECH);
  }
  const opts = optionsOf(dir);
  assert.equal(opts[0].id, 'approve:spec');
  assert.ok(opts[0].recommended);
  assert.equal(opts.filter((o) => o.id.startsWith('approve:')).length, 1);
  assert.match(routeCall(['ask', dir]), /Проверка ИИ — по желанию/);
  assert.equal(fs.existsSync(path.join(dir, '_work/review')), false);
  routeCall(['choose', dir, 'approve:spec']);
  assert.equal(loadFeature(dir).approvals.find((a) => a.kind === 'spec').state, 'ok');
  assert.equal(contents(dir, 'tech.md'), TECH);
  assert.equal(fs.existsSync(path.join(dir, 'scenarios.md')), false);
  routeCall(['gate', 'slices', dir]);
});

test('блок 5: автоматические ошибки и зависимый Q нельзя обойти прямыми approve/gen', () => {
  const dir = bundleWorkspace();
  routeCall(['approve', 'spec', dir]);
  write(dir, '_work/plan.md', CUT_PLAN);
  const oldChoice = choiceOfPlan(dir).id;
  write(dir, 'brainstorming.md', PROTOCOL.replace('| 1 |', '| 7 |'));
  routeCall(['approve', 'spec', dir], 1);
  routeCall(['gen', 'slices', dir, oldChoice], 1);
  assert.equal(fs.existsSync(path.join(dir, 'slices')), false);
  write(dir, 'brainstorming.md', PROTOCOL);
  add(dir, 1, 'defer');
  routeCall(['approve', 'spec', dir], 3);
  routeCall(['gate', 'slices', dir], 3);
  routeCall(['gen', 'slices', dir, oldChoice], 1);
  assert.equal(fs.existsSync(path.join(dir, 'slices')), false);
  assert.equal(contents(dir, '_work/plan.md'), CUT_PLAN);
});

test('блок 5: план обязателен после согласования; до подтверждения нет записи, старый выбор отклоняется', () => {
  const dir = bundleWorkspace();
  write(dir, '_work/plan.md', CUT_PLAN);
  routeCall(['gen', 'slices', dir], 1);
  assert.equal(choiceOfPlan(dir), undefined);
  routeCall(['approve', 'spec', dir]);
  routeCall(['plan', dir]);
  const choice = choiceOfPlan(dir);
  const preview = routeCall(['ask', dir]);
  assert.match(preview, /Границы: проверка названия/);
  assert.match(preview, /Приёмка: пустое название отклонено/);
  assert.ok(preview.indexOf('Границы:') < preview.indexOf(choice.id));
  assert.equal(fs.existsSync(path.join(dir, 'slices')), false);
  routeCall(['gen', 'slices', dir], 1);
  routeCall(['choose', dir, 'plan:yes'], 2);
  routeCall(['choose', dir, 'plan:edit']);
  write(dir, '_work/plan.md', CUT_PLAN.replace('запись не создана', 'запись не создана; можно исправить название'));
  routeCall(['choose', dir, choice.id], 2);
  routeCall(['gen', 'slices', dir, choice.id], 1);
  assert.equal(fs.existsSync(path.join(dir, 'slices')), false);
  assert.notEqual(choiceOfPlan(dir).id, choice.id);
});

test('блок 5: границы и краткая приёмка обязательны; ошибки плана не создают файлы', () => {
  const dir = bundleWorkspace();
  routeCall(['approve', 'spec', dir]);
  for (const key of ['Границы', 'Приёмка']) {
    write(dir, '_work/plan.md', CUT_PLAN.replace(new RegExp(`^${key}:.*$`, 'm'), `${key}: нет`));
    assert.match(routeCall(['plan', dir], 1), new RegExp(`PL-02.*${key}`));
    routeCall(['gen', 'slices', dir], 1);
    assert.equal(choiceOfPlan(dir), undefined);
    assert.equal(fs.existsSync(path.join(dir, 'slices')), false);
  }
});

test('блок 5: изменение комплекта и повторное согласование не оживляют старое подтверждение плана', () => {
  const dir = bundleWorkspace();
  routeCall(['approve', 'spec', dir]);
  write(dir, '_work/plan.md', CUT_PLAN);
  const before = choiceOfPlan(dir).id;
  write(dir, 'tech.md', TECH + '\nПри ошибке запись остаётся прежней.\n');
  assert.equal(loadFeature(dir).approvals.find((a) => a.kind === 'spec').state, 'changed');
  routeCall(['gen', 'slices', dir, before], 1);
  routeCall(['approve', 'spec', dir]);
  routeCall(['choose', dir, before], 2);
  assert.notEqual(choiceOfPlan(dir).id, before);
  assert.equal(fs.existsSync(path.join(dir, 'slices')), false);
});

// Содержание WHEN/THEN задаёт fixture вместо модели; проверяется сохранность принятого объёма.
function fillGenerated(dir) {
  const file = 'slices/001-validation.md';
  write(dir, file, contents(dir, file)
    .replace('- <сервис-владелец>: <контракт по смыслу> — <не меняется или МЕНЯЕТ КОНТРАКТ: что именно>',
      '- tasks-core: проверка названия — не меняется')
    .replace('AC-001-B? <имя>\n  WHEN <условие>\n  THEN <наблюдаемый исход>',
      'AC-001-B? Пустое название\n  WHEN передано пустое название\n  THEN запись не сохраняется')
    .replace('Проверяет: <FR-n>', 'Проверяет: FR-1'));
  write(dir, 'slices/README.md', contents(dir, 'slices/README.md')
    .replaceAll('<действие>', 'Передать пустое название').replaceAll('<ожидание>', 'Запись не сохраняется')
    .replaceAll('<что пересекается и как разрешили>', 'Нет пересечений'));
}

test('блок 5: подтверждённый план создаёт точные файлы с условиями; заполненные AC и связи проверяются', () => {
  const dir = bundleWorkspace();
  routeCall(['approve', 'spec', dir]);
  write(dir, '_work/plan.md', CUT_PLAN);
  const id = choiceOfPlan(dir).id;
  routeCall(['choose', dir, id]);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'slices')).sort(), ['001-validation.md', 'README.md']);
  const md = contents(dir, 'slices/001-validation.md');
  assert.match(md, /^# 001 — Проверка названия$/m);
  assert.match(md, /^Условия приёмки: пустое название отклонено, запись не создана$/m);
  assert.match(md, /^- Согласовано: проверка названия; изменение остальных полей вне этой части$/m);
  assert.match(md, /Основание:.*FR-1/);
  assert.match(md, /AC-001-B\?/);
  assert.equal(fs.existsSync(path.join(dir, '_work/plan.md')), false);
  fillGenerated(dir);
  routeCall(['done', dir]);
  const checked = JSON.parse(routeCall(['check', dir, '--json']));
  assert.equal(checked.findings.filter((f) => f.level === 'err').length, 0);
  const sl = loadFeature(dir).slices.get('001');
  assert.deepEqual(sl.acs.map((a) => a.id), ['AC-001-B1']);
  assert.deepEqual(sl.acs[0].refs, ['FR-1']);
  assert.match(sl.acs[0].text, /WHEN передано пустое название\n  THEN запись не сохраняется/);
  assert.match(contents(dir, 'slices/README.md'), /001-validation\.md/);
  routeCall(['choose', dir, id], 2);
  assert.equal(contents(dir, 'slices/001-validation.md'), sl.md);
});

test('блок 5: необязательный ADR после согласования не меняет комплект и не требует принятия', () => {
  const dir = bundleWorkspace();
  routeCall(['approve', 'spec', dir]);
  const spec = contents(dir, 'spec.md');
  write(dir, '../adr/0001-validation.md', '# ADR-0001 — Проверка\nФича: ' + path.basename(dir) + '/\nСтатус: предложено\n' +
    '## Контекст\nFR-1\n## Варианты\n### A. Существующий механизм\nВыбран: уже проверяет название\n' +
    '### B. Новая проверка\nОтложен: дублирует существующую\n## Решение\nСуществующая проверка\n' +
    '## Последствия\nПоведение прежнее\n## Не выяснено\nНет\n');
  assert.equal(contents(dir, 'spec.md'), spec);
  assert.equal(loadFeature(dir).approvals.find((a) => a.kind === 'spec').state, 'ok');
  assert.ok(!optionsOf(dir).some((o) => /adr/.test(o.id)));
  routeCall(['gate', 'slices', dir]);
  assert.match(routeCall(['gate', 'adr', dir]), /ADR необязателен/);
  write(dir, '_work/plan.md', CUT_PLAN);
  routeCall(['choose', dir, choiceOfPlan(dir).id]);
  const adrFile = '../adr/0001-validation.md';
  write(dir, adrFile, contents(dir, adrFile).replace('Статус:', 'Затрагивает slices: 001\nСтатус:')
    .replace('Поведение прежнее', 'slice 001 — поведение прежнее'));
  fillGenerated(dir);
  routeCall(['done', dir]);
  routeCall(['approve', 'slices', dir]);
  routeCall(['gate', 'build', dir]);
  assert.match(contents(dir, adrFile), /Статус: предложено/);
  assert.ok(!optionsOf(dir).some((o) => /adr/.test(o.id)));
});

test('блок 5: отдельные сценарии входят в единую отметку; ошибка связи блокирует согласование', () => {
  const dir = bundleWorkspace();
  write(dir, 'spec.md', BEHAVIOR + '\n[Пользовательские сценарии](scenarios.md)\n');
  reserveFlowId(dir, 'SC');
  const scenarios = '# Сценарии\n## SC-1 — Проверка названия\nТребования: FR-1\nПустое название не сохраняется.\n';
  write(dir, 'scenarios.md', scenarios.replace('FR-1', 'FR-999'));
  routeCall(['gen', 'links', dir]);
  routeCall(['approve', 'spec', dir], 3);
  write(dir, 'scenarios.md', scenarios);
  routeCall(['gen', 'links', dir]);
  routeCall(['approve', 'spec', dir]);
  const unchangedTech = contents(dir, 'tech.md');
  write(dir, 'scenarios.md', scenarios + '\nМожно исправить название и повторить.\n');
  assert.equal(loadFeature(dir).approvals.find((a) => a.kind === 'spec').state, 'changed');
  assert.equal(contents(dir, 'tech.md'), unchangedTech);
  routeCall(['gate', 'slices', dir], 3);
});
