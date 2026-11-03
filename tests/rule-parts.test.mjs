// Помощники правил — напрямую, без CLI: разбор ссылок, графы, таблицы ревью, сервисы, ссылки на код, заготовки.
// Тесты написаны под выживших мутантов (шаг 8.3 REFACTORING.md): результат сверяется целиком.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseAdr } from '../skills/sdd-lint/scripts/sdd-lint/adr.mjs';
import { approveCmd } from '../skills/sdd-lint/scripts/sdd-lint/approval.mjs';
import { codeRefs, internalNames } from '../skills/sdd-lint/scripts/sdd-lint/code-refs.mjs';
import { lintCmd } from '../skills/sdd-lint/scripts/sdd-lint/config.mjs';
import { stubLines } from '../skills/sdd-lint/scripts/sdd-lint/cut.mjs';
import { dependencyCycles } from '../skills/sdd-lint/scripts/sdd-lint/graph.mjs';
import { idTypos, fixIdTypos } from '../skills/sdd-lint/scripts/sdd-lint/ids.mjs';
import { reqRefs } from '../skills/sdd-lint/scripts/sdd-lint/links.mjs';
import { rel } from '../skills/sdd-lint/scripts/sdd-lint/md.mjs';
import { sharing, layers } from '../skills/sdd-lint/scripts/sdd-lint/readme.mjs';
import { parseReview, findRow, withDecisions } from '../skills/sdd-lint/scripts/sdd-lint/review.mjs';
import { parseServices, parseHalves, halvesProblem, halvesLine, unknownService } from '../skills/sdd-lint/scripts/sdd-lint/services.mjs';
import { srcRefs, parseSources } from '../skills/sdd-lint/scripts/sdd-lint/sources.mjs';
import { parseSpec } from '../skills/sdd-lint/scripts/sdd-lint/spec.mjs';

// Узлы графа строкой: «002>003 003>002» — 002 зависит от 003, 003 от 002; «001>» — без зависимостей.
const graph = (s) => new Map(s.split(' ').map((x) => x.split('>')).map(([k, d]) => [k, { deps: d ? d.split(',') : [] }]));

test('graph: dependencyCycles — цикл с путём до него; зависимость на себя и на чужой номер — не цикл', () => {
  assert.deepEqual(dependencyCycles(graph('001> 002>003 003>002')), [{ num: '002', path: ['002', '003', '002'] }]);
  assert.deepEqual(dependencyCycles(graph('001>002 002>003 003>001 004>001')), [{ num: '001', path: ['001', '002', '003', '001'] }]);
  assert.deepEqual(dependencyCycles(graph('001>001,009 002>001')), []);
});

test('readme: layers — слои по зависимостям; зависимость на себя и на чужой номер выполнена', () => {
  assert.deepEqual(layers({}, graph('001> 002>001 003>003,009 004>002')), [['001', '003'], ['002'], ['004']]);
  assert.deepEqual(layers({}, graph('001>002 002>001 003>')), [['003'], ['001', '002']]);
});

test('readme: sharing — 001 «подготовка» требование не делит, 001 другого типа делит', () => {
  const m = (type) => ({ slices: new Map([['001', { type }], ['002', { type: 'поведение' }], ['003', { type: null }]]) });
  assert.deepEqual(sharing(m('подготовка'), ['001', '002', '003']), ['002', '003']);
  assert.deepEqual(sharing(m('поведение'), ['001', '002']), ['001', '002']);
  assert.deepEqual(sharing(m(null), ['001']), ['001']);
});

test('ids: idTypos и fixIdTypos — кириллица в AC и ADR, латинская P в «Почему отдельно»', () => {
  const md = 'АС-003-В2 и AC-003-B1, АС-002-?\nАDR-12 и ADR-3\nПочему отдельно: P1 — кэш';
  assert.deepEqual(idTypos(md), [
    { n: 1, from: 'АС-003-В2', to: 'AC-003-B2', why: 'кириллица в ID' },
    { n: 1, from: 'АС-002-?', to: 'AC-002-?', why: 'кириллица в ID' },
    { n: 2, from: 'АDR-12', to: 'ADR-12', why: 'кириллица в ID' },
    { n: 3, from: 'P1', to: 'Р1', why: 'латинская P вместо кириллической Р' },
  ]);
  assert.equal(fixIdTypos(md).md, 'AC-003-B2 и AC-003-B1, AC-002-?\nADR-12 и ADR-3\nПочему отдельно: Р1 — кэш');
  assert.deepEqual(fixIdTypos('AC-003-B1'), { md: 'AC-003-B1', typos: [] });
});

test('links и sources: ссылки «[id](href)» и номера без ссылки', () => {
  assert.deepEqual(reqRefs('[FR-1](../spec.md#L29), NFR-2 и [FR-3]'), [
    { id: 'FR-1', href: '../spec.md#L29' },
    { id: 'NFR-2', href: null },
  ]);
  assert.deepEqual(srcRefs('Из протокола: [4](brainstorming.md#L18), П1, 7'), [
    { id: '4', href: 'brainstorming.md#L18' },
    { id: 'П1', href: null },
    { id: '7', href: null },
  ]);
});

test('sources: parseSources — под блоком требования, в разделе без блока, вне разделов', () => {
  const spec = parseSpec('/x/spec.md', '# X — Dev Spec\n\n## Требования\n\n```\nFR-1  Текст.\n```\nИз протокола: 1\n\n## Вне scope\n\n- экспорт\n  Из протокола: 2\n\n## Цель\n\nИз протокола: 3\n');
  assert.deepEqual(parseSources(spec.sc, spec.reqs), [
    { n: 8, text: 'Из протокола: 1', refs: [{ id: '1', href: null }], target: { kind: 'req', ids: ['FR-1'] } },
    { n: 13, text: '  Из протокола: 2', refs: [{ id: '2', href: null }], target: { kind: 'вне scope' } },
    { n: 17, text: 'Из протокола: 3', refs: [{ id: '3', href: null }], target: null },
  ]);
});

const REVIEW = `# Ревью slices

| # | Важность | Где | Что не так | Решение |
|---|---|---|---|---|
| R1 | блокер | spec | нет пары | |
| R2 | замечание |
`;

test('review: parseReview — таблица с «#» и «Решение» в любых колонках; без них — таблицы нет', () => {
  const rv = parseReview('/r.md', REVIEW);
  assert.equal(rv.decisionCol, 4);
  assert.deepEqual(
    rv.rows.map(({ cells, ...r }) => r),
    [
      { id: 'R1', level: 'блокер', blocker: true, decision: '', where: 'spec', what: 'нет пары', point: '', proposal: '', n: 5 },
      { id: 'R2', level: 'замечание', blocker: false, decision: '', where: '', what: '', point: '', proposal: '', n: 6 },
    ],
  );
  const first = parseReview('/r.md', '| Решение | # |\n|---|---|\n| да | R1 |\n');
  assert.deepEqual([first.table, first.decisionCol, first.rows[0].id, first.rows[0].decision], [true, 0, 'R1', 'да']);
  assert.deepEqual(parseReview('/r.md', '| # | Где |\n|---|---|\n| R1 | x |\n'), { file: '/r.md', md: '| # | Где |\n|---|---|\n| R1 | x |\n', table: false, rows: [] });
  assert.equal(parseReview('/r.md', '| Где | Решение |\n|---|---|\n| x | |\n').table, false);
});

test('review: findRow и withDecisions — строку ищет без регистра, короткую дополняет пустыми ячейками', () => {
  const rv = parseReview('/r.md', REVIEW);
  assert.equal(findRow(null, 'R1'), null);
  assert.equal(findRow(rv, ' r2 ')?.n, 6);
  assert.equal(findRow(rv, 'R9'), null);
  const md = withDecisions(rv, new Map([['R1', 'да | нет'], ['R2', 'исправлено']]));
  assert.equal(md.split('\n').slice(4, 6).join('\n'), '| R1 | блокер | spec | нет пары | да / нет |\n| R2 | замечание |  |  | исправлено |');
});

test('adr: parseAdr — номер из заголовка «# ADR-N», без него — null', () => {
  assert.deepEqual([parseAdr('/a/0012-x.md', '# ADR-12 — Кэш\n').num, parseAdr('/a/0012-x.md', '# ADR-12 — Кэш\n').headNum], ['0012', '12']);
  assert.equal(parseAdr('/a/0012-x.md', '# Кэш\n').headNum, null);
});

test('approval: approveCmd — у ADR номер из имени файла', () => {
  const m = { dir: '/tmp/docs/search' };
  assert.equal(approveCmd(m, { kind: 'adr', file: '/tmp/docs/adr/0007-kesh.md' }), lintCmd('approve', 'adr', rel(m.dir), '0007'));
  assert.equal(approveCmd(m, { kind: 'spec', file: '/tmp/docs/search/spec.md' }), lintCmd('approve', 'spec', rel(m.dir)));
});

const REG = { list: ['tasks-core', 'notify', 'frontend'], from: '«Сервисы:» протокола' };

test('services: parseServices — список имён; имя с пробелом или «один» — реестра нет', () => {
  assert.deepEqual(parseServices('Frontend, tasks-core; notify + billing и auth'), ['frontend', 'tasks-core', 'notify', 'billing', 'auth']);
  assert.equal(parseServices('tasks core, notify'), null);
  assert.equal(parseServices('один сервис'), null);
  assert.equal(parseServices(''), null);
});

test('services: parseHalves и halvesLine — разбор строки «Половины:» и её канонический вид', () => {
  assert.deepEqual(parseHalves('только tasks-core'), { services: ['tasks-core'], bad: [], ok: true });
  assert.deepEqual(parseHalves('tasks-core + frontend, принимаются вместе'), { services: ['tasks-core', 'frontend'], bad: [], ok: true });
  assert.deepEqual(parseHalves(''), { services: [], bad: [], ok: false });
  assert.deepEqual(parseHalves('tasks core + notify'), { services: ['notify'], bad: ['tasks core'], ok: false });
  assert.equal(halvesLine(['tasks-core'], false), 'только tasks-core');
  assert.equal(halvesLine(['tasks-core', 'frontend'], false), 'tasks-core + frontend, принимаются вместе');
  assert.equal(halvesLine(['tasks-core', 'frontend'], true), 'tasks-core + frontend, ревьюят все стороны вместе');
});

test('services: halvesProblem — подсказка по каждому не-имени, неизвестные сервисы, без реестра', () => {
  const p = (raw, reg = REG) => halvesProblem(raw, reg);
  assert.equal(p('tasks-core + notify'), null);
  assert.equal(p(''), '«Половины: » — нет ни одного сервиса');
  assert.equal(p('tasks-core notify'), '«tasks-core notify» — не имя сервиса: разделяй сервисы «+»: «tasks-core + notify»');
  assert.equal(p('tasks core'), '«tasks core» — не имя сервиса: верно «tasks-core»');
  assert.equal(p('notify api'), '«notify api» — не имя сервиса: сервисы — через «+», имена латиницей как в «Сервисы:»');
  assert.equal(p('notfy srv'), '«notfy srv» — не имя сервиса: сервисы — через «+», имена латиницей как в «Сервисы:»');
  assert.equal(p('task core'), '«task core» — не имя сервиса: похоже на «tasks-core»');
  assert.equal(p('tasks core', null), '«tasks core» — не имя сервиса: сервисы — через «+», имена латиницей как в «Сервисы:»');
  assert.equal(p('billing + notify'), '«billing» нет в «Сервисы:» протокола (tasks-core, notify, frontend)');
});

test('services: unknownService — «похоже на» по имени без разделителей или на расстоянии до 2', () => {
  assert.equal(unknownService('notify', REG), null);
  assert.equal(unknownService('x', null), null);
  assert.equal(unknownService('tasks_core', REG), '«tasks_core» нет в «Сервисы:» протокола (tasks-core, notify, frontend); похоже на «tasks-core»');
  assert.equal(unknownService('notifyxx', REG), '«notifyxx» нет в «Сервисы:» протокола (tasks-core, notify, frontend); похоже на «notify»');
  assert.equal(unknownService('notifyxxx', REG), '«notifyxxx» нет в «Сервисы:» протокола (tasks-core, notify, frontend)');
});

test('code-refs: codeRefs — ссылки на код, пути и файлы, вызовы; документы, картинки и аббревиатуры — мимо', () => {
  const refs = (s) => codeRefs(s).map(([rule, x]) => `${rule} ${x}`);
  assert.deepEqual(refs('[a](src/a.ts) [b](lib/x) [c](notes.txt#L5) [d](README.md) [e](pic.png) [f](notes.txt)'), [
    'CD-02 src/a.ts',
    'CD-02 lib/x',
    'CD-02 notes.txt#L5',
  ]);
  assert.deepEqual(refs('см. https://github.com/o/r/blob/main/a.ts и https://github.com/o/r/blob/main/README.md и https://example.com/a.ts'), [
    'CD-02 https://github.com/o/r/blob/main/a.ts',
  ]);
  assert.deepEqual(refs('[x](https://gitlab.com/o/r/-/blob/main/b.go) и [y](https://example.com/b.go)'), ['CD-02 https://gitlab.com/o/r/-/blob/main/b.go']);
  assert.deepEqual(refs('файл domain/errors/TaskErrors.ts, папка contracts/events/, Node.js и «src/a.ts»'), [
    'CD-01 domain/errors/TaskErrors.ts',
    'CD-01 contracts/events/',
  ]);
  assert.deepEqual(refs('вызов service.transfer(dto), create() и ID(уникальный), API (внешний)'), ['CD-03 service.transfer(dto)', 'CD-03 create()']);
});

test('code-refs: internalNames — внутренние имена по суффиксу, кроме уже найденных ссылок и «текстов»', () => {
  assert.deepEqual(internalNames('TaskService зовёт TaskRepository, TaskService снова; «UserController» и src/UserHandler.ts'), ['TaskService', 'TaskRepository']);
});

test('cut: stubLines — соседние заготовки раздела одной группой, строки таблицы и другой раздел — отдельно', () => {
  const md = ['## А', '<имя>', '<роль>', '', '<срок>', '', '', '<цена>', '| <ячейка> |', '| <строка> |', '## Б', '<итог>'].join('\n');
  assert.deepEqual(stubLines(md), [
    { n: 2, items: ['<имя>', '<роль>', '<срок>'] },
    { n: 8, items: ['<цена>'] },
    { n: 9, items: ['<ячейка>'] },
    { n: 10, items: ['<строка>'] },
    { n: 12, items: ['<итог>'] },
  ]);
  assert.deepEqual(stubLines('<!-- <не заготовка> -->\n<да>'), [{ n: 2, items: ['<да>'] }]);
});

test('sources: первая проза снимает привязку к блоку; раздел даёт запасную цель', () => {
  const md = 'Из протокола: 9\n## Открытые вопросы\n```\nFR-1 A\nNFR-2 B\n```\n\nИз протокола: 1\nИз протокола: 2\n## Не про поведение\n```\nне требование\n```\nИз протокола: 3';
  const s = parseSpec('spec.md', md);
  assert.deepEqual(s.sources, [
    { n: 1, text: 'Из протокола: 9', refs: [{ id: '9', href: null }], target: null },
    { n: 8, text: 'Из протокола: 1', refs: [{ id: '1', href: null }], target: { kind: 'req', ids: ['FR-1', 'NFR-2'] } },
    { n: 9, text: 'Из протокола: 2', refs: [{ id: '2', href: null }], target: { kind: 'открытый вопрос' } },
    { n: 14, text: 'Из протокола: 3', refs: [{ id: '3', href: null }], target: { kind: 'не про поведение' } },
  ]);
});
