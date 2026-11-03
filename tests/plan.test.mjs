// План нарезки (plan.mjs) — разбор и превью напрямую, без CLI: модель и текст превью целиком.
// Тесты написаны под выживших мутантов (шаг 8.2 REFACTORING.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { parsePlan, sharedReqs, compactIds, planPreview, slugify } from '../skills/sdd-lint/scripts/sdd-lint/plan.mjs';

const FILE = path.join(process.cwd(), 'x/plan.md');
const PLAN = `# План нарезки — Поиск

## 001-contracts — Контракты
Основание: контракты
Зависимости: нет
Тип: подготовка

## 002-Поиск — Поиск по названию
**Основание:** FR-1, FR-2, FR-3, NFR-1
Основание: FR-9
Зависимости: 001
Половины:
Результат:
Почему отдельно:

## 003 — Фильтры по цене
Основание: FR-3, FR-5
Зависимости: 002
Половины: catalog + frontend
Результат: фильтр работает
Почему отдельно: P1 — ADR: кэш цен

## Заметки
## 004-x
`;

test('plan: parsePlan — заголовки, первое значение ключа, пустые значения — пусто, не null', () => {
  const p = parsePlan('/x/plan.md', PLAN);
  assert.deepEqual(p.bad, [{ n: 23, text: '## Заметки' }, { n: 24, text: '## 004-x' }]);
  const [a, b, c] = p.slices;
  assert.deepEqual([a.slug, b.slug, c.slug], ['contracts', 'poisk', 'filtry-po-tsene']);
  assert.deepEqual([a.type, b.type, c.type], ['подготовка', 'поведение', 'поведение']);
  assert.deepEqual(b.head, { Основание: 'FR-1, FR-2, FR-3, NFR-1', Зависимости: '001', Половины: '', Результат: '', 'Почему отдельно': '' });
  assert.deepEqual(b.headN, { Основание: 9, Зависимости: 11, Половины: 12, Результат: 13, 'Почему отдельно': 14 });
  assert.deepEqual([b.basisRaw, b.halves, b.result, b.why], ['FR-1, FR-2, FR-3, NFR-1', '', '', '']);
  assert.deepEqual([...b.basis], ['FR-1', 'FR-2', 'FR-3', 'NFR-1']);
  assert.deepEqual([a.basisRaw, a.halves, a.result, a.why], ['контракты', null, null, null]);
  assert.deepEqual([a.deps, b.deps, c.deps], [[], ['001'], ['002']]);
  assert.equal(parsePlan('/x/plan.md', null), null);
});

test('plan: slug — латиница из заголовка, иначе из названия, иначе «slice»', () => {
  const slugs = parsePlan('/x/plan.md', '## 001-Search-Box — X\n## 002 — Корзина\n## 003-!!! — !!!\n').slices.map((s) => s.slug);
  assert.deepEqual(slugs, ['search-box', 'korzina', 'slice']);
  assert.equal(slugify('Очень длинное название slice, которое не влезает в сорок знаков'), 'ochen-dlinnoe-nazvanie-slice-kotoroe-ne');
});

test('plan: sharedReqs — требование в двух slices, кроме подготовки 001', () => {
  const p = parsePlan('/x/plan.md', PLAN);
  assert.deepEqual(sharedReqs(p), [['FR-3', ['002', '003']]]);
  const prep = parsePlan('/x/plan.md', '## 001-a — A\nОснование: FR-1\nТип: подготовка\n## 002-b — B\nОснование: FR-1\n');
  assert.deepEqual(sharedReqs(prep), []);
  const behaviour001 = parsePlan('/x/plan.md', '## 001-a — A\nОснование: FR-1\n## 002-b — B\nОснование: FR-1\n');
  assert.deepEqual(sharedReqs(behaviour001), [['FR-1', ['001', '002']]]);
  const other = parsePlan('/x/plan.md', '## 005-a — A\nОснование: FR-1\nТип: подготовка\n## 006-b — B\nОснование: FR-1\n');
  assert.deepEqual(sharedReqs(other), [['FR-1', ['005', '006']]]);
});

test('plan: compactIds — FR первыми, подряд от трёх — диапазоном', () => {
  assert.equal(compactIds(['NFR-2', 'FR-3', 'FR-1', 'FR-2', 'FR-7', 'FR-8', 'NFR-1', 'AR-1']), 'FR-1…FR-3, FR-7, FR-8, AR-1, NFR-1, NFR-2');
  assert.equal(compactIds(['NFR-1', 'FR-10', 'FR-9', 'FR-11', 'FR-11']), 'FR-9…FR-11, NFR-1');
  assert.equal(compactIds(['NFR-1', 'FR-1']), 'FR-1, NFR-1');
  assert.equal(compactIds(['FR-5']), 'FR-5');
});

const spec = (...ids) => ({ reqs: new Map(ids.map((id) => [id, { id, deleted: id.endsWith('-99') }])) });

test('plan: planPreview — slices, покрытие, общие FR, только NFR, ожидание ADR', () => {
  const plan = parsePlan(FILE, `${PLAN}\n## 005-nfr — Скорость\nОснование: NFR-1\nЗависимости: 003\nПочему отдельно: Р1 — ADR-0002\n`);
  const adrs = [{ num: '0002', status: 'принято 01.11.2026' }];
  const out = planPreview({ plan, spec: spec('FR-1', 'FR-2', 'FR-3', 'FR-5', 'FR-9', 'FR-99', 'NFR-1'), adrs });
  assert.equal(
    out,
    [
      'План нарезки (x/plan.md): 4 slices, порядок 001 → 002 → 003 → 005',
      '',
      '- 001 Контракты — подготовка',
      '  - Половины: —',
      '- 002 Поиск по названию — поведение, после 001',
      '  - Основание: FR-1…FR-3, NFR-1',
      '  - Половины: —',
      '- 003 Фильтры по цене — поведение, после 002',
      '  - Основание: FR-3, FR-5',
      '  - Половины: catalog + frontend',
      '  - Результат: фильтр работает',
      '  - Почему отдельно: Р1 — ADR: кэш цен',
      '- 005 Скорость — поведение, после 003',
      '  - Основание: NFR-1',
      '  - Половины: —',
      '  - Почему отдельно: Р1 — ADR-0002 (ADR-0002 «принято 01.11.2026»)',
      '',
      'Не покрыты: FR-9.',
      '',
      'Обратите внимание:',
      '- FR-3 — в 002 и 003: склеить или описать границу',
      '- NFR-1 — в 002 и 005: склеить или описать границу',
      '- 005 — только NFR: склеить с путём, к которому он относится?',
      '- 003 ждёт ADR «кэш цен» — предложу написать после нарезки',
      '- 005 отделён по Р1, но ADR-0002 уже принят — часть его не ждёт: склеить?',
    ].join('\n'),
  );
});

test('plan: planPreview — всё покрыто; ADR не принят — заметки нет; больше шести slices — заметка', () => {
  const heads = (n) => Array.from({ length: n }, (_, i) => `## 00${i + 1}-s — S${i + 1}\nОснование: FR-${i + 1}\nПочему отдельно: Р2\n`).join('');
  const six = planPreview({ plan: parsePlan('/x/plan.md', heads(6)), spec: spec('FR-1', 'FR-2'), adrs: [] });
  assert.match(six, /Покрыты все 2 требований: FR-1, FR-2\./);
  assert.doesNotMatch(six, /Обратите внимание/);
  const seven = planPreview({ plan: parsePlan('/x/plan.md', heads(7)), spec: null, adrs: [] });
  assert.match(seven, /\n- 7 slices — больше ориентира 3–6$/);
  assert.doesNotMatch(seven, /Покрыты|Не покрыты/);
  const waiting = parsePlan('/x/plan.md', '## 001-a — A\nОснование: FR-1\nПочему отдельно: Р1 — ADR-0003, ADR-0004\n');
  const adrs = [{ num: '0003', status: 'предложено' }];
  assert.doesNotMatch(planPreview({ plan: waiting, spec: null, adrs }), /уже принят/);
  assert.match(planPreview({ plan: waiting, spec: null, adrs }), /ADR-0003 «предложено»\)/);
  const r2 = parsePlan('/x/plan.md', '## 001-a — A\nОснование: FR-1\nПочему отдельно: Р2 — ADR-0003\n');
  assert.doesNotMatch(planPreview({ plan: r2, spec: null, adrs: [{ num: '0003', status: 'принято' }] }), /уже принят/);
});
