// Выбор места открытого вопроса: приоритет файла, AC, первого FR и ADR.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openTarget } from '../skills/sdd-lint/scripts/sdd-lint/open-questions.mjs';
import { feature } from './helpers.mjs';

test('openTarget: цель целиком и приоритеты ссылок, отсутствующая цель — null', () => {
  const m = feature({ 'spec.md': '', 'slices/001-a.md': 'Основание: FR-1', 'slices/002-b.md': 'Основание: FR-2' });
  m.featureAdrs = [{ num: '0003', file: 'adr/0003.md' }];
  const rows = [
    'spec|||spec', 'slices|001-a.md AC-002-1|FR-2|001', 'slices|FR-2|AC-001-1|001',
    'slices|FR-2 FR-1||002', 'slices||FR-1|', 'slices|AC-999-1 FR-1||', 'slices|FR-99||',
    'adr-0003|||adr', 'adr-9999|||',
  ];
  for (const row of rows) {
    const [key, where, what, target] = row.split('|');
    let expected = null;
    if (target === 'spec') expected = { file: m.specFile, re: /^Открытые вопросы/, title: 'Открытые вопросы' };
    else if (target === 'adr') expected = { file: 'adr/0003.md', re: /^Не выяснено/, title: 'Не выяснено', adr: true };
    else if (target) expected = { file: m.slices.get(target).file, re: /^Открытые вопросы/, title: 'Открытые вопросы к Dev Spec' };
    assert.deepEqual(openTarget(m, key, { where, what }), expected, row);
  }
  assert.equal(openTarget(feature({}), 'spec', { where: '', what: '' }), null);
});
