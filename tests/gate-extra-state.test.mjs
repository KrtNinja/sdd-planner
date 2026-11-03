// Выбор ADR: вопрос, отсутствие ADR и нормализация явно выбранного номера.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewStep } from '../skills/sdd-lint/scripts/sdd-lint/gate-extra.mjs';
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
