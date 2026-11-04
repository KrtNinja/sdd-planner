// Реальная папка с @ в имени отличается от синтаксиса ссылки @path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { targetFiles } from '../skills/sdd-lint/scripts/sdd-lint/cmd-guard.mjs';
import { createIo, Exit } from '../skills/sdd-lint/scripts/sdd-lint/io.mjs';
import { parseArgs } from '../skills/sdd-lint/scripts/sdd-lint/args.mjs';
import { repo, inDir, JSON_ENV } from './helpers.mjs';

test('targetFiles: существующая папка с буквальным @, обычная папка и отдельный файл', () => {
  const cwd = repo({ '@actual/spec.md': '# Spec', 'normal/brainstorming.md': '# Протокол', 'docs/search/spec.md': '# Spec' });
  try {
    inDir(cwd, JSON_ENV, () => {
      const ctx = { args: parseArgs(['snapshot']), io: createIo() };
      assert.deepEqual(targetFiles(ctx, '@actual'), [path.join(cwd, '@actual/spec.md')]);
      assert.deepEqual(targetFiles(ctx, 'search'), [path.join(cwd, 'docs/search/spec.md')]);
      assert.throws(() => targetFiles(ctx, 'missing'), (e) => e instanceof Exit && e.code === 2);
      assert.deepEqual(ctx.io.chunks, [[2, 'Нет файла или папки missing\nСправка: `node scripts/sdd-lint.mjs help snapshot`\n']]);
      assert.deepEqual(targetFiles(ctx, 'normal'), [path.join(cwd, 'normal/brainstorming.md')]);
      assert.deepEqual(targetFiles(ctx, '@actual/spec.md'), [path.join(cwd, '@actual/spec.md')]);
    });
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});
