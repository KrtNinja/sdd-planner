// Реальная папка с @ в имени отличается от синтаксиса ссылки @path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { targetFiles } from '../skills/sdd-lint/scripts/sdd-lint/cmd-guard.mjs';
import { createIo } from '../skills/sdd-lint/scripts/sdd-lint/io.mjs';
import { parseArgs } from '../skills/sdd-lint/scripts/sdd-lint/args.mjs';
import { repo, inDir, JSON_ENV } from './helpers.mjs';

test('targetFiles: существующая папка с буквальным @, обычная папка и отдельный файл', () => {
  const cwd = repo({ '@actual/spec.md': '# Spec', 'normal/brainstorming.md': '# Протокол' });
  try {
    inDir(cwd, JSON_ENV, () => {
      const ctx = { args: parseArgs(['snapshot']), io: createIo() };
      assert.deepEqual(targetFiles(ctx, '@actual'), [path.join(cwd, '@actual/spec.md')]);
      assert.deepEqual(targetFiles(ctx, 'normal'), [path.join(cwd, 'normal/brainstorming.md')]);
      assert.deepEqual(targetFiles(ctx, '@actual/spec.md'), [path.join(cwd, '@actual/spec.md')]);
    });
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});
