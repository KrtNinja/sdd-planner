// Явные примеры отсутствующих в каталоге правил ADR, включая отрицательные случаи.
import { test } from 'node:test';
import path from 'node:path';
import { checkAdrs } from '../skills/sdd-lint/scripts/sdd-lint/adr-rules.mjs';
import { feature } from './helpers.mjs';
import { expectRules } from './rule-examples-helpers.mjs';

const FILE = '../adr/0001-a.md';
const adr = (head = '# ADR-1', status = 'Статус: предложено', sections = []) =>
  [head, 'Фича: search/', ...sections.map((s) => `## ${s}`), status].join('\n');

test('AD-01, AD-02: отсутствующие статус и разделы; пустой статус тоже отсутствует', () => {
  const ids = ['AD-01', 'AD-02'];
  for (const status of ['', 'Статус:']) {
    const m = feature({ [FILE]: adr('# ADR-1', status) });
    expectRules(m, checkAdrs(m), ids, [
      ['AD-01', 'warn', FILE, null, 'нет строки «Статус:»'],
      ...['Контекст', 'Варианты', 'Решение', 'Последствия', 'Не выяснено'].map((s) =>
        ['AD-02', 'err', FILE, null, `нет раздела «${s}»`]),
    ]);
  }
  const valid = feature({ [FILE]: adr('# ADR-1', 'Статус: предложено', ['Контекст', 'Варианты', 'Решение', 'Последствия', 'Не выяснено']) });
  expectRules(valid, checkAdrs(valid), ids, []);
  // Раздел в блоке кода не заменяет настоящий раздел; чужой ADR не проверяется как ADR фичи.
  const code = feature({ [FILE]: adr() + '\n```\n## Контекст\n```', '../adr/0002-other.md': '# ADR-2' });
  expectRules(code, checkAdrs(code), ['AD-02'], ['Контекст', 'Варианты', 'Решение', 'Последствия', 'Не выяснено'].map((s) =>
    ['AD-02', 'err', FILE, null, `нет раздела «${s}»`]));
});

test('AD-09: дубликаты номеров среди всех ADR и несовпадение заголовка только у ADR фичи', () => {
  const m = feature({ [FILE]: adr('# ADR-2'), '../adr/0001-b.md': '# ADR-1\nДругая фича' });
  expectRules(m, checkAdrs(m), ['AD-09'], [
    ['AD-09', 'err', '../adr/0001-b.md', null, `номер 0001 уже у ${path.relative(process.cwd(), path.resolve(m.dir, FILE))}`],
    ['AD-09', 'err', FILE, 1, 'файл 0001, в заголовке ADR-2'],
  ]);
  for (const head of ['# ADR-1', '# ADR-0001', '# Решение']) {
    const valid = feature({ [FILE]: adr(head), '../adr/0002-b.md': '# ADR-99\nДругая фича' });
    expectRules(valid, checkAdrs(valid), ['AD-09'], []);
  }
});

test('AD-10: статус ADR проверяется только при одобренных slices', () => {
  for (const status of [null, 'предложено', 'принято']) {
    for (const slicesStatus of [null, 'на ревью', 'одобрено']) {
      const m = feature({ [FILE]: adr('# ADR-1', status ? `Статус: ${status}` : '') });
      // Контракт checkAdrs после загрузки: статус согласования уже разобран.
      m.slicesStatus = slicesStatus;
      m.featureAdrs[0].status = status;
      expectRules(m, checkAdrs(m), ['AD-10'], slicesStatus === 'одобрено' && status !== 'принято'
        ? [['AD-10', 'warn', FILE, null, `статус «${status || '—'}», части работы уже одобрены`]] : []);
    }
  }
});
