// Закрытые цели остаются обязательными даже при старом baseline (274 теста, 27 экспортов).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiredQuality } from '../tools/metrics/quality.mjs';

const zeros = { crapAtLeast10: 0, complexityAtLeast10: 0, eslint: {} };

test('обязательные цели: весь набор тестов и ноль лишних экспортов', () => {
  for (const row of ['359 359 0 ok', '367 367 0 ok', '274 274 0 tests', '359 358 0 tests', '359 359 1 exports']) {
    const [total, pass, unused, result] = row.split(' ');
    const expected = result === 'ok' ? [] : [result === 'tests'
      ? 'тесты: нужны все прошедшие тесты, не меньше 359' : 'экспортов без потребителей должно быть 0'];
    assert.deepEqual(requiredQuality({ ...zeros, tests: { total: +total, pass: +pass }, unusedExports: +unused }), expected);
  }
  assert.deepEqual(requiredQuality({ ...zeros, tests: { total: NaN, pass: NaN }, unusedExports: 0 }, { checkTests: false }), []);
  assert.deepEqual(requiredQuality({ ...zeros, tests: { total: NaN, pass: NaN }, unusedExports: 0 }),
    ['тесты: нужны все прошедшие тесты, не меньше 359']);
});


test('финальные нули сложности обязательны независимо от устаревшего baseline', () => {
  const clean = { ...zeros, tests: { total: 424, pass: 424 }, unusedExports: 0 };
  for (const key of ['crapAtLeast10', 'complexityAtLeast10']) {
    for (const value of [1, undefined, NaN]) {
      assert.deepEqual(requiredQuality({ ...clean, [key]: value }), [`${key}: должно быть 0`]);
    }
  }
  for (const rule of ['complexity', 'max-len', 'no-nested-ternary']) {
    assert.deepEqual(requiredQuality({ ...clean, eslint: { [rule]: 1 } }), [`eslint ${rule}: должно быть 0`]);
  }
  assert.deepEqual(requiredQuality({ ...clean, eslint: { 'max-params': 4 } }), []);
});
