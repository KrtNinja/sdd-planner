// Список сценариев для golden-теста (tests/golden.test.mjs): какие вызовы sdd-lint закрепить.
// Перебор делает сам sdd-lint своим Tab-дополнением (__complete) в каждом состоянии из
// tests/golden/states.mjs: команды, варианты, фича, номера ADR и slices, id вариантов вопроса этапа,
// флаг --json. Свободный текст (задача для start) дополнение не даёт — он взят из tests/start.test.mjs.
// Модель сценарии не придумывает.
//
//   node tools/golden/scenarios.mjs   — пишет tests/golden/scenarios.json; файл коммитится и правится
//                                       только вместе с осознанным изменением набора команд.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { STATES } from '../../tests/golden/states.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LINT = path.join(REPO, 'skills/sdd-lint/scripts/sdd-lint.mjs');
const OUT = path.join(REPO, 'tests/golden/scenarios.json');
const MAX_DEPTH = 4;
// Команды, вывод которых зависит от git: их повторяем в состоянии git.
const GIT_CMDS = new Set(['diff', 'close', 'guard', 'snapshot', 'approve', 'fix', 'done', 'check', 'comments', 'ask', 'choose']);
// Команды разбора находок: их перебираем в состоянии review.
const REVIEW_CMDS = ['ask', 'choose', 'triage', 'gate'];
// Команды нарезки: их перебираем в состоянии plan.
const PLAN_CMDS = ['plan', 'gen', 'ask', 'choose', 'gate', 'done', 'next'];
// Старт по шагам — вызовы из tests/start.test.mjs, по одному на ветку разбора ввода.
const START = [
  ['start', 'добавить панель настроек пользователя'],
  ['start', 'добавить панель настроек пользователя', '--slug', 'user-settings'],
  ['start', 'добавить панель настроек пользователя', '--name', 'name:own'],
  ['start', 'добавить панель настроек пользователя', '--name', '`docs/User_Settings/`'],
  ['start', 'возврат платежа покупателю', '--name', 'PROJECT-4567'],
  ['start', 'профиль покупателя в кабинете', '--name', 'назови ABC-12 пожалуйста'],
  ['start', 'панель настроек', '--name', 'adr'],
  ['start', 'панель настроек', '--slug', 'Панель'],
  ['start', 'добавить панель настроек, смотри @specs/settings.md и https://wiki.example.ru/x', '--slug', 'settings'],
  ['start', 'task-handover "Хочу, чтобы исполнитель мог передать задачу коллеге"'],
  ['start', 'docs/нет-такой'],
];
// MCP-сервер: те же вызовы, что делает агент, — args инструмента sdd_lint.
const MCP = [['comments'], ['ask', 'docs/comments'], ['gate', 'slices', 'docs/comments'], ['нет-такой-команды']];

function inState(state, fn) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-golden-gen-'));
  STATES[state](cwd);
  try {
    return fn((words) => spawnSync('node', [LINT, '__complete', ...words], { cwd, encoding: 'utf8' }).stdout.split('\n').filter(Boolean).map((l) => l.split('\t')[0]));
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

// Из дополнения фичи и пути — один представитель: имя фичи; для guard и snapshot — файл spec.md.
function pick(values, words) {
  const isPath = (v) => v.includes('/') || v === 'comments';
  const plain = values.filter((v) => !isPath(v));
  if (plain.length === values.length) return plain;
  return [...plain, ['guard', 'snapshot'].includes(words[0]) ? 'docs/comments/spec.md' : 'comments'];
}

function collect(complete, commands) {
  const out = [];
  const seen = new Set();
  const add = (args) => { const k = JSON.stringify(args); if (!seen.has(k)) { seen.add(k); out.push(args); } };
  const walk = (words) => {
    add(words);
    if (words.length >= MAX_DEPTH) return;
    if (complete([...words, '-']).includes('--json')) add([...words, '--json']);
    for (const v of pick(complete([...words, '']), words)) walk([...words, v]);
  };
  for (const c of commands(complete)) walk([c]);
  return { out, add };
}

const commandsOf = (complete) => complete(['']).filter((v) => !v.includes('/') && v !== 'comments');

const good = inState('good', (complete) => {
  const { out, add } = collect(complete, commandsOf);
  add([]);
  // check в дополнении не показывается (он по умолчанию) — добавляем явно.
  add(['check', 'comments']);
  add(['check', 'comments', '--json']);
  add(['comments']);
  add(['aprove', 'docs/comments']);
  return out;
});
const review = inState('review', (complete) => collect(complete, () => REVIEW_CMDS).out);
const plan = inState('plan', (complete) => collect(complete, () => PLAN_CMDS).out);

const scenarios = {
  good,
  git: good.filter((a) => GIT_CMDS.has(a[0])),
  review,
  plan,
  empty: [...good.filter((a) => a.length <= 1), ...START],
  mcp: MCP,
};

const lines = Object.entries(scenarios).map(([k, v]) => `${JSON.stringify(k)}: [\n${v.map((a) => `  ${JSON.stringify(a)}`).join(',\n')}\n]`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `{\n${lines.join(',\n')}\n}\n`);
console.log(`Сценариев: ${Object.entries(scenarios).map(([k, v]) => `${k} ${v.length}`).join(', ')} → ${path.relative(REPO, OUT)}`);
