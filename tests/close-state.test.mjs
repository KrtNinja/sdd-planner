// Закрытие пустого планирования: нет файлов для удаления и единственное предупреждение.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeSummary } from '../skills/sdd-lint/scripts/sdd-lint/close.mjs';
import { feature } from './helpers.mjs';
import { rel } from '../skills/sdd-lint/scripts/sdd-lint/md.mjs';

test('closeSummary: пустая фича — незавершённое планирование без предупреждения о потере файлов', () => {
  const m = feature({});
  assert.deepEqual(closeSummary(m), {
    dir: rel(m.dir), files: [], effects: [], risks: [
      'Планирование не закончено (нет spec.md; частей работы нет): протокол и результаты проверки нужны для доработки; после удаления останутся только в Git.',
    ],
  });
});
