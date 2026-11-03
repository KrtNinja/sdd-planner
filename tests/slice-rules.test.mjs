// Правила slices (slice-rules, ac-rules, cut, code-refs) — напрямую на короткой фиче, без CLI: находки целиком.
// Тесты написаны под выживших мутантов (шаг 8.3 REFACTORING.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkCodeRefs } from '../skills/sdd-lint/scripts/sdd-lint/code-refs.mjs';
import { checkCut } from '../skills/sdd-lint/scripts/sdd-lint/cut.mjs';
import { checkSlices } from '../skills/sdd-lint/scripts/sdd-lint/slice-rules.mjs';
import { feature, brief, slice, ac, SPEC } from './helpers.mjs';

test('SL-19: покрытие «Основания» — удалённый AC не в счёт, пока есть AC-NNN-? — не считаем', () => {
  const body = ['', '## Tasks-core-половина', ...ac('AC-001-B1 Поиск'), '', ...ac('AC-001-B2 Дубль (удалён: повтор)', 'FR-2', ['  без WHEN'])];
  const m = feature({ 'spec.md': SPEC, 'slices/001-a.md': slice('001', { basis: 'FR-1, FR-2' }, ...body) });
  assert.deepEqual(brief(m, checkSlices(m), ['SL-14', 'SL-15', 'SL-19']), ['SL-19 slices/001-a.md:5 FR-2 из «Основание» не проверяет ни один AC']);
  const pending = feature({ 'spec.md': SPEC, 'slices/001-a.md': slice('001', { basis: 'FR-1, FR-2' }, ...body, '```', 'AC-001-?', '```') });
  assert.deepEqual(brief(pending, checkSlices(pending), ['SL-19']), []);
});

test('SL-19: FR не из spec и фича без spec — тоже без AC', () => {
  const body = ['', '## Tasks-core-половина', ...ac('AC-001-B1 Поиск')];
  const unknown = feature({ 'spec.md': SPEC, 'slices/001-a.md': slice('001', { basis: 'FR-1, FR-9' }, ...body) });
  assert.deepEqual(brief(unknown, checkSlices(unknown), ['SL-19']), ['SL-19 slices/001-a.md:5 FR-9 из «Основание» не проверяет ни один AC']);
  const noSpec = feature({ 'slices/001-a.md': slice('001', { basis: 'FR-1, FR-2' }, ...body) });
  assert.deepEqual(brief(noSpec, checkSlices(noSpec), ['SL-19']), ['SL-19 slices/001-a.md:5 FR-2 из «Основание» не проверяет ни один AC']);
});

test('SL-25, SL-11, SL-27: «Границы» на slices, зависимости, ссылки на AC', () => {
  const m = feature({
    'spec.md': SPEC,
    'slices/001-a.md': slice('001', { type: 'подготовка', deps: '001, 009' }, '', '## Границы', '', 'Не входит: фильтры (002 и 009), сортировка — slice 008, всё — slice 001.'),
    'slices/002-b.md': slice('002', { deps: '001' }, '', '## Tasks-core-половина', ...ac('AC-002-B1 Поиск'), '', 'См. AC-002-B1 и AC-002-B7.'),
  });
  assert.deepEqual(brief(m, checkSlices(m), ['SL-11', 'SL-25', 'SL-27']), [
    'SL-25 slices/001-a.md:- «Границы»: slice 009 нет',
    'SL-25 slices/001-a.md:- «Границы»: slice 008 нет',
    'SL-11 slices/001-a.md:7 slice зависит сам от себя',
    'SL-11 slices/001-a.md:7 зависимость 009 — такого slice нет',
    'SL-27 slices/002-b.md:23 ссылка на AC-002-B7, такого AC нет',
  ]);
});

test('SL-17, SL-18: FR из «Основание» зависимостей — транзитивно, через цикл и мимо несуществующих', () => {
  const m = feature({
    'spec.md': SPEC,
    'slices/001-a.md': slice('001', { type: 'подготовка' }),
    'slices/002-b.md': slice('002', { basis: 'FR-2', deps: '001, 009, 003' }),
    'slices/003-c.md': slice('003', { basis: 'FR-3', deps: '002' }, '', '## Tasks-core-половина', ...ac('AC-003-B1 Поиск', 'FR-1, FR-3, FR-4')),
  });
  assert.deepEqual(brief(m, checkSlices(m), ['SL-17', 'SL-18']), [
    'SL-18 slices/003-c.md:17 AC-003-B1 проверяет FR-1 из зависимости',
    'SL-17 slices/003-c.md:17 AC-003-B1 ссылается на FR-4, а в «Основание» slice его нет',
  ]);
});

test('SL-20, SL-15: раздел AC по его стороне; строка без ключевого слова — только продолжение с отступом больше', () => {
  const lines = ['  без ключевого слова', '  WHEN Анна ищет', '  THEN список', '    и продолжение', '  тоже без слова'];
  const m = feature({
    'spec.md': SPEC,
    'slices/001-a.md': slice('001', {}, '', '## Общая приёмка', ...ac('AC-001-B1 Не там'), '', '## Tasks-core-половина', ...ac('AC-001-1 Общий'), '',
      ...ac('AC-001-F1 Фронт'), '', ...ac('AC-001-B2 Строки', 'FR-1', lines)),
  });
  assert.deepEqual(brief(m, checkSlices(m), ['SL-15', 'SL-20']), [
    'SL-20 slices/001-a.md:17 AC-001-B1 стоит в разделе «Общая приёмка», его место — «<Сервис>-половина»',
    'SL-20 slices/001-a.md:25 AC-001-1 стоит в разделе «Tasks-core-половина», его место — «Общая приёмка»',
    'SL-20 slices/001-a.md:32 AC-001-F1 стоит в разделе «Tasks-core-половина», его место — «Frontend-половина»',
    'SL-15 slices/001-a.md:40 AC-001-B2: строка без WHEN / AND / THEN',
    'SL-15 slices/001-a.md:44 AC-001-B2: строка без WHEN / AND / THEN',
  ]);
});

const PROTOCOL = '# Поиск — Brainstorming\n\nСтатус: готов\n\nСервисы: tasks-core, frontend\n';

test('SL-33, SL-37: сервис из заголовка половины — один раз на заголовок; заготовки README', () => {
  const m = feature({
    'brainstorming.md': PROTOCOL,
    'slices/001-a.md': slice('001', {}, '', '## Billing-половина', 'Здесь граница.', ...ac('AC-001-B1 Счёт'), '', '## Frontend-половина', 'Экран.'),
    'slices/README.md': '# Поиск — slices\n\n## Пересечения\n\n- FR-1 — 001, 002: <где граница>\n',
  });
  assert.deepEqual(brief(m, checkCut(m), ['SL-33', 'SL-37']), [
    'SL-37 slices/README.md:5 «<где граница>»',
    'SL-33 slices/001-a.md:15 «billing» нет в «Сервисы:» протокола (tasks-core, frontend)',
  ]);
});

// AC стороны side: count штук с номерами от from, удалённые — с пометкой.
const acs = (side, count, from = 1, deleted = false) =>
  Array.from({ length: count }, (_, i) => ac(`AC-001-${side}${from + i} AC${deleted ? ' (удалён: повтор)' : ''}`)).flat();

test('SL-35: Р2 правдив, когда в одной половине больше 10 живых AC; удалённые и общие не в счёт', () => {
  const why = 'Р2 — объём';
  const ten = feature({ 'slices/001-a.md': slice('001', { why }, '', '## Общая приёмка', ...acs('', 3), '## Tasks-core-половина', ...acs('B', 10), ...acs('B', 2, 11, true)) });
  assert.deepEqual(brief(ten, checkCut(ten), ['SL-35']), ['SL-35 slices/001-a.md:13 «Почему отдельно: Р2», а в половинах не больше 10 AC']);
  const eleven = feature({ 'slices/001-a.md': slice('001', { why }, '', '## Tasks-core-половина', ...acs('B', 11)) });
  assert.deepEqual(brief(eleven, checkCut(eleven), ['SL-35']), []);
});

test('CD-05: внутренние имена в прозе slice и в блоке FR — находка, в блоке AC — нет (там SL-22)', () => {
  const spec = SPEC.replace('FR-2  Текст.', 'FR-2  TaskRepository хранит.');
  const m = feature({
    'spec.md': spec,
    'slices/001-a.md': slice('001', {}, '', 'Граница: TaskController.', '## Tasks-core-половина', ...ac('AC-001-B1 Поиск', 'FR-1', ['  WHEN TaskService ищет', '  THEN список'])),
  });
  assert.deepEqual(brief(m, checkCodeRefs(m), ['CD-05']), [
    'CD-05 spec.md:13 «TaskRepository» — внутреннее имя из кода',
    'CD-05 slices/001-a.md:15 «TaskController» — внутреннее имя из кода',
  ]);
});
