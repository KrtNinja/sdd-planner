// Выбор ADR: вопрос, отсутствие ADR и нормализация явно выбранного номера.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewStep, findingStep } from '../skills/sdd-lint/scripts/sdd-lint/gate-extra.mjs';
import { pickText } from '../skills/sdd-lint/scripts/sdd-lint/question.mjs';
import { G, screen } from '../skills/sdd-lint/scripts/sdd-lint/screen.mjs';
import { rel } from '../skills/sdd-lint/scripts/sdd-lint/md.mjs';
import { feature } from './helpers.mjs';

test('reviewStep: ADR отсутствует, неоднозначен или явно выбран', () => {
  const m = feature({});
  assert.deepEqual(reviewStep(m, 'adr'), { stop: true, text: screen('У фичи нет ADR — ревьюить нечего.', G.stop) });
  m.featureAdrs = [{ num: '0001', status: null }, { num: '0002', status: 'проект' }];
  const expected = { stop: true, text: pickText(null, {
    header: 'ADR', question: 'Какой ADR смотрим?', options: [
      { id: 'adr:0001', label: 'ADR 0001', description: '«—»' },
      { id: 'adr:0002', label: 'ADR 0002', description: '«проект»' },
    ],
  }, ['gate', 'review', rel(m.dir), '<id>']) };
  assert.deepEqual(reviewStep(m, 'adr'), expected);
  assert.deepEqual(reviewStep(m, 'adr:99'), expected);
  assert.deepEqual(reviewStep(m, 'adr:2'), { card: null, parts: ['режим adr 0002'], mode: 'adr', num: '0002' });
  m.featureAdrs[0].status = 'принято';
  assert.deepEqual(reviewStep(m, 'adr'), { card: null, parts: ['режим adr 0002'], mode: 'adr', num: '0002' });
  m.featureAdrs = [{ num: '0001', status: 'принято' }];
  assert.deepEqual(reviewStep(m, 'adr'), { card: null, parts: ['режим adr 0001'], mode: 'adr', num: '0001' });
});


test('findingStep: полная карточка без ссылок и с решённой находкой по FR и AC', () => {
  const m = feature({});
  const row = { id: 'R1', n: 8, where: 'Экран', what: 'Неясно поведение', proposal: 'Уточнить', decision: '—' };
  m.reviews.set('spec', { file: m.dir + '/review.md', rows: [row] });
  const head = `**Находка R1** · ревью spec · \`${rel(m.dir)}/review.md:8\``;
  assert.deepEqual(findingStep(m, 'r1'), {
    card: head + '\n\n- **Где:** Экран\n- **Что не так:** Неясно поведение\n- **Предложение:** Уточнить',
    parts: ['находка spec:R1', 'решение в ревью впишешь на шаге «Источник»'],
  });
  row.where = 'FR-1'; row.what = 'Проверить AC-001-B1'; row.decision = 'исправлено';
  assert.deepEqual(findingStep(m, 'spec:R1'), {
    card: head + '\n\n- **Где:** FR-1\n- **Что не так:** Проверить AC-001-B1\n- **Предложение:** Уточнить\n- **Решение уже есть:** «исправлено»' +
      '\n\nЧто на ней держится:\n- **FR-1** — нет в spec.md\n- **AC-001-B1** — нет в slices',
    parts: ['находка spec:R1', 'решение уже есть — спроси человека, менять ли его'],
  });
});
