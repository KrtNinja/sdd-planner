// Пометка правки сохраняется целиком, включая первый символ совпадения.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEditMarks } from '../skills/sdd-lint/scripts/sdd-lint/edit-marks.mjs';
import { feature, brief } from './helpers.mjs';

test('editMarks: сообщение содержит совпадение целиком', () => {
  const m = feature({ 'spec.md': '# Поиск\nдобавлен после ревью\n' });
  assert.deepEqual(brief(m, checkEditMarks(m)), ['SP-22 spec.md:2 «добавлен после ревью» — пометка правки']);
});
