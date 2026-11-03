// Низкая CC promote: сначала проверяем переход статусов через публичную команду done.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { workspace, file, read, edit, run, SPEC_OK } from './helpers.mjs';

test('done: черновик spec переводится на ревью с slices и без них, повторный вызов не меняет статус', () => {
  for (const withSlices of [false, true]) {
    const cwd = workspace();
    edit(cwd, 'comments/spec.md', SPEC_OK, 'Статус: черновик');
    if (!withSlices) fs.rmSync(file(cwd, 'comments/slices'), { recursive: true });
    else edit(cwd, 'comments/slices/README.md', 'Статус: на ревью', 'Статус: черновик');
    const result = run(cwd, 'done', 'comments');
    assert.equal(result.code, 0, result.out);
    const files = withSlices ? ['comments/slices/README.md', 'comments/spec.md'] : ['comments/spec.md'];
    assert.ok(result.out.includes(`Статус «на ревью»: ${files.map((f) => `docs/${f}`).join(', ')}.`), result.out);
    for (const f of files) assert.match(read(cwd, f), /^Статус: на ревью$/m);
    const before = files.map((f) => read(cwd, f));
    const again = run(cwd, 'done', 'comments');
    assert.equal(again.code, 0, again.out);
    assert.doesNotMatch(again.out, /Статус «на ревью»:/);
    assert.deepEqual(files.map((f) => read(cwd, f)), before);
  }
});
