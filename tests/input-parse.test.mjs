// Свободный ввод и опись: полные результаты на границах старого поведения.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classify, titleOf, inventory, parseSourcesAnswer } from '../skills/sdd-lint/scripts/sdd-lint/input.mjs';
import { repo, inDir, JSON_ENV } from './helpers.mjs';

test('input: приоритет фичи, фразы, файла и ссылки', () => {
  const cwd = repo({ 'docs/ready/spec.md': '', 'docs/empty/task.md': '# T', 'task.md': '# Task', 'other.md': '', 'src/x.js': '' });
  const rows = [
    ['', { kind: 'empty', sources: [], missing: [] }],
    ['ready', { kind: 'feature', dir: 'docs/ready', sources: [], missing: [] }],
    ['fresh-name', { kind: 'need-task', slug: 'fresh-name', sources: [], missing: [] }],
    ['ready "другая задача" @task.md', { kind: 'feature', dir: 'docs/ready', sources: ['task.md'], missing: [] }],
    ['docs/empty/task.md', { kind: 'task', slug: null, task: { file: 'docs/empty/task.md' }, sources: [], missing: [] }],
    ['fresh-name "найти товар"', { kind: 'task', slug: 'fresh-name', task: { text: 'найти товар' }, sources: [], missing: [] }],
    ['вот задача @task.md', { kind: 'task', slug: null, task: { file: 'task.md' }, sources: [], missing: [] }],
    ['найти нужный товар @task.md', { kind: 'task', slug: null, task: { text: 'найти нужный товар' }, sources: ['task.md'], missing: [] }],
    ['https://example.test/a', { kind: 'task', slug: null, task: { url: 'https://example.test/a' }, sources: [], missing: [] }],
    ['смотри https://example.test/a', { kind: 'task', slug: null, task: { url: 'https://example.test/a' }, sources: [], missing: [] }],
    ['найти товар https://example.test/a', { kind: 'task', slug: null, task: { text: 'найти товар' }, sources: ['https://example.test/a'], missing: [] }],
    ['@task.md @other.md', { kind: 'need-task', slug: null, task: null, sources: ['task.md', 'other.md'], missing: [] }],
    ['@src/ https://example.test/a', { kind: 'need-task', slug: null, task: null, sources: ['src', 'https://example.test/a'], missing: [] }],
    ['A/B-тест фронт/бэк @missing.md', { kind: 'task', slug: null, task: { text: 'A/B-тест фронт/бэк' }, sources: [], missing: ['missing.md'] }],
  ];
  inDir(cwd, JSON_ENV, () => {
    for (const [raw, expected] of rows) assert.deepEqual(classify(raw), expected, raw);
    assert.deepEqual(classify(null), rows[0][1]);
  });
});

test('input: заголовок берётся из первого предложения, файла или slug и обрезается после 70', () => {
  const cwd = repo({ 'title.md': 'проза\n# заголовок  \n# другой', 'empty.md': 'без заголовка' });
  inDir(cwd, JSON_ENV, () => {
    const rows = [
      [null, 'Fallback'], [{}, 'Fallback'], [{ text: 'первая фраза! Вторая.' }, 'Первая фраза'],
      [{ file: 'title.md' }, 'Заголовок'], [{ file: 'empty.md' }, 'Fallback'], [{ url: 'https://x' }, 'Fallback'],
      [{ text: 'a'.repeat(70) }, 'A' + 'a'.repeat(69)], [{ text: 'a'.repeat(71) }, 'A' + 'a'.repeat(69) + '…'],
      [{ text: 'слово '.repeat(15) }, 'Слово' + ' слово'.repeat(10) + '…'],
    ];
    for (const [task, expected] of rows) assert.equal(titleOf(task, 'fallback'), expected);
  });
});

test('input: ответы об источниках различают найденное, отсутствующее, отказ и повтор', () => {
  inDir(repo({ 'src/a.js': '' }), JSON_ENV, () => {
    const rows = [
      ['репозиторий', { entries: ['репозиторий'], missing: [] }],
      ['нет — новый проект', { entries: ['нет — новый проект'], missing: [] }],
      ['что есть @src/', { entries: ['репозиторий', 'src'], missing: [] }],
      ['нет новый проект', { entries: ['нет — новый проект'], missing: [] }],
      ['@gone.md', { entries: [], missing: ['gone.md'] }],
      ['https://a.test, https://b.test.', { entries: ['https://a.test', 'https://b.test'], missing: [] }],
      ['не нужно', { entries: [], missing: [], none: true }],
      ['дал доступ', { entries: [], missing: [], retry: true }],
      ['', { entries: [], missing: [], unclear: true }],
    ];
    for (const [raw, expected] of rows) assert.deepEqual(parseSourcesAnswer(raw), expected, raw);
  });
});

test('input: опись считает типы, пропускает служебное и не уходит глубже четырёх каталогов', () => {
  const cwd = repo({
    'README.md': '', 'docs/a/spec.md': '', 'docs/b/brainstorming.md': '', 'docs/adr/0001-a.md': '', 'docs/adr/other.md': '',
    'src/README': '', 'src/notes.md': '', 'src/a.js': '', 'src/openapi.yaml': '', 'src/model.proto': '', 'src/plain.txt': '',
    'src/.hidden/a.js': '', 'src/node_modules/a.js': '', 'src/a/b/c/yes.ts': '', 'src/a/b/c/d/no.ts': '',
    '.hidden/a.js': '', 'node_modules/a.js': '', 'empty/no.txt': '', 'root.js': '',
  });
  inDir(cwd, JSON_ENV, () => {
    assert.deepEqual(inventory('a'), {
      items: ['README.md', 'docs/ — фичи: b', 'docs/adr/ — ADR: 1', 'src/ — README: 1, документов: 1, контрактов: 2, файлов кода: 2'],
      code: 4, docs: 5, empty: false,
    });
    fs.symlinkSync('src', 'linked');
    assert.equal(inventory('a').code, 4);
  });
  inDir(repo(), JSON_ENV, () => assert.deepEqual(inventory(), { items: [], code: 0, docs: 0, empty: true }));
});

test('input: опись ограничивает показ восемью строками, но сохраняет полные счётчики', () => {
  const files = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`src${i}/a.js`, '']));
  for (let i = 0; i < 7; i++) files[`docs/f${i}/spec.md`] = '';
  inDir(repo(files), JSON_ENV, () => assert.deepEqual(inventory(), {
    items: ['docs/ — фичи: f0, f1, f2, f3, f4 и ещё 2', ...Array.from({ length: 7 }, (_, i) => `src${i}/ — файлов кода: 1`)],
    code: 10, docs: 7, empty: false,
  }));
});
