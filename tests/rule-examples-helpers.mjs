// Полная находка выбранных правил: проверяем также уровень и отсутствие лишних полей.
import assert from 'node:assert/strict';
import path from 'node:path';

export function expectRules(m, found, ids, rows) {
  const actual = found.filter((f) => ids.includes(f.rule)).map((f) => ({ ...f, file: path.relative(m.dir, f.file) }));
  const expected = rows.map(([rule, level, file, line, msg]) => ({ rule, level, file, line, msg }));
  assert.deepEqual(actual, expected);
}
