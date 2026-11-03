// Общее для тестов sdd-lint: запуск CLI, рабочая копия эталонной фичи, чтение и правка доков,
// файл ревью, git. Тесты проверяют поведение через CLI — как его видят агент и человек.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { loadFeature } from '../skills/sdd-lint/scripts/sdd-lint/feature.mjs';
import { run as runLint } from '../skills/sdd-lint/scripts/sdd-lint/run.mjs';

// Дочерние процессы (CLI, MCP, hook) покрытие не пишут: Node склеивает файлы покрытия процессов в порядке PID,
// и непокрытые ветки то попадают в отчёт, то нет. Покрытие — только у кода, вызванного в процессе тестов.
delete process.env.NODE_V8_COVERAGE;

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LINT = process.env.SDD_LINT || path.join(root, 'skills/sdd-lint/scripts/sdd-lint.mjs');
export const MCP = path.join(root, 'skills/sdd-lint/scripts/mcp.mjs');
export const GOOD = path.join(root, 'tests/fixtures/good');

// Статусы эталона: «одобрено» и «принято» с отметкой approve (отпечаток содержимого).
export const SPEC_OK = 'Статус: одобрено 27.10.2026 · 67e1fb';
export const ADR_OK = 'Статус: принято 27.10.2026 · 9aebc0';
export const FP = '[0-9a-f]{6}';

// Форма команд в подсказках настраивается окружением; тесты закрепляют одну.
// JSON_ENV — вопросы структурой (SDD_VIEW=json), SCREEN_ENV — то, что видит человек в GigaCode.
export const JSON_ENV = { SDD_SKILL_PREFIX: '/', SDD_LINT_CMD: 'node scripts/sdd-lint.mjs', SDD_VIEW: 'json' };
export const SCREEN_ENV = { SDD_SKILL_PREFIX: '/', SDD_LINT_CMD: '/sdd-lint', SDD_VIEW: '' };

export const tmpDir = (prefix = 'sdd-test-') => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

// Копия эталонной фичи во временной папке.
export function workspace() {
  const dir = tmpDir();
  fs.cpSync(GOOD, dir, { recursive: true });
  return dir;
}

// Пустой репозиторий с доками; files — { 'путь': 'текст' }.
export function repo(files = {}) {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, 'docs'));
  for (const [f, t] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), t);
  }
  return dir;
}

// Фича из текстов в docs/<name> временной папки: { 'spec.md': …, 'slices/001-a.md': …, '../adr/0001-x.md': … } → модель.
// Правила зовутся на ней напрямую; находки — строками brief().
export function feature(files, name = 'search') {
  const dir = path.join(tmpDir(), 'docs', name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [f, t] of Object.entries(files)) {
    if (t == null) continue; // { ...files, 'spec.md': null } — фича без файла
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), t);
  }
  return loadFeature(dir);
}
// Находка строкой «ID файл:строка текст», файл — от папки фичи; only — какие ID оставить.
export const brief = (m, found, only = null) =>
  found.filter((f) => !only || only.includes(f.rule)).map((f) => `${f.rule} ${path.relative(m.dir, f.file)}:${f.line ?? '-'} ${f.msg}`);

// Шапка slice — строки 1–13 (Основание — 5, Зависимости — 7, Почему отдельно — 13), body — с 14-й.
export const slice = (num, { type = 'поведение', basis = 'FR-1', deps = 'нет', halves = 'tasks-core + frontend, принимаются вместе', why = '—' } = {}, ...body) =>
  [`# ${num} — Срез ${num}`, '', `Тип: ${type}`, '', `Основание: ${basis}`, '', `Зависимости: ${deps}`, '', `Половины: ${halves}`, '',
    'Результат: есть', '', `Почему отдельно: ${why}`, ...body, ''].join('\n');
// Блок AC: строка ID, тело, «Проверяет:» (null — без неё).
export const ac = (id, checks = 'FR-1', lines = ['  WHEN Анна ищет', '  THEN список']) => ['```', id, ...lines, '```', ...(checks ? [`Проверяет: ${checks}`] : [])];
export const SPEC = ['# Поиск — Dev Spec', '', 'Статус: черновик', '', '## Функциональные требования', '',
  ...['FR-1', 'FR-2', 'FR-3', 'FR-4'].flatMap((id) => ['```', `${id}  Текст.`, '      Пример: Анна.', '```', '']),
  '```', 'NFR-1  Ответ за 1 с.', '```', ''].join('\n');

// git в папке: g('status') → вывод. Автор задан, подпись коммитов выключена.
export const git = (cwd) => (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8', stdio: 'pipe' });

export function commitAll(cwd, msg = 'init') {
  const g = git(cwd);
  if (!fs.existsSync(path.join(cwd, '.git'))) g('init', '-q');
  g('add', '-A');
  g('commit', '-qm', msg);
  return cwd;
}

// fn() в папке cwd с окружением env и своим TMPDIR (там счётчики прогонов и снимки), потом всё возвращается.
// Тесты идут по очереди, поэтому смена папки процесса безопасна.
// runner — запуск sdd-lint функцией run() так же: { code, out } — stdout, затем stderr, как у spawnSync.
export function inDir(cwd, env, fn) {
  const vars = { ...env, TMPDIR: path.join(cwd, '.tmp') };
  const saved = { cwd: process.cwd(), env: Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]])) };
  process.chdir(cwd);
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    process.chdir(saved.cwd);
    for (const [k, v] of Object.entries(saved.env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}
export const runner = (env) => (cwd, ...args) =>
  inDir(cwd, env, () => {
    const { code, chunks } = runLint(args);
    const text = (fd) => chunks.filter(([f]) => f === fd).map(([, t]) => t).join('');
    return { code, out: text(1) + text(2) };
  });
export const run = runner(JSON_ENV);

// Тот же вызов отдельным процессом — для проверок самой точки входа (CLI, симлинк, hook).
export const spawnRunner = (env) => (cwd, ...args) => {
  const r = spawnSync('node', [LINT, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env, TMPDIR: path.join(cwd, '.tmp') } });
  return { code: r.status, out: r.stdout + r.stderr };
};

// Пути, чтение и правка внутри docs/.
export const file = (cwd, rel) => path.join(cwd, 'docs', rel);
export const read = (cwd, rel) => fs.readFileSync(file(cwd, rel), 'utf8');
export function edit(cwd, rel, from, to) {
  const s = read(cwd, rel);
  assert.ok(s.includes(from), `в ${rel} нет «${from}»`);
  fs.writeFileSync(file(cwd, rel), s.replace(from, to));
}

// Проверки фичи: { code, findings, hints, … } из check --json.
export function check(cwd, feature = 'docs/comments') {
  const r = run(cwd, 'check', feature, '--json');
  return { code: r.code, ...JSON.parse(r.out) };
}
export const rules = (res) => res.findings.map((f) => f.rule);

// Порча эталона ловится своим правилом; msg — что должно быть в тексте находки.
export function caught(rule, rel, from, to, msg) {
  test(`${rule}: ${rel} — «${from.slice(0, 40)}»`, () => {
    const cwd = workspace();
    edit(cwd, rel, from, to);
    const res = check(cwd);
    const hit = res.findings.filter((f) => f.rule === rule);
    assert.ok(hit.length, `ожидалось ${rule}, получено: ${rules(res).join(', ') || 'ничего'}`);
    if (msg) assert.ok(hit.some((f) => msg.test(f.msg)), hit.map((f) => f.msg).join('\n'));
  });
}

// Вопрос в выводе: JSON может идти после текста.
export const json = (out) => JSON.parse(out.slice(out.indexOf('{')));
export const ids = (q) => q.questions.flatMap((x) => x.options.map((o) => o.id));
export const optionIds = (out) => ids(json(out));

// Файл ревью в _work/review/<key>.md со строками таблицы находок.
export const REVIEW_ROWS = [
  '| R1 | замечание | slices/002-comments.md, AC-002-B4 | нет успешного удаления руководителем | 4 | добавить AC |  |',
  '| R2 | блокер | slices/003-mention-notifications.md | не решено, что с уведомлением, если комментарий удалили до доставки | 3 | уведомление не приходит |  |',
  '| R3 | замечание | slices/README.md | порядок работ не объясняет, почему 003 после 002 | 6 | — |  |',
  '| R4 | блокер | slices/002-comments.md, AC-002-B2 | граница длины без пары 5000 / 5001 | 2 | добавить AC на 5001 |  |',
];
export function writeReview(cwd, rows = REVIEW_ROWS, key = 'slices') {
  const d = file(cwd, 'comments/_work/review');
  fs.mkdirSync(d, { recursive: true });
  const n = (level) => rows.filter((r) => r.split('|')[2].trim() === level).length;
  fs.writeFileSync(
    path.join(d, `${key}.md`),
    `# Ревью ${key} — Комментарии\n\nИтог: блокеров ${n('блокер')}, замечаний ${n('замечание')}\n\n| # | Важность | Где | Что не так | Пункт | Предложение | Решение |\n|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`,
  );
}
