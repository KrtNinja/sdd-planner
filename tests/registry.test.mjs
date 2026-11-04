import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpDir, SPEC, feature, slice, ac, inDir } from './helpers.mjs';
import { initTestFlow, reserveFlowId } from '../skills/sdd-lint/scripts/sdd-lint/flow-state.mjs';
import { loadFeature, runChecks } from '../skills/sdd-lint/scripts/sdd-lint/feature.mjs';
import { applyQuestion } from '../skills/sdd-lint/scripts/sdd-lint/registry-actions.mjs';
import { registrySummary, draftWork, fileQuestionBlockers } from '../skills/sdd-lint/scripts/sdd-lint/registry-view.mjs';
import { questionDigest, registryRecords, questionActions } from '../skills/sdd-lint/scripts/sdd-lint/registry-format.mjs';
import { recoverRegistry } from '../skills/sdd-lint/scripts/sdd-lint/registry-store.mjs';
import { openQuestions } from '../skills/sdd-lint/scripts/sdd-lint/open-questions.mjs';
import { run } from '../skills/sdd-lint/scripts/sdd-lint/run.mjs';

function setup() {
  const dir = path.join(tmpDir(), 'docs', 'registry');
  fs.mkdirSync(dir, { recursive: true });
  initTestFlow(dir);
  fs.writeFileSync(path.join(dir, 'spec.md'), SPEC);
  fs.writeFileSync(path.join(dir, 'brainstorming.md'), '# Обсуждение\nСтатус: идёт\n');
  return dir;
}
const input = (key = 'round-1') => ({ key, title: 'Повторять отправку?', stage: 'grill', topic: 'отправка',
  context: 'Анна отправляет дважды', resume: 'Проверить повтор после таймаута', impact: 'known', refs: ['FR-1'],
  followup: 'Если да — выяснить лимит; если нет — выяснить обратную связь' });
const state = (dir) => JSON.parse(fs.readFileSync(path.join(dir, '.sdd-flow.json'), 'utf8'));
const text = (dir) => fs.readFileSync(path.join(dir, 'questions.md'), 'utf8');
const command = (dir, verb, payload) => run(['questions', verb, dir, JSON.stringify(payload)]);
const output = (result) => result.chunks.map((c) => c[1]).join('');
const act = (dir, verb, payload) => applyQuestion(dir, verb, payload);

test('Q-01–Q-05: ленивый реестр, отложенный grill, независимая тема и новая сессия', () => {
  const dir = setup();
  const original = fs.readFileSync(path.join(dir, 'spec.md'), 'utf8');
  assert.equal(fs.existsSync(path.join(dir, 'questions.md')), false);
  assert.match(registrySummary(loadFeature(dir)), /нет/);
  const q = act(dir, 'add', input());
  assert.equal(q.id, 'Q1');
  assert.equal(state(dir).next.Q, 2);
  assert.throws(() => draftWork(loadFeature(dir), ['Q1']), /Неизвестная/);
  assert.equal(act(dir, 'defer', { key: 'later', id: q.id }).fields.Статус, 'deferred');
  const fresh = loadFeature(dir);
  assert.match(registrySummary(fresh), /ждёт ответа \(отложен\)/);
  assert.match(text(dir), /Продолжить: Проверить повтор после таймаута/);
  assert.match(text(dir), /Если да — выяснить лимит/);
  assert.match(draftWork(fresh, ['FR-2']), /независимый черновик/);
  assert.throws(() => draftWork(fresh, ['FR-1']), /Q1/);
  assert.equal(fs.readFileSync(path.join(dir, 'spec.md'), 'utf8'), original);
  assert.equal(fresh.protocol.status, 'идёт');
  assert.match(output(run(['ask', dir])), /Нерешённых вопросов: 1/);
  assert.doesNotMatch(output(run(['ask', dir])), /Повторять отправку/);
  assert.equal(run(['gate', 'spec', dir, 'draft:FR-2']).code, 0);
  assert.equal(run(['gate', 'spec', dir, 'draft:FR-1']).code, 3);
  assert.equal(run(['gate', 'build', dir, 'draft:FR-2']).code, 3);
});

test('идемпотентность: повтор add после defer и другой порядок полей не создают Q и не откатывают состояние', () => {
  const dir = setup();
  const first = input();
  act(dir, 'add', first);
  act(dir, 'defer', { key: 'defer', id: 'Q1', colleagues: 'Команда поддержки' });
  const old = text(dir);
  const retry = act(dir, 'add', Object.fromEntries(Object.entries(first).reverse()));
  assert.equal(retry.id, 'Q1');
  assert.equal(retry.fields.Статус, 'deferred');
  assert.equal(text(dir), old);
  assert.equal(state(dir).next.Q, 2);
  assert.throws(() => act(dir, 'add', { ...first, title: 'Другой вопрос?' }), /Ключ действия/);
});

test('Q-03/Q-10: ответ и исключение требуют обработки; отложить ответ нельзя', () => {
  const dir = setup();
  act(dir, 'add', input());
  const answered = act(dir, 'answer', { key: 'answer', id: 'Q1', answer: 'Да, повторять' });
  assert.equal(answered.fields.Статус, 'answered');
  assert.match(registrySummary(loadFeature(dir)), /ответ требует обработки/);
  assert.throws(() => act(dir, 'defer', { key: 'late', id: 'Q1' }), /Ответ требует обработки/);
  assert.throws(() => act(dir, 'exclude', { key: 'out', id: 'Q1', decision: 'Не делаем' }), /consequences/);
  act(dir, 'exclude', { key: 'out', id: 'Q1', decision: 'Человек исключил повтор', consequences: 'При таймауте нужна поддержка' });
  assert.match(text(dir), /Статус: answered/);
  assert.match(text(dir), /Последствия: При таймауте/);
  assert.throws(() => draftWork(loadFeature(dir), ['FR-1']), /Q1/);
});

test('Q-06/Q-08: фильтры и явно неизвестное влияние; уточнение области не закрывает вопрос', () => {
  const dir = setup();
  act(dir, 'add', { ...input(), impact: 'unknown', refs: [] });
  assert.match(registrySummary(loadFeature(dir)), /Область влияния неизвестна/);
  assert.throws(() => draftWork(loadFeature(dir), ['FR-2']), /неизвестна/);
  assert.match(registrySummary(loadFeature(dir), { topic: 'иная' }), /нет/);
  assert.match(registrySummary(loadFeature(dir), { stage: 'grill', id: 'Q1' }), /Q1/);
  act(dir, 'scope', { key: 'scope', id: 'Q1', impact: 'known', refs: ['FR-1'] });
  assert.match(draftWork(loadFeature(dir), ['FR-2']), /Можно/);
  assert.equal(loadFeature(dir).flow.records[0].fields.Статус, 'open');
  assert.throws(() => act(dir, 'scope', { key: 'empty', id: 'Q1', impact: 'known', refs: [] }), /нужны/);
});

test('ссылки на сценарий, родитель Q, блокировка согласования существующего документа', () => {
  const dir = setup();
  reserveFlowId(dir, 'SC');
  fs.appendFileSync(path.join(dir, 'spec.md'), '\n## SC-1 — Отправить\nТребования: FR-1\n');
  act(dir, 'add', input());
  act(dir, 'add', { ...input('child'), parent: 'Q1', refs: ['SC-1'], stage: 'scenarios' });
  fs.appendFileSync(path.join(dir, 'spec.md'), '\n## Открытые вопросы\n- [Q2](questions.md#q2)\n');
  const m = loadFeature(dir);
  assert.equal(m.flow.graph.edges.some((e) => e.from === 'Q2' && e.to === 'Q1'), true);
  assert.equal(fileQuestionBlockers(m, [m.specFile]).length, 2);
  assert.equal(run(['approve', 'spec', dir]).code, 3);
  assert.equal(runChecks(m).filter((f) => f.rule === 'QU-01').length, 0);
  fs.appendFileSync(path.join(dir, 'spec.md'), '- Ещё один независимый список?\n');
  assert.match(runChecks(loadFeature(dir)).find((f) => f.rule === 'QU-01').msg, /ссылка/);
});

test('граф учитывает AC, основания и зависимости slices', () => {
  const dir = setup();
  fs.mkdirSync(path.join(dir, 'slices'));
  fs.writeFileSync(path.join(dir, 'slices/001-one.md'), slice('001', { basis: 'FR-1' }, ...ac('AC-001-B1')));
  fs.writeFileSync(path.join(dir, 'slices/002-two.md'), slice('002', { basis: 'FR-2', deps: '001' }, ...ac('AC-002-B1', 'FR-2')));
  act(dir, 'add', { ...input(), refs: ['AC-001-B1'] });
  assert.throws(() => draftWork(loadFeature(dir), ['AC-002-B1']), /Q1/);
  assert.match(draftWork(loadFeature(dir), ['FR-3']), /Можно/);
});

test('проверка входа: неверные поля, ссылки и legacy не создают файл и не тратят ID', () => {
  const dir = setup();
  const bad = [null, {}, { ...input(), key: '../bad' }, { ...input(), title: '\n## Q9' },
    { ...input(), refs: 'FR-1' }, { ...input(), refs: [1] }, { ...input(), title: '' },
    { ...input(), stage: 'no' }, { ...input(), refs: ['FR-99'] }, { ...input(), parent: 'Q8' },
    { ...input(), impact: 'sure' }, { ...input(), refs: [] }, { ...input(), answer: 'Сразу закрыть' },
    { ...input(), title: undefined }, { ...input(), context: undefined }];
  for (const payload of bad) assert.throws(() => act(dir, 'add', payload));
  assert.throws(() => act(dir, 'answer', { key: 'x', id: 'Q9', answer: 'Да' }), /не найден/);
  assert.throws(() => act(dir, 'resolve', { key: 'x', id: 'Q1' }), /Неизвестное/);
  assert.equal(fs.existsSync(path.join(dir, 'questions.md')), false);
  assert.equal(state(dir).next.Q, 1);
  assert.throws(() => draftWork(loadFeature(dir), []), /пустая/);
  assert.throws(() => draftWork(loadFeature(dir), ['Q9']), /Неизвестная/);
  assert.throws(() => draftWork(loadFeature(dir), ['FR-99']), /Неизвестная/);
  const legacy = feature({ 'spec.md': SPEC });
  assert.throws(() => act(legacy.dir, 'add', input()), /миграции нет/);
  assert.throws(() => draftWork(legacy, ['FR-1']), /новом процессе/);
  assert.equal(command(legacy.dir, 'list', {}).code, 2);
});

test('свободный контекст и соседние вопросы не теряются при обновлении', () => {
  const dir = setup();
  act(dir, 'add', input());
  fs.appendFileSync(path.join(dir, 'questions.md'), 'Свободный абзац.\n');
  act(dir, 'add', { ...input('two'), title: 'Второй вопрос' });
  act(dir, 'defer', { key: 'later', id: 'Q1' });
  const records = registryRecords(text(dir));
  assert.equal(records.length, 2);
  assert.equal(records[1].title, 'Второй вопрос');
  assert.match(text(dir), /Свободный абзац/);
  assert.equal((text(dir).match(/<a id="q1">/g) || []).length, 1);
  assert.equal(Object.keys(questionActions(records[0])).length, 2);
});

test('ошибки структуры и журнала диагностируются до изменения', () => {
  assert.throws(() => registryRecords('## SC-1 — Путь'), /только вопросы/);
  assert.throws(() => registryRecords('## Q1 — Вопрос'), /Этап/);
  const dir = setup();
  act(dir, 'add', input());
  fs.writeFileSync(path.join(dir, 'questions.md'), text(dir).replace(/Действия:.*/, 'Действия: []'));
  assert.throws(() => act(dir, 'defer', { key: 'd', id: 'Q1' }), /журнал/);
  assert.match(runChecks(loadFeature(dir)).map((f) => f.msg).join(), /журнал/);
  fs.writeFileSync(path.join(dir, 'questions.md'), text(dir).replace('Действия: []', 'Действия: {"a":"bad"}'));
  assert.throws(() => act(dir, 'defer', { key: 'd', id: 'Q1' }), /действие/);
});

test('команда даёт понятные карточки, сводку и восстановление без внутренних статусов', () => {
  const dir = setup();
  assert.match(output(command(dir, 'add', input())), /ждёт ответа/);
  assert.match(output(command(dir, 'defer', { key: 'later', id: 'Q1' })), /отложен/);
  assert.doesNotMatch(output(command(dir, 'list', {})), /deferred/);
  assert.equal(command(dir, 'work', { refs: ['FR-2'] }).code, 0);
  assert.equal(command(dir, 'work', {}).code, 2);
  assert.equal(command(dir, 'recover', {}).code, 0);
  assert.equal(run(['questions', 'list', dir, '{']).code, 2);
  const json = run(['questions', 'list', dir, '{}', '--json']);
  assert.match(JSON.parse(output(json)).text, /Q1/);
});

test('атомарная запись: сбои реестра не откатывают выданный Q, старый документ цел', () => {
  const dir = setup();
  act(dir, 'add', input());
  const before = text(dir);
  const rename = fs.renameSync;
  const failure = mock.method(fs, 'renameSync', (from, to) => {
    if (String(to).endsWith('questions.md')) throw new Error('disk failure');
    return rename(from, to);
  });
  try { assert.throws(() => act(dir, 'add', input('two')), /disk failure/); }
  finally { failure.mock.restore(); }
  assert.equal(text(dir), before);
  assert.equal(state(dir).next.Q, 3);
  assert.equal(act(dir, 'add', input('two')).id, 'Q3');
  assert.equal(fs.existsSync(path.join(dir, 'questions.md.pending')), false);
});

test('recovery: неполный pending, полный кандидат, уже опубликованный и конфликт', () => {
  const dir = setup();
  act(dir, 'add', input());
  const pending = path.join(dir, 'questions.md.pending');
  const before = text(dir);
  fs.writeFileSync(pending, '{');
  assert.throws(() => act(dir, 'add', input('two')), /EEXIST/);
  assert.match(runChecks(loadFeature(dir)).map((f) => f.msg).join(), /Незавершённая запись реестра/);
  recoverRegistry(dir);
  assert.equal(text(dir), before);
  const md = before.replace('Статус: open', 'Статус: deferred');
  const envelope = JSON.stringify({ base: questionDigest(before), md, hash: questionDigest(md) });
  fs.writeFileSync(pending, envelope);
  fs.writeFileSync(path.join(dir, 'questions.md.writing'), 'partial');
  recoverRegistry(dir);
  assert.equal(text(dir), md);
  fs.writeFileSync(pending, envelope);
  recoverRegistry(dir);
  assert.equal(text(dir), md);
  fs.writeFileSync(pending, JSON.stringify({ base: 'bad', md: before, hash: questionDigest(before) }));
  assert.throws(() => recoverRegistry(dir), /изменился/);
  assert.equal(fs.existsSync(pending), true);
  for (const value of [null, {}, { base: 'x', md: before, hash: 'wrong' }]) {
    fs.writeFileSync(pending, JSON.stringify(value));
    assert.throws(() => recoverRegistry(dir), /Повреждён/);
  }
});

test('QU-01: незаполненные поля, ложное известное влияние, потерянный ответ и последствия', () => {
  const dir = setup();
  act(dir, 'add', input());
  const file = path.join(dir, 'questions.md');
  const before = text(dir);
  const invalid = [
    [before.replace('Контекст: Анна отправляет дважды', ''), /Контекст/],
    [before.replace('Влияние: known', 'Влияние: wrong'), /known или unknown/],
    [before.replace('Элементы: FR-1', ''), /требует элементов/],
    [before.replace('Статус: open', 'Статус: answered'), /нет полученного ответа/],
    [before + 'Исключение: Не нужно\n', /требует последствий/],
  ];
  for (const [md, expected] of invalid) {
    fs.writeFileSync(file, md);
    const messages = runChecks(loadFeature(dir)).filter((f) => f.rule === 'QU-01').map((f) => f.msg).join();
    assert.match(messages, expected);
  }
  fs.writeFileSync(file, before);
  act(dir, 'answer', { key: 'a', id: 'Q1', answer: 'Да' });
  assert.equal(runChecks(loadFeature(dir)).filter((f) => f.rule === 'QU-01').length, 0);
  act(dir, 'exclude', { key: 'e', id: 'Q1', decision: 'Убираем', consequences: 'Нет повторов' });
  assert.equal(runChecks(loadFeature(dir)).filter((f) => f.rule === 'QU-01').length, 0);
});

test('реестр принимает существующий локальный контракт и отвергает повреждённый граф для черновика', () => {
  const dir = setup();
  fs.writeFileSync(path.join(dir, 'api.md'), '<a id="send"></a>\n');
  act(dir, 'add', { ...input(), refs: ['contract:api.md#send'] });
  assert.match(text(dir), /contract:api.md#send/);
  fs.writeFileSync(path.join(dir, 'api.md'), 'Нет якоря');
  assert.throws(() => draftWork(loadFeature(dir), ['FR-2']), /нет цели/);
  assert.throws(() => act(dir, 'add', input('two')), /нет цели/);
});

test('реестр не возвращает новый ID до записи документа при сбое write/fsync', () => {
  const dir = setup();
  act(dir, 'add', input());
  const before = text(dir);
  for (const method of ['writeFileSync', 'fsyncSync']) {
    const failure = mock.method(fs, method, () => { throw new Error('I/O'); });
    try { assert.throws(() => act(dir, 'defer', { key: method, id: 'Q1' }), /I\/O/); }
    finally { failure.mock.restore(); }
    assert.equal(text(dir), before);
    assert.equal(fs.existsSync(path.join(dir, 'questions.md.pending')), false);
  }
});

test('recovery не публикует невыданный Q или документ до восстановления счётчика', () => {
  const dir = setup();
  act(dir, 'add', input());
  const pending = path.join(dir, 'questions.md.pending');
  const before = text(dir);
  const candidate = before.replace('## Q1', '## Q7');
  const envelope = (md) => JSON.stringify({ base: questionDigest(before), md, hash: questionDigest(md) });
  fs.writeFileSync(pending, envelope(candidate));
  assert.throws(() => recoverRegistry(dir), /не зарезервирован/);
  fs.writeFileSync(pending, envelope(before));
  fs.writeFileSync(path.join(dir, '.sdd-flow.json.pending'), '{}');
  assert.throws(() => recoverRegistry(dir), /Сначала восстановите счётчики/);
  fs.unlinkSync(path.join(dir, '.sdd-flow.json.pending'));
  fs.unlinkSync(path.join(dir, '.sdd-flow.json'));
  assert.throws(() => recoverRegistry(dir), /признака/);
  assert.equal(text(dir), before);
});

test('новый prompt содержит контракт; triage сохраняет один Q вместо самостоятельного списка', () => {
  const cwd = tmpDir();
  const dir = path.join(cwd, 'docs', 'task');
  fs.mkdirSync(dir, { recursive: true });
  initTestFlow(dir);
  fs.writeFileSync(path.join(dir, 'spec.md'), SPEC);
  const review = path.join(dir, '_work', 'review');
  fs.mkdirSync(review, { recursive: true });
  fs.writeFileSync(path.join(review, 'spec.md'), '# Проверка\n\n' +
    '| # | Важность | Где | Что не так | Пункт | Предложение | Решение |\n|---|---|---|---|---|---|---|\n' +
    '| R1 | блокер | FR-1 | Как повторять? | 1 | Уточнить | |\n');
  inDir(cwd, {}, () => {
    assert.match(output(run(['prompt', 'sdd-grill', 'task'])), /Вопросы тестового нового процесса/);
    const result = run(['triage', dir, 'spec:R1', 'open']);
    assert.equal(result.code, 0);
    assert.match(output(result), /Q1/);
    assert.equal(run(['triage', dir, 'spec:R1', 'open']).code, 0);
  });
  assert.equal(registryRecords(text(dir)).length, 1);
  assert.equal(state(dir).next.Q, 2);
  assert.equal(fs.readFileSync(path.join(dir, 'spec.md'), 'utf8'), SPEC);
  const m = loadFeature(dir);
  assert.equal(openQuestions(m, 'spec').length, 1);
  assert.equal(openQuestions(m, 'slices').length, 1); // unknown impact blocks every area
  assert.match(output(run(['gate', 'build', dir])), /нерешённые вопросы/);
});

test('ошибки ссылок, дубликаты ключей и записи Q за пределами реестра диагностируются', () => {
  const dir = setup();
  act(dir, 'add', input());
  const before = text(dir);
  reserveFlowId(dir, 'Q');
  fs.appendFileSync(path.join(dir, 'questions.md'), before.replace(/Q1/g, 'Q2'));
  assert.match(runChecks(loadFeature(dir)).map((f) => f.msg).join(), /Повтор ключа действия/);
  fs.writeFileSync(path.join(dir, 'questions.md'), before);
  fs.appendFileSync(path.join(dir, 'spec.md'), before.replace(/Q1/g, 'Q2'));
  assert.match(runChecks(loadFeature(dir)).map((f) => f.msg).join(), /только в questions.md/);
  for (const link of ['[Q1](wrong.md#q1)', '[Q1](questions.md#wrong)', '[Q9](questions.md#q9)']) {
    fs.writeFileSync(path.join(dir, 'spec.md'), `${SPEC}\n## Открытые вопросы\n- ${link}\n`);
    assert.match(runChecks(loadFeature(dir)).map((f) => f.msg).join(), /нужна ссылка/);
  }
});

test('ответ не принимается пустым, закрытая запись не меняется, варианты CLI читаются', () => {
  const dir = setup();
  act(dir, 'add', input());
  assert.throws(() => act(dir, 'answer', { key: 'a', id: 'Q1' }), /answer/);
  for (const status of ['resolved', 'excluded']) {
    fs.writeFileSync(path.join(dir, 'questions.md'), text(dir).replace(/Статус: \w+/, `Статус: ${status}`));
    assert.throws(() => act(dir, 'defer', { key: 'd', id: 'Q1' }), /уже закрыт/);
    assert.match(registrySummary(loadFeature(dir)), /нет/);
  }
  assert.match(output(run(['help', 'questions'])), /key/);
  const error = run(['questions', 'add', dir, '{}', '--json']);
  assert.equal(error.code, 2);
  assert.match(JSON.parse(output(error)).error, /ключ/);
});

test('независимость включает требования ADR и ожидание ADR в slice; неизвестная зависимость блокирует выбор', () => {
  const dir = setup();
  const name = path.basename(dir);
  const adrDir = path.join(dir, '..', 'adr');
  fs.mkdirSync(adrDir, { recursive: true });
  const adrFile = path.join(adrDir, '9876-registry-test.md');
  try {
    fs.writeFileSync(adrFile, `# ADR-9876: Доставка\nФича: [задача](../${name}/spec.md)\n\n## Контекст\nFR-2\n`);
    fs.mkdirSync(path.join(dir, 'slices'));
    fs.writeFileSync(path.join(dir, 'slices/001-one.md'), slice('001', { basis: 'FR-3', why: 'Р1 — ADR-9876' }, ...ac('AC-001-B1', 'FR-3')));
    act(dir, 'add', { ...input(), refs: ['ADR-9876'] });
    const m = loadFeature(dir);
    assert.throws(() => draftWork(m, ['FR-2']), /Q1/);
    assert.throws(() => draftWork(m, ['AC-001-B1']), /Q1/);
    assert.match(draftWork(m, ['FR-4']), /Можно/);
    fs.writeFileSync(path.join(dir, 'slices/002-two.md'), slice('002', { basis: 'FR-4', deps: '003' }));
    assert.throws(() => draftWork(loadFeature(dir), ['FR-4']), /Неизвестная зависимость/);
  } finally { fs.unlinkSync(adrFile); }
});

test('ключи, совпадающие со свойствами Object, остаются обычными ключами идемпотентности', () => {
  const dir = setup();
  const first = act(dir, 'add', input('toString'));
  assert.equal(first.id, 'Q1');
  assert.equal(act(dir, 'add', input('toString')).id, 'Q1');
  assert.equal(act(dir, 'defer', { key: '__proto__', id: 'Q1' }).fields.Статус, 'deferred');
  assert.equal(state(dir).next.Q, 2);
});

test('уточнение known → unknown удаляет старые связи, но сохраняет контекст и блокировку', () => {
  const dir = setup();
  act(dir, 'add', input());
  act(dir, 'scope', { key: 'unknown', id: 'Q1', impact: 'unknown', refs: [] });
  assert.doesNotMatch(text(dir), /Элементы:/);
  assert.match(text(dir), /Контекст: Анна/);
  assert.throws(() => draftWork(loadFeature(dir), ['FR-2']), /неизвестна/);
});

test('конкурирующая внешняя правка и сбой fsync staging-файла не теряют документ', () => {
  const dir = setup();
  act(dir, 'add', input());
  const file = path.join(dir, 'questions.md');
  const before = text(dir);
  const fsync = fs.fsyncSync;
  let calls = 0;
  const external = mock.method(fs, 'fsyncSync', (fd) => {
    fsync(fd);
    fs.writeFileSync(file, before + 'Внешняя правка\n');
  });
  try { assert.throws(() => act(dir, 'defer', { key: 'conflict', id: 'Q1' }), /изменился/); }
  finally { external.mock.restore(); }
  assert.equal(text(dir), before + 'Внешняя правка\n');
  const failure = mock.method(fs, 'fsyncSync', (fd) => {
    if (++calls === 2) throw new Error('staging failure');
    fsync(fd);
  });
  try { assert.throws(() => act(dir, 'defer', { key: 'staging', id: 'Q1' }), /staging failure/); }
  finally { failure.mock.restore(); }
  assert.equal(text(dir), before + 'Внешняя правка\n');
  assert.equal(fs.existsSync(`${file}.writing`), false);
  assert.equal(fs.existsSync(`${file}.pending`), false);
});
