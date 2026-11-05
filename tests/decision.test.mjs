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
  assert.throws(() => act(dir, 'prepare', proposal(dir)), /Не найден \.sdd-flow\.json/);
  assert.equal(read(dir, 'spec.md'), SPEC);
});

test('recovery не публикует закрытый Q поверх изменённых после проверки документов', async () => {
  const { recoverRegistry } = await import('../skills/sdd-lint/scripts/sdd-lint/registry-store.mjs');
  const dir = setup();
  act(dir, 'prepare', proposal(dir));
  accept(dir);
  const base = read(dir, 'questions.md');
  act(dir, 'apply', { packageHash: hash(dir) });
  const candidate = read(dir, 'questions.md');
  const after = read(dir, 'spec.md');
  fs.writeFileSync(path.join(dir, 'questions.md'), base);
  fs.writeFileSync(path.join(dir, 'spec.md'), SPEC);
  fs.writeFileSync(path.join(dir, 'questions.md.pending'), JSON.stringify({ base: questionDigest(base), md: candidate, hash: questionDigest(candidate) }));
  assert.throws(() => recoverRegistry(dir), /требует восстановления документа/);
  assert.equal(question(dir).fields.Статус, 'answered');
  fs.writeFileSync(path.join(dir, 'spec.md'), after);
  recoverRegistry(dir);
  assert.equal(question(dir).fields.Статус, 'resolved');
});

test('R-09: один пакет через ask/choose; после согласия только механическое проведение', async () => {
  const { run } = await import('../skills/sdd-lint/scripts/sdd-lint/run.mjs');
  const { askOf } = await import('../skills/sdd-lint/scripts/sdd-lint/ask.mjs');
  const dir = setup();
  act(dir, 'prepare', proposal(dir));
  const screen = askOf(loadFeature(dir)).questions[0];
  assert.match(screen.preview, /Что меняется и почему/);
  assert.equal(screen.options[0].label, 'Согласовать пакет');
  const choice = run(['choose', dir, screen.options[0].id]);
  assert.equal(choice.code, 0);
  const output = choice.chunks.map((c) => c[1]).join('');
  assert.match(output, /"questions","apply"/);
  assert.equal(question(dir).fields.Статус, 'answered');
  const next = askOf(loadFeature(dir)).questions[0].options[0];
  assert.equal(next.label, 'Завершить проведение');
  assert.equal(run(['choose', dir, next.id]).code, 0);
  assert.equal(question(dir).fields.Статус, 'resolved');
  assert.equal(run(['choose', dir, screen.options[0].id]).code, 2);
});

test('R-04/R-09: уже согласованное решение не требует нового служебного подтверждения', async () => {
  const { run } = await import('../skills/sdd-lint/scripts/sdd-lint/run.mjs');
  const dir = setup();
  const input = proposal(dir, { key: 'agreed', id: 'Q1', origin: 'analyst', agreement: 'Уже согласовано, внеси этот пакет' });
  const result = run(['questions', 'prepare', dir, JSON.stringify(input)]);
  assert.equal(result.code, 0);
  assert.match(result.chunks.map((c) => c[1]).join(''), /"questions","apply"/);
  assert.equal(JSON.parse(question(dir).fields.Согласование).decision, input.agreement);
  act(dir, 'apply', { packageHash: hash(dir) });
  assert.equal(question(dir).fields.Статус, 'resolved');
});

test('неизвестная область запрещает пакет, но сохраняет ответ до уточнения scope', () => {
  const dir = setup();
  applyQuestion(dir, 'scope', { key: 'unknown', id: 'Q1', impact: 'unknown', refs: [] });
  const saved = read(dir, 'questions.md');
  assert.throws(() => act(dir, 'prepare', proposal(dir, { context: [] })), /уточните область влияния/);
  assert.equal(read(dir, 'questions.md'), saved);
  assert.equal(read(dir, 'spec.md'), SPEC);
  assert.throws(() => draftWork(loadFeature(dir), ['FR-2']), /Q1/);
  applyQuestion(dir, 'scope', { key: 'known', id: 'Q1', impact: 'known', refs: ['FR-1'] });
  assert.equal(question(dir).fields.Ответ, 'разрешаем');
  assert.match(draftWork(loadFeature(dir), ['FR-2']), /Можно продолжить/);
  assert.throws(() => draftWork(loadFeature(dir), ['FR-1']), /Q1/);
  act(dir, 'prepare', proposal(dir));
  assert.ok(question(dir).fields.Пакет);
});

test('resume передаёт исполнимый вход и различает согласование, проведение и доработку', async () => {
  const { resumeQuestion } = await import('../skills/sdd-lint/scripts/sdd-lint/registry-resume.mjs');
  const dir = setup();
  const resume = () => resumeQuestion(loadFeature(dir), { id: 'Q1' });
  const template = () => JSON.parse(resume().match(/^Вход questions prepare .*?: (.*)$/m)[1]);
  const input = template();
  assert.equal(input.id, 'Q1');
  assert.equal(input.ready, false);
  assert.deepEqual(input.context, proposal(dir).context);
  decisionAction(dir, 'prepare', { ...input, ...proposal(dir) });
  const choices = () => JSON.parse(resume().match(/^Продолжение сохранённого пакета: (.*)$/m)[1]);
  assert.equal(choices().options[0].label, 'Согласовать пакет');
  assert.doesNotMatch(resume(), /продолжи apply/);
  accept(dir);
  assert.equal(choices().options[0].label, 'Завершить проведение');
  act(dir, 'revise', { packageHash: hash(dir) });
  assert.notEqual(template().key, input.key);
  decisionAction(dir, 'prepare', { ...template(), ...proposal(dir) });
  assert.equal(question(dir).fields.Согласование, undefined);
});

test('пакет FR пересматривает SC/TECH/ADR/AC по связям, независимые документы не меняет', async () => {
  const { reserveFlowId } = await import('../skills/sdd-lint/scripts/sdd-lint/flow-state.mjs');
  const { slice, ac } = await import('./helpers.mjs');
  const { run } = await import('../skills/sdd-lint/scripts/sdd-lint/run.mjs');
  const dir = path.join(tmpDir(), 'docs', 'export');
  fs.mkdirSync(dir, { recursive: true });
  initTestFlow(dir); reserveFlowId(dir, 'SC');
  const spec = '# Требования\nСтатус: черновик\n' +
    ['FR-1', 'FR-2'].map((id) => `\n\`\`\`\n${id}  Текст.\nПример: Анна.\n\`\`\`\n`).join('') + '\n## Пользовательские сценарии\n### SC-1 — Экспорт\nТребования: FR-1\nАнна видит файл.\n';
  fs.writeFileSync(path.join(dir, 'spec.md'), spec);
  fs.writeFileSync(path.join(dir, 'tech.md'), '# Решение\nСтатус: одобрено\n## TECH — Экспорт\nСвязи: SC-1\nСуществующий сервис.\n');
  fs.mkdirSync(path.join(dir, 'slices'));
  fs.writeFileSync(path.join(dir, 'slices/001-export.md'), slice('001', { why: 'Р1 ADR-0001' }, '## Общая приёмка', ...ac('AC-001-1')));
  fs.writeFileSync(path.join(dir, 'slices/002-other.md'),
    slice('002', { basis: 'FR-2', why: 'Р1 ADR-0002' }, '## Общая приёмка', ...ac('AC-002-1', 'FR-2')));
  fs.mkdirSync(path.join(dir, '../adr'));
  const adr = (n, basis) => `# ADR-${n} — Решение\nФича: export/\nСтатус: предложено\nЗатрагивает slices: ${n.slice(1)}\n` +
    `## Контекст\n${basis}\n## Варианты\n### A. Использовать сервис\nВыбран: уже работает\n` +
    `### B. Новый сервис\nОтложен: дороже\n## Решение\nСуществующий сервис\n## Последствия\nslice ${n.slice(1)} сохраняет ограничения\n## Не выяснено\nНет\n`;
  fs.writeFileSync(path.join(dir, '../adr/0001-export.md'), adr('0001', 'SC-1'));
  const unrelated = adr('0002', 'FR-2');
  fs.writeFileSync(path.join(dir, '../adr/0002-other.md'), unrelated);
  assert.equal(run(['gen', 'links', dir]).code, 0);
  const independentSlice = read(dir, 'slices/002-other.md');
  applyQuestion(dir, 'add', { key: 'q', title: 'Повтор?', stage: 'grill', topic: 'экспорт',
    context: 'Повтор после сбоя', resume: 'Повтор', impact: 'known', refs: ['FR-1'] });
  applyQuestion(dir, 'answer', { key: 'a', id: 'Q1', answer: 'Повтор разрешён', origin: 'analyst' });
  act(dir, 'prepare', proposal(dir, { changes: [{ file: 'spec.md', before: spec,
    after: spec.replace('FR-1  Текст.', 'FR-1  Повтор разрешён.').replace('Анна видит файл.', 'Анна повторяет запрос и видит файл.') }] }));
  const files = JSON.parse(question(dir).fields.Пакет).changes.map((c) => c.file);
  for (const file of ['spec.md', 'tech.md', '../adr/0001-export.md', 'slices/001-export.md']) assert.ok(files.includes(file), file);
  assert.ok(!files.includes('../adr/0002-other.md'));
  accept(dir);
  act(dir, 'apply', { packageHash: hash(dir) });
  assert.equal(question(dir).fields.Статус, 'resolved');
  assert.match(read(dir, 'spec.md'), /Анна повторяет запрос/);
  assert.match(read(dir, 'tech.md'), /Статус: на ревью/);
  assert.match(read(dir, '../adr/0001-export.md'), /Статус: на ревью/);
  assert.match(read(dir, 'slices/001-export.md'), /AC-001-1/);
  assert.equal(read(dir, '../adr/0002-other.md'), unrelated);
  assert.equal(read(dir, 'slices/002-other.md'), independentSlice);
});
