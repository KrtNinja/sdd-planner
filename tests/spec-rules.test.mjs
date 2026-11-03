// Правила Dev Spec (spec-rules.mjs) — напрямую на короткой фиче, без CLI: находки целиком (ID, строка, текст).
// Тесты написаны под выживших мутантов (шаг 8.3 REFACTORING.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkSpec } from '../skills/sdd-lint/scripts/sdd-lint/spec-rules.mjs';
import { feature, brief } from './helpers.mjs';

const fence = (...lines) => ['```', ...lines, '```'];
const PROTOCOL = `# Поиск — Brainstorming

Статус: готов

## Решения

| # | Вопрос | Рекомендация агента | Решение |
|---|---|---|---|
| 1 | Длина запроса? | 2 символа | 2 |
| 2 | Сколько подсказок? | 5 | 5, при 4 пусто |
| 3 | Скорость? | 10 мс | быстро |
`;
const SPEC = [
  '# Поиск — Dev Spec',
  '',
  'Статус: черновик',
  '',
  'Протокол: [brainstorming.md](brainstorming.md), очередь через Kafka',
  '',
  '## Данные для примеров',
  '',
  '| Персонаж | Роль |',
  '|---|---|',
  '| Анна Петрова | покупатель |',
  '',
  '## Функциональные требования',
  '',
  ...fence('FR-1  Запрос не длиннее 2 символов.', '      Пример: Анна вводит запрос.'),
  'Из протокола: 1',
  '',
  ...fence('FR-2  Подсказок не меньше 5, при 4 — пусто; не больше 1 строки.', '      Пример: пользователь вводит запрос.'),
  'Из протокола: 2',
  '',
  ...fence('NFR-1  Ответ за 10 мс.'),
  'Из протокола: 3',
  '',
  '## Не про поведение',
  '',
  '- события через Kafka',
  '',
  '## Цель',
  '',
  '- поиск хранит историю в Redis',
  '',
].join('\n');

test('SP-05: слово реализации в обычном разделе — находка; «Не про поведение» и строка «Протокол:» — мимо', () => {
  const m = feature({ 'spec.md': SPEC, 'brainstorming.md': PROTOCOL });
  assert.deepEqual(brief(m, checkSpec(m), ['SP-05']), ['SP-05 spec.md:38 «Redis» — технология в Dev Spec']);
});

test('SP-09, SP-11, SP-12: пример без персонажа, граница без пары, число только из рекомендации агента', () => {
  const m = feature({ 'spec.md': SPEC, 'brainstorming.md': PROTOCOL });
  assert.deepEqual(brief(m, checkSpec(m), ['SP-08', 'SP-09', 'SP-11', 'SP-12']), [
    'SP-11 spec.md:16 FR-1: «не длиннее 2» без парного значения 3 (или 1)',
    'SP-09 spec.md:22 FR-2: в примере нет персонажа или объекта из «Данные для примеров»',
    'SP-12 spec.md:28 NFR-1: число 10 есть только в рекомендации агента (строка #3 протокола)',
  ]);
});

test('SP-09: без «Данных для примеров» пример не сверяется; объекты без персонажей — сверяется', () => {
  const noData = SPEC.replace(/## Данные для примеров[\s\S]*?(?=## Функциональные)/, '');
  const m = feature({ 'spec.md': noData, 'brainstorming.md': PROTOCOL });
  assert.deepEqual(brief(m, checkSpec(m), ['SP-09']), []);
  const objects = SPEC.replace('| Персонаж | Роль |\n|---|---|\n| Анна Петрова | покупатель |', '| Объект | Название |\n|---|---|\n| ORDER-7 | «Чайник» |');
  const o = feature({ 'spec.md': objects, 'brainstorming.md': PROTOCOL });
  assert.deepEqual(brief(o, checkSpec(o), ['SP-09']), [
    'SP-09 spec.md:16 FR-1: в примере нет персонажа или объекта из «Данные для примеров»',
    'SP-09 spec.md:22 FR-2: в примере нет персонажа или объекта из «Данные для примеров»',
  ]);
});

test('SP-21: протокола нет — находка на первой «Из протокола:», без неё — на строке «Протокол:»', () => {
  const m = feature({ 'spec.md': SPEC });
  assert.deepEqual(brief(m, checkSpec(m), ['SP-21']), ['SP-21 spec.md:19 протокола нет, а spec на него ссылается']);
  const noSources = feature({ 'spec.md': SPEC.replace(/^Из протокола: \d\n/gm, '') });
  assert.deepEqual(brief(noSources, checkSpec(noSources), ['SP-21']), ['SP-21 spec.md:5 протокола нет, а spec на него ссылается']);
});
