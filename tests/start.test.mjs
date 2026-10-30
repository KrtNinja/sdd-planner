// Тесты старта /sdd-grill (sdd-lint start) и исследования источников (research, CX-*):
// три пути человека — без задачи, задача фразой, задача файлом — и проверка работы сабагента скриптом.
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
const CMD_ENV = { SDD_SKILL_PREFIX: '/', SDD_LINT_CMD: 'node scripts/sdd-lint.mjs' };

// Пустой репозиторий с доками; files — { 'путь': 'текст' }.
function repo(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-start-test-'));
  fs.mkdirSync(path.join(dir, 'docs'));
  for (const [f, t] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), t);
  }
  return dir;
}
const SERVICES = {
  'services/tasks-core/README.md': '# tasks-core\n\nРоли: owner и member.\nУ задачи один исполнитель.\n',
  'services/notify-service/README.md': '# notify-service\n\nУведомления в приложении и по почте.\n',
};
function run(cwd, ...args) {
  const r = spawnSync('node', [LINT, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...CMD_ENV, TMPDIR: path.join(cwd, '.tmp') } });
  return { code: r.status, out: r.stdout + r.stderr };
}
// Вопрос в выводе start — JSON после текста.
const json = (out) => JSON.parse(out.slice(out.indexOf('{')));
const optionIds = (out) => json(out).questions.flatMap((q) => q.options.map((o) => o.id));
const recommended = (out) => json(out).questions[0].options.find((o) => o.recommended).id;
const read = (cwd, f) => fs.readFileSync(path.join(cwd, f), 'utf8');
const ctxFile = (slug) => `docs/${slug}/_work/context.md`;
// То, что делает сабагент: пишет факты под заголовками разделов.
function fillContext(cwd, slug, sections) {
  let md = read(cwd, ctxFile(slug));
  for (const [h, lines] of Object.entries(sections)) md = md.replace(new RegExp(`## ${h}\\n\\n-\\n`), `## ${h}\n\n${lines.join('\n')}\n`);
  fs.writeFileSync(path.join(cwd, ctxFile(slug)), md);
}

// ---------- путь 1: ничего не пришло ----------
test('start без аргументов: вопрос «Какую задачу будем делать?», ответ — в start', () => {
  const r = run(repo(), 'start');
  assert.equal(r.code, 0);
  assert.match(r.out, /^Задачи нет\. Спроси человека дословно и жди ответа:/);
  assert.match(r.out, /«Какую задачу будем делать\? .+@путь \(Tab дополнит\)\.»/);
  assert.match(r.out, /Ответ человека передай дословно: sdd_lint \["start","<ответ>"\]\./);
  assert.doesNotMatch(r.out, /Начатые/);
});
test('start без аргументов: начатые фичи — в вопросе, продолжить можно по имени', () => {
  const cwd = repo(SERVICES);
  run(cwd, 'start', 'исполнитель передаёт задачу коллеге', '--slug', 'task-handover');
  const r = run(cwd, 'start');
  assert.match(r.out, /«Начатые: task-handover — чтобы продолжить, напишите имя\.»/);
  const again = run(cwd, 'start', 'task-handover');
  assert.match(again.out, /"id": "src:repo"/);
});

// ---------- путь 2: задача фразой ----------
test('задача фразой: имя папки придумывает агент, человека не спрашивают', () => {
  const r = run(repo(), 'start', 'добавить панель настроек пользователя');
  assert.match(r.out, /^Задача: «добавить панель настроек пользователя»\./);
  assert.match(r.out, /Человека не спрашивай/);
  assert.match(r.out, /sdd_lint \["start","добавить панель настроек пользователя","--slug","<имя>"\]/);
  assert.equal(fs.readdirSync(path.join(repo(), 'docs')).length, 0);
});
test('задача фразой и имя: протокол из шаблона, затем вопрос об источниках с описью папки', () => {
  const cwd = repo(SERVICES);
  const r = run(cwd, 'start', 'добавить панель настроек пользователя', '--slug', 'user-settings');
  assert.equal(r.code, 0, r.out);
  const md = read(cwd, 'docs/user-settings/brainstorming.md');
  assert.match(md, /^# Добавить панель настроек пользователя — Brainstorming/);
  assert.match(md, /^Статус: идёт$/m);
  assert.match(md, /^Запрос: «добавить панель настроек пользователя»$/m);
  assert.match(md, /^Источники: </m);
  assert.match(r.out, /^Создан docs\/user-settings\/brainstorming\.md\./);
  assert.match(r.out, /--rename/);
  const q = json(r.out);
  assert.equal(q.questions[0].question, 'Есть дополнительная документация или код, которые помогут понять, как устроен проект?');
  assert.match(q.preview, /Папка фичи: docs\/user-settings/);
  assert.match(q.preview, /services\/ — README: 2/);
  assert.deepEqual(optionIds(r.out), ['src:repo', 'src:give', 'src:new']);
  assert.equal(recommended(r.out), 'src:repo');
});
test('вопрос об источниках: в папке ничего нет — «пришлю» рекомендуется, «хватит того, что здесь» не предлагается', () => {
  const r = run(repo(), 'start', 'добавить панель настроек', '--slug', 'settings');
  assert.deepEqual(optionIds(r.out), ['src:give', 'src:new']);
  assert.match(json(r.out).preview, /кроме фичи, ничего нет/);
});
test('имя папки проверяет скрипт: кириллица, занято, «adr»', () => {
  const cwd = repo();
  assert.match(run(cwd, 'start', 'панель настроек', '--slug', 'Панель').out, /не подходит: латиница/);
  assert.match(run(cwd, 'start', 'панель настроек', '--slug', 'adr').out, /«adr» занято/);
  run(cwd, 'start', 'панель настроек', '--slug', 'settings');
  assert.match(run(cwd, 'start', 'что-то другое совсем', '--slug', 'settings').out, /Папка docs\/settings уже занята — запрос «панель настроек»/);
});
test('ссылки и пути рядом с задачей — источники: вопроса нет, сразу задание сабагенту', () => {
  const cwd = repo({ ...SERVICES, 'specs/settings.md': '# Настройки\n' });
  const r = run(cwd, 'start', 'добавить панель настроек, смотри @specs/settings.md и https://wiki.example.ru/x', '--slug', 'settings');
  assert.match(read(cwd, 'docs/settings/brainstorming.md'), /^Источники: specs\/settings\.md; https:\/\/wiki\.example\.ru\/x$/m);
  assert.match(r.out, /Изучаю источники/);
  assert.match(r.out, /Вызови инструмент sdd_lint с args \["research","context","docs\/settings"\] и выполни то, что он вернёт\./);
  assert.match(r.out, /Сабагентов у тебя нет — выполни сам здесь/);
});
test('путь, которого нет: «Не нашёл» и подсказка про @ и Tab', () => {
  const r = run(repo(), 'start', 'панель настроек @specs/nope.md');
  assert.match(r.out, /^Не нашёл: specs\/nope\.md\./);
  assert.match(r.out, /начните с @ — Tab дополнит/);
});
test('старая форма: «task-handover "фраза"» и одно имя без задачи', () => {
  const cwd = repo();
  run(cwd, 'start', 'task-handover "Хочу, чтобы исполнитель мог передать задачу коллеге"');
  assert.match(read(cwd, 'docs/task-handover/brainstorming.md'), /^Запрос: «Хочу, чтобы исполнитель мог передать задачу коллеге»$/m);
  const r = run(cwd, 'start', 'comments');
  assert.match(r.out, /^Задачи нет/);
  assert.match(r.out, /sdd_lint \["start","<ответ>","--slug","comments"\]/);
});

// ---------- путь 3: задача файлом ----------
test('задача файлом: имя папки из имени файла, «Запрос: файл …», заголовок из файла', () => {
  const cwd = repo({ 'docs/inbox/user-settings.md': '# Панель настроек\n\nМенять имя и язык.\n' });
  const r = run(cwd, 'start', '@docs/inbox/user-settings.md');
  assert.equal(r.code, 0, r.out);
  const md = read(cwd, 'docs/user-settings/brainstorming.md');
  assert.match(md, /^# Панель настроек — Brainstorming/);
  assert.match(md, /^Запрос: файл docs\/inbox\/user-settings\.md$/m);
  assert.match(r.out, /"id": "src:give"/);
});
test('задача файлом с общим именем (task.md) — имя придумывает агент', () => {
  const cwd = repo({ 'inbox/task.md': '# Задача\n' });
  const r = run(cwd, 'start', 'вот задача @inbox/task.md');
  assert.match(r.out, /^Задача: файл inbox\/task\.md\./);
  assert.match(r.out, /--slug","<имя>"/);
});
test('задача файлом, новый проект: изучается только файл задачи, «ничего не нашёл» не спрашивают', () => {
  const cwd = repo({ 'docs/inbox/user-settings.md': '# Панель\n\nМенять имя и язык.\nЯзык — только ru и en.\n' });
  run(cwd, 'start', '@docs/inbox/user-settings.md');
  const r = run(cwd, 'choose', 'docs/user-settings', 'src:new');
  assert.match(read(cwd, 'docs/user-settings/brainstorming.md'), /^Источники: нет — новый проект$/m);
  assert.match(r.out, /research","context","docs\/user-settings"/);
  const task = run(cwd, 'research', 'context', 'docs/user-settings');
  assert.match(task.out, /^Источники:\n- docs\/inbox\/user-settings\.md$/m);
  fillContext(cwd, 'user-settings', {
    Задача: ['- Менять имя и язык — `docs/inbox/user-settings.md:3`'],
    'Уже решено в задаче': ['- Язык — только ru и en — `docs/inbox/user-settings.md:4`'],
  });
  assert.equal(run(cwd, 'research', 'check', 'docs/user-settings').code, 0);
  const ready = run(cwd, 'start', 'docs/user-settings');
  assert.match(ready.out, /^Старт готов/);
  assert.match(ready.out, /«Уже решено в задаче» — 1: до первого раунда допиши/);
});

// ---------- ответы на вопрос об источниках ----------
test('choose src:give — человек отвечает словами, ответ уходит в start; «да, вот …» — плюс то, что в папке', () => {
  const cwd = repo({ ...SERVICES, '../front-docs-start-test/README.md': '# front\n' });
  run(cwd, 'start', 'панель настроек пользователя', '--slug', 'settings');
  const r = run(cwd, 'choose', 'docs/settings', 'src:give');
  assert.match(r.out, /^Передай человеку дословно и жди ответа:\n\nПришлите пути или ссылки/);
  assert.match(r.out, /Ответ человека передай дословно: sdd_lint с args \["start","docs\/settings","--sources","<ответ человека>"\]\./);
  const a = run(cwd, 'start', 'docs/settings', '--sources', 'Да, вот @services/notify-service/ и https://wiki.example.ru/s');
  assert.match(read(cwd, 'docs/settings/brainstorming.md'), /^Источники: репозиторий; services\/notify-service; https:\/\/wiki\.example\.ru\/s$/m);
  assert.match(a.out, /research","context"/);
});
test('ответ «нет» без источников: в папке пусто — «Источники: нет», о текущем устройстве спрашивают человека', () => {
  const cwd = repo();
  run(cwd, 'start', 'панель настроек пользователя', '--slug', 'settings');
  const r = run(cwd, 'start', 'docs/settings', '--sources', 'нет');
  assert.match(read(cwd, 'docs/settings/brainstorming.md'), /^Источники: нет$/m);
  assert.match(r.out, /^Старт готов/);
  assert.match(r.out, /источников нет\. Что есть сейчас .+ спрашивай у человека/);
});
test('choose src:new — изучать нечего, старт готов: «спрашивай, как должно быть»', () => {
  const cwd = repo(SERVICES);
  run(cwd, 'start', 'панель настроек пользователя', '--slug', 'settings');
  const r = run(cwd, 'choose', 'docs/settings', 'src:new');
  assert.match(r.out, /^Старт готов — дальше шаги скилла со 2-го\./);
  assert.match(r.out, /новый проект\. Спрашивай, как должно быть/);
  assert.match(r.out.trim(), /Выполняй то, что сказано в выводе выше\.$/);
});
test('непонятный ответ про источники — переспросить, пути без @ не теряются', () => {
  const cwd = repo();
  run(cwd, 'start', 'панель настроек пользователя', '--slug', 'settings');
  assert.match(run(cwd, 'start', 'docs/settings', '--sources', 'ну спросите у Пети').out, /Из ответа не понял/);
  assert.match(run(cwd, 'start', 'docs/settings', '--sources', '../nope-dir-start-test/docs').out, /Не нашёл \.\.\/nope-dir-start-test\/docs/);
});

test('ответ словами: «хватит того, что в репозитории» — репозиторий; «A/B-тест» и «фронт/бэк» в задаче — не пути', () => {
  const cwd = repo(SERVICES);
  const t = run(cwd, 'start', 'сделать A/B-тест панели для фронт/бэк', '--slug', 'ab');
  assert.doesNotMatch(t.out, /Не нашёл/);
  run(cwd, 'start', 'docs/ab', '--sources', 'Нет, хватит того, что в репозитории');
  assert.match(read(cwd, 'docs/ab/brainstorming.md'), /^Источники: репозиторий$/m);
});

// ---------- исследование и проверка сабагента ----------
function researched(files = SERVICES) {
  const cwd = repo(files);
  run(cwd, 'start', 'исполнитель передаёт задачу коллеге', '--slug', 'handover');
  run(cwd, 'choose', 'docs/handover', 'src:repo');
  return cwd;
}
test('research context: заготовка с шапкой от скрипта, задание — источники, проверка, запреты', () => {
  const cwd = researched();
  const r = run(cwd, 'research', 'context', 'docs/handover');
  assert.equal(r.code, 0);
  assert.match(r.out, /^# Исследование источников: docs\/handover/);
  assert.match(r.out, /сейчас этап «brainstorming»/);
  assert.match(r.out, /^- репозиторий — текущая папка целиком$/m);
  assert.match(r.out, /sdd_lint \["research","check","docs\/handover"\]/);
  assert.match(r.out, /Нельзя: рекомендации и оценки/);
  const md = read(cwd, ctxFile('handover'));
  assert.match(md, /^Задача: «исполнитель передаёт задачу коллеге»$/m);
  assert.match(md, /^Источники: репозиторий$/m);
  assert.match(md, /^## Ответы на вопросы$/m);
});
test('research check: разделы, источник у факта, путь и строка существуют, без рекомендаций, объём', () => {
  const cwd = researched();
  run(cwd, 'research', 'context', 'docs/handover');
  fillContext(cwd, 'handover', {
    'Роли и доступ': [
      '- Роли owner и member — `services/tasks-core/README.md:3`',
      '- Исполнитель один — `services/tasks-core/README.md:40`',
      '- Админ видит всё — `services/admin/README.md:1`',
      '- Права хранятся в профиле',
      '- Лучше сделать отдельный экран — `services/tasks-core/README.md:1`',
    ],
  });
  let r = run(cwd, 'research', 'check', 'docs/handover');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /CX-03 .*строк 5, а ссылка на 40/);
  assert.match(r.out, /CX-03 .*нет файла services\/admin\/README\.md/);
  assert.match(r.out, /CX-02 .*Права хранятся в профиле/);
  assert.match(r.out, /CX-04 .*Лучше сделать/);
  assert.doesNotMatch(read(cwd, ctxFile('handover')), /^Проверено:/m);
  // Имя в теле факта источником не считается: проверяется только то, что после « — ».
  fs.writeFileSync(path.join(cwd, ctxFile('handover')), read(cwd, ctxFile('handover')).replace(/## Роли и доступ\n\n[\s\S]*?\n\n## Данные/, '## Роли и доступ\n\n- Событие `task.updated` уходит при правке — `services/tasks-core/README.md:4`\n\n## Данные'));
  r = run(cwd, 'research', 'check', 'docs/handover');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /проверено, фактов о проекте — 1/);
  assert.match(read(cwd, ctxFile('handover')), /^Проверено: да$/m);
  fs.writeFileSync(path.join(cwd, ctxFile('handover')), read(cwd, ctxFile('handover')).replace('## Ограничения', 'x'));
  assert.match(run(cwd, 'research', 'check', 'docs/handover').out, /CX-01 .*нет раздела «Ограничения»/);
  fs.writeFileSync(path.join(cwd, ctxFile('handover')), read(cwd, ctxFile('handover')).replace('x', `## Ограничения\n\n${'- длинный факт без смысла — `services/tasks-core/README.md:1`\n'.repeat(160)}`));
  assert.match(run(cwd, 'research', 'check', 'docs/handover').out, /CX-05/);
});
test('start после исследования: чистый контекст — «Старт готов» и что прочитать', () => {
  const cwd = researched();
  run(cwd, 'research', 'context', 'docs/handover');
  fillContext(cwd, 'handover', { 'Роли и доступ': ['- Роли owner и member — `services/tasks-core/README.md:3`'] });
  const r = run(cwd, 'start', 'docs/handover');
  assert.match(r.out, /^Старт готов/);
  assert.match(r.out, /Контекст: docs\/handover\/_work\/context\.md, фактов о проекте — 1\. Прочитай его целиком/);
  assert.match(r.out, /Протокол пуст — начинай с design tree/);
  assert.match(read(cwd, ctxFile('handover')), /^Проверено: да$/m, 'проверку без вызова check делает start');
});
test('start: ошибки контекста — две попытки сабагента со списком, третья — дальше с предупреждением', () => {
  const cwd = researched();
  run(cwd, 'research', 'context', 'docs/handover');
  fillContext(cwd, 'handover', { 'Роли и доступ': ['- Роли owner и member — `services/tasks-core/README.md:3`', '- Без источника'] });
  for (const n of [1, 2]) {
    const r = run(cwd, 'start', 'docs/handover');
    assert.match(r.out, new RegExp(`не прошёл проверку — попытка ${n} из 2:\\n  ОШИБКА\\s+CX-02`));
    assert.match(r.out, /research","context","docs\/handover"/);
  }
  assert.match(run(cwd, 'research', 'context', 'docs/handover').out, /## Исправь в файле\n\n- CX-02/);
  const r = run(cwd, 'start', 'docs/handover');
  assert.match(r.out, /^Старт готов/);
  assert.match(r.out, /В контексте остались ошибки \(1\)/);
});
test('ничего не нашлось — вопрос «Есть ещё документация?», «Продолжаем» — старт готов', () => {
  const cwd = researched();
  run(cwd, 'research', 'context', 'docs/handover');
  fillContext(cwd, 'handover', { 'Не нашёл': ['- Кто может передавать задачу?'] });
  const r = run(cwd, 'start', 'docs/handover');
  assert.equal(json(r.out).questions[0].question, 'По задаче в источниках ничего не нашёл. Есть ещё документация или код?');
  assert.equal(recommended(r.out), 'ctx:more');
  const go = run(cwd, 'choose', 'docs/handover', 'ctx:go');
  assert.match(go.out, /^Старт готов/);
  assert.match(read(cwd, ctxFile('handover')), /^Принято: да$/m);
});
test('не открылась папка вне проекта — подсказка /directory add; «готово» — изучить заново', () => {
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-ext-'));
  fs.writeFileSync(path.join(ext, 'README.md'), '# ext\n');
  const cwd = researched();
  const rel = path.relative(cwd, ext);
  run(cwd, 'start', 'docs/handover', '--sources', rel);
  const task = run(cwd, 'research', 'context', 'docs/handover');
  assert.match(task.out, new RegExp(`- ${rel.replace(/[.]/g, '\\.')} — вне папки проекта`));
  fillContext(cwd, 'handover', { 'Роли и доступ': ['- Роли owner и member — `services/tasks-core/README.md:3`'], 'Не удалось прочитать': [`- ${rel} — вне папки проекта`] });
  const r = run(cwd, 'start', 'docs/handover');
  assert.match(json(r.out).preview, new RegExp(`/directory add ${rel.replace(/[.]/g, '\\.')}`));
  assert.equal(recommended(r.out), 'ctx:go');
  assert.match(run(cwd, 'choose', 'docs/handover', 'ctx:more').out, /напишите «готово»/);
  const again = run(cwd, 'start', 'docs/handover', '--sources', 'готово');
  assert.match(again.out, /research","context","docs\/handover"/);
  assert.match(run(cwd, 'research', 'context', 'docs/handover').out, /## Файл уже заполнен/);
});
test('research fact: задание с вопросом, ответ — строкой в «Ответы на вопросы»; «не нашёл» без источника — не ошибка', () => {
  const cwd = researched();
  const r = run(cwd, 'research', 'fact', 'docs/handover', 'Сколько исполнителей у задачи?');
  assert.match(r.out, /^# Вопрос по источникам: docs\/handover/);
  assert.match(r.out, /ведёт этап «brainstorming»/);
  assert.match(r.out, /«Сколько исполнителей у задачи\?»/);
  assert.match(r.out, /в конец раздела «Ответы на вопросы»/);
  fillContext(cwd, 'handover', { 'Ответы на вопросы': ['- В: Сколько исполнителей? → один — `services/tasks-core/README.md:4`', '- В: Есть ли SLA? → не нашёл: README сервисов'] });
  assert.equal(run(cwd, 'research', 'check', 'docs/handover').code, 0);
  assert.equal(run(cwd, 'research', 'fact', 'docs/handover').code, 2);
});

// ---------- продолжение, переименование, конец ----------
test('продолжение в новом окне: решений N и последнее, историю чата держать не нужно', () => {
  const cwd = repo();
  run(cwd, 'start', 'панель настроек пользователя', '--slug', 'settings');
  run(cwd, 'start', 'docs/settings', '--sources', 'нет — новый проект');
  const f = path.join(cwd, 'docs/settings/brainstorming.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('|---|---|---|---|---|\n', '|---|---|---|---|---|\n| 1 | Продукт и UI | Кто видит панель? | Только владелец | да |\n'));
  const r = run(cwd, 'start', '@docs/settings/');
  assert.match(r.out, /Протокол: решений 1, последнее — #1 «Кто видит панель\?»/);
  assert.match(r.out, /«Продолжаем docs\/settings: решений 1\. Всё нужное — в протоколе и контексте, историю чата держать не нужно\.»/);
});
test('rename: другое имя папки, пока идёт brainstorming', () => {
  const cwd = repo();
  run(cwd, 'start', 'панель настроек пользователя', '--slug', 'settings');
  const r = run(cwd, 'start', 'docs/settings', '--rename', 'user-settings');
  assert.match(r.out, /^Папка docs\/settings теперь docs\/user-settings/);
  assert.ok(fs.existsSync(path.join(cwd, 'docs/user-settings/brainstorming.md')));
  assert.match(run(cwd, 'start', 'docs/user-settings', '--rename', 'Bad Name').out, /не подходит/);
});
test('протокол готов: start не начинает заново, а задаёт вопрос этапа', () => {
  const cwd = repo();
  run(cwd, 'start', 'панель настроек пользователя', '--slug', 'settings');
  const f = path.join(cwd, 'docs/settings/brainstorming.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('Статус: идёт', 'Статус: готов'));
  const r = run(cwd, 'start', 'settings');
  assert.match(r.out, /^Протокол docs\/settings готов/);
  assert.ok(optionIds(r.out).includes('window:sdd-spec'));
});
test('файл задачи внутри docs/ — документ, а не фича', () => {
  const cwd = repo({ 'docs/inbox/notes.md': '# Заметки\n' });
  const r = run(cwd, 'start', 'docs/inbox/notes.md');
  assert.match(r.out, /^Задача: файл docs\/inbox\/notes\.md\./);
  assert.ok(!fs.existsSync(path.join(cwd, 'docs/inbox/brainstorming.md')));
});
test('help и Tab: start и research в справке, флаги start дополняются', () => {
  const cwd = repo();
  assert.match(run(cwd, 'help', 'start').out, /sdd-lint start \[<что человек написал после \/sdd-grill>\]/);
  assert.match(run(cwd, 'help', 'research').out, /CX-\*/);
  assert.match(run(cwd, 'research').out, /research — выбери вариант:[\s\S]*research context <feature>/);
  const c = run(cwd, '__complete', 'start', '--').out.split('\n').map((x) => x.split('\t')[0]);
  assert.ok(c.includes('--sources') && c.includes('--rename'), c.join(','));
});
test('скилл sdd-grill: первый шаг — start, задания сабагенту не вшиты в скилл', () => {
  const md = fs.readFileSync(path.join(root, 'skills/sdd-grill/SKILL.md'), 'utf8');
  assert.match(md, /1\. Старт\. `sdd_lint \["start","<всё после \/sdd-grill одной строкой, как пришло>"\]`/);
  assert.match(md, /argument-hint: '\[задача словами \| @файл с задачей \| <feature>\]'/);
  // Шаблоны заданий сабагенту отдаёт research — prompt скилла их не приносит в окно.
  const p = run(repo(), 'prompt', 'sdd-grill');
  assert.doesNotMatch(p.out, /# Исследование источников/);
  assert.match(p.out, /Файл скилла references\/questions\.md:/);
});
