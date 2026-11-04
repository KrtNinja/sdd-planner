// gen links: отсутствующий spec, пустой результат и README создаётся только когда уже существует.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { genLinks, linkSpec, linkSlice } from '../skills/sdd-lint/scripts/sdd-lint/gen-links.mjs';
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

test('linkSpec: старые назначения объединяются по требованиям и разделам, пустые ячейки не теряются', () => {
  const original = ['# Search', '', '```', 'FR-1 Search', '```', '',
    '## Вне scope', 'Нет.', '', '## Открытые вопросы', 'Уточнить.', '', '## Трассировка', '',
    '| Протокол | Куда |', '|---|---|', '| 1 | FR-1 |', '| 2 | FR-1 |', '| 3 | вне scope |',
    '| 4 | вне scope |', '| П1 | открытый вопрос |', '| | |', '| 5 | не про поведение: |', ''].join('\n');
  const m = feature({ 'spec.md': original, 'brainstorming.md': '# Brainstorming\n' });
  const message = linkSpec(m);
  const expected = ['# Search', '', '```', 'FR-1 Search', '```', 'Из протокола: 1, 2', '',
    '## Вне scope', 'Из протокола: 3, 4', '', '## Открытые вопросы', 'Уточнить.', '', 'Из протокола: П1', '',
    '## Не про поведение', '- не про поведение (из протокола: )', '- не про поведение (из протокола: 5)', ''].join('\n');
  assert.equal(fs.readFileSync(m.specFile, 'utf8'), expected);
  assert.ok(message.endsWith('Ссылок на строки протокола: 0. Нет в протоколе: 1, 2, 3, 4, П1, 5 — исправь номер руками.'), message);
});


test('linkSlice: несколько старых ссылок переносятся снизу вверх; существующая строка не дублируется', () => {
  const original = ['# Slice', '```', 'AC-001-B1 [FR-1] Один', '  WHEN запрос', '  THEN ответ', '```',
    '```', 'AC-001-B2 [FR-2] Два', '  WHEN запрос', '  THEN ответ', '```',
    '```', 'AC-001-B3 [FR-1] Три', '  WHEN запрос', '  THEN ответ', '```', 'Проверяет: FR-2', ''].join('\n');
  const m = feature({ 'spec.md': '```\nFR-1 Поиск\n```\n```\nFR-2 Ответ\n```\n', 'slices/001-a.md': original });
  const sl = m.slices.get('001');
  assert.equal(linkSlice(sl, m.spec), 2);
  const expected = ['# Slice', '```', 'AC-001-B1 Один', '  WHEN запрос', '  THEN ответ', '```',
    'Проверяет: [FR-1](../spec.md#L2)', '```', 'AC-001-B2 Два', '  WHEN запрос', '  THEN ответ', '```',
    'Проверяет: [FR-2](../spec.md#L5)', '```', 'AC-001-B3 Три', '  WHEN запрос', '  THEN ответ', '```',
    'Проверяет: [FR-2](../spec.md#L5)', ''].join('\n');
  assert.equal(fs.readFileSync(sl.file, 'utf8'), expected);
  const reloaded = feature({ 'spec.md': m.spec.md, 'slices/001-a.md': expected });
  assert.equal(linkSlice(reloaded.slices.get('001'), reloaded.spec), 0);
  assert.equal(fs.readFileSync(reloaded.slices.get('001').file, 'utf8'), expected);
});
