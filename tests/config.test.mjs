// Настройки GigaCode: пустое переопределение и точные границы подсказки.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skill, lintBase, tipOk, tipLine } from '../skills/sdd-lint/scripts/sdd-lint/config.mjs';
import { inDir, repo } from './helpers.mjs';

test('config: пустой префикс и команда не заменяются значениями по умолчанию', () => {
  inDir(repo(), { SDD_SKILL_PREFIX: '', SDD_LINT_CMD: '' }, () => {
    assert.deepEqual([skill('sdd-grill', 'search'), lintBase()], ['sdd-grill search', '']);
  });
});

test('tipOk: 12 слов включительно, 100 символов исключительно', () => {
  for (const row of 'words 11 true\nwords 12 true\nwords 13 false\nchars 99 true\nchars 100 false\nchars 101 false'.split('\n')) {
    const [kind, n, ok] = row.split(' ');
    const cmd = kind === 'words' ? Array(Number(n)).fill('a').join(' ') : 'a'.repeat(Number(n));
    assert.equal(tipOk(cmd), ok === 'true', row);
    assert.equal(tipLine(cmd), ok === 'true' ? `Tip: Введите ${cmd} чтобы продолжить` : null, row);
  }
});
