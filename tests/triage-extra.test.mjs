// Отказы triage не меняют ревью; закрытая фича хранит снятие только в ревью, ADR — в «Не выяснено».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { workspace, writeReview, run, read, file } from './helpers.mjs';

const row = '| R1 | блокер | неизвестно | Вопрос | 1 | Уточнить | |';

test('triage: неизвестное действие и неизвестная цель open не меняют файл', () => {
  const cwd = workspace();
  writeReview(cwd, [row]);
  const before = read(cwd, 'comments/_work/review/slices.md');
  for (const [verb, expected] of [
    ['unknown', 'Решение «unknown» не бывает: open, ignore, П<n> или «исправлено».\n'],
    ['open', 'Не понял, в какой файл записать вопрос по R1: в «Где» нет части работы, AC или FR. Куда его записать?\n'],
  ]) {
    assert.deepEqual(run(cwd, 'triage', 'comments', 'slices:R1', verb), { code: 2, out: expected });
    assert.equal(read(cwd, 'comments/_work/review/slices.md'), before);
  }
  assert.deepEqual(run(cwd, 'triage', 'comments', 'slices:R1', 'исправлено'), {
    code: 0, out: 'R1: «Решение» — исправлено (`docs/comments/_work/review/slices.md`).\n',
  });
  assert.ok(read(cwd, 'comments/_work/review/slices.md').includes('| исправлено |'));
});

test('triage: ignore без протокола не создаёт его, open ADR не блокирует одобрение', () => {
  const cwd = workspace();
  fs.rmSync(file(cwd, 'comments/brainstorming.md'));
  writeReview(cwd, [row]);
  assert.deepEqual(run(cwd, 'triage', 'comments', 'slices:R1', 'ignore'), {
    code: 0, out: 'R1 отклонён: «отклонено» в `docs/comments/_work/review/slices.md`.\n',
  });
  assert.equal(fs.existsSync(file(cwd, 'comments/brainstorming.md')), false);
  assert.ok(read(cwd, 'comments/_work/review/slices.md').includes('| отклонено: не исправлять |'));
  writeReview(cwd, [row], 'adr-0001');
  const result = run(cwd, 'triage', 'comments', 'adr-0001:R1', 'open');
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /^R1 → открытый вопрос: `docs\/adr\/0001-mention-notifications.md:\d+` \(«Не выяснено»\)\.\n$/);
  assert.ok(read(cwd, 'adr/0001-mention-notifications.md').includes('- неизвестно: Вопрос. Блокирует ли slices — не решено.'));
  assert.ok(read(cwd, 'comments/_work/review/adr-0001.md').includes('| открытый вопрос |'));
});
