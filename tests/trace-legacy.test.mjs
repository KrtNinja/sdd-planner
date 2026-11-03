// Старый раздел трассировки: точная подсказка миграции и ненулевой код выхода.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { workspace, file, run } from './helpers.mjs';

test('trace: старый раздел требует fix до вывода строк протокола', () => {
  const cwd = workspace();
  fs.appendFileSync(file(cwd, 'comments/spec.md'), '\n## Трассировка\n\n| Протокол | Куда |\n|---|---|\n| 1 | FR-1 |\n');
  const result = run(cwd, 'trace', 'docs/comments');
  assert.equal(result.code, 1);
  assert.equal(result.out, 'В docs/comments/spec.md старый раздел «Трассировка»: `node scripts/sdd-lint.mjs fix docs/comments`\n');
});
