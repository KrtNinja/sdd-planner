import { test, mock } from 'node:test';
import { applyQuestion } from '../skills/sdd-lint/scripts/sdd-lint/registry-actions.mjs';
import { decisionAction } from '../skills/sdd-lint/scripts/sdd-lint/decision-actions.mjs';
import { questionContext } from '../skills/sdd-lint/scripts/sdd-lint/registry-context.mjs';
import { questionDigest } from '../skills/sdd-lint/scripts/sdd-lint/registry-format.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { initTestFlow, reserveFlowId } from '../skills/sdd-lint/scripts/sdd-lint/flow-state.mjs';
import { loadFeature, runChecks } from '../skills/sdd-lint/scripts/sdd-lint/feature.mjs';
import { fingerprint, approvalMds } from '../skills/sdd-lint/scripts/sdd-lint/approval.mjs';
import { scenarioSection } from '../skills/sdd-lint/scripts/sdd-lint/scenario-section.mjs';
import { planScenarioMove } from '../skills/sdd-lint/scripts/sdd-lint/scenario-plan.mjs';
import { publishScenarioMove, recoverScenarioMove, scenarioJournal } from '../skills/sdd-lint/scripts/sdd-lint/scenario-store.mjs';
import { visibleLength } from '../skills/sdd-lint/scripts/sdd-lint/read-size.mjs';
import { saveSnapshot, snapPath, protectedParts, diffParts } from '../skills/sdd-lint/scripts/sdd-lint/snapshot.mjs';
import { run } from '../skills/sdd-lint/scripts/sdd-lint/run.mjs';
import { tmpDir } from './helpers.mjs';

const section = '## Пользовательские сценарии\n\n### SC-1 — Скачать отчёт\nРоль: аналитик. Цель: получить отчёт.\n' +
  'Начало: отчёт выбран.\n\n#### SC-1-S1 — Запросить файл\nАнна запускает экспорт; видит «Готовим файл».\n' +
  'Результат: ссылка на файл. При сбое — «Повторить»; повтор запускает новый запрос.\n';
function setup(size = 10001, extra = '') {
  const dir = path.join(tmpDir(), 'docs', 'export');
  fs.mkdirSync(dir, { recursive: true });
  initTestFlow(dir);
  reserveFlowId(dir, 'SC'); reserveFlowId(dir, 'STEP', 'SC-1');
  let spec = '# Отчёт\nСтатус: черновик\n\n## Требования\n```\nFR-1  Анна получает файл.\nПример: Анна скачала отчёт.\n```\n\n' + section + extra;
  spec += 'я'.repeat(Math.max(0, size - visibleLength(spec)));
  fs.writeFileSync(path.join(dir, 'spec.md'), spec);
  return dir;
}
const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');
const write = (dir, file, text) => fs.writeFileSync(path.join(dir, file), text);
function cmd(dir, verb, ...args) {
  const r = run(['scenarios', verb, dir, ...args]);
  return { code: r.code, text: r.chunks.map((c) => c[1]).join('') };
}

test('S-06/S-08: точные границы видимых символов с кириллицей, Markdown и ссылками', () => {
  for (const n of [9999, 10000, 10001]) {
    const dir = setup(n, '\n**Текст** [ссылка](https://example.org) <!-- не считается -->\n');
    assert.equal(visibleLength(read(dir, 'spec.md')), n);
    const result = cmd(dir, 'move');
    assert.equal(result.code, 0, result.text);
    assert.equal(fs.existsSync(path.join(dir, 'scenarios.md')), n > 10000);
    assert.match(cmd(dir, 'status').text, /spec:/);
  }
});

test('S-07: текст и ID сохранены; повтор и уменьшение не возвращают раздел', () => {
  const dir = setup();
  const before = read(dir, 'spec.md');
  const state = read(dir, '.sdd-flow.json');
  const expected = scenarioSection(before).text;
  assert.equal(cmd(dir, 'move').code, 0);
  assert.equal(read(dir, 'scenarios.md'), expected);
  assert.equal(read(dir, '.sdd-flow.json'), state);
  assert.equal(loadFeature(dir).flow.graph.byId.get('SC-1-S1').file, path.join(dir, 'scenarios.md'));
  assert.match(cmd(dir, 'move').text, /уже вынесены/);
  assert.equal(read(dir, 'scenarios.md'), expected);
  assert.match(cmd(dir, 'find', 'Скачать').text, /scenarios.md:3/);
  write(dir, 'scenarios.md', section);
  assert.match(cmd(dir, 'move').text, /уже вынесены/);
});

test('S-10: перенос действительного одобрения и снимка; последующая правка снимает одобрение', () => {
  const dir = setup();
  let m = loadFeature(dir);
  write(dir, 'spec.md', read(dir, 'spec.md').replace('черновик', `одобрено 04.11.2026 · ${fingerprint(approvalMds(m, 'spec', m.specFile))}`));
  saveSnapshot(m.specFile);
  assert.equal(cmd(dir, 'move').code, 0);
  m = loadFeature(dir);
  assert.equal(m.approvals[0].state, 'ok');
  assert.deepEqual(diffParts(JSON.parse(fs.readFileSync(snapPath(m.specFile))).parts, protectedParts(m.spec.md)), []);
  write(dir, 'scenarios.md', read(dir, 'scenarios.md').replace('новый запрос', 'два запроса'));
  assert.equal(loadFeature(dir).approvals[0].state, 'changed');
});

test('S-07: конфликт файла и дубликат SC не перезаписываются', () => {
  const dir = setup();
  write(dir, 'scenarios.md', 'Чужой текст');
  assert.match(cmd(dir, 'move').text, /уже существует/);
  assert.equal(read(dir, 'scenarios.md'), 'Чужой текст');
  write(dir, 'scenarios.md', section);
  assert.match(cmd(dir, 'move').text, /Дубликат ID SC-1/);
  assert.match(cmd(dir, 'find', 'SC-1').text, /Дубликат ID SC-1/);
  const trace = run(['trace', dir, 'SC-1']);
  assert.notEqual(trace.code, 0);
  assert.match(trace.chunks.map((c) => c[1]).join(''), /Дубликат ID SC-1/);
  assert.ok(runChecks(loadFeature(dir)).some((f) => f.rule === 'FL-01'));
});

test('S-08: отсутствие раздела, остаточный spec и большой scenarios явно показаны', () => {
  const dir = setup();
  write(dir, 'spec.md', '# Большой\n' + 'я'.repeat(10001));
  assert.match(cmd(dir, 'move').text, /переносить нечего/);
  const other = setup(21000, '\n## Остальные требования\n' + 'ю'.repeat(11000));
  assert.match(cmd(other, 'move').text, /spec всё ещё превышает/);
  const big = setup(12000);
  assert.match(cmd(big, 'move').text, /scenarios превышает/);
});

test('прерванный перенос виден; повтор recovery сохраняет единственную копию', () => {
  const dir = setup();
  const plan = planScenarioMove(loadFeature(dir));
  assert.throws(() => publishScenarioMove(dir, plan, () => { throw new Error('авария'); }), /авария/);
  assert.ok(fs.existsSync(scenarioJournal(dir)));
  assert.match(cmd(dir, 'move').text, /не завершён/);
  assert.equal(cmd(dir, 'recover').code, 0);
  assert.equal(cmd(dir, 'recover').code, 0);
  assert.equal(fs.existsSync(scenarioJournal(dir)), false);
});

test('recovery: конфликт внешней правки не скрывается и не перезаписывается', () => {
  const dir = setup();
  const plan = planScenarioMove(loadFeature(dir));
  assert.throws(() => publishScenarioMove(dir, plan, () => { throw new Error('stop'); }));
  write(dir, 'spec.md', 'Внешняя правка');
  assert.match(cmd(dir, 'recover').text, /Конфликт переноса/);
  assert.equal(read(dir, 'spec.md'), 'Внешняя правка');
  write(dir, 'spec.md', plan.changes.find((c) => c.file.endsWith('/spec.md')).after);
  assert.equal(cmd(dir, 'recover').code, 0);
});

test('legacy не получает обязанности; ошибки раздела и команды диагностируются', () => {
  const dir = setup(10);
  assert.match(cmd(dir, 'find', 'нет').text, /не найдены/);
  assert.equal(cmd(dir, 'unknown').code, 2);
  assert.throws(() => scenarioSection(section + section), /повторён/);
  fs.unlinkSync(path.join(dir, '.sdd-flow.json'));
  assert.match(cmd(dir, 'move').text, /legacy не меняется/);
  assert.equal(fs.existsSync(path.join(dir, 'scenarios.md')), false);
});

test('ссылки на строки, заголовки и локальные фрагменты переезжают вместе со сценарием', () => {
  const dir = setup();
  let spec = read(dir, 'spec.md');
  const n = spec.split('\n').findIndex((l) => l.includes('#### SC-1-S1')) + 1;
  spec = spec.replace('Начало:', `См. [FR](#L6), [шаг](#L${n}), [заголовок](#sc-1-s1--запросить-файл).\nНачало:`);
  write(dir, 'spec.md', spec);
  // Повторно вычисляем строку после вставки.
  const stepLine = spec.split('\n').findIndex((l) => l.includes('#### SC-1-S1')) + 1;
  write(dir, 'tech.md', `## TECH — Отчёт\nСвязи: SC-1, FR-1\n[шаг](spec.md#L${stepLine})\n`);
  const r = cmd(dir, 'move');
  assert.equal(r.code, 0, r.text);
  assert.match(read(dir, 'tech.md'), /\(scenarios.md#L/);
  assert.match(read(dir, 'scenarios.md'), /\[FR\]\(spec.md#L6\)/);
  assert.match(read(dir, 'scenarios.md'), /\[заголовок\]\(#sc-1-s1--запросить-файл\)/);
  assert.match(cmd(dir, 'find', 'SC-1-S1').text, /scenarios.md/);
  const trace = run(['trace', dir, 'SC-1']);
  assert.match(trace.chunks.map((c) => c[1]).join(''), /TECH:/);
});

test('отложенный Q продолжает блокировать approve после переноса', async () => {
  const dir = setup();
  applyQuestion(dir, 'add', { key: 'question', title: 'Повтор?', stage: 'scenarios', topic: 'экспорт',
    context: 'После сбоя', resume: 'Уточнить повтор', impact: 'known', refs: ['SC-1-S1'] });
  applyQuestion(dir, 'defer', { key: 'later', id: 'Q1' });
  const before = read(dir, 'questions.md');
  assert.equal(cmd(dir, 'move').code, 0);
  assert.equal(read(dir, 'questions.md'), before);
  const approval = run(['approve', 'spec', dir]);
  assert.equal(approval.code, 3);
  assert.match(approval.chunks.map((c) => c[1]).join(''), /Q1/);
});

test('пакет Q: отказ переноса до revise; старый context после переноса не принимается', async () => {
  const dir = setup();
  const { proposal, packageHash } = preparedAnswer(dir);
  const saved = read(dir, 'questions.md');
  assert.match(cmd(dir, 'move').text, /сначала завершите apply/);
  assert.equal(read(dir, 'questions.md'), saved);
  decisionAction(dir, 'revise', { key: 'r', id: 'Q1', packageHash });
  assert.equal(cmd(dir, 'move').code, 0);
  assert.throws(() => decisionAction(dir, 'prepare', { ...proposal, key: 'new' }), /Контекст SC-1-S1 изменился/);
});

test('неполный перенос после первого файла восстанавливается без потери текста', async () => {
  const dir = setup();
  const original = fs.renameSync;
  const stub = mock.method(fs, 'renameSync', (from, to) => {
    if (to === path.join(dir, 'spec.md')) throw new Error('прерывание');
    return original(from, to);
  });
  try { assert.match(cmd(dir, 'move').text, /прерывание/); } finally { stub.mock.restore(); }
  assert.ok(read(dir, 'spec.md').includes('### SC-1'));
  assert.ok(read(dir, 'scenarios.md').includes('### SC-1'));
  const pending = loadFeature(dir).flow.problems.find((p) => p.message.startsWith('Перенос сценариев не завершён'));
  assert.equal(pending.file, path.join(dir, 'spec.md'));
  assert.equal(pending.n, 1);
  assert.equal(run(['fix', dir]).code, 1);
  assert.equal(cmd(dir, 'recover').code, 0);
  assert.equal(read(dir, 'spec.md').includes('### SC-1'), false);
  assert.equal(loadFeature(dir).flow.records.filter((r) => r.id === 'SC-1').length, 1);
});

test('предложение переноса первое при превышении; legacy и точный лимит сохраняют маршрут', async () => {
  const { scenarioMoveQuestion } = await import('../skills/sdd-lint/scripts/sdd-lint/scenario-view.mjs');
  const { askOf } = await import('../skills/sdd-lint/scripts/sdd-lint/ask.mjs');
  const dir = setup();
  assert.equal(askOf(loadFeature(dir)).questions[0].options[0].id, 'scenarios:move');
  assert.equal(scenarioMoveQuestion(loadFeature(setup(10000))), null);
  assert.equal(cmd(dir, 'move').code, 0);
  assert.equal(scenarioMoveQuestion(loadFeature(dir)), null);
  fs.unlinkSync(path.join(dir, '.sdd-flow.json'));
  assert.equal(scenarioMoveQuestion(loadFeature(dir)), null);
});

test('контракт и диапазоны строк обновляются; ссылка через границу требует явного исправления', () => {
  const dir = setup();
  const part = scenarioSection(read(dir, 'spec.md'));
  write(dir, 'api.md', `[путь](spec.md#L${part.start + 1}-L${part.start + 3})\n[route]: spec.md#L${part.start + 2}\n`);
  assert.equal(cmd(dir, 'move').code, 0);
  assert.match(read(dir, 'api.md'), /scenarios.md#L1-L3/);
  assert.match(read(dir, 'api.md'), /\[route\]: scenarios.md#L2/);
  const crossing = setup();
  write(crossing, 'api.md', '[граница](spec.md#L1-L20)');
  assert.match(cmd(crossing, 'move').text, /пересекает границу/);
  assert.equal(fs.existsSync(path.join(crossing, 'scenarios.md')), false);
});

function preparedAnswer(dir, extra = []) {
  applyQuestion(dir, 'add', { key: 'q', title: 'Повтор?', stage: 'scenarios', topic: 'отчёт',
    context: 'Ошибка', resume: 'Повтор', impact: 'known', refs: ['SC-1-S1'] });
  applyQuestion(dir, 'answer', { key: 'a', id: 'Q1', answer: 'Да' });
  const before = read(dir, 'spec.md');
  const proposal = { key: 'p', id: 'Q1', summary: 'Повтор', assessment: 'Ответ полон', tradeoffs: 'Нет', remaining: 'Нет',
    ready: true, conflicts: [], obligations: 'unchanged', context: questionContext(loadFeature(dir), ['SC-1-S1']),
    changes: [{ file: 'spec.md', before, after: before.replace('новый запрос', 'повторный запрос') }] };
  proposal.changes.push(...extra);
  decisionAction(dir, 'prepare', proposal);
  const q = loadFeature(dir).flow.records.find((r) => r.id === 'Q1');
  const packageHash = questionDigest(q.fields.Пакет);
  return { proposal, packageHash };
}

test('частичный пакет нельзя спрятать переносом; после apply перенос доступен', () => {
  const dir = setup();
  const extra = [{ file: 'tech.md', before: null, after: '## TECH — Отчёт\nСвязи: FR-1\nСуществующий экспорт.\n' }];
  const { packageHash } = preparedAnswer(dir, extra);
  decisionAction(dir, 'accept', { key: 'accept', id: 'Q1', packageHash, origin: 'analyst', decision: 'Да' });
  const original = fs.renameSync;
  const stub = mock.method(fs, 'renameSync', (from, to) => {
    if (String(to).endsWith('/tech.md')) throw new Error('остановка записи');
    return original(from, to);
  });
  try {
    assert.throws(() => decisionAction(dir, 'apply', { key: 'apply', id: 'Q1', packageHash }), /остановка записи/);
  } finally { stub.mock.restore(); }
  assert.match(cmd(dir, 'move').text, /частично проведённый пакет нельзя/);
  assert.equal(fs.existsSync(path.join(dir, 'scenarios.md')), false);
  decisionAction(dir, 'apply', { key: 'apply', id: 'Q1', packageHash });
  assert.equal(cmd(dir, 'move').code, 0);
  assert.equal(loadFeature(dir).flow.records.find((r) => r.id === 'Q1').fields.Статус, 'resolved');
});

test('определение ссылки вне раздела не теряется при переносе', () => {
  const dir = setup();
  write(dir, 'spec.md', read(dir, 'spec.md').replace('Роль:', 'Документ [правило][req].\nРоль:') + '\n## Источники\n[req]: #L6\n');
  assert.equal(cmd(dir, 'move').code, 0);
  assert.match(read(dir, 'scenarios.md'), /\[правило\]\(spec.md#L6\)/);
});

test('определение внутри сценариев сохраняет ссылки оставшегося spec', () => {
  const dir = setup();
  const before = read(dir, 'spec.md').replace('## Требования', '[Основной путь][route]\n\n## Требования') +
    '\n[route]: #sc-1--скачать-отчёт\n';
  write(dir, 'spec.md', before);
  assert.equal(cmd(dir, 'move').code, 0);
  assert.match(read(dir, 'spec.md'), /\[Основной путь\]\(scenarios.md#sc-1--скачать-отчёт\)/);
  assert.equal(read(dir, 'scenarios.md'), scenarioSection(before).text);
});

test('названия ссылок сохраняются вместе с новыми адресами', () => {
  const dir = setup();
  write(dir, 'spec.md', read(dir, 'spec.md').replace('Роль:', '[Правило][req]\nРоль:') +
    '\n## Источники\n[req]: #L6 "Правило экспорта"\n');
  write(dir, 'api.md', '[Путь](spec.md#sc-1--скачать-отчёт "Основной путь")');
  assert.equal(cmd(dir, 'move').code, 0);
  assert.match(read(dir, 'scenarios.md'), /\[Правило\]\(spec.md#L6 "Правило экспорта"\)/);
  assert.equal(read(dir, 'api.md'), '[Путь](scenarios.md#sc-1--скачать-отчёт "Основной путь")');
});

test('approve и правила review охватывают оба места хранения', async () => {
  const { inDir } = await import('./helpers.mjs');
  const dir = setup();
  assert.equal(run(['approve', 'spec', dir]).code, 0);
  assert.equal(cmd(dir, 'move').code, 0);
  assert.equal(run(['approve', 'spec', dir]).code, 0);
  const result = inDir(path.dirname(path.dirname(dir)), {}, () => run(['prompt', 'sdd-review', 'export', 'spec']));
  assert.match(result.chunks.map((c) => c[1]).join(''), /spec.md И существующий scenarios.md/);
});

test('до записи проверяются структура раздела, снимок guard и символические ссылки', () => {
  const dir = setup();
  const spec = path.join(dir, 'spec.md');
  saveSnapshot(spec);
  write(dir, 'spec.md', read(dir, 'spec.md').replace('### SC-1 — Скачать отчёт', '### SC-1 — Забрать отчёт'));
  assert.match(cmd(dir, 'move').text, /Снимок.*расходится/);
  assert.equal(fs.existsSync(path.join(dir, 'scenarios.md')), false);
  const linked = setup();
  fs.symlinkSync(path.join(dir, 'spec.md'), path.join(linked, 'copy.md'));
  assert.match(cmd(linked, 'move').text, /Символическая ссылка/);
  const missing = setup();
  fs.unlinkSync(path.join(missing, 'spec.md'));
  assert.throws(() => planScenarioMove(loadFeature(missing)), /Нет spec/);
  const outside = setup();
  reserveFlowId(outside, 'SC');
  write(outside, 'spec.md', '## SC-2 — Отдельный\n' + read(outside, 'spec.md'));
  assert.match(cmd(outside, 'move').text, /внутри раздела/);
});

test('повреждённый журнал и неопределённые ссылки не приводят к потере документов', async () => {
  const { inlineScenarioReferences, relocateScenarioLinks } = await import('../skills/sdd-lint/scripts/sdd-lint/scenario-links.mjs');
  assert.throws(() => inlineScenarioReferences('[неизвестно][x]', ''), /Нет определения/);
  assert.equal(inlineScenarioReferences('[a][]', '[a]: https://example.org'), '[a](https://example.org)');
  const dir = setup();
  const before = read(dir, 'spec.md');
  write(dir, '.sdd-scenarios.pending', '{"body":"{}","hash":"wrong"}');
  assert.match(cmd(dir, 'recover').text, /Повреждён журнал/);
  assert.equal(read(dir, 'spec.md'), before);
  const move = { spec: '/d/spec.md', target: '/d/scenarios.md', start: 5, stop: 10, replacement: 4, anchors: new Set(['sc']) };
  const text = '[вне](https://example.org#x) [без](file.md) [иной](other.md#L8) [после](spec.md#L11)';
  assert.equal(relocateScenarioLinks(text, '/d/x.md', '/d/x.md', move), text.replace('#L11', '#L10'));
});

test('сокращённая ссылка сохраняется; обязательства FR не уезжают из spec', async () => {
  const { inlineScenarioReferences } = await import('../skills/sdd-lint/scripts/sdd-lint/scenario-links.mjs');
  assert.equal(inlineScenarioReferences('[Документ] и [Q1]', '[документ]: api.md'), '[Документ](api.md) и [Q1]');
  const dir = setup();
  write(dir, 'spec.md', read(dir, 'spec.md') + '\n```\nFR-2  Правило.\nПример: Анна.\n```\n');
  assert.match(cmd(dir, 'move').text, /содержит блок FR\/NFR/);
  assert.equal(fs.existsSync(path.join(dir, 'scenarios.md')), false);
});

test('recovery отвергает повреждённые пути и структуру плана до любой записи', () => {
  const dir = setup();
  const original = read(dir, 'spec.md');
  const valid = planScenarioMove(loadFeature(dir));
  const damaged = [
    [{ ...valid.changes[0], file: 'relative.md' }, /Путь переноса/],
    [{ ...valid.changes[0], file: '/outside/spec.md' }, /Путь переноса/],
    [{ ...valid.changes[0], file: path.join(dir, 'secret.txt') }, /Путь переноса/],
    [{ ...valid.changes[0], after: null }, /Нет текста/],
  ];
  for (const [change, expected] of damaged) {
    const body = JSON.stringify({ changes: [change], snapshots: [] });
    write(dir, '.sdd-scenarios.pending', JSON.stringify({ body, hash: questionDigest(body) }));
    assert.match(cmd(dir, 'recover').text, expected);
    assert.equal(read(dir, 'spec.md'), original);
  }
  for (const plan of [{ changes: [], snapshots: [] }, { changes: valid.changes, snapshots: [{ file: '/tmp/alien' }] }]) {
    const body = JSON.stringify(plan);
    write(dir, '.sdd-scenarios.pending', JSON.stringify({ body, hash: questionDigest(body) }));
    assert.equal(cmd(dir, 'recover').code, 2);
    assert.equal(read(dir, 'spec.md'), original);
  }
});

test('перенос не легализует ручное или устаревшее одобрение', () => {
  for (const status of ['одобрено 04.11.2026', 'одобрено 04.11.2026 · 123456']) {
    const dir = setup();
    write(dir, 'spec.md', read(dir, 'spec.md').replace('черновик', status));
    assert.match(cmd(dir, 'move').text, /AP-0[12]/);
    assert.equal(fs.existsSync(path.join(dir, 'scenarios.md')), false);
  }
});

test('отсутствие маркера процесса сохраняет legacy даже при одноимённом служебном файле', async () => {
  const { requireIdleMove } = await import('../skills/sdd-lint/scripts/sdd-lint/scenario-store.mjs');
  const dir = setup();
  write(dir, '.sdd-scenarios.pending', 'старый произвольный файл');
  assert.throws(() => requireIdleMove(dir), /scenarios recover/);
  fs.unlinkSync(path.join(dir, '.sdd-flow.json'));
  assert.doesNotThrow(() => requireIdleMove(dir));
});

test('совместимый формат блока 01: SC уровня 2 переносится без изменения заголовков', () => {
  const dir = setup();
  let text = read(dir, 'spec.md').replace('## Пользовательские сценарии\n\n', '');
  text = text.replace('### SC-1 —', '## SC-1 —').replace('#### SC-1-S1', '### SC-1-S1');
  write(dir, 'spec.md', text + 'я'.repeat(100));
  assert.equal(cmd(dir, 'move').code, 0);
  assert.match(read(dir, 'scenarios.md'), /^## SC-1 —/);
  assert.match(read(dir, 'scenarios.md'), /\n### SC-1-S1/);
  const compact = section.replace('Пользовательские сценарии', 'Сценарии');
  assert.equal(scenarioSection(compact).text, compact);
  assert.equal(scenarioSection('## SC-1 — Один\n## SC-2 — Второй\n## Далее\n').text,
    '## SC-1 — Один\n## SC-2 — Второй\n');
});

test('границы раздела сохраняют заголовок документа и следующий раздел дословно', () => {
  const text = '# Заголовок\n\n## Пользовательские сценарии\n### SC-1 — Путь\nДействие.\n\n## Следующий раздел\nОстальной текст';
  assert.deepEqual(scenarioSection(text), {
    start: 2, stop: 6, text: '## Пользовательские сценарии\n### SC-1 — Путь\nДействие.\n\n',
    before: '# Заголовок\n', after: '## Следующий раздел\nОстальной текст',
  });
  assert.equal(scenarioSection('```\n## Пользовательские сценарии\n```\n'), null);
});
