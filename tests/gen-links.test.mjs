// gen links: отсутствующий spec, пустой результат и README создаётся только когда уже существует.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { genLinks } from '../skills/sdd-lint/scripts/sdd-lint/gen-links.mjs';
import { createIo, Exit } from '../skills/sdd-lint/scripts/sdd-lint/io.mjs';
import { parseArgs } from '../skills/sdd-lint/scripts/sdd-lint/args.mjs';
import { feature, slice } from './helpers.mjs';

test('genLinks: spec обязателен; без ссылок и slices пустой вывод', () => {
  const ctx = { args: parseArgs(['gen', 'links']), io: createIo() };
  assert.throws(() => genLinks(ctx, feature({})), (e) => e instanceof Exit && e.code === 2);
  assert.ok(ctx.io.chunks.some(([, text]) => text.includes('Нет spec.md')));
  ctx.io.chunks.length = 0;
  genLinks(ctx, feature({ 'spec.md': '# Search\n' }));
  assert.deepEqual(ctx.io.chunks, [[1, '\n']]);
});

test('genLinks: slices без README получают ссылки, новый README не создаётся', () => {
  const m = feature({ 'spec.md': '# Search\n\n```\nFR-1 Search\n```\n', 'slices/001-search.md': slice('001') });
  const ctx = { args: parseArgs(['gen', 'links']), io: createIo() };
  genLinks(ctx, m);
  assert.deepEqual(ctx.io.chunks, [[1, 'slices: «Основание» — ссылка на spec.md, FR в «Проверяет:» — ссылки на их строки.\n']]);
  assert.equal(fs.existsSync(m.readmeFile), false);
  assert.equal(fs.readFileSync([...m.slices.values()][0].file, 'utf8'), slice('001').replace('Основание: FR-1', 'Основание: FR-1 ([Dev Spec](../spec.md))'));
});
