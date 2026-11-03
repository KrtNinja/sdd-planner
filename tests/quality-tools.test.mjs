// Закрытые цели остаются обязательными даже при старом baseline (274 теста, 27 экспортов).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiredQuality } from '../tools/metrics/quality.mjs';

test('обязательные цели: весь набор тестов и ноль лишних экспортов', () => {
  for (const row of ['359 359 0 ok', '367 367 0 ok', '274 274 0 tests', '359 358 0 tests', '359 359 1 exports']) {
    const [total, pass, unused, result] = row.split(' ');
    const expected = result === 'ok' ? [] : [result === 'tests'
      ? 'тесты: нужны все прошедшие тесты, не меньше 359' : 'экспортов без потребителей должно быть 0'];
    assert.deepEqual(requiredQuality({ tests: { total: +total, pass: +pass }, unusedExports: +unused }), expected);
  }
  assert.deepEqual(requiredQuality({ tests: { total: NaN, pass: NaN }, unusedExports: 0 }, { checkTests: false }), []);
  assert.deepEqual(requiredQuality({ tests: { total: NaN, pass: NaN }, unusedExports: 0 }),
    ['тесты: нужны все прошедшие тесты, не меньше 359']);
});
