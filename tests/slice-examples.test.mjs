// Явные примеры шапок и связей slices: точные находки и граничные отрицательные случаи.
import { test } from 'node:test';
import { checkSlices } from '../skills/sdd-lint/scripts/sdd-lint/slice-rules.mjs';
import { feature, slice, ac, SPEC } from './helpers.mjs';
import { expectRules } from './rule-examples-helpers.mjs';

const FILE = 'slices/001-a.md';
const check = (text, ids, rows) => {
  const m = feature({ [FILE]: text });
  expectRules(m, checkSlices(m), ids, rows);
};

test('SL-01: отсутствующая строка шапки и присутствующая, включая пустое значение', () => {
  const keys = ['Тип', 'Основание', 'Зависимости', 'Половины', 'Результат'];
  check('# 001 — Slice', ['SL-01'], keys.map((k) => ['SL-01', 'err', FILE, null, `нет строки «${k}:» в шапке`]));
  for (const k of keys) {
    const text = slice('001').replace(new RegExp(`^${k}:.*$`, 'm'), '');
    check(text, ['SL-01'], [['SL-01', 'err', FILE, null, `нет строки «${k}:» в шапке`]]);
  }
  check(slice('001'), ['SL-01'], []);
  check(slice('001').replace('Результат: есть', 'Результат:'), ['SL-01'], []);
});

test('SL-03, SL-06: AC вне блока и несколько AC внутри; проза и отдельные блоки', () => {
  check(slice('001', {}, 'AC-001-B1 Поиск', 'См. AC-001-B2.'), ['SL-03', 'SL-06'], [
    ['SL-03', 'err', FILE, 14, 'AC-001-B1 вне блока кода'],
  ]);
  check(slice('001', {}, '```', 'AC-001-B1 Один', 'AC-001-B2 Два', '```'), ['SL-03', 'SL-06'], [
    ['SL-06', 'err', FILE, 14, 'в блоке кода 2 AC'],
  ]);
  check(slice('001', {}, ...ac('AC-001-B1 Один'), ...ac('AC-001-B2 Два')), ['SL-03', 'SL-06'], []);
});

const many = (side, count, deleted = false) => Array.from({ length: count }, (_, i) =>
  ac(`AC-001-${side}${i + 1} Поиск${deleted ? ' (удалён: повтор)' : ''}`)).flat();
test('SL-08: граница 10/11 в каждой половине, общие и удалённые AC не учитываются', () => {
  check(slice('001', {}, ...many('B', 10), ...many('F', 10), ...many('', 11)), ['SL-08'], []);
  check(slice('001', {}, ...many('B', 11), ...many('F', 11)), ['SL-08'], [
    ['SL-08', 'warn', FILE, null, '11 AC в серверной-половине'],
    ['SL-08', 'warn', FILE, null, '11 AC в фронтенд-половине'],
  ]);
  check(slice('001', {}, ...many('B', 11, true), ...many('F', 11, true)), ['SL-08'], []);
});

test('SL-09, SL-10: открытый вопрос меняет уровень после одобрения, «Нет» и отсутствие раздела чистые', () => {
  for (const status of [null, 'на ревью', 'одобрено']) {
    for (const question of [null, 'Нет', 'Какой срок?']) {
      const m = feature({ [FILE]: slice('001', {}, ...(question === null ? [] : ['## Открытые вопросы', question])) });
      m.slicesStatus = status;
      const approved = status === 'одобрено';
      expectRules(m, checkSlices(m), ['SL-09', 'SL-10'], question !== 'Какой срок?' ? [] : [approved
        ? ['SL-10', 'err', FILE, null, 'части работы одобрены, но в одной из них есть открытые вопросы']
        : ['SL-09', 'info', FILE, null, 'есть открытые вопросы к требованиям']]);
    }
  }
});

test('SL-12: неизвестные FR/NFR основания; известные ссылки и отсутствие spec', () => {
  for (const spec of [SPEC, null]) {
    const m = feature({ [FILE]: slice('001', { basis: 'FR-1, FR-9, NFR-9' }), 'spec.md': spec });
    expectRules(m, checkSlices(m), ['SL-12'], spec ? ['FR-9', 'NFR-9'].map((id) =>
      ['SL-12', 'err', FILE, 5, `«Основание»: ${id} нет в spec.md`]) : []);
  }
  const valid = feature({ [FILE]: slice('001', { basis: 'FR-1, NFR-1' }), 'spec.md': SPEC });
  expectRules(valid, checkSlices(valid), ['SL-12'], []);
});

test('SL-26: 0, 6 и 7 slices; README не добавляет slice', () => {
  for (const count of [0, 6, 7]) {
    const files = Object.fromEntries(Array.from({ length: count }, (_, i) => {
      const n = String(i + 1).padStart(3, '0');
      return [`slices/${n}-a.md`, slice(n, { type: 'подготовка' })];
    }));
    const m = feature({ ...files, 'slices/README.md': '# Slices' });
    expectRules(m, checkSlices(m), ['SL-26'], count === 7
      ? [['SL-26', 'info', 'slices', null, 'Частей работы: 7 — больше ориентира 3–6']] : []);
  }
});
