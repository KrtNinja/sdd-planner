// Замеры кода sdd-lint и гейт «не хуже базовой линии» (ratchet). Модель не участвует: только числа.
//
//   node metrics/report.mjs               — замер, сводка в консоль, полный отчёт в metrics/.out/report.json
//   node metrics/report.mjs --no-coverage — без прогона тестов (CRAP не считается, только сложность)
//   node metrics/report.mjs --gate        — то же и сравнение с metrics/baseline.json: код 1 при ухудшении
//   node metrics/report.mjs --baseline    — записать текущие числа как базовую линию (коммитит человек)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ESLint } from 'eslint';
import * as walk from 'acorn-walk';
import { REPO, CODE, TESTS, listMjs, source, parse, rel } from './lib.mjs';
import { deps } from './deps.mjs';
import { clones } from './clones.mjs';
import { crap, coverageMasks } from './crap.mjs';

const TOOLS = path.join(REPO, 'tools');
const OUT = path.join(TOOLS, 'metrics/.out');
const BASELINE = path.join(TOOLS, 'metrics/baseline.json');
// ub-mode: «Reduce each function under CRAP 10» — нарушение с 10 включительно.
const CRAP_MAX = 10;
// Где можно печатать и завершать процесс: точка входа CLI и MCP-сервер.
const IO_ALLOWED = new Set(['skills/sdd-lint/scripts/sdd-lint.mjs', 'skills/sdd-lint/scripts/mcp.mjs']);

const argv = process.argv.slice(2);
const opt = { coverage: !argv.includes('--no-coverage'), gate: argv.includes('--gate'), baseline: argv.includes('--baseline') };

function runTests() {
  const v8 = path.join(OUT, 'v8');
  fs.rmSync(v8, { recursive: true, force: true });
  const env = { ...process.env, ...(opt.coverage ? { NODE_V8_COVERAGE: v8 } : {}) };
  const started = Date.now();
  const r = spawnSync('node', ['--test', ...listMjs(TESTS).filter((f) => f.endsWith('.test.mjs'))], { cwd: REPO, env, encoding: 'utf8', maxBuffer: 1 << 28 });
  const num = (k) => +(r.stdout.match(new RegExp(`^(?:ℹ|#) ${k} (\\d+)`, 'm'))?.[1] ?? NaN);
  return { tests: { total: num('tests'), pass: num('pass'), fail: num('fail'), seconds: Math.round((Date.now() - started) / 1000) }, v8 };
}

async function eslint() {
  const engine = new ESLint({ cwd: REPO, overrideConfigFile: path.join(TOOLS, 'eslint.config.mjs') });
  const results = await engine.lintFiles([path.join(CODE, '**/*.mjs')]);
  const byRule = {};
  for (const r of results) for (const m of r.messages) byRule[m.ruleId ?? 'parse'] = (byRule[m.ruleId ?? 'parse'] ?? 0) + 1;
  return byRule;
}

function tsc() {
  const bin = path.join(TOOLS, 'node_modules/.bin/tsc');
  const args = ['--allowJs', '--checkJs', '--noEmit', '--target', 'es2022', '--module', 'nodenext', '--moduleResolution', 'nodenext',
    '--noUnusedLocals', '--skipLibCheck', '--typeRoots', path.join(TOOLS, 'node_modules/@types'), '--types', 'node',
    path.join(CODE, 'sdd-lint.mjs'), path.join(CODE, 'mcp.mjs')];
  const r = spawnSync(bin, args, { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26 });
  const byCode = {};
  for (const m of r.stdout.matchAll(/error (TS\d+)/g)) byCode[m[1]] = (byCode[m[1]] ?? 0) + 1;
  return { total: Object.values(byCode).reduce((a, b) => a + b, 0), byCode };
}

// process.exit и console.* вне точки входа: из-за них логику нельзя вызвать функцией и проверить в процессе.
function sideEffects() {
  const files = {};
  for (const file of listMjs(CODE)) {
    if (IO_ALLOWED.has(rel(file))) continue;
    let n = 0;
    walk.simple(parse(source(file)), {
      MemberExpression(m) {
        if (m.object.name === 'console' || (m.object.name === 'process' && ['exit', 'argv'].includes(m.property.name))) n++;
      },
    });
    if (n) files[rel(file)] = n;
  }
  return { total: Object.values(files).reduce((a, b) => a + b, 0), files };
}

function summary(r) {
  const offenders = r.crap.entries.filter((e) => (e.crap ?? e.complexity) >= CRAP_MAX);
  return {
    tests: r.tests,
    functions: r.crap.functions,
    crapAtLeast10: r.crap.entries.filter((e) => e.crap >= 10).length,
    crapOver30: r.crap.entries.filter((e) => e.crap > 30).length,
    complexityAtLeast10: r.crap.entries.filter((e) => e.complexity >= 10).length,
    offenders: Object.fromEntries(offenders.map((e) => [e.key, { complexity: e.complexity, crap: e.crap }])),
    eslint: r.eslint,
    tscErrors: r.tsc.total,
    clonesCodePercent: r.clonesCode.percent,
    clonesTestsPercent: r.clonesTests.percent,
    cycles: r.deps.cycles.length,
    sideEffects: r.sideEffects.total,
    unusedExports: r.deps.unusedExports.length,
  };
}

function compare(now, base) {
  const bad = [];
  const better = [];
  const notWorse = (name, cur, was) => {
    if (cur > was) bad.push(`${name}: ${was} → ${cur}`);
    else if (cur < was) better.push(`${name}: ${was} → ${cur}`);
  };
  if (!(now.tests.fail === 0)) bad.push(`тесты: упало ${now.tests.fail}`);
  if (now.tests.total < base.tests.total) bad.push(`тестов стало меньше: ${base.tests.total} → ${now.tests.total}`);
  else if (now.tests.total > base.tests.total) better.push(`тестов: ${base.tests.total} → ${now.tests.total}`);
  for (const [key, e] of Object.entries(now.offenders)) {
    const was = base.offenders[key];
    const metric = e.crap === null ? 'complexity' : 'crap';
    if (!was) bad.push(`${key}: новая функция с ${metric} ${e[metric]} ≥ ${CRAP_MAX}`);
    else if (was[metric] !== null && e[metric] > was[metric]) bad.push(`${key}: ${metric} ${was[metric]} → ${e[metric]}`);
  }
  for (const rule of new Set([...Object.keys(now.eslint), ...Object.keys(base.eslint)])) notWorse(`eslint ${rule}`, now.eslint[rule] ?? 0, base.eslint[rule] ?? 0);
  for (const k of ['tscErrors', 'clonesCodePercent', 'clonesTestsPercent', 'cycles', 'sideEffects', 'unusedExports']) notWorse(k, now[k], base[k]);
  return { bad, better };
}

function print(s) {
  const t = s.tests;
  console.log(`Тесты: ${t.pass}/${t.total}, упало ${t.fail}, ${t.seconds} с`);
  console.log(`Функций: ${s.functions}; CRAP ≥ 10: ${s.crapAtLeast10}, CRAP > 30: ${s.crapOver30}; сложность ≥ 10: ${s.complexityAtLeast10}`);
  console.log(`ESLint: ${Object.entries(s.eslint).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`tsc --checkJs: ${s.tscErrors} ошибок; повторы: код ${s.clonesCodePercent}%, тесты ${s.clonesTestsPercent}%`);
  console.log(`Циклы импорта: ${s.cycles}; process.exit/argv/console вне точки входа: ${s.sideEffects}; экспортов без потребителей: ${s.unusedExports}`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { tests, v8 } = opt.coverage ? runTests() : { tests: { total: NaN, pass: NaN, fail: 0, seconds: 0 }, v8: null };
  const r = {
    tests,
    crap: crap(CODE, v8 ? coverageMasks(v8, CODE) : null),
    eslint: await eslint(),
    tsc: tsc(),
    deps: deps(CODE, TESTS),
    clonesCode: clones(CODE, 50),
    clonesTests: clones(TESTS, 50),
    sideEffects: sideEffects(),
  };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(r, null, 1));
  const s = summary(r);
  print(s);
  if (opt.baseline) {
    if (!opt.coverage) throw new Error('базовая линия снимается только с покрытием: без --no-coverage');
    fs.writeFileSync(BASELINE, `${JSON.stringify(s, null, 1)}\n`);
    console.log(`\nБазовая линия записана: ${rel(BASELINE)}. Закоммитьте её отдельным коммитом.`);
  }
  if (!opt.gate) return;
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  if (!opt.coverage) { s.tests = base.tests; for (const e of Object.values(base.offenders)) e.crap = null; }
  const { bad, better } = compare(s, base);
  if (better.length) console.log(`\nЛучше базовой линии (можно обновить: npm run baseline):\n${better.map((x) => `- ${x}`).join('\n')}`);
  if (bad.length) {
    console.log(`\nГЕЙТ НЕ ПРОЙДЕН — хуже базовой линии:\n${bad.map((x) => `- ${x}`).join('\n')}`);
    process.exitCode = 1;
  } else console.log('\nГейт пройден: не хуже базовой линии.');
}

await main();
