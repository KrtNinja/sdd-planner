// Причины отказа ворот: наличие, статус, находки и приоритеты проверяются до разрезания.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateClosed } from '../skills/sdd-lint/scripts/sdd-lint/cmd-check.mjs';
import { feature, inDir, JSON_ENV } from './helpers.mjs';

test('gateClosed: приоритет наличия, статуса и ошибок; неизвестный этап открыт', () => {
  const m = feature({});
  inDir(m.dir, JSON_ENV, () => {
    for (const stage of ['adr', 'decide', 'review', 'slices']) assert.deepEqual(gateClosed(m, stage, []),
      ['нет spec.md', 'Сначала подготовьте требования: `/sdd-spec search`']);
    assert.deepEqual(gateClosed(m, 'spec', []), ['нет brainstorming.md', 'Сначала обсудите задачу: `/sdd-grill search`']);
    m.protocol = { status: null };
    assert.deepEqual(gateClosed(m, 'spec', []), ['статус протокола «—»', 'Сначала закончите обсуждение задачи: `/sdd-grill search`']);
    m.protocol.status = 'готов';
    const found = [{ level: 'err', file: 'brainstorming.md' }];
    assert.deepEqual(gateClosed(m, 'spec', found), ['ошибки в протоколе', `Автоматическая проверка нашла ошибки в протоколе — поправьте его, список: \`node scripts/sdd-lint.mjs ${m.dir}\``]);
    assert.equal(gateClosed(m, 'spec', []), null);
    m.spec = { status: null };
    assert.deepEqual(gateClosed(m, 'slices', []), ['статус требований «—»', `Сначала одобрите spec.md: \`node scripts/sdd-lint.mjs approve spec ${m.dir}\``]);
    m.spec.status = 'одобрено';
    assert.deepEqual(gateClosed(m, 'slices', found), ['ошибки в протоколе или требованиях', `Исправьте ошибки в протоколе или требованиях и одобрите требования заново, список: \`node scripts/sdd-lint.mjs ${m.dir}\``]);
    for (const stage of ['slices', 'adr', 'decide', 'review', 'unknown']) assert.equal(gateClosed(m, stage, []), null);
  });
});
