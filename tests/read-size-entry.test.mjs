// Видимый объём: разметка вне блока и внутри него, граница 10 000.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleLength, checkReadSize } from '../skills/sdd-lint/scripts/sdd-lint/read-size.mjs';
import { feature, brief } from './helpers.mjs';

test('visibleLength: содержимое fenced блока считается буквально', () => {
  assert.equal(visibleLength('```\n**a**\n```\n**b**'), 6);
});

test('readSize: 10 000 разрешено, 10 001 выдаёт точную находку', () => {
  for (const count of [9999, 10000, 10001]) {
    const m = feature({ 'spec.md': 'a'.repeat(count) });
    assert.deepEqual(brief(m, checkReadSize(m)), count === 10001
      ? ['SP-23 spec.md:- 10 001 символов при ориентире 10 000 (без пробелов, ссылок и разметки)'] : []);
  }
});
