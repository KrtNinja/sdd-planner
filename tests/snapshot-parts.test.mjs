// Защищённые части сравниваются как мультимножества, в порядке старых категорий.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffParts } from '../skills/sdd-lint/scripts/sdd-lint/snapshot.mjs';

test('diffParts: повторы, отсутствующая категория, новые категории и граница сокращения', () => {
  const long = 'a'.repeat(71);
  assert.deepEqual(diffParts({ ID: ['x', 'x', 'y'], текст: ['line\nnext', long, 'b'.repeat(70)], число: ['1'] },
    { ID: ['x', 'z', 'z'], текст: [], extra: ['ignored'] }), [
    'ID — было: x', 'ID — было: y', 'ID — стало: z',
    'текст — было: line ⏎ next', `текст — было: ${'a'.repeat(67)}…`, `текст — было: ${'b'.repeat(70)}`, 'число — было: 1',
  ]);
  assert.deepEqual(diffParts({ ID: ['x', 'y', 'x'] }, { ID: ['y', 'x', 'x'] }), []);
});
