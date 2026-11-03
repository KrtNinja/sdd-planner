// Контекст: границы разделов и фактов проверяются на полной модели через публичную загрузку.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContext } from '../skills/sdd-lint/scripts/sdd-lint/context.mjs';
import { feature } from './helpers.mjs';

test('context: повтор раздела, пустые пункты и код не теряют границы фактов', () => {
  const md = 'Источники: репозиторий\nПроверено: да\nПринято: да\n- вне раздела\n## Данные и объекты\n- A\n-\n* —\n```\n- код\n```\n## Уже решено в задаче\n* B\n## Не удалось прочитать\n- C\n## Данные и объекты\n  - D  \nтекст\n## Пусто';
  const m = feature({ '_work/context.md': md });
  const a = { text: '- A', n: 6 };
  const b = { text: '* B', n: 13 };
  const c = { text: '- C', n: 15 };
  const d = { text: '- D', n: 17 };
  assert.deepEqual(loadContext(m), {
    file: `${m.workDir}/context.md`, md, sources: 'репозиторий', checked: true, accepted: true,
    sections: new Map([['Данные и объекты', [a, d]], ['Уже решено в задаче', [b]], ['Не удалось прочитать', [c]], ['Пусто', []]]),
    facts: 2, filled: true, decided: [b], unread: [c],
  });
  assert.equal(loadContext(feature({})), null);
  const empty = feature({ '_work/context.md': '' });
  assert.deepEqual(loadContext(empty), {
    file: `${empty.workDir}/context.md`, md: '', sources: null, checked: false, accepted: false,
    sections: new Map(), facts: 0, filled: false, decided: [], unread: [],
  });
});
