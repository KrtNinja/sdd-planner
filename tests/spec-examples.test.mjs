// Явные находки требований вне блока и пустой спецификации.
import { test } from 'node:test';
import { checkSpec } from '../skills/sdd-lint/scripts/sdd-lint/spec-rules.mjs';
import { feature } from './helpers.mjs';
import { expectRules } from './rule-examples-helpers.mjs';

const FILE = 'spec.md';
const head = '# Spec\nСтатус: черновик\n';
test('SP-02, SP-04: FR/NFR вне блоков не образуют требования; ссылка в прозе не является определением', () => {
  const m = feature({ [FILE]: head + 'FR-1 Поиск\nNFR-1 Ответ\nСм. FR-2.' });
  expectRules(m, checkSpec(m), ['SP-02', 'SP-04'], [
    ['SP-02', 'err', FILE, 3, 'FR-1 вне блока кода'],
    ['SP-02', 'err', FILE, 4, 'NFR-1 вне блока кода'],
    ['SP-04', 'err', FILE, null, 'не найдено ни одного FR/NFR в блоках кода'],
  ]);
  for (const body of ['```\nFR-1 Поиск. Пример: запрос.\n```', '```\nNFR-1 Ответ за 1 с.\n```']) {
    const valid = feature({ [FILE]: head + body });
    expectRules(valid, checkSpec(valid), ['SP-02', 'SP-04'], []);
  }
});

test('SP-04: отсутствие файла отличается от файла без требований и постороннего блока', () => {
  for (const md of [null, head, head + '```\nобычный текст\n```']) {
    const m = feature({ [FILE]: md });
    expectRules(m, checkSpec(m), ['SP-04'], md === null ? []
      : [['SP-04', 'err', FILE, null, 'не найдено ни одного FR/NFR в блоках кода']]);
  }
});
