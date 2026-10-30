// Тесты нарезки: план → проверка → согласие → файлы скриптом → done; правдивость Р1–Р3, сервисы,
// кириллица в ID, заготовки; fallback, если MCP-сервер lint не отвечает.
// Запуск из корня репозитория: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LINT = process.env.SDD_LINT || path.join(root, 'skills/sdd-lint/scripts/sdd-lint.mjs');
const GOOD = path.join(root, 'tests/fixtures/good');
const CMD_ENV = { SDD_SKILL_PREFIX: '/', SDD_LINT_CMD: 'node scripts/sdd-lint.mjs' };

function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-plan-test-'));
  fs.cpSync(GOOD, dir, { recursive: true });
  return dir;
}
function run(cwd, ...args) {
  const r = spawnSync('node', [LINT, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...CMD_ENV, TMPDIR: path.join(cwd, '.tmp') } });
  return { code: r.status, out: r.stdout + r.stderr };
}
const check = (cwd) => JSON.parse(run(cwd, 'check', 'docs/comments', '--json').out);
const rules = (res) => res.findings.map((f) => f.rule);
const file = (cwd, rel) => path.join(cwd, 'docs', rel);
const read = (cwd, rel) => fs.readFileSync(file(cwd, rel), 'utf8');
function edit(cwd, rel, from, to) {
  const s = read(cwd, rel);
  assert.ok(s.includes(from), `в ${rel} нет «${from}»`);
  fs.writeFileSync(file(cwd, rel), s.replace(from, to));
}
function caught(rule, rel, from, to, msg) {
  test(`${rule}: ${rel} — «${from.slice(0, 40)}»`, () => {
    const cwd = workspace();
    edit(cwd, rel, from, to);
    const res = check(cwd);
    const hit = res.findings.filter((f) => f.rule === rule);
    assert.ok(hit.length, `ожидалось ${rule}, получено: ${rules(res).join(', ') || 'ничего'}`);
    if (msg) assert.ok(hit.some((f) => msg.test(f.msg)), hit.map((f) => f.msg).join('\n'));
  });
}
const S002 = 'comments/slices/002-comments.md';
const S003 = 'comments/slices/003-mention-notifications.md';

// ---------- кириллица в ID ----------
caught('SL-31', S003, 'AC-003-B2 Сбой доставки', 'AC-003-В2 Сбой доставки', /кириллица в ID; верно «AC-003-B2»/);
caught('SL-31', S003, 'Почему отдельно: Р1 — ждёт', 'Почему отдельно: P1 — ждёт', /латинская P/);
test('SL-31: AC с кириллической буквой не пропадает из проверок и export', () => {
  const cwd = workspace();
  edit(cwd, S003, 'AC-003-B2 Сбой доставки', 'AC-003-В2 Сбой доставки');
  const res = check(cwd);
  assert.ok(!rules(res).includes('SL-19'), 'NFR-3 по-прежнему проверяет AC-003-B2');
});
test('fix: кириллицу в ID и в заготовке заменяет латиницей, заготовку нумерует', () => {
  const cwd = workspace();
  edit(cwd, S003, 'AC-003-B2 Сбой доставки', 'АС-003-В? Сбой доставки');
  edit(cwd, S003, 'Почему отдельно: Р1 — ждёт', 'Почему отдельно: P1 — ждёт');
  const r = run(cwd, 'fix', 'docs/comments');
  assert.match(r.out, /АС-003-В\? → AC-003-B\?/);
  assert.match(read(cwd, S003), /^AC-003-B2 Сбой доставки$/m);
  assert.match(read(cwd, S003), /^Почему отдельно: Р1 — ждёт/m);
  assert.ok(!rules(check(cwd)).includes('SL-31'));
});

// ---------- сервисы ----------
caught('SL-32', S003, 'Половины: tasks-core + notify-service + frontend, принимаются вместе', 'Половины: tasks-core и notify service, фронтенд', /не имя сервиса/);
caught('SL-33', S003, '## Notify-service-половина', '## Notify-servise-половина', /похоже на «notify-service»/);
caught('SL-33', S002, 'Половины: tasks-core + frontend', 'Половины: task-core + frontend', /нет в «Сервисы:» протокола/);
test('export: сервисы — те же, что проверил lint', () => {
  const cwd = workspace();
  edit(cwd, S003, 'Половины: tasks-core + notify-service + frontend, принимаются вместе', 'Половины: только notify-service');
  const e = JSON.parse(run(cwd, 'export', 'docs/comments').out);
  assert.deepEqual(e.slices.find((s) => s.num === '003').services, ['notify-service', 'frontend']);
});

// ---------- правдивость причин и лазейки перенарезки ----------
caught('SL-34', S003, 'ждёт ADR-0001', 'ждёт ADR-0002', /ADR-0002 нет в docs\/adr/);
caught('SL-35', S003, 'Почему отдельно: Р1 — ждёт ADR-0001 и подключения notify-service к доставке событий', 'Почему отдельно: Р2 — много AC', /не больше \d AC/);
caught('SL-38', S003, 'Р1 — ждёт ADR-0001 и подключения notify-service к доставке событий', 'Р1 — ADR: дедупликация уведомлений', /ADR-0001 уже затрагивает slice 003: впиши «Р1 — ждёт ADR-0001»/);
const PREP = `# 004 — Подготовка индекса

Тип: подготовка

Основание: NFR-2

Зависимости: 001

Половины: только tasks-core

Результат: подсказки упоминаний готовы к нагрузке

Почему отдельно: —

## Границы
- Вне slice: подсказки (002).

## Открытые вопросы к Dev Spec
Нет.
`;
test('SL-02: «подготовка» без причины — тоже лишний slice; из одних NFR — кандидат С3', () => {
  const cwd = workspace();
  fs.writeFileSync(file(cwd, 'comments/slices/004-index.md'), PREP);
  run(cwd, 'gen', 'readme', 'docs/comments');
  const res = check(cwd);
  for (const r of ['SL-02', 'SL-36', 'RM-03']) assert.ok(rules(res).includes(r), `${r}: ${rules(res).join(', ')}`);
});

// ---------- план нарезки ----------
const PLAN = `# План нарезки — Комментарии

## 001-contracts — Контракты
Основание: контракты для всех FR и NFR
Зависимости: нет
Половины: tasks-core + notify-service + frontend
Результат: контракты лежат у владельцев
Почему отдельно: —

## 002-comments — Комментарии в задаче
Основание: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, NFR-1, NFR-2
Зависимости: 001
Половины: tasks-core + frontend
Результат: участники обсуждают задачу в карточке
Почему отдельно: —

## 003-mention-notifications — Уведомления об упоминаниях
Основание: FR-8, FR-9, FR-10, NFR-3
Зависимости: 001, 002
Половины: tasks-core + notify-service + frontend
Результат: упомянутый получает уведомление в колокольчике
Почему отдельно: P1 — ждёт ADR-0001
`;
// Фича до нарезки: spec одобрен, slices нет, ADR предложен.
function planWorkspace(plan = PLAN) {
  const cwd = workspace();
  fs.rmSync(file(cwd, 'comments/slices'), { recursive: true });
  edit(cwd, 'adr/0001-mention-notifications.md', /^Статус:.*$/m.exec(read(cwd, 'adr/0001-mention-notifications.md'))[0], 'Статус: предложено');
  if (plan) {
    fs.mkdirSync(file(cwd, 'comments/slices'), { recursive: true });
    fs.writeFileSync(file(cwd, 'comments/slices/plan.md'), plan);
  }
  return cwd;
}
const ask = (cwd) => JSON.parse(run(cwd, 'ask', 'docs/comments').out);
const ids = (a) => a.questions.flatMap((q) => q.options.map((o) => o.id));

test('gate slices: путь фичи из любого вида аргумента и бриф для нарезки', () => {
  const cwd = planWorkspace(null);
  const r = run(cwd, 'gate', 'slices', '@docs/comments/');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^Фича: docs\/comments$/m);
  assert.match(r.out, /^ {2}FR-10 {2}Уведомление может прийти с задержкой/m);
  assert.match(r.out, /^Сервисы: frontend, tasks-core, notify-service/m);
  assert.match(r.out, /ADR фичи \(прочитай\): docs\/adr\/0001-mention-notifications\.md «предложено»/);
  assert.match(r.out, /^Сейчас: плана нет — начни с него: docs\/comments\/slices\/plan\.md\.$/m);
});
test('plan: чистый план — без ошибок, латинская P в причине не ошибка', () => {
  const r = run(planWorkspace(), 'plan', 'docs/comments');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /План без ошибок: 3 slices\./);
  assert.match(r.out, /sdd_lint \["ask","docs\/comments"\]/);
});
test('plan: покрытие, причины, зависимости, сервисы — ошибки с номером строки; лимит прогонов', () => {
  const bad = PLAN.replace('FR-9, FR-10, NFR-3', 'FR-9, FR-10')
    .replace('Почему отдельно: P1 — ждёт ADR-0001', 'Почему отдельно: отдельная задача')
    .replace('Зависимости: 001, 002', 'Зависимости: 001, 007')
    .replace('Половины: tasks-core + frontend', 'Половины: tasks-core + notify service');
  const cwd = planWorkspace(bad);
  let r = run(cwd, 'plan', 'docs/comments');
  assert.equal(r.code, 1);
  for (const x of ['PL-04', 'PL-06', 'PL-07', 'PL-08']) assert.match(r.out, new RegExp(x));
  assert.match(r.out, /не покрыты: NFR-3/);
  assert.match(r.out, /«notify service» — не имя сервиса: верно «notify-service»/);
  assert.match(r.out, /прогон 1 из 3/);
  run(cwd, 'plan', 'docs/comments');
  r = run(cwd, 'plan', 'docs/comments');
  assert.match(r.out, /не ушли за 3 прогона\. Покажи человеку список/);
});
test('plan: Р1 по принятому ADR, требование в двух slices, slice из NFR, больше 6 — предупреждения', () => {
  const extra = [4, 5, 6, 7].map((n) => `\n## 00${n}-part-${n} — Часть ${n}\nОснование: NFR-2\nЗависимости: 002\nПоловины: только tasks-core\nРезультат: часть ${n}\nПочему отдельно: Р3 — раньше\n`).join('');
  const cwd = planWorkspace(PLAN + extra);
  edit(cwd, 'adr/0001-mention-notifications.md', 'Статус: предложено', 'Статус: принято');
  run(cwd, 'approve', 'adr', 'docs/comments', '0001');
  const r = run(cwd, 'plan', 'docs/comments');
  for (const x of ['PL-09', 'PL-10', 'PL-11', 'PL-12']) assert.match(r.out, new RegExp(x), r.out);
  assert.match(r.out, /ADR-0001 уже «принято/);
});
test('ask: план — человеку списком до вопроса, «Да» рекомендовано, других вопросов нет', () => {
  const a = ask(planWorkspace());
  assert.equal(a.stage, 'План нарезки ждёт согласия (docs/comments/slices/plan.md)');
  assert.match(a.instruction, /^Сначала выведи preview дословно/);
  assert.match(a.preview, /^- 003 Уведомления об упоминаниях — поведение, после 001, 002$/m);
  assert.match(a.preview, /Основание: FR-1…FR-7, NFR-1, NFR-2/);
  assert.match(a.preview, /Почему отдельно: Р1 — ждёт ADR-0001 \(ADR-0001 «предложено»\)/);
  assert.match(a.preview, /Покрыты все 13 требований/);
  assert.deepEqual(ids(a), ['plan:yes', 'plan:edit']);
  assert.equal(a.questions[0].options[0].label, 'Да, создать файлы slices (рекомендую)');
  assert.match(a.questions[0].options[0].description, /создаст 3 файла/);
});
test('choose plan:yes — файлы по плану с заготовками, README, план удалён; дальше — заполнить', () => {
  const cwd = planWorkspace();
  const r = run(cwd, 'choose', 'docs/comments', 'plan:yes');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Созданы по плану в docs\/comments\/slices\/: 001-contracts\.md, 002-comments\.md, 003-mention-notifications\.md/);
  assert.match(r.out, /продолжай нарезку с шага «Заполни заготовки»/);
  assert.ok(!fs.existsSync(file(cwd, 'comments/slices/plan.md')));
  const s3 = read(cwd, S003);
  assert.match(s3, /^Половины: tasks-core \+ notify-service \+ frontend, принимаются вместе$/m);
  assert.match(s3, /^Почему отдельно: Р1 — ждёт ADR-0001$/m);
  for (const h of ['## Общая приёмка (собранное приложение)', '## Tasks-core-половина', '## Notify-service-половина', '## Frontend-половина']) assert.ok(s3.includes(h), h);
  assert.match(s3, /^AC-003-B\? <имя>$/m);
  assert.match(s3, /^- Все AC-003-\* закрыты тестами: в названии теста — ссылка comments\/AC-ID$/m);
  assert.match(read(cwd, 'comments/slices/001-contracts.md'), /^Половины: tasks-core \+ notify-service \+ frontend, ревьюят все стороны вместе$/m);
  const readme = read(cwd, 'comments/slices/README.md');
  assert.match(readme, /^Статус: черновик$/m);
  assert.match(readme, /^Сервисы: frontend, tasks-core, notify-service$/m);
  assert.match(readme, /^\| 2 \| <действие> \| <ожидание> \| FR-8, FR-9, FR-10 \|$/m);
  const res = check(cwd);
  assert.ok(rules(res).includes('SL-37'));
  assert.ok(!rules(res).some((x) => ['SL-07', 'SL-14', 'SL-16', 'SL-19'].includes(x)), `заготовки не дают шума: ${rules(res).join(', ')}`);
  const a = ask(cwd);
  assert.match(a.stage, /^Slices созданы по плану, заготовок «<…>» не заполнено: \d+$/);
  assert.deepEqual(ids(a), ['here:sdd-slices', 'window:sdd-slices']);
});
test('gen slices: не создаёт файлы, если в плане ошибки или slices уже есть', () => {
  let cwd = planWorkspace(PLAN.replace('FR-9, FR-10, NFR-3', 'FR-9, FR-10'));
  let r = run(cwd, 'gen', 'slices', 'docs/comments');
  assert.equal(r.code, 1);
  assert.match(r.out, /Файлы не созданы: в плане ошибки/);
  assert.ok(!fs.existsSync(file(cwd, 'comments/slices/002-comments.md')));
  assert.deepEqual(ids(ask(cwd)), ['plan:continue', 'plan:edit']);
  cwd = workspace();
  fs.writeFileSync(file(cwd, 'comments/slices/plan.md'), PLAN);
  r = run(cwd, 'gen', 'slices', 'docs/comments');
  assert.equal(r.code, 1);
  assert.match(r.out, /уже есть файлы slices/);
  assert.ok(rules(check(cwd)).includes('PL-13'));
});

// ---------- done ----------
test('done: заполненные slices — номера, «на ревью», снимок и вопрос этапа', () => {
  const cwd = workspace();
  edit(cwd, 'comments/slices/README.md', 'Статус: на ревью', 'Статус: черновик');
  edit(cwd, S002, 'AC-002-B6 Скорость', 'AC-002-B? Скорость');
  const r = run(cwd, 'done', 'docs/comments');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /AC-002-B\? → AC-002-B6/);
  assert.match(r.out, /Этап готов: ошибок 0, предупреждений 0\. Статус «на ревью»: docs\/comments\/slices\/README\.md\./);
  const json = JSON.parse(r.out.slice(r.out.indexOf('{')));
  assert.equal(json.stage, 'Slices на ревью');
  assert.match(read(cwd, 'comments/slices/README.md'), /^Статус: на ревью$/m);
  assert.ok(fs.readdirSync(path.join(cwd, '.tmp', 'sdd-lint-snapshots')).length > 0);
});
test('done: ошибки — исправить и снова done; предупреждения — один проход, потом человеку', () => {
  const cwd = workspace();
  edit(cwd, S002, 'Проверяет: [FR-1](../spec.md#L29)\n', '');
  let r = run(cwd, 'done', 'docs/comments');
  assert.equal(r.code, 1);
  assert.match(r.out, /Не готово: ошибок \d+\. Исправь их и снова sdd_lint \["done","docs\/comments"\] — прогон 1 из 3\./);
  edit(cwd, S002, 'AC-002-B1 Кто комментирует\n  WHEN Дина', 'AC-002-B1 Кто комментирует\n  WHEN Олег Ким');
  fs.writeFileSync(file(cwd, S002), read(cwd, S002).replace('```\n\n```\nAC-002-B2', '```\nПроверяет: FR-1\n\n```\nAC-002-B2'));
  r = run(cwd, 'done', 'docs/comments');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /ошибок нет, предупреждений 1\. Исправь те, что можно без решения человека/);
  r = run(cwd, 'done', 'docs/comments');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Скажи человеку, что осталось:\n {2}SL-24/);
});

// ---------- fallback: MCP-сервер не отвечает ----------
const BLOCK = 'Нет `sdd_lint` или он не отвечает — остановись и задай вопрос из «Если sdd_lint не отвечает» в правилах планирования. Скрипт для вариантов 2 и 3 — `../sdd-lint/scripts/sdd-lint.mjs` от папки этого скилла.';
test('скиллы: один и тот же блок про sdd_lint, вызовы — в форме sdd_lint [...]', () => {
  for (const d of fs.readdirSync(path.join(root, 'skills')).filter((x) => x.startsWith('sdd-'))) {
    const md = fs.readFileSync(path.join(root, 'skills', d, 'SKILL.md'), 'utf8');
    assert.ok(md.includes(BLOCK), `${d}: нет блока про недоступный sdd_lint`);
    assert.ok(!md.includes('<скрипт>'), `${d}: старая запись <скрипт>`);
    assert.ok(!/node <папка этого скилла>/.test(md), `${d}: молчаливый обход MCP`);
  }
});
test('правила: при недоступном sdd_lint — вопрос с тремя вариантами, этап без lint не выполняется', () => {
  const md = fs.readFileSync(path.join(root, 'rules/AGENTS.planning.md'), 'utf8');
  const sec = md.slice(md.indexOf('### Если sdd_lint не отвечает'));
  assert.ok(sec.length > 30, 'нет раздела');
  assert.match(sec, /без строки «\[код выхода: N\]»/);
  assert.match(sec, /1\. «Подожди, сейчас перезапущу его» \(рекомендую\)/);
  assert.match(sec, /2\. «Попробуй из корня»/);
  assert.match(sec, /3\. «Покажи команду — запущу сам»/);
  assert.match(sec, /Этап сам не выполняй/);
});
test('MCP: ответ сервера всегда с кодом выхода — по нему агент отличает сбой сервера', () => {
  const cwd = planWorkspace(null);
  const input = ['{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}', '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"sdd_lint","arguments":{"args":["plan","comments"]}}}'].join('\n');
  const out = execFileSync('node', [path.join(root, 'skills/sdd-lint/scripts/mcp.mjs')], { cwd, input, encoding: 'utf8', env: { ...process.env, TMPDIR: path.join(cwd, '.tmp') } });
  const res = out.trim().split('\n').map((l) => JSON.parse(l)).find((x) => x.id === 2);
  assert.match(res.result.content[0].text, /Плана нет: запиши docs\/comments\/slices\/plan\.md[\s\S]*\[код выхода: 2\]$/);
});
test('prompt: в шапке — вопрос из правил и абсолютный путь к скрипту для вариантов 2 и 3', () => {
  const r = run(workspace(), 'prompt', 'sdd-slices', 'comments');
  assert.match(r.out, /Нет его или не отвечает — вопрос из «Если sdd_lint не отвечает» в правилах планирования; скрипт для вариантов 2 и 3 — `\/[^`]+sdd-lint\.mjs`/);
  assert.match(r.out, /Файл скилла assets\/plan\.md:/);
});
test('evals: place-files.sh поднимает MCP-сервер lint, как GigaCode', () => {
  const cases = fs
    .readdirSync(path.join(root, 'skills'))
    .flatMap((s) => {
      const d = path.join(root, 'skills', s, 'evals');
      return fs.existsSync(d) ? fs.readdirSync(d).map((c) => path.join(d, c)) : [];
    })
    .filter((d) => fs.existsSync(path.join(d, 'place-files.sh')));
  for (const c of cases) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-eval-'));
    execFileSync('bash', [path.join(c, 'place-files.sh')], { cwd, stdio: 'pipe' });
    const srv = JSON.parse(fs.readFileSync(path.join(cwd, '.mcp.json'), 'utf8')).mcpServers['sdd-lint'];
    assert.ok(fs.existsSync(srv.args[0]), `${path.relative(root, c)}: ${srv.args[0]}`);
    assert.match(fs.readFileSync(path.join(c, 'prompt.md'), 'utf8'), /mcp__sdd-lint__sdd_lint/);
  }
});
test('Р1 — ADR: <тема>: вопрос «Нужен ADR», ворота build закрыты, пока ADR не затрагивает slice', () => {
  const cwd = workspace();
  edit(cwd, S003, 'Р1 — ждёт ADR-0001 и подключения notify-service к доставке событий', 'Р1 — ADR: дедупликация уведомлений');
  edit(cwd, 'adr/0001-mention-notifications.md', 'Затрагивает slices: 003\n', '');
  run(cwd, 'fix', 'docs/comments');
  assert.ok(ids(ask(cwd)).includes('adr-here:003'));
  assert.match(run(cwd, 'docs/comments').out, /написать ADR «дедупликация уведомлений» \(slice 003\): \/sdd-adr comments "дедупликация уведомлений"/);
  assert.equal(run(cwd, 'approve', 'adr', 'docs/comments', '0001').code, 0);
  assert.equal(run(cwd, 'approve', 'slices', 'docs/comments').code, 0);
  const g = run(cwd, 'gate', 'build', 'docs/comments');
  assert.equal(g.code, 3, g.out);
  assert.match(g.out, /нет ADR: «дедупликация уведомлений» \(slice 003\)/);
});
