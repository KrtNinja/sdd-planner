// Тесты ведения по этапам: выбор фичи скриптом, вопрос вместо тупика у закрытых ворот, строка человеку,
// тема ADR, находка ревью для decide, режим ревью, trace FR → slices и AC, research на любом этапе.
// Запуск из корня репозитория: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LINT = process.env.SDD_LINT || path.join(root, 'skills/sdd-lint/scripts/sdd-lint.mjs');
const GOOD = path.join(root, 'tests/fixtures/good');
const SPEC_OK = 'Статус: одобрено 27.10.2026 · 67e1fb';
const CMD_ENV = { SDD_SKILL_PREFIX: '/', SDD_LINT_CMD: 'node scripts/sdd-lint.mjs' };

function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-guide-test-'));
  fs.cpSync(GOOD, dir, { recursive: true });
  return dir;
}
function run(cwd, ...args) {
  const r = spawnSync('node', [LINT, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...CMD_ENV, TMPDIR: path.join(cwd, '.tmp') } });
  return { code: r.status, out: r.stdout + r.stderr };
}
function edit(cwd, rel, from, to) {
  const f = path.join(cwd, 'docs', rel);
  const s = fs.readFileSync(f, 'utf8');
  assert.ok(s.includes(from), `в ${rel} нет «${from}»`);
  fs.writeFileSync(f, s.replace(from, to));
}
const json = (out) => JSON.parse(out.slice(out.indexOf('{')));
const optionIds = (out) => json(out).questions.flatMap((q) => q.options.map((o) => o.id));
const review = (cwd, key, rows) => {
  const d = path.join(cwd, 'docs/comments/_work/review');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(
    path.join(d, `${key}.md`),
    `# Ревью ${key} — comments\n\nИтог: блокеров ${rows.length}, замечаний 0\n\n| # | Важность | Где | Что не так | Пункт | Предложение | Решение |\n|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`,
  );
};

// ---------- какую фичу брать ----------
test('gate без фичи: подходит одна — берётся сама, со строкой «беру единственную»', () => {
  const cwd = workspace();
  edit(cwd, 'comments/spec.md', SPEC_OK, 'Статус: на ревью');
  const r = run(cwd, 'gate', 'spec');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^Фича не указана — беру единственную, где можно писать Dev Spec: docs\/comments\.\nВОРОТА spec: открыты\.\nФича: docs\/comments/);
});
test('gate без фичи: подходят несколько — вопрос, ответ уходит в тот же gate', () => {
  const cwd = workspace();
  edit(cwd, 'comments/spec.md', SPEC_OK, 'Статус: на ревью');
  fs.cpSync(path.join(cwd, 'docs/comments'), path.join(cwd, 'docs/likes'), { recursive: true });
  const r = run(cwd, 'gate', 'spec');
  assert.equal(r.code, 2);
  assert.deepEqual(optionIds(r.out), ['comments', 'likes']);
  assert.match(json(r.out).instruction, /sdd_lint с args \["gate","spec","<id>"\]/);
  assert.match(json(r.out).text, /^Какую фичу берём — писать Dev Spec\?\n1\. comments — Dev Spec/);
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
  assert.match(r.out, /ВОРОТА spec: закрыты — статус протокола «идёт»\.\nСкажи человеку одной строкой: «Сначала закончите brainstorming: \/sdd-grill comments»\. Затем задай вопрос этапа/);
  assert.ok(optionIds(r.out).includes('here:sdd-grill'));
});
test('ворота build (зона реализации) — по-старому, без вопроса этапа', () => {
  const c = run(workspace(), 'gate', 'build', 'comments');
  assert.equal(c.code, 3);
  assert.match(c.out, /Скажи человеку: «Сначала одобрите slices/);
  assert.doesNotMatch(c.out, /"instruction"/);
});
test('ворота открыты: строка человеку — что будет на этапе и где решает он', () => {
  const cwd = workspace();
  edit(cwd, 'comments/spec.md', SPEC_OK, 'Статус: на ревью');
  assert.match(run(cwd, 'gate', 'spec', 'comments').out, /Скажи человеку одной строкой: «Пишу Dev Spec по docs\/comments: только решения из протокола/);
  assert.match(run(cwd, 'gate', 'decide', 'comments').out, /«Провожу решение по docs\/comments сверху вниз/);
});

// ---------- ADR: тема ----------
test('gate adr без темы: slices ждут ADR (Р1 — ADR: …) — вопрос с этими темами', () => {
  const cwd = workspace();
  edit(cwd, 'comments/slices/002-comments.md', 'Почему отдельно: —', 'Почему отдельно: Р1 — ADR: хранение истории правок');
  const r = run(cwd, 'gate', 'adr', 'comments');
  assert.equal(r.code, 0, r.out);
  const q = json(r.out);
  assert.equal(q.questions[0].options[0].label, 'хранение истории правок (рекомендую)');
  assert.match(q.questions[0].options[0].description, /ждёт slice 002 \(Р1\)/);
  assert.match(q.instruction, /\["gate","adr","docs\/comments","<id>"\]/);
  const t = run(cwd, 'gate', 'adr', 'comments', 'хранение истории правок');
  assert.match(t.out, /Тема: «хранение истории правок» — её ждёт slice 002 \(Р1\)\./);
  assert.match(t.out, /Скажи человеку одной строкой: «ADR по docs\/comments/);
});
test('gate adr без темы и без Р1 — кандидатов ищет сабагент, в окно — только они', () => {
  const r = run(workspace(), 'gate', 'adr', 'comments');
  assert.match(r.out, /Кандидатов найдёт сабагент/);
  assert.match(r.out, /Вызови инструмент sdd_lint с args \["research","fact","docs\/comments","Какие технические решения нужны этой фиче/);
  assert.match(r.out, /Сабагентов нет — тот же вызов сам/);
  assert.doesNotMatch(r.out, /Скажи человеку одной строкой: «ADR/);
});

// ---------- decide: находка ревью ----------
test('gate decide R1: находку находит скрипт, с тем, что на неё завязано', () => {
  const cwd = workspace();
  review(cwd, 'slices', ['| R1 | блокер | slices/002-comments.md, AC-002-B1, FR-2 | лимит не проверен | 3 | добавить AC на 5001 символ |  |']);
  const r = run(cwd, 'gate', 'decide', 'comments', 'R1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Находка R1 — ревью slices, docs\/comments\/_work\/review\/slices\.md:\d+/);
  assert.match(r.out, /Предложение: добавить AC на 5001 символ/);
  assert.match(r.out, /Решение: пусто/);
  assert.match(r.out, /^FR-2 {2}docs\/comments\/spec\.md:\d+/m);
  assert.match(r.out, /^AC-002-B1 {2}docs\/comments\/slices\/002-comments\.md:\d+ {2}проверяет: /m);
});
test('gate decide: нет находки — какие есть; одна и та же в двух ревью — вопрос', () => {
  const cwd = workspace();
  review(cwd, 'slices', ['| R1 | блокер | slices/002-comments.md | а | 1 | б |  |']);
  review(cwd, 'spec', ['| R1 | замечание | spec.md, FR-1 | в | 1 | г |  |']);
  assert.match(run(cwd, 'gate', 'decide', 'comments', 'R9').out, /Находки R9 нет\. Есть: R1 \(slices\), R1 \(spec\)/);
  const r = run(cwd, 'gate', 'decide', 'comments', 'R1');
  assert.deepEqual(optionIds(r.out).sort(), ['slices:R1', 'spec:R1']);
  assert.match(run(cwd, 'gate', 'decide', 'comments', 'spec:R1').out, /Находка R1 — ревью spec/);
});

// ---------- review: режим ----------
test('gate review: режим не назван — ничего не ждёт / одно берётся само / несколько — вопрос', () => {
  let cwd = workspace();
  assert.match(run(cwd, 'gate', 'review', 'comments').out, /Режим: slices/);
  edit(cwd, 'comments/spec.md', SPEC_OK, 'Статус: на ревью');
  const r = run(cwd, 'gate', 'review', 'comments');
  assert.deepEqual(optionIds(r.out), ['spec', 'slices']);
  assert.match(json(r.out).instruction, /\["gate","review","docs\/comments","<id>"\]/);
  assert.match(run(cwd, 'gate', 'review', 'comments', 'adr').out, /Режим: adr 0001/);
  cwd = workspace();
  assert.equal(run(cwd, 'approve', 'slices', 'docs/comments').code, 0);
  assert.match(run(cwd, 'gate', 'review', 'comments').out, /Ревью ничего не ждёт/);
});

// ---------- trace: что держится на требовании ----------
test('trace FR-n: строки протокола, slices из «Основание», AC с файлом и строкой', () => {
  const r = run(workspace(), 'trace', 'comments', 'FR-9');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^FR-9 {2}docs\/comments\/spec\.md:\d+/);
  assert.match(r.out, /протокол: #\d+/);
  assert.match(r.out, /slices \(Основание\): 003/);
  assert.match(r.out, /AC: AC-003-/);
  assert.match(run(workspace(), 'trace', 'comments', 'FR-99').out, /FR-99 {2}— нет в spec\.md/);
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
