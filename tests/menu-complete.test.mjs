// Дополнение сохраняет порядок, описания, фильтрацию путей и незаполненные слоты.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { complete } from '../skills/sdd-lint/scripts/sdd-lint/cmd-menu.mjs';
import { repo, inDir, JSON_ENV, workspace, run } from './helpers.mjs';

test('complete: пути, скрытые файлы, неизвестные фичи и флаги', () => {
  const cwd = repo({ 'docs/one/spec.md': '# One\n', 'docs/one/.note.md': '', 'docs/one/skip.txt': '', 'docs/one/extra.md': '' });
  inDir(cwd, JSON_ENV, () => {
    for (const [words, expected] of [
      [['guard', 'docs/one/'], ['docs/one/extra.md', 'docs/one/spec.md']],
      [['guard', 'docs/one/.'], ['docs/one/.note.md']],
      [['check', 'docs/missing/'], []],
      [['approve', 'adr', 'missing', ''], []],
      [['next', 'FR', 'one', ''], []],
      [['next', 'AC', 'missing', ''], []],
      [['next', 'AC', 'one', '001', ''], ['B\tAC серверной части', 'F\tAC пользовательского интерфейса']],
      [['diff', '--base', ''], ['HEAD']],
      [['diff', '--base', 'HEAD', '--'], ['--json', '--base']],
      [['choose', 'missing', ''], []],
    ]) assert.deepEqual(complete(words), expected, words.join(' '));
  });
});

test('menu: закрытая фича не предлагает несуществующий следующий шаг', () => {
  const cwd = workspace();
  const approved = run(cwd, 'approve', 'slices', 'comments');
  assert.equal(approved.code, 0, approved.out);
  const closed = run(cwd, 'close', 'comments', '--yes');
  assert.equal(closed.code, 0, closed.out);
  const menu = run(cwd);
  assert.equal(menu.code, 0, menu.out);
  assert.deepEqual(menu.out.split('\n').filter((l) => l.startsWith('- **comments**')), [
    '- **comments** — Планирование завершено: части работы одобрены, ADR приняты, временные файлы убраны',
  ]);
});
