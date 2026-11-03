// После закрытия протокола research сохраняет задачу по приоритету контекст → заголовок → имя.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repo, run, read } from './helpers.mjs';

test('research: задача без протокола берётся из контекста, spec или имени папки', () => {
  for (const [spec, context, expected] of [
    ['# Поиск — Dev Spec\n', null, '«Поиск»'],
    ['Текст без заголовка\n', null, 'search'],
    [null, null, 'search'],
    ['# Поиск\n', 'Задача: Явный запрос\nИсточники: repo\n', 'Явный запрос'],
    [null, 'Задача: Без spec\n', 'Без spec'],
  ]) {
    const files = { 'docs/search/README.md': '# Search\n' };
    if (spec !== null) files['docs/search/spec.md'] = spec;
    if (context !== null) files['docs/search/_work/context.md'] = context;
    const cwd = repo(files);
    const result = run(cwd, 'research', 'fact', 'docs/search', 'Есть ли поиск?');
    assert.equal(result.code, 0, result.out);
    assert.deepEqual(read(cwd, 'search/_work/context.md').split('\n').filter((l) => l.startsWith('Задача:')), [`Задача: ${expected}`]);
  }
});
