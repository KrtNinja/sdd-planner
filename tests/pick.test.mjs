// Выбор фичи и подсказки: прямые вызовы, полный результат, границы путей и аргументов.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { inDir, repo, tmpDir, JSON_ENV } from './helpers.mjs';
import { listFeatures, resolveFeature, pickChoice, needDir } from '../skills/sdd-lint/scripts/sdd-lint/pick.mjs';
import { parseArgs } from '../skills/sdd-lint/scripts/sdd-lint/args.mjs';
import { createIo, Exit } from '../skills/sdd-lint/scripts/sdd-lint/io.mjs';

const files = Object.fromEntries(`docs/alpha/spec.md
docs/beta/brainstorming.md
docs/adr/spec.md
docs/plain.txt
docs/alpha/docs/spec.md
outside/note.md`.split('\n').map((f) => [f, '']));

function output(argv, fn) {
  const ctx = { args: parseArgs(argv), io: createIo() };
  assert.throws(() => fn(ctx), (e) => e instanceof Exit && e.code === 2);
  return ctx.io.chunks;
}

test('pick: список исключает adr, файлы и пустые папки; пути выбирают ближайшую фичу', () => {
  const cwd = repo(files);
  fs.mkdirSync(path.join(cwd, 'docs/empty'));
  inDir(cwd, JSON_ENV, () => {
    assert.deepEqual(listFeatures(), ['alpha', 'beta']);
    assert.deepEqual(listFeatures('outside/note.md'), []);
    for (const row of `alpha|docs/alpha
@docs/alpha/|docs/alpha
docs/alpha/spec.md|docs/alpha
docs/alpha/docs|docs/alpha
docs/alpha/docs/spec.md|docs/alpha/docs/spec.md
docs/adr/spec.md|NULL
docs/adr|docs/adr
docs|docs
outside|outside
outside/note.md|NULL
missing|NULL
|NULL`.split('\n')) {
      const [input, expected] = row.split('|');
      assert.equal(resolveFeature(input), expected === 'NULL' ? null : expected, input);
    }
  });
});

const choices = (feature) => `- \`node scripts/sdd-lint.mjs approve spec ${feature}\` — одобрить требования\n` +
  `- \`node scripts/sdd-lint.mjs approve slices ${feature}\` — одобрить части работы\n` +
  `- \`node scripts/sdd-lint.mjs approve adr ${feature}\` — принять ADR\n`;

test('pickChoice: default n, выбранная фича и запасная фича при пропущенном или неверном пути', () => {
  inDir(repo(files), JSON_ENV, () => {
    for (const row of 'bad beta|beta\nbad missing|alpha\nbad|alpha\n|alpha'.split('\n')) {
      const [args, expected] = row.split('|');
      const argv = ['approve', ...args.split(' ').filter(Boolean)];
      const heading = args ? 'Нет варианта «bad» у approve' : 'approve — выбери вариант';
      assert.deepEqual(output(argv, (ctx) => pickChoice(ctx, 'approve')), [[2, `${heading}:\n\n${choices(expected)}`]]);
    }
    assert.deepEqual(output(['approve', '', 'beta'], (ctx) => pickChoice(ctx, 'approve')),
      [[2, `approve — выбери вариант:\n\n${choices('beta')}`]]);
    assert.deepEqual(output(['approve', 'prefix', 'bad', 'beta'], (ctx) => pickChoice(ctx, 'approve', 1)),
      [[2, `Нет варианта «bad» у approve:\n\n${choices('beta')}`]]);
  });
});

test('needDir: подсказка без фичи сохраняет аргументы до неё; соседи исключают adr и файлы', () => {
  inDir(repo(files), JSON_ENV, () => {
    assert.deepEqual(output(['approve', 'spec'], (ctx) => needDir(ctx, undefined)), [[2,
      'Укажите задачу. Задачи в `docs/`:\n\n- `node scripts/sdd-lint.mjs approve alpha`\n- `node scripts/sdd-lint.mjs approve beta`\n']]);
    assert.deepEqual(output([], (ctx) => needDir(ctx, 'docs/missing')), [[2,
      'Нет папки docs/missing. Задачи в docs/: alpha, beta. Новая задача начинается с `/sdd-grill missing`.\n']]);
  });
});

test('resolveFeature: одиночный файл docs не является фичей', () => {
  const cwd = tmpDir();
  fs.writeFileSync(path.join(cwd, 'docs'), '');
  inDir(cwd, JSON_ENV, () => assert.equal(resolveFeature('docs'), null));
});
