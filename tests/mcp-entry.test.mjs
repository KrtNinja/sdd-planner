// Граница MCP: ошибки JSON-RPC, тип args и объединение потоков вывода.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { replyTo, lintOutput } from '../skills/sdd-lint/scripts/sdd-lint/mcp-server.mjs';

const call = (params) => JSON.parse(replyTo(JSON.stringify({ id: 7, method: 'tools/call', params })));
test('MCP: отсутствующие params и неверные falsy args дают точную ошибку', () => {
  for (const params of [undefined, null]) {
    assert.deepEqual(call(params), { jsonrpc: '2.0', id: 7, error: { code: -32602, message: 'Нет инструмента undefined' } });
  }
  for (const value of ['false', '0', '""']) {
    assert.deepEqual(call({ name: 'sdd_lint', arguments: { args: JSON.parse(value) } }),
      { jsonrpc: '2.0', id: 7, error: { code: -32602, message: 'args — массив строк' } });
  }
});

test('MCP: исключения Error и строка возвращаются с кодом 1, окружение восстановлено', (t) => {
  const keys = ['NO_COLOR', 'FORCE_COLOR', 'SDD_VIEW'];
  const saved = keys.map((key) => process.env[key]);
  const error = new Error('ошибка доступа к docs');
  error.stack = 'Error: ошибка доступа к docs\n  at existsSync';
  try {
    for (const [failure, expected] of [[error, error.stack], ['ошибка existsSync', 'ошибка existsSync']]) {
      process.env.NO_COLOR = 'original';
      delete process.env.FORCE_COLOR;
      process.env.SDD_VIEW = 'json';
      const exists = t.mock.method(fs, 'existsSync', (file) => {
        assert.equal(file, 'docs');
        assert.deepEqual(keys.map((key) => process.env[key]), ['1', '0', 'screen']);
        throw failure;
      });
      let result;
      try { result = call({ name: 'sdd_lint', arguments: { args: [] } }); }
      finally { exists.mock.restore(); }
      assert.deepEqual(result, { jsonrpc: '2.0', id: 7, result: {
        content: [{ type: 'text', text: `${expected}\n\n⚙ sdd: код 1` }],
      } });
      assert.deepEqual(keys.map((key) => process.env[key]), ['original', undefined, 'json']);
    }
  } finally {
    keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; });
  }
});

 test('MCP: stdout перед stderr, порядок внутри потоков сохранён', () => {
  for (const row of '2:e,1:a,2:f,1:b|ab~ef\n1:a,1:b|ab\n2:e,2:f|ef\n|'.split('\n')) {
    const [input, expected] = row.split('|');
    const chunks = input ? input.split(',').map((s) => [Number(s[0]), s.slice(2)]) : [];
    assert.equal(lintOutput(chunks), expected.replaceAll('~', '\n'));
  }
});
