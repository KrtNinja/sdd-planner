// Тесты ведения по этапам: выбор фичи скриптом, вопрос вместо тупика у закрытых ворот, строка человеку,
// тема ADR, находка ревью для decide, режим ревью, trace FR → slices и AC, research на любом этапе.
// Запуск из корня репозитория: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SPEC_OK, workspace, run, edit, json, optionIds, writeReview } from './helpers.mjs';

// ---------- какую фичу брать ----------
test('gate без фичи: подходит одна — берётся сама, со строкой «беру единственную»', () => {
  const cwd = workspace();
  edit(cwd, 'comments/spec.md', SPEC_OK, 'Статус: на ревью');
  const r = run(cwd, 'gate', 'spec');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^Фича не указана — беру единственную, где можно писать Dev Spec: docs\/comments\.\n\n/);
  assert.match(r.out, /\n⚙ sdd: ворота spec открыты · фича docs\/comments · /);
});
test('gate без фичи: подходят несколько — вопрос, ответ уходит в тот же gate', () => {
  const cwd = workspace();
  edit(cwd, 'comments/spec.md', SPEC_OK, 'Статус: на ревью');
  fs.cpSync(path.join(cwd, 'docs/comments'), path.join(cwd, 'docs/likes'), { recursive: true });
  const r = run(cwd, 'gate', 'spec');
  assert.equal(r.code, 2);
  assert.deepEqual(optionIds(r.out), ['comments', 'likes']);
  assert.match(json(r.out).gear, /^⚙ sdd: вопрос «Фича» → \["gate","spec","<id>"\] · варианты: 1=comments, 2=likes · своими словами — вместо <id>$/);
  assert.match(json(r.out).card, /^Фича не указана\.\n\n\*\*Какую фичу берём — писать Dev Spec\?\*\*\n\n1\. \*\*comments\*\* — Dev Spec/);
});
test('close без фичи: единственная с временными артефактами — сразу вопрос подтверждения', () => {
  const r = run(workspace(), 'close', '--json');
  assert.equal(r.code, 0, r.out);
  assert.ok(optionIds(r.out).length >= 2);
});

// ---------- ворота ----------
test('ворота закрыты: причина, строка человеку и вопрос этапа — что делать сейчас', () => {
  const cwd = workspace();
  fs.rmSync(path.join(cwd, 'docs/comments/slices'), { recursive: true });
  fs.rmSync(path.join(cwd, 'docs/comments/spec.md'));
  edit(cwd, 'comments/brainstorming.md', 'Статус: готов', 'Статус: идёт');
  const r = run(cwd, 'gate', 'spec', 'comments');
  assert.equal(r.code, 3);
  assert.match(json(r.out).card, /^Ворота spec закрыты — статус протокола «идёт»\. Сначала закончите brainstorming: `\/sdd-grill comments`\n\n\*\*/);
  assert.ok(optionIds(r.out).includes('here:sdd-grill'));
});
test('ворота build (зона реализации) — по-старому, без вопроса этапа', () => {
  const c = run(workspace(), 'gate', 'build', 'comments');
  assert.equal(c.code, 3);
  assert.match(c.out, /^Ворота build закрыты — slices не одобрены\. Сначала одобрите slices/);
  assert.match(c.out, /\n\n⚙ sdd: стоп\s*$/);
  assert.doesNotMatch(c.out, /"questions"/);
});
test('ворота открыты: строка человеку — что будет на этапе и где решает он', () => {
  const cwd = workspace();
  edit(cwd, 'comments/spec.md', SPEC_OK, 'Статус: на ревью');
  assert.match(run(cwd, 'gate', 'spec', 'comments').out, /^Пишу Dev Spec по docs\/comments: только решения из протокола/);
  assert.match(run(cwd, 'gate', 'decide', 'comments').out, /^Провожу решение по docs\/comments сверху вниз/);
});

// ---------- ADR: тема ----------
test('gate adr без темы: slices ждут ADR (Р1 — ADR: …) — вопрос с этими темами', () => {
  const cwd = workspace();
  edit(cwd, 'comments/slices/002-comments.md', 'Почему отдельно: —', 'Почему отдельно: Р1 — ADR: хранение истории правок');
  const r = run(cwd, 'gate', 'adr', 'comments');
  assert.equal(r.code, 0, r.out);
  const q = json(r.out);
  assert.equal(q.questions[0].options[0].label, 'хранение истории правок');
  assert.equal(q.questions[0].options[0].recommended, true);
  assert.match(q.card, /^1\. \*\*хранение истории правок\*\* \(рекомендую\) — /m);
  assert.match(q.questions[0].options[0].description, /ждёт slice 002 \(Р1\)/);
  assert.match(q.gear, /→ \["gate","adr","docs\/comments","<id>"\]/);
  const t = run(cwd, 'gate', 'adr', 'comments', 'хранение истории правок');
  assert.match(t.out, /^ADR по docs\/comments/);
  assert.match(t.out, /\n\nТема ADR: «хранение истории правок» — её ждёт slice 002 \(Р1\)\./);
});
test('gate adr без темы и без Р1 — кандидатов ищет сабагент, в окно — только они', () => {
  const r = run(workspace(), 'gate', 'adr', 'comments');
  assert.match(r.out, /^Тема ADR не указана, и slices не ждут ADR\. Ищу в сабагенте/);
  assert.match(r.out, /\n⚙ sdd: сабагент \["research","fact","docs\/comments","Какие технические решения нужны этой фиче/);
  assert.match(r.out, / · без сабагентов — то же здесь\s*$/);
  assert.doesNotMatch(r.out, /^ADR по docs\/comments/m);
});

// ---------- decide: находка ревью ----------
test('gate decide R1: находку находит скрипт, с тем, что на неё завязано', () => {
  const cwd = workspace();
  writeReview(cwd, ['| R1 | блокер | slices/002-comments.md, AC-002-B1, FR-2 | лимит не проверен | 3 | добавить AC на 5001 символ |  |'], 'slices');
  const r = run(cwd, 'gate', 'decide', 'comments', 'R1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^\*\*Находка R1\*\* · ревью slices · `docs\/comments\/_work\/review\/slices\.md:\d+`$/m);
  assert.match(r.out, /^- \*\*Предложение:\*\* добавить AC на 5001 символ$/m);
  assert.match(r.out, /решение в ревью впишешь на шаге «Источник»/);
  assert.match(r.out, /^- \*\*FR-2\*\* `docs\/comments\/spec\.md:\d+`/m);
  assert.match(r.out, /^- \*\*AC-002-B1\*\* `docs\/comments\/slices\/002-comments\.md:\d+` — проверяет: /m);
});
test('gate decide: нет находки — какие есть; одна и та же в двух ревью — вопрос', () => {
  const cwd = workspace();
  writeReview(cwd, ['| R1 | блокер | slices/002-comments.md | а | 1 | б |  |'], 'slices');
  writeReview(cwd, ['| R1 | замечание | spec.md, FR-1 | в | 1 | г |  |'], 'spec');
  assert.match(run(cwd, 'gate', 'decide', 'comments', 'R9').out, /Находки R9 нет\. Есть: R1 \(slices\), R1 \(spec\)/);
  const r = run(cwd, 'gate', 'decide', 'comments', 'R1');
  assert.deepEqual(optionIds(r.out).sort(), ['slices:R1', 'spec:R1']);
  assert.match(run(cwd, 'gate', 'decide', 'comments', 'spec:R1').out, /\*\*Находка R1\*\* · ревью spec/);
});

// ---------- review: режим ----------
test('gate review: режим не назван — ничего не ждёт / одно берётся само / несколько — вопрос', () => {
  let cwd = workspace();
  assert.match(run(cwd, 'gate', 'review', 'comments').out, / · режим slices · /);
  edit(cwd, 'comments/spec.md', SPEC_OK, 'Статус: на ревью');
  const r = run(cwd, 'gate', 'review', 'comments');
  assert.deepEqual(optionIds(r.out), ['spec', 'slices']);
  assert.match(json(r.out).gear, /→ \["gate","review","docs\/comments","<id>"\]/);
  assert.match(run(cwd, 'gate', 'review', 'comments', 'adr').out, / · режим adr 0001 · /);
  cwd = workspace();
  assert.equal(run(cwd, 'approve', 'slices', 'docs/comments').code, 0);
  assert.match(run(cwd, 'gate', 'review', 'comments').out, /Ревью ничего не ждёт/);
});

// ---------- trace: что держится на требовании ----------
test('trace FR-n: строки протокола, slices из «Основание», AC с файлом и строкой', () => {
  const r = run(workspace(), 'trace', 'comments', 'FR-9');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^- \*\*FR-9\*\* `docs\/comments\/spec\.md:\d+`/);
  assert.match(r.out, /^ {2}- протокол: #\d+$/m);
  assert.match(r.out, /^ {2}- slices \(Основание\): 003$/m);
  assert.match(r.out, /^ {2}- AC: AC-003-/m);
  assert.match(run(workspace(), 'trace', 'comments', 'FR-99').out, /\*\*FR-99\*\* — нет в spec\.md/);
});

// ---------- research на любом этапе ----------
test('research fact после slices: этап в задании, источники — папка, если протокола уже нет', () => {
  const cwd = workspace();
  let r = run(cwd, 'research', 'fact', 'comments', 'Какие поля у события task.updated?');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /ведёт этап «slices»/);
  assert.match(r.out, /документы фичи — docs\/comments\/ и docs\/adr\//);
  fs.rmSync(path.join(cwd, 'docs/comments/brainstorming.md'));
  fs.rmSync(path.join(cwd, 'docs/comments/_work'), { recursive: true, force: true });
  r = run(cwd, 'research', 'fact', 'comments', 'Какие поля у события task.updated?');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Где искать: репозиторий;/);
  assert.match(fs.readFileSync(path.join(cwd, 'docs/comments/_work/context.md'), 'utf8'), /^Источники: репозиторий$/m);
});
test('research context на этапе slices: протокол без «Источники:» — изучается папка', () => {
  const cwd = workspace();
  const r = run(cwd, 'research', 'context', 'comments');
  assert.match(r.out, /^- репозиторий — текущая папка целиком$/m);
  assert.match(r.out, /сейчас этап «slices»/);
  assert.match(r.out, /контракты между ними \(API, события, поля\)/);
});
