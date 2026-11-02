// Golden-тест: вывод и код выхода sdd-lint на сценариях из tests/golden/scenarios.json закреплены
// дословно в tests/golden/<состояние>.md. Это сетка для рефакторинга: поменялось хоть слово в выводе —
// тест падает и называет сценарий. Сценарии перебирает tools/golden/scenarios.mjs, а не модель.
//
//   node --test tests/golden.test.mjs                    — сверка
//   UPDATE_GOLDEN=1 node --test tests/golden.test.mjs    — переснять эталон (только осознанно, отдельным коммитом)
//
// Вывод — как его видит человек в GigaCode (SDD_VIEW пустой): карточка и строка ⚙.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { STATES, GIT_ENV } from './golden/states.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LINT = path.join(root, 'skills/sdd-lint/scripts/sdd-lint.mjs');
const MCP = path.join(root, 'skills/sdd-lint/scripts/mcp.mjs');
const DIR = path.join(root, 'tests/golden');
const SCENARIOS = JSON.parse(fs.readFileSync(path.join(DIR, 'scenarios.json'), 'utf8'));
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const ENV = { SDD_SKILL_PREFIX: '/', SDD_LINT_CMD: '/sdd-lint', SDD_VIEW: '' };
const PARALLEL = Math.max(2, Math.min(8, os.availableParallelism?.() ?? 4));

// Временная папка, даты и отпечаток одобрения меняются от прогона к прогону — смысл вывода нет.
function normalize(out, dirs) {
  let s = out;
  for (const d of dirs) s = s.split(d).join('<TMP>');
  return s
    .replace(/\d{2}\.\d{2}\.\d{4}( · [0-9a-f]{6})?/g, (_, fp) => `<ДАТА>${fp ? ' · <ОТПЕЧАТОК>' : ''}`)
    .replace(/\d{4}-\d{2}-\d{2}/g, '<ДАТА>')
    .replace(/[ \t]+$/gm, '')
    .trimEnd();
}

function spawnOut(cmd, args, cwd, input) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, env: { ...process.env, ...ENV, ...GIT_ENV, TMPDIR: path.join(cwd, '.tmp') } });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
    if (input) p.stdin.end(input);
  });
}

// MCP: initialize и один tools/call — как агент вызывает sdd_lint. Ответ — текст инструмента.
async function mcpCall(cwd, args) {
  const rpc = (id, method, params) => JSON.stringify({ jsonrpc: '2.0', id, method, params });
  const input = `${rpc(1, 'initialize', { protocolVersion: '2025-06-18' })}\n${rpc(2, 'tools/call', { name: 'sdd_lint', arguments: { args } })}\n`;
  const r = await spawnOut('node', [MCP], cwd, input);
  const reply = r.out.split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((m) => m.id === 2);
  if (reply?.error) return { code: r.code, out: `error ${reply.error.code}: ${reply.error.message}` };
  return { code: r.code, out: `${reply.result.isError ? 'isError\n' : ''}${reply.result.content.map((c) => c.text).join('\n')}` };
}

async function runOne(state, args) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-golden-'));
  const isMcp = state === 'mcp';
  STATES[isMcp ? 'good' : state](cwd);
  const dirs = [fs.realpathSync(cwd), cwd];
  const r = isMcp ? await mcpCall(cwd, args) : await spawnOut('node', [LINT, ...args], cwd);
  fs.rmSync(cwd, { recursive: true, force: true });
  return { args, code: r.code, out: normalize(r.out, dirs) };
}

async function runAll(state) {
  const todo = SCENARIOS[state];
  const results = new Array(todo.length);
  let next = 0;
  const worker = async () => { while (next < todo.length) { const i = next++; results[i] = await runOne(state, todo[i]); } };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return results;
}

// ~~~~ вместо ``` — в выводе бывают блоки кода.
const title = (state, args) => (state === 'mcp' ? `sdd_lint ${JSON.stringify(args)}` : `sdd-lint ${args.join(' ')}`.trimEnd());
const block = (state, r) => `### \`${title(state, r.args)}\`\n\nкод ${r.code}\n\n~~~~text\n${r.out}\n~~~~\n`;
const render = (state, results) => `# Golden: состояние «${state}»\n\nСнято tests/golden.test.mjs. Не правится руками: UPDATE_GOLDEN=1.\n\n${results.map((r) => block(state, r)).join('\n')}`;
const split = (md) => new Map([...md.matchAll(/^### `([^`\n]*)`\n\nкод .*?\n\n~~~~text\n[\s\S]*?\n~~~~\n/gm)].map((m) => [m[1], m[0]]));

for (const state of Object.keys(SCENARIOS)) {
  test(`golden: ${state}`, async () => {
    const file = path.join(DIR, `${state}.md`);
    const now = render(state, await runAll(state));
    if (UPDATE || !fs.existsSync(file)) {
      fs.writeFileSync(file, now);
      return;
    }
    const was = fs.readFileSync(file, 'utf8');
    if (now === was) return;
    // Падение — по первому разошедшемуся сценарию: так видно, какая команда поменяла вывод.
    const a = split(was);
    const b = split(now);
    for (const [k, v] of b) assert.equal(v, a.get(k), `вывод «${k}» разошёлся с ${path.relative(root, file)}`);
    for (const k of a.keys()) assert.ok(b.has(k), `сценария «${k}» больше нет`);
    assert.equal(now, was);
  });
}
