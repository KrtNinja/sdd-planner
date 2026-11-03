// Статус протокола: полная находка, пустой документ и значимые отрицательные случаи.
import { test } from 'node:test';
import { checkProtocol } from '../skills/sdd-lint/scripts/sdd-lint/protocol.mjs';
import { feature } from './helpers.mjs';
import { expectRules } from './rule-examples-helpers.mjs';

test('PR-01: статус отсутствует или пуст; готов, идёт и отсутствующий файл', () => {
  for (const status of ['', 'Статус:', 'Статус: идёт', 'Статус: готов', null]) {
    const m = feature({ 'brainstorming.md': status === null ? null : `# Протокол\n${status}` });
    expectRules(m, checkProtocol(m), ['PR-01'], status === '' || status === 'Статус:'
      ? [['PR-01', 'warn', 'brainstorming.md', 1, 'нет строки «Статус:»']] : []);
  }
});
