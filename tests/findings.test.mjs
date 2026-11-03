// Отчёт: порядок, счётчики, подсказки и полный текст/JSON через io в памяти.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { report, noStatus } from '../skills/sdd-lint/scripts/sdd-lint/findings.mjs';
import { parseArgs } from '../skills/sdd-lint/scripts/sdd-lint/args.mjs';
import { createIo } from '../skills/sdd-lint/scripts/sdd-lint/io.mjs';
import { inDir, repo, JSON_ENV } from './helpers.mjs';

const HINTS = {
  'SP-03': 'у каждого требования свой номер: новое пиши как FR-? — номер поставит `sdd-lint fix docs/<feature>`',
  'SP-01': 'добавь строку «Статус: черновик | на ревью | одобрено <дата>» под заголовком',
  'SP-07': 'открытые вопросы закрываются через `/sdd-decide` до одобрения',
};
const rows = (text) => text.split('\n').map((s) => {
  const [rule, level, file, n, msg] = s.split(' ');
  return { rule, level, file, line: n === '-' ? null : Number(n), msg };
});
const INPUT = `SP-07 info a.md 1 вопрос
SP-01 warn a.md 2 статус
SP-03 err b.md 1 b
SP-03 err a.md 3 три
SP-03 err a.md - без
SP-03 err a.md 1 один`;
const SORTED = `SP-03 err a.md - без
SP-03 err a.md 1 один
SP-03 err a.md 3 три
SP-03 err b.md 1 b
SP-01 warn a.md 2 статус
SP-07 info a.md 1 вопрос`;
const TEXT = `- **ОШИБКА** \`SP-03\` \`a.md\` — без
- **ОШИБКА** \`SP-03\` \`a.md:1\` — один
- **ОШИБКА** \`SP-03\` \`a.md:3\` — три
- **ОШИБКА** \`SP-03\` \`b.md:1\` — b
- **ВНИМАНИЕ** \`SP-01\` \`a.md:2\` — статус
- **ИНФО** \`SP-07\` \`a.md:1\` — вопрос

Как исправить:
- \`SP-01\` — ${HINTS['SP-01']}
- \`SP-03\` — ${HINTS['SP-03']}
`;

test('report: сортировка на месте по уровню, файлу и строке; перестановки входа не меняют результат', () => {
  inDir(repo(), JSON_ENV, () => {
    for (const mode of ['', '--json']) {
      const ctx = { args: parseArgs(mode ? [mode] : []), io: createIo() };
      for (let shift = 0; shift < rows(INPUT).length; shift++) {
        const input = rows(INPUT);
        const found = [...input.slice(shift), ...input.slice(0, shift)];
        const counts = { err: 4, warn: 1, info: 1 };
        assert.deepEqual(report(ctx, found, { stage: 'spec' }), counts);
        assert.deepEqual(found, rows(SORTED));
        const expected = mode ? JSON.stringify({ findings: rows(SORTED), hints: HINTS, counts, stage: 'spec' }, null, 2) + '\n' : TEXT;
        assert.equal(ctx.io.chunks.map(([, text]) => text).join(''), expected);
        assert.ok(ctx.io.chunks.every(([fd]) => fd === 1));
        ctx.io.chunks.length = 0;
      }
    }
  });
});

test('noStatus: отсутствующий статус по умолчанию на строке 1', () => {
  for (const status of [undefined, null, '']) {
    assert.deepEqual(noStatus('SP-01', 'spec.md', status),
      [{ rule: 'SP-01', level: 'warn', file: 'spec.md', line: 1, msg: 'нет строки «Статус:»' }]);
  }
  assert.deepEqual(noStatus('SP-01', 'spec.md', 'черновик'), []);
});
