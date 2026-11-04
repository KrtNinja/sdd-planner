// choose: ошибка вложенного lint сохраняет stderr и стек, а успешный вызов отдаёт только stdout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { cmdChoose } from '../skills/sdd-lint/scripts/sdd-lint/cmd-ask.mjs';
import { createIo, Exit } from '../skills/sdd-lint/scripts/sdd-lint/io.mjs';
import { parseArgs } from '../skills/sdd-lint/scripts/sdd-lint/args.mjs';
import { feature } from './helpers.mjs';

test('choose close:yes: исключения Error и строка, успех и ненулевой код lint', () => {
  const m = feature({ 'brainstorming.md': '# Протокол' });
  const error = new Error('сломано');
  error.stack = 'Error: сломано\n  at lint';
  const cases = [
    [() => { throw error; }, 1, error.stack],
    [() => { throw 'строковая ошибка'; }, 1, 'строковая ошибка'],
    [() => ({ code: 0, chunks: [[1, 'вывод'], [2, 'ошибка']] }), 0, 'вывод'],
    [() => ({ code: 1, chunks: [[1, 'вывод'], [2, 'ошибка']] }), 1, 'выводошибка'],
  ];
  for (const [result, code, text] of cases) {
    const ctx = { args: parseArgs(['choose', m.dir, 'close:yes']), io: createIo(), lint: (args) => {
      assert.deepEqual(args, ['close', path.relative(process.cwd(), m.dir), '--yes']);
      return result();
    } };
    assert.throws(() => cmdChoose(ctx), (e) => e instanceof Exit && e.code === code);
    assert.deepEqual(ctx.io.chunks, [[1, `${text}\n\n⚙ sdd: стоп\n`]]);
  }
});
