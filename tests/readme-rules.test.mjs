// README slices (readme-rules, gen readme), план нарезки и ADR — напрямую на короткой фиче, без CLI: находки и текст целиком.
// Тесты написаны под выживших мутантов (шаг 8.3 REFACTORING.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { checkAdrs } from '../skills/sdd-lint/scripts/sdd-lint/adr-rules.mjs';
import { checkPlan } from '../skills/sdd-lint/scripts/sdd-lint/plan-rules.mjs';
import { checkReadme } from '../skills/sdd-lint/scripts/sdd-lint/readme-rules.mjs';
import { genReadme } from '../skills/sdd-lint/scripts/sdd-lint/readme.mjs';
import { feature, brief, slice, SPEC } from './helpers.mjs';

const SLICES = {
  'spec.md': SPEC,
  'slices/001-a.md': slice('001', { type: 'подготовка', basis: 'FR-1' }),
  'slices/002-b.md': slice('002', { basis: 'FR-1, FR-2', deps: '001' }),
  'slices/003-c.md': slice('003', { basis: 'FR-3', deps: '003' }),
};
const table = (head, ...rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---|').join('')}`, ...rows.map((r) => `| ${r.join(' | ')} |`)];
const README = (rows, order = '001 → 002, 003') =>
  [
    '# Поиск — части работы', '', 'Статус: черновик', '',
    ...rows, '',
    '## Покрытие требований',
    ...table(['Требование', 'Slice'], ['[FR-1](../spec.md#L101), см. 003', '001, 002'], ['FR-2', ''], ['FR-3', '003']), '',
    '## Порядок работ', '', order, '',
  ].join('\n');

test('RM-02: строки таблицы, «Покрытие» (номера — только из колонки slices) и «Порядок работ» сверяются со slices', () => {
  const rows = table(['Slice', 'Тип', 'Основание', 'Зависит от'], ['001', 'подготовка', 'FR-1', '—'], ['002', 'поведение', 'FR-1, FR-3', '001'], ['003', 'поведение', 'FR-3', '002']);
  const m = feature({ ...SLICES, 'slices/README.md': README(rows) });
  assert.deepEqual(brief(m, checkReadme(m), ['RM-02']), [
    'RM-02 slices/README.md:8 002: «Основание» в README не совпадает с файлом части работы',
    'RM-02 slices/README.md:9 003: «Зависит от» в README не совпадает с файлом части работы',
    'RM-02 slices/README.md:15 «Покрытие» FR-2: в README —, по «Основание» 002',
  ]);
});

test('RM-02: «Порядок работ» — по первому упоминанию slice; зависимость на себя порядок не нарушает', () => {
  const rows = table(['Slice', 'Тип'], ['001', 'подготовка'], ['002', 'поведение'], ['003', 'поведение']);
  const m = feature({ ...SLICES, 'slices/README.md': README(rows, '002 → 001 → 002, 003') });
  assert.deepEqual(brief(m, checkReadme(m), ['RM-02']).filter((x) => x.includes('Порядок')), ['RM-02 slices/README.md:- «Порядок работ»: 002 раньше своей зависимости 001']);
});

test('RM-02: без колонок «Основание» и «Зависит от» сверять нечего; строки нет — и строка лишняя', () => {
  const rows = table(['Slice', 'Тип'], ['001', 'подготовка'], ['002', 'поведение'], ['004', 'поведение']);
  const m = feature({ ...SLICES, 'slices/README.md': README(rows) });
  assert.deepEqual(brief(m, checkReadme(m), ['RM-02']), [
    'RM-02 slices/README.md:5 в таблице нет части работы 003',
    'RM-02 slices/README.md:9 в таблице есть часть работы 004, но её файла нет',
    'RM-02 slices/README.md:15 «Покрытие» FR-2: в README —, по «Основание» 002',
  ]);
});

const genOf = (m) => {
  genReadme({}, m, true);
  return fs.readFileSync(m.readmeFile, 'utf8');
};

test('gen readme: новый README — заголовок по spec или папке, ADR, «Проверка фичи» по поведенческим slices с FR', () => {
  const files = { ...SLICES, 'slices/003-c.md': slice('003', { basis: 'NFR-1', deps: '002' }) };
  assert.equal(
    genOf(feature(files)),
    [
      '# Поиск — части работы', '', 'Статус: черновик', '', 'Требования: [../spec.md](../spec.md)', '', 'ADR: нет', '',
      '<!-- Таблицу, «Покрытие требований» и «Порядок работ» собирает sdd-lint fix: руками не правь. -->', '',
      ...table(['Slice', 'Тип', 'Стороны', 'Основание', 'Зависит от', 'Почему отдельно'],
        ['[001 Срез 001](001-a.md)', 'подготовка', 'tasks-core + frontend, принимаются вместе', 'FR-1', '—', '—'],
        ['[002 Срез 002](002-b.md)', 'поведение', 'tasks-core + frontend, принимаются вместе', 'FR-1, FR-2', '001', '—'],
        ['[003 Срез 003](003-c.md)', 'поведение', 'tasks-core + frontend, принимаются вместе', 'NFR-1', '002', '—']),
      '', '## Покрытие требований',
      ...table(['Требование', 'Slice'], ['[FR-1](../spec.md#L8)', '001, 002'], ['[FR-2](../spec.md#L13)', '002'], ['[FR-3](../spec.md#L18)', '—'],
        ['[FR-4](../spec.md#L23)', '—'], ['[NFR-1](../spec.md#L28)', '003']),
      '', '## Порядок работ', '001 → 002 → 003', '', 'Через запятую — части работы, которые можно делать параллельно.', '',
      '## Пересечения', 'Нет.', '',
      '## Проверка фичи (после всех slices)', ...table(['Шаг', 'Действие', 'Ожидание', 'Требования'], ['1', '<действие>', '<ожидание>', 'FR-1, FR-2']), '',
    ].join('\n'),
  );
  const noSpec = genOf(feature({ ...files, 'spec.md': null, '../adr/0001-kesh.md': '# ADR-1 — Кэш\n\nslices: search/002\n' }));
  assert.deepEqual(noSpec.split('\n').filter((l) => /^(# |ADR:)/.test(l)), ['# search — части работы', 'ADR: [0001](../../adr/0001-kesh.md)']);
});

test('gen readme: в готовом README таблица slices меняется на месте, остальное не трогается', () => {
  const rows = table(['Slice', 'Тип'], ['001', 'подготовка']);
  const m = feature({ ...SLICES, 'slices/README.md': ['# Поиск — части работы', '', ...rows, '', '## Заметки', '', 'Свой текст.', ''].join('\n') });
  const md = genOf(m).split('\n');
  assert.deepEqual(md.slice(0, 3), ['# Поиск — части работы', '', '| Slice | Тип | Стороны | Основание | Зависит от | Почему отдельно |']);
  assert.deepEqual(md.slice(7, 11), ['', '## Заметки', '', 'Свой текст.']);
});

const PLAN = [
  '# План нарезки — Поиск', '',
  '## 001-contracts — Контракты', 'Основание: FR-1', 'Зависимости: нет', 'Тип: подготовка', '',
  '## 002-poisk — Поиск', 'Тип: поведение', 'Основание: FR-2', 'Зависимости: 009', '',
  '## 002-poisk — Поиск снова', 'Основание: FR-3', 'Зависимости: 001', '',
].join('\n');

test('PL-03, PL-07: повтор номера и slug; находка зависимости — на строке «Зависимости:»', () => {
  const m = feature({ 'spec.md': SPEC, '_work/plan.md': PLAN });
  assert.deepEqual(brief(m, checkPlan(m), ['PL-03', 'PL-07']), [
    'PL-03 _work/plan.md:13 номер «002» уже у «Поиск»',
    'PL-03 _work/plan.md:13 slug «poisk» уже у «Поиск»',
    'PL-07 _work/plan.md:11 002: зависимости 009 в плане нет',
  ]);
});

const adr = (...variants) => ['# ADR-1 — Кэш', '', 'Фича: search/', '', '## Варианты', '', ...variants.flatMap((v) => [`### ${v}`, v === 'A' ? 'Выбран' : 'Отклонён: FR-1', ''])].join('\n');

test('AD-03: двух вариантов достаточно, одного — нет', () => {
  const two = feature({ '../adr/0001-kesh.md': adr('A', 'B') });
  assert.deepEqual(brief(two, checkAdrs(two), ['AD-03']), []);
  const one = feature({ '../adr/0001-kesh.md': adr('A') });
  assert.deepEqual(brief(one, checkAdrs(one), ['AD-03']), ['AD-03 ../adr/0001-kesh.md:- вариантов: 1']);
});

test('gen readme: пустые поля slice получают явные заглушки, заголовок — имя файла', () => {
  const m = feature({ 'slices/001-empty.md': '' });
  const generated = genOf(m);
  assert.deepEqual(generated.split('\n').filter((l) => l.startsWith('| [001 ')), [
    '| [001 001-empty.md](001-empty.md) | — | — | — | — | — |',
  ]);
  assert.ok(generated.includes('## Покрытие требований\n| Требование | Slice |\n|---|---|\n'));
});

test('gen readme: отсутствующая таблица вставляется перед первым H2 или в конец', () => {
  const rows = table(['Slice', 'Тип', 'Стороны', 'Основание', 'Зависит от', 'Почему отдельно'],
    ['[001 Срез 001](001-a.md)', 'поведение', 'tasks-core + frontend, принимаются вместе', 'FR-1', '—', '—']).join('\n');
  for (const [old, prefix] of [
    ['# Existing\n\n## Notes\nkeep\n', `# Existing\n\n${rows}\n\n## Notes\nkeep`],
    ['# Existing\nkeep\n', `# Existing\nkeep\n\n${rows}`],
  ]) {
    const m = feature({ 'slices/001-a.md': slice('001'), 'slices/README.md': old });
    assert.equal(genOf(m), `${prefix}\n\n## Покрытие требований\n| Требование | Slice |\n|---|---|\n| FR-1 | 001 |\n\n` +
      '## Порядок работ\n001\n\nЧерез запятую — части работы, которые можно делать параллельно.\n');
  }
});
