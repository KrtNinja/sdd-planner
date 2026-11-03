// Каталог правил sdd-lint/rules.mjs против кода и тестов — сверка регулярками по исходникам, без модели.
// 1. У каждого ID из каталога есть проверка в коде, у каждого ID в коде — строка каталога с подсказкой.
// 2. ID выдаёт один модуль; исключения перечислены с причиной.
// 3. Правила без теста — список UNTESTED; он может только сокращаться: написал тест — убери ID из списка.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RULES } from '../skills/sdd-lint/scripts/sdd-lint/rules.mjs';
import { root } from './helpers.mjs';

const SRC = path.join(root, 'skills/sdd-lint/scripts');
const TESTS = path.join(root, 'tests');
const CATALOG = path.join(SRC, 'sdd-lint/rules.mjs');
const CATALOG_IDS = Object.keys(RULES).sort();

const files = (dir, ext) => fs.readdirSync(dir, { recursive: true }).filter((f) => f.endsWith(ext)).map((f) => path.join(dir, f));
// ID в кавычках: 'SP-01'. Списки `ids: [...]` у правил — перечень, а не проверка: их не считаем.
const idsIn = (text) => [...text.replace(/ids:\s*\[[^\]]*\]/g, '').matchAll(/'([A-Z]{2}-\d{2})'/g)].map((m) => m[1]);
const code = files(SRC, '.mjs').filter((f) => f !== CATALOG).map((f) => ({ module: path.basename(f), ids: new Set(idsIn(fs.readFileSync(f, 'utf8'))) }));

// Один ID — из нескольких модулей, и это задумано.
const SHARED = {
  'SL-16': ['ac-rules.mjs', 'slice-rules.mjs'], // «Проверяет:» под AC — правило AC; «Проверяет:» не под блоком — правило slice
  'SL-28': ['links.mjs', 'slice-rules.mjs'], // ссылки на FR в строке «Проверяет:» и README — links.mjs; «Основание» slice — правило slice
  'RV-01': ['cmd-approve.mjs', 'review.mjs'], // approve не одобряет при блокере ревью — та же находка уровнем err
  'HG-01': ['cmd-approve.mjs', 'cmd-guard.mjs'], // approve сверяет защищённые части со снимком, как guard
};

// Правила, которые не упомянуты ни в одном тесте и ни в одном эталоне golden.
const UNTESTED = [
  'SL-01', 'SL-03', 'SL-04',
  'SL-06', 'SL-08', 'SL-09', 'SL-10', 'SL-12', 'SL-21', 'SL-26', 'SP-02', 'SP-04',
];

test('каталог: у каждого ID есть проверка в коде, у каждого ID в коде — строка каталога', () => {
  const inCode = new Set(code.flatMap((x) => [...x.ids]));
  assert.deepEqual(CATALOG_IDS.filter((id) => !inCode.has(id)), [], 'ID в каталоге, но ни один модуль его не выдаёт');
  assert.deepEqual([...inCode].filter((id) => !RULES[id]).sort(), [], 'ID в коде, но нет в каталоге rules.mjs');
});

test('каталог: ID выдаёт один модуль, кроме перечисленных в SHARED', () => {
  const where = (id) => code.filter((x) => x.ids.has(id)).map((x) => x.module).sort();
  for (const id of CATALOG_IDS) {
    if (SHARED[id]) assert.deepEqual(where(id), SHARED[id], `${id}: модули поменялись — поправь SHARED`);
    else assert.ok(where(id).length <= 1, `${id} выдают ${where(id).join(', ')}: одно правило — один модуль, или опиши в SHARED`);
  }
});

test('каталог: правила без теста — ровно список UNTESTED (он только сокращается)', () => {
  const texts = [...files(TESTS, '.test.mjs').filter((f) => !f.endsWith('catalog.test.mjs')), ...files(path.join(TESTS, 'golden'), '.md')]
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');
  const untested = CATALOG_IDS.filter((id) => !texts.includes(id));
  assert.deepEqual(untested.filter((id) => !UNTESTED.includes(id)), [], 'новое правило без теста: напиши тест (caught в sdd-lint.test.mjs)');
  assert.deepEqual(UNTESTED.filter((id) => !untested.includes(id)), [], 'у правила появился тест: убери его ID из UNTESTED');
});
