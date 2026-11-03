// io: буфер или callback, оба потока и код выхода по умолчанию.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIo, Exit } from '../skills/sdd-lint/scripts/sdd-lint/io.mjs';

test('createIo: полный вывод и exit() одинаковы в памяти и с callback', () => {
  for (const callback of [false, true]) {
    const written = [];
    const io = createIo(callback ? (fd, text) => written.push([fd, text]) : undefined);
    io.log('value=%d', 3);
    io.error('ошибка', 'текст');
    io.log();
    const expected = [[1, 'value=3\n'], [2, 'ошибка текст\n'], [1, '\n']];
    assert.deepEqual(io.chunks, callback ? [] : expected);
    assert.deepEqual(written, callback ? expected : []);
    assert.throws(() => io.exit(), (e) => e instanceof Exit && e.name === 'Exit' && e.code === 0 && e.message === 'exit 0');
  }
});
