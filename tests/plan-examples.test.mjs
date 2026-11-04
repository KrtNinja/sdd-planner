// Примеры правил плана: заголовки, неизвестные требования и незаполненные поля.
import { test } from 'node:test';
import { checkPlan } from '../skills/sdd-lint/scripts/sdd-lint/plan-rules.mjs';
import { feature, SPEC } from './helpers.mjs';
import { expectRules } from './rule-examples-helpers.mjs';

const FILE = '_work/plan.md';
const plan = (basis = 'FR-1', result = 'поиск') => [
  '# План', '## 001-search — Поиск', `Основание: ${basis}`, 'Зависимости: нет',
  'Половины: tasks-core + frontend, принимаются вместе', `Результат: ${result}`, 'Почему отдельно: —',
].join('\n');

test('PL-01: неправильный заголовок и пустой план; корректный и отсутствующий план', () => {
  const bad = feature({ [FILE]: '# План\n## Не slice' });
  expectRules(bad, checkPlan(bad), ['PL-01'], [
    ['PL-01', 'err', FILE, 2, '«## Не slice» — не заголовок части работы'],
    ['PL-01', 'err', FILE, null, 'нет ни одной части работы'],
  ]);
  const mixed = feature({ [FILE]: plan() + '\n## Ошибка' });
  expectRules(mixed, checkPlan(mixed), ['PL-01'], [['PL-01', 'err', FILE, 8, '«## Ошибка» — не заголовок части работы']]);
  for (const text of [null, plan()]) {
    const m = feature({ [FILE]: text });
    expectRules(m, checkPlan(m), ['PL-01'], []);
  }
});

test('PL-05: неизвестные FR/NFR; известное требование и отсутствие spec', () => {
  for (const spec of [SPEC, null]) {
    const m = feature({ [FILE]: plan('FR-1, FR-9, NFR-9'), 'spec.md': spec });
    expectRules(m, checkPlan(m), ['PL-05'], spec ? ['FR-9', 'NFR-9'].map((id) =>
      ['PL-05', 'err', FILE, 3, `001: ${id} нет в spec.md`]) : []);
  }
  const valid = feature({ [FILE]: plan('FR-1, NFR-1'), 'spec.md': SPEC });
  expectRules(valid, checkPlan(valid), ['PL-05'], []);
});

test('PL-14: полные тексты заготовок на своей строке; заполненное поле', () => {
  const m = feature({ [FILE]: plan('FR-1', '<результат> и <проверка>') });
  expectRules(m, checkPlan(m), ['PL-14'], [['PL-14', 'err', FILE, 6, '«<результат>», «<проверка>»']]);
  const valid = feature({ [FILE]: plan() });
  expectRules(valid, checkPlan(valid), ['PL-14'], []);
});
