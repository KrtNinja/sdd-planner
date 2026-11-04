// Точка входа: stdout и stderr сверяются отдельно, несмотря на отсутствие дочернего процесса в LCOV.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { run } from '../skills/sdd-lint/scripts/sdd-lint/run.mjs';
import { root, LINT, inDir, JSON_ENV } from './helpers.mjs';

test('CLI: help пишет только в stdout, неизвестная команда — только в stderr', () => {
  inDir(root, JSON_ENV, () => {
    for (const [args, fd] of [[['help'], 1], [['unknown-command'], 2]]) {
      const expected = run(args);
      const actual = spawnSync(process.execPath, [LINT, ...args], { cwd: root, encoding: 'utf8' });
      const stream = (n) => expected.chunks.filter(([f]) => f === n).map(([, t]) => t).join('');
      assert.ok(stream(fd).length > 0);
      assert.equal(stream(fd === 1 ? 2 : 1), '');
      assert.deepEqual({ code: actual.status, stdout: actual.stdout, stderr: actual.stderr },
        { code: expected.code, stdout: stream(1), stderr: stream(2) });
    }
  });
});
