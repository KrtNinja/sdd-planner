// Разбор документов фичи (data, protocol, spec, slices) — напрямую, без CLI: модель целиком на коротком входе.
// Тесты написаны под выживших мутантов (шаг 8.2 REFACTORING.md): поле, которое не сверяет ни один тест, мутант не замечает.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scan } from '../skills/sdd-lint/scripts/sdd-lint/md.mjs';
import { parseData, mentionsData, unknownNames } from '../skills/sdd-lint/scripts/sdd-lint/data.mjs';
import { parseProtocol, checkProtocol } from '../skills/sdd-lint/scripts/sdd-lint/protocol.mjs';
import { parseSpec } from '../skills/sdd-lint/scripts/sdd-lint/spec.mjs';
import { parseSlice } from '../skills/sdd-lint/scripts/sdd-lint/slices.mjs';

const DATA = `# Поиск — Dev Spec

## Данные для примеров

| Персонаж | Роль |
|---|---|
| Анна Петрова | покупатель, заказ ORDER-7 |
| Борис | продавец |

- Вера Смирнова — администратор
* Глеб
- товар «Синий чайник»

\`\`\`
- Дина Козлова
DRAFT-9
\`\`\`

## Цели

- Пётр Сидоров здесь не персонаж
`;

test('data: parseData — персонажи из таблицы и списка, объекты по ID и «названию», блок кода и другие разделы — мимо', () => {
  const d = parseData(scan(DATA));
  assert.deepEqual(d.people, [
    { first: 'Анна', last: 'Петрова' },
    { first: 'Борис', last: null },
    { first: 'Вера', last: 'Смирнова' },
    { first: 'Глеб', last: null },
  ]);
  assert.deepEqual([...d.objects], ['ORDER-7']);
  assert.deepEqual([...d.objNames], ['Синий чайник']);
});

test('data: mentionsData — по началу имени или фамилии, по ID и по «названию» объекта', () => {
  const d = parseData(scan(DATA));
  assert.equal(mentionsData('Петровой показан заказ', d), true);
  assert.equal(mentionsData('Анне показан заказ', d), true);
  assert.equal(mentionsData('открыт ORDER-7', d), true);
  assert.equal(mentionsData('в корзине Синий чайник', d), true);
  assert.equal(mentionsData('пользователь открывает поиск', d), false);
  const objectsOnly = { people: [], objects: new Set(['ORDER-7']), objNames: new Set() };
  assert.equal(mentionsData('открыт ORDER-7', objectsOnly), true);
  assert.equal(mentionsData('открыт ORDER-8', objectsOnly), false);
});

test('data: unknownNames — пары «Имя Фамилия», которых нет среди персонажей, в любом порядке', () => {
  const d = parseData(scan(DATA));
  assert.deepEqual(unknownNames('Анна Петрова и Петрова Анна, Вера Смирнова, Пётр Сидоров и Анна Смирнова, снова Пётр Сидоров', d), [
    'Пётр Сидоров',
    'Анна Смирнова',
  ]);
  assert.deepEqual(unknownNames('«Пётр Сидоров» в кавычках — не имя', d), []);
  assert.deepEqual(unknownNames('Пётр Сидоров', { people: [], objects: new Set(), objNames: new Set() }), []);
  assert.deepEqual(unknownNames('Борис Петров', d), ['Борис Петров']);
  assert.deepEqual(unknownNames('Петрова Мария', d), ['Петрова Мария']);
});

const PROTOCOL = `# Brainstorming — Поиск

Статус: готов

## Решения

| Рекомендация | # | Вопрос | Решение |
|---|---|---|---|
| да | 1 | Нужен ли поиск? | да |
| нет | 3 | Фильтры? | |

## Решения после brainstorming

| # | Решение |
|---|---|
| 7 | подсказки |
| | история |
| П9 | сортировка |

## Снято на ревью

| Когда | Ревью | Где | Что не так | Статус |
|---|---|---|---|---|
| 01.11.2026 | spec | FR-2 | лишнее | снято |

## Вне scope

- голосовой поиск
текст не пункт

\`\`\`
- не пункт: код
\`\`\`
`;

test('protocol: parseProtocol — колонки по названию в любом порядке, номера «после» — П-номера', () => {
  const p = parseProtocol('/x/brainstorming.md', PROTOCOL);
  assert.equal(p.status, 'готов');
  assert.deepEqual(p.rows.map(({ id, q, rec, dec, n, raw }) => ({ id, q, rec, dec, n, raw })), [
    { id: '1', q: 'Нужен ли поиск?', rec: 'да', dec: 'да', n: 9, raw: 'да | 1 | Нужен ли поиск? | да' },
    { id: '3', q: 'Фильтры?', rec: 'нет', dec: '', n: 10, raw: 'нет | 3 | Фильтры? | ' },
  ]);
  assert.deepEqual(p.post, [
    { id: 'П7', dec: 'подсказки', n: 16, raw: '7 | подсказки' },
    { id: 'П2', dec: 'история', n: 17, raw: ' | история' },
    { id: 'П9', dec: 'сортировка', n: 18, raw: 'П9 | сортировка' },
  ]);
  assert.deepEqual(p.dropped, [{ when: '01.11.2026', review: 'spec', where: 'FR-2', what: 'лишнее', status: 'снято', n: 24 }]);
  assert.deepEqual(p.outScope, [{ text: '- голосовой поиск', n: 28 }]);
});

test('protocol: parseProtocol — без колонок «Рекомендация» и «#»: пусто; нет файла — null', () => {
  const p = parseProtocol('/x/b.md', '## Решения\n\n| Вопрос | Решение |\n|---|---|\n| Зачем? | так |\n\n## Решения после brainstorming\n\n| Решение |\n|---|\n| позже |\n');
  assert.deepEqual(p.rows.map(({ id, q, rec, dec }) => ({ id, q, rec, dec })), [{ id: '', q: 'Зачем?', rec: '', dec: 'так' }]);
  assert.deepEqual(p.post.map(({ id, dec }) => ({ id, dec })), [{ id: 'П1', dec: 'позже' }]);
  assert.equal(parseProtocol('/x/b.md', null), null);
});

test('protocol: checkProtocol — PR-02 называет номер строки и ожидаемый, PR-03 — строку без решения', () => {
  const protocol = parseProtocol('/x/brainstorming.md', PROTOCOL);
  const found = checkProtocol({ protocol }).map(({ rule, line, msg }) => ({ rule, line, msg }));
  assert.deepEqual(found, [
    { rule: 'PR-02', line: 10, msg: 'строка 2 таблицы «Решения» имеет номер «3», ожидался 2' },
    { rule: 'PR-03', line: 10, msg: 'статус «готов», а у строки #3 нет решения' },
  ]);
});

test('spec: parseSpec — повторы, ID вне блока, блок с несколькими ID, заголовок без «— Dev Spec»', () => {
  const md = '# Поиск — Dev Spec\n\nСтатус: черновик\n\n```\nFR-1 Поиск\nFR-2 Фильтр\n```\n\n```\nFR-1 Повтор\n```\n\nNFR-3 вне блока\n';
  const s = parseSpec('/x/spec.md', md);
  assert.equal(s.title, 'Поиск');
  assert.deepEqual([...s.reqs.keys()], ['FR-1', 'FR-2']);
  assert.deepEqual(s.dups, [{ id: 'FR-1', n: 11 }]);
  assert.deepEqual(s.multi, [{ n: 5, ids: ['FR-1', 'FR-2'] }]);
  assert.deepEqual(s.outside, [{ id: 'NFR-3', n: 14 }]);
  assert.equal(parseSpec('/x/spec.md', 'без заголовка').title, '');
});

const SLICE = `# 002 — Поиск по названию

Тип: поведение
Основание: FR-1, FR-2

\`\`\`
AC-002-1 [FR-1] Найден товар
Когда покупатель ищет «чайник»
\`\`\`
Проверяет: FR-2

\`\`\`
AC-002-B2 Ответ API
Когда <условие>
\`\`\`

\`\`\`
AC-002-3 Без заготовки в блоке
\`\`\`
Проверяет: <FR-n>

AC-002-9 вне блока
`;

test('slices: parseSlice — ссылки из [ … ] и «Проверяет:», заготовки, ID вне блока, без «Зависимости» — пусто', () => {
  const s = parseSlice('/x/slices/002-search.md', SLICE);
  assert.equal(s.title, 'Поиск по названию');
  assert.equal(s.basisRaw, 'FR-1, FR-2');
  assert.deepEqual(s.deps, []);
  assert.deepEqual(s.acs.map(({ id, side, k, stub, oldRefs, refs }) => ({ id, side, k, stub, oldRefs, refs })), [
    { id: 'AC-002-1', side: '', k: 1, stub: false, oldRefs: ['FR-1'], refs: ['FR-1', 'FR-2'] },
    { id: 'AC-002-B2', side: 'B', k: 2, stub: true, oldRefs: [], refs: [] },
    { id: 'AC-002-3', side: '', k: 3, stub: true, oldRefs: [], refs: [] },
  ]);
  assert.deepEqual(s.outside, [{ id: 'AC-002-9', n: 22 }]);
  const bare = parseSlice('/x/slices/003-x.md', '# 003 — X\n\nЗависимости: 002, 001\n');
  assert.equal(bare.basisRaw, '');
  assert.deepEqual(bare.deps, ['002', '001']);
});

test('data: пустой раздел, таблица объектов и строка без имени сохраняют полную модель', () => {
  for (const md of ['', '## Данные для примеров\n| Объект | Описание |\n|---|---|\n| ITEM-2 | «Чай» |\n- без имени']) {
    const hasObjects = md !== '';
    assert.deepEqual(parseData(scan(md)), {
      people: [], objects: new Set(hasObjects ? ['ITEM-2'] : []), objNames: new Set(hasObjects ? ['Чай'] : []),
    });
  }
});
