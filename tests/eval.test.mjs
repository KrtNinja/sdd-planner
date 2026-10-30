// Тесты раннера evals (tools/eval.mjs) на поддельном GigaCode: прогон без интерактива, script-грейдеры,
// отчёт, многоходовой кейс через --continue, doctor. Запуск из корня репозитория: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVAL = path.join(root, 'tools/eval.mjs');
const FAKE = path.join(root, 'tests/fixtures/fake-gigacode.mjs');

function env() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-eval-test-'));
  const cfg = path.join(dir, 'eval.json');
  fs.writeFileSync(cfg, JSON.stringify({ cli: [process.execPath, FAKE], args: ['-p', '{prompt}', '-o', 'stream-json', '-m', '{model}'], continueArgs: ['--continue'], models: ['good'] }));
  return { dir, vars: { SDD_EVAL_CONFIG: cfg, SDD_EVAL_OUT: path.join(dir, 'out'), FAKE_LOG: path.join(dir, 'calls.log') } };
}
const run = (e, ...args) => {
  const r = spawnSync('node', [EVAL, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, ...e.vars } });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

test('eval: кейсы grill на «хорошей» и «плохой» модели — отчёт, провалы, ход работы', () => {
  const e = env();
  const r = run(e, '--cases', 'grill/start-empty-asks-task,grill/start-phrase-asks-sources', '--models', 'good,bad');
  assert.equal(r.code, 1, r.out + r.err);
  assert.match(r.out, /^evals \d{8}-\d{4}: кейсов 2, моделей 2, судья смысловых критериев — good\./);
  assert.match(r.out, /grill\/start-empty-asks-task +✓ 3\/3 +✗ \d\/3/);
  assert.match(r.out, /grill\/start-phrase-asks-sources +✓ 4\/4 +✗ \d\/4/);
  assert.match(r.out, /- grill\/start-empty-asks-task · bad · 01: первый вызов sdd_lint: нет/);
  assert.match(r.out, /- grill\/start-empty-asks-task · bad · 03: папок фич 1: settings/);
  assert.doesNotMatch(r.out, /· good ·/);
  const outDir = path.join(e.vars.SDD_EVAL_OUT, fs.readdirSync(e.vars.SDD_EVAL_OUT)[0]);
  const trace = fs.readFileSync(path.join(outDir, 'grill__start-empty-asks-task/good/trace.md'), 'utf8');
  assert.match(trace, /→ sdd-lint__sdd_lint \{"args":\["start"\]\}/);
  assert.match(trace, /агент: Какую задачу будем делать\?/);
  assert.ok(fs.existsSync(path.join(outDir, 'report.md')));
});
test('eval: смысловые критерии — судья по умолчанию первая модель; --no-judge — «не проверено», а не провал', () => {
  const e = env();
  const r = run(e, '--cases', 'grill/handover-first-round', '--models', 'good', '--no-judge');
  assert.match(r.out, /судья смысловых критериев — нет/);
  assert.match(r.out, /Смысловых критериев не проверено: 5 \(запуск с --no-judge\)\./);
  const j = run(e, '--cases', 'grill/start-empty-asks-task', '--models', 'good');
  assert.match(j.out, /судья смысловых критериев — good/);
});
test('eval: многоходовой кейс — второй ход через --continue, ответы человека из prompt.md', () => {
  const e = env();
  const kase = path.join(e.dir, 'case');
  fs.mkdirSync(path.join(kase, 'graders'), { recursive: true });
  fs.writeFileSync(path.join(kase, 'place-files.sh'), 'mkdir -p docs\n');
  fs.writeFileSync(path.join(kase, 'prompt.md'), '---\nmax_turns: 5\ntimeout_seconds: 60\n---\n\nпервый\n\n=== ответ человека ===\n\nвторой\n\nInput files: docs/\n');
  fs.writeFileSync(path.join(kase, 'graders/01-check.md'), "---\ntype: script\n---\n\nОтвет на второй ход.\n\n```sh\nq said 'ответ на «второй»'\n```\n");
  const r = run(e, '--case-dir', kase, '--models', 'good');
  assert.equal(r.code, 0, r.out + r.err);
  const calls = fs.readFileSync(e.vars.FAKE_LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(calls.length, 2);
  assert.ok(!calls[0].includes('--continue') && calls[1].includes('--continue'));
});
test('eval doctor: флаги, расширение и пробный вызов скилла в безынтерактивном режиме', () => {
  const r = run(env(), 'doctor');
  assert.match(r.out, /✓ флаги безынтерактивного режима есть: -p -o -m --continue/);
  assert.match(r.out, /✓ расширение sdd-planner подключено/);
  assert.match(r.out, /✓ на good: слэш-команда скилла и MCP sdd_lint работают/);
});
test('eval list: script-критерии у кейсов старта grill', () => {
  const r = run(env(), 'list');
  assert.match(r.out, /grill\/start-empty-asks-task {2}\(1 ход\.\)\n {2}01 script/);
});
test('eval: CLI не запустился — «сбой CLI» вместо пройденных критериев, ошибка целиком и одной строкой', () => {
  const r = run(env(), '--cases', 'grill/start-empty-asks-task,grill/start-phrase-asks-sources', '--models', 'broken', '--no-judge');
  assert.equal(r.code, 1);
  assert.match(r.out, /grill\/start-empty-asks-task +⚠ сбой CLI/);
  assert.match(r.out, /CLI не запустился в 2 из 2 прогонов: код 1 — Invalid values: \/ Argument: approval-mode, Given: "yolo"/);
  assert.doesNotMatch(r.out, /Не прошло:/);
});
test('eval doctor: пробный запуск упал — команда и ошибка CLI', () => {
  const e = env();
  const cfg = JSON.parse(fs.readFileSync(e.vars.SDD_EVAL_CONFIG, 'utf8'));
  fs.writeFileSync(e.vars.SDD_EVAL_CONFIG, JSON.stringify({ ...cfg, models: ['broken'] }));
  const r = run(e, 'doctor');
  assert.match(r.out, /✗ пробный запуск на broken упал, код 1 — Invalid values: \/ Argument: approval-mode/);
  assert.match(r.out, /команда: .* -p \/sdd-lint/);
});
