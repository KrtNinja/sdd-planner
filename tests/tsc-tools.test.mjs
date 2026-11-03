// Реальные статусы дочернего компилятора: диагностика типов отдельно от сбоя инструмента.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpDir } from './helpers.mjs';
import { runTsc } from '../tools/metrics/tsc.mjs';

test('tsc: чистый результат и штатные TS-диагностики сохраняются целиком', () => {
  for (const row of ['0|', '1|error TS5023: unknown option', '2|a.mjs(1,1): error TS2322: wrong type']) {
    const [code, output] = row.split('|');
    assert.equal(runTsc(process.execPath, ['-e', `process.stdout.write(${JSON.stringify(output)}); process.exit(${code});`], process.cwd()), output);
  }
});

test('tsc: ненулевой код без диагностики, сигнал и отсутствие исполняемого файла роняют замер', () => {
  const dir = tmpDir('sdd-tsc-');
  try {
    for (const code of [1, 2, 3]) {
      assert.throws(() => runTsc(process.execPath, ['-e', `process.stderr.write('compiler failed'); process.exit(${code});`], dir),
        new RegExp(`tsc: замер не выполнен \\(${code}\\): compiler failed`));
    }
    assert.throws(() => runTsc(path.join(dir, 'missing'), [], dir), /ENOENT/);
    assert.throws(() => runTsc(process.execPath, ['-e', "process.kill(process.pid, 'SIGTERM')"], dir), /SIGTERM/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
