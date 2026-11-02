// Тесты разбора ревью: блокеры по одному, вопрос о замечаниях, очередь, финал, открытые вопросы перед
// одобрением; решения пишет triage, decide — задача сабагенту; снятое ревьюер не поднимает.
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
const CMD_ENV = { SDD_SKILL_PREFIX: '/', SDD_LINT_CMD: 'node scripts/sdd-lint.mjs', SDD_VIEW: 'json' };

function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-walk-test-'));
  fs.cpSync(GOOD, dir, { recursive: true });
  return dir;
}
function run(cwd, ...args) {
  const r = spawnSync('node', [LINT, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...CMD_ENV, TMPDIR: path.join(cwd, '.tmp') } });
  return { code: r.status, out: r.stdout + r.stderr };
}
const read = (cwd, rel) => fs.readFileSync(path.join(cwd, 'docs', rel), 'utf8');
function edit(cwd, rel, from, to) {
  const s = read(cwd, rel);
  assert.ok(s.includes(from), `в ${rel} нет «${from}»`);
  fs.writeFileSync(path.join(cwd, 'docs', rel), s.replace(from, to));
}
const ask = (cwd) => JSON.parse(run(cwd, 'ask', 'docs/comments').out);
const ids = (a) => a.questions.flatMap((q) => q.options.map((o) => o.id));
const decision = (cwd, id, key = 'slices') => read(cwd, `comments/_work/review/${key}.md`).split('\n').find((l) => l.startsWith(`| ${id} `)).split('|').slice(-2, -1)[0].trim();

const ROWS = [
  '| R1 | замечание | slices/002-comments.md, AC-002-B4 | нет успешного удаления руководителем | 4 | добавить AC |  |',
  '| R2 | блокер | slices/003-mention-notifications.md | не решено, что с уведомлением, если комментарий удалили до доставки | 3 | уведомление не приходит |  |',
  '| R3 | замечание | slices/README.md | порядок работ не объясняет, почему 003 после 002 | 6 | — |  |',
  '| R4 | блокер | slices/002-comments.md, AC-002-B2 | граница длины без пары 5000 / 5001 | 2 | добавить AC на 5001 |  |',
];
function withReview(cwd, rows = ROWS, key = 'slices') {
  const d = path.join(cwd, 'docs/comments/_work/review');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(
    path.join(d, `${key}.md`),
    `# Ревью ${key} — Комментарии\n\nИтог: блокеров 2, замечаний 2\n\n| # | Важность | Где | Что не так | Пункт | Предложение | Решение |\n|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`,
  );
}

test('разбор: блокер — блок находки и «Как решаем?», один вопрос, «Напишу решение» рекомендован первым', () => {
  const cwd = workspace();
  withReview(cwd);
  const a = ask(cwd);
  assert.equal(a.questions.length, 1);
  const q = a.questions[0];
  assert.equal(q.header, 'Блокер R2');
  assert.equal(q.question, 'Как решаем?');
  // Блок находки — списком: так его не склеит ни один markdown, модель его не перепечатывает.
  assert.equal(
    a.preview,
    '**Блокер R2** · ревью slices · блокеров к разбору: 2\n\n- **Где:** `slices/003-mention-notifications.md`\n- **Что не так:** не решено, что с уведомлением, если комментарий удалили до доставки\n- **Предложение:** уведомление не приходит\n- **Пункт чек-листа:** 3',
  );
  assert.deepEqual(
    q.options.map((o) => o.label),
    ['Напишу решение', 'Принимаю рекомендации', 'Затрудняюсь, добавить в открытые вопросы', 'Игнорировать'],
  );
  assert.equal(q.options[0].recommended, true);
  assert.match(a.card, /\n\n\*\*Как решаем\?\*\*\n\n1\. \*\*Напишу решение\*\* \(рекомендую\) — следующим сообщением; проведу через `\/sdd-decide`\n2\. /);
  assert.equal(a.gear, '⚙ sdd: вопрос «Блокер R2» → ["choose","docs/comments","<id>"] · варианты: 1=rv:slices:R2:write, 2=rv:slices:R2:accept, 3=rv:slices:R2:open, 4=rv:slices:R2:ignore');
});

test('разбор: «Напишу решение» ждёт ответ, ответ — /sdd-decide в сабагенте, без сабагентов — здесь', () => {
  const cwd = workspace();
  withReview(cwd);
  const w = run(cwd, 'choose', 'docs/comments', 'rv:slices:R2:write');
  assert.match(w.out, /^Напишите решение по R2 одним сообщением — проведу его через `\/sdd-decide`\.\n\n⚙ sdd: жди ответ → \["choose","docs\/comments","rv:slices:R2:write","<ответ человека>"\]\n$/);
  const r = run(cwd, 'choose', 'docs/comments', 'rv:slices:R2:write', 'Уведомление не приходит');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^Провожу решение по R2 через `\/sdd-decide` в сабагенте/);
  assert.match(
    r.out,
    /\n⚙ sdd: сабагент \["prompt","sdd-decide","comments","slices:R2","Уведомление не приходит","--sub"\] · отчёт сабагента — человеку · затем \["ask","docs\/comments"\] · без сабагентов — вызови \["prompt","sdd-decide","comments","slices:R2","Уведомление не приходит"\]\n$/,
  );
  // --sub: задача сабагенту — тот же скилл, но человеку он вопросов не задаёт.
  const sub = run(cwd, 'prompt', 'sdd-decide', 'comments', 'slices:R2', 'Уведомление не приходит', '--sub');
  assert.match(sub.out, /Ты сабагент: человеку вопросов не задавай/);
  assert.doesNotMatch(run(cwd, 'prompt', 'sdd-decide', 'comments', 'slices:R2', 'да').out, /Ты сабагент/);
  const empty = run(cwd, 'choose', 'docs/comments', 'rv:slices:R2:write', '<ответ человека>');
  assert.match(empty.out, /^Ответа нет\./);
});

test('разбор: «Принимаю рекомендации» — decide «да»; без «Предложения» варианта нет', () => {
  const cwd = workspace();
  withReview(cwd);
  assert.match(run(cwd, 'choose', 'docs/comments', 'rv:slices:R2:accept').out, /\["prompt","sdd-decide","comments","slices:R2","да"\]/);
  withReview(cwd, [ROWS[2].replace('| замечание |', '| блокер |')]);
  assert.ok(!ids(ask(cwd)).includes('rv:slices:R3:accept'));
});

test('разбор: «Затрудняюсь» — вопрос в slice из «Где», «Решение» — открытый вопрос, следующий блокер', () => {
  const cwd = workspace();
  withReview(cwd);
  const r = run(cwd, 'choose', 'docs/comments', 'rv:slices:R2:open');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^R2 → открытый вопрос: `docs\/comments\/slices\/003-mention-notifications\.md:\d+`/);
  assert.match(r.out, /\n\n⚙ sdd: вызови \["ask","docs\/comments"\]\n$/);
  assert.match(read(cwd, 'comments/slices/003-mention-notifications.md'), /## Открытые вопросы к Dev Spec\n- не решено, что с уведомлением, если комментарий удалили до доставки\n/);
  assert.equal(decision(cwd, 'R2'), 'открытый вопрос');
  assert.equal(ask(cwd).questions[0].header, 'Блокер R4');
});

test('разбор: «Игнорировать» — «отклонено», строка в «Снято на ревью», gate review отдаёт её ревьюеру', () => {
  const cwd = workspace();
  withReview(cwd);
  const r = run(cwd, 'choose', 'docs/comments', 'rv:slices:R2:ignore');
  assert.equal(r.code, 0, r.out);
  assert.equal(decision(cwd, 'R2'), 'отклонено: не исправлять');
  const p = read(cwd, 'comments/brainstorming.md');
  assert.match(p, /## Снято на ревью\n[\s\S]*\| Когда \| Ревью \| Где \| Что не так \| Статус \|\n\|---\|---\|---\|---\|---\|\n\| \d\d\.\d\d\.\d{4} \| slices R2 \| slices\/003-mention-notifications\.md \| не решено, что с уведомлением/);
  run(cwd, 'choose', 'docs/comments', 'rv:slices:R4:ignore');
  assert.equal((read(cwd, 'comments/brainstorming.md').match(/## Снято на ревью/g) || []).length, 1);
  assert.equal((read(cwd, 'comments/brainstorming.md').match(/\| slices R\d \|/g) || []).length, 2);
  const g = run(cwd, 'gate', 'review', 'docs/comments', 'slices');
  assert.match(g.out, /Сняты на прошлых ревью — снова не поднимаются:\n- `slices\/003-mention-notifications\.md`: не решено, что с уведомлением, если комментарий удалили до доставки \(slices R2, /);
  assert.doesNotMatch(run(cwd, 'gate', 'review', 'docs/comments', 'spec').out, /Сняты на прошлых ревью/);
  const c = run(cwd, 'check', 'docs/comments', '--json');
  assert.equal(JSON.parse(c.out).findings.filter((f) => f.level === 'err').length, 0, c.out);
});

test('разбор: блокеры решены — «Пройдёмся по замечаниям?» со списком; «по очереди» — очередь «к разбору»', () => {
  const cwd = workspace();
  withReview(cwd);
  run(cwd, 'choose', 'docs/comments', 'rv:slices:R2:ignore');
  run(cwd, 'choose', 'docs/comments', 'rv:slices:R4:ignore');
  let a = ask(cwd);
  assert.equal(a.questions[0].question, 'Пройдёмся по замечаниям?');
  assert.deepEqual(ids(a), ['remarks:slices:all', 'remarks:slices:some', 'remarks:slices:none']);
  assert.match(a.preview, /^\*\*Замечания ревью slices\*\* · 2\n\n- \*\*R1\*\* · `slices\/002-comments\.md`, AC-002-B4 · нет успешного удаления руководителем\n- \*\*R3\*\* · /);
  run(cwd, 'choose', 'docs/comments', 'remarks:slices:all');
  assert.equal(decision(cwd, 'R1'), 'к разбору');
  assert.equal(decision(cwd, 'R3'), 'к разбору');
  a = ask(cwd);
  assert.equal(a.questions[0].header, 'Замечание R1');
  assert.match(a.preview, /^\*\*Замечание R1\*\* · ревью slices · замечаний к разбору: 2\n\n- \*\*Где:\*\* /);
  run(cwd, 'triage', 'docs/comments', 'slices:R1', 'П2');
  assert.equal(ask(cwd).questions[0].header, 'Замечание R3');
});

test('разбор: «Давай только …» — номера словами, остальные сняты; непонятный ответ — переспросить', () => {
  const cwd = workspace();
  withReview(cwd, [ROWS[0], ROWS[2], '| R5 | замечание | spec.md | — | 1 | — |  |']);
  const bad = run(cwd, 'choose', 'docs/comments', 'remarks:slices:some', 'давай R9');
  assert.equal(bad.code, 0, bad.out);
  assert.match(bad.out, /^Не нашёл среди замечаний без решения: R9\. Замечания: R1, R3, R5\./);
  assert.match(bad.out, /\n\nНапишите номера замечаний, которые разберём[^\n]*\n\n⚙ sdd: жди ответ → \["choose","docs\/comments","remarks:slices:some","<ответ человека>"\]\n$/);
  const r = run(cwd, 'choose', 'docs/comments', 'remarks:slices:some', 'только 1 и R5');
  assert.equal(r.code, 0, r.out);
  assert.equal(decision(cwd, 'R1'), 'к разбору');
  assert.equal(decision(cwd, 'R5'), 'к разбору');
  assert.equal(decision(cwd, 'R3'), 'отклонено: не исправлять');
  assert.match(read(cwd, 'comments/brainstorming.md'), /\| slices R3 \|/);
});

test('разбор: «Игнорировать» замечания — все сняты, финал без повтора ревью', () => {
  const cwd = workspace();
  withReview(cwd, [ROWS[0], ROWS[2]]);
  run(cwd, 'choose', 'docs/comments', 'remarks:slices:none');
  const a = ask(cwd);
  assert.deepEqual(ids(a).slice(0, 2), ['approve:slices', 'humanize:slices']);
  assert.ok(!ids(a).includes('review-here:slices'));
});

test('одобрение: открытые вопросы — по одному, ответ — decide в сабагенте, затем снова «Одобрить»', () => {
  const cwd = workspace();
  withReview(cwd, [ROWS[1]]);
  run(cwd, 'choose', 'docs/comments', 'rv:slices:R2:open');
  const a = ask(cwd);
  const approve = a.questions[0].options.find((o) => o.id === 'approve:slices');
  assert.match(approve.description, /^сначала 1 открытый вопрос — по одному, затем/);
  const w = run(cwd, 'choose', 'docs/comments', 'approve:slices');
  assert.match(w.out, /^\*\*Открытый вопрос 1 из 1\*\* · `docs\/comments\/slices\/003-mention-notifications\.md:\d+`\n\n- \*\*Вопрос:\*\* не решено, что с уведомлением/);
  assert.match(w.out, /\n\n\*\*Как решаем\?\*\* Напишите решение одним сообщением\.\n\n⚙ sdd: жди ответ → /);
  assert.match(read(cwd, 'comments/slices/README.md'), /^Статус: на ревью$/m);
  const r = run(cwd, 'choose', 'docs/comments', 'approve:slices', 'Уведомление не приходит');
  assert.match(r.out, /\["prompt","sdd-decide","comments","не решено, что с уведомлением, если комментарий удалили до доставки","Уведомление не приходит","--sub","--note","[^"]*убери его оттуда\."\]/);
  assert.match(r.out, / · затем \["choose","docs\/comments","approve:slices"\] · /);
  // decide закрыл вопрос — «Одобрить» одобряет.
  edit(cwd, 'comments/slices/003-mention-notifications.md', '- не решено, что с уведомлением, если комментарий удалили до доставки', 'Нет.');
  const ok = run(cwd, 'choose', 'docs/comments', 'approve:slices');
  assert.equal(ok.code, 0, ok.out);
  assert.match(read(cwd, 'comments/slices/README.md'), /^Статус: одобрено/m);
});

test('разбор spec: открытый вопрос заменяет «Нет.», «Где» без имени файла; номера R в тексте нет', () => {
  const cwd = workspace();
  edit(cwd, 'comments/spec.md', read(cwd, 'comments/spec.md').match(/^Статус:.*$/m)[0], 'Статус: на ревью');
  withReview(cwd, ['| R1 | блокер | spec.md, FR-3 | не решено, может ли руководитель править чужой комментарий | 5 | нельзя |  |'], 'spec');
  assert.equal(ask(cwd).questions[0].header, 'Блокер R1');
  run(cwd, 'choose', 'docs/comments', 'rv:spec:R1:open');
  assert.match(read(cwd, 'comments/spec.md'), /## Открытые вопросы\n- FR-3: не решено, может ли руководитель править чужой комментарий\n/);
  const c = JSON.parse(run(cwd, 'check', 'docs/comments', '--json').out);
  assert.deepEqual(c.findings.filter((f) => f.level !== 'info').map((f) => f.rule), []);
  const q = ask(cwd).questions[0];
  assert.equal(q.options[1].label, 'Убрать AI стиль из спеки');
});

test('triage: П<n> от decide, неизвестная находка — код 2 со списком', () => {
  const cwd = workspace();
  withReview(cwd);
  assert.equal(run(cwd, 'triage', 'docs/comments', 'slices:R2', 'П3').code, 0);
  assert.equal(decision(cwd, 'R2'), 'П3');
  const bad = run(cwd, 'triage', 'docs/comments', 'slices:R9', 'ignore');
  assert.equal(bad.code, 2);
  assert.match(bad.out, /Находки R9 в `docs\/comments\/_work\/review\/slices\.md` нет\. Есть: R1, R2, R3, R4\./);
  assert.equal(run(cwd, 'triage', 'docs/comments', 'spec:R1', 'ignore').code, 2);
  assert.match(run(cwd, 'help', 'triage').out, /sdd-lint triage docs\/<feature> <ревью> remarks/);
});

test('close: замечание «к разбору» — без решения', () => {
  const cwd = workspace();
  withReview(cwd, [ROWS[0]]);
  run(cwd, 'choose', 'docs/comments', 'remarks:slices:all');
  assert.match(run(cwd, 'close', 'docs/comments').out, /Замечания ревью без решения: R1/);
});
