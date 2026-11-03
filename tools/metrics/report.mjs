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
import { runTsc } from './tsc.mjs';

const TOOLS = path.join(REPO, 'tools');
const OUT = path.join(TOOLS, 'metrics/.out');
const BASELINE = path.join(TOOLS, 'metrics/baseline.json');
// ub-mode: «Reduce each function under CRAP 10» — нарушение с 10 включительно.
const CRAP_MAX = 10;
// Окно поиска повторов. В тестах однотипные проверки с разными данными (run → code → match) при окне 50
// совпадают по токенам и считаются копиями; окно 75 оставляет только скопированные блоки.
const CLONE_WINDOW = { code: 50, tests: 75 };
// Модули-данные: строки одной формы («'SP-03': ['err', 'подсказка']») совпадают по токенам,
// но это не скопированный код — повторы в них не ищут (решение в чате, шаг 7.1). Чтобы сюда не прятали код,
// функции в них — без ветвлений: сложность больше 1 — гейт падает. Путь — файл или папка с «/» на конце.
const DATA_MODULES = ['skills/sdd-lint/scripts/sdd-lint/rules.mjs'];
const isData = (f) => DATA_MODULES.some((d) => (d.endsWith('/') ? f.startsWith(d) : f === d));
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

// Язык — под минимальный Node из README (22.5, V8 12.4): синтаксис ES2024 и из ES2025 только то, что в нём есть, —
// методы Set и помощники итераторов. Promise.try, RegExp.escape, Float16Array в 22.5 нет: tsc их не пропустит.
const TS_TARGET = 'es2024';
const TS_LIB = ['es2024', 'es2025.collection', 'es2025.iterator'];

function tsc() {
  const bin = path.join(TOOLS, 'node_modules/.bin/tsc');
  const args = ['--allowJs', '--checkJs', '--noEmit', '--target', TS_TARGET, '--lib', TS_LIB.join(','), '--module', 'nodenext', '--moduleResolution', 'nodenext',
    '--noUnusedLocals', '--skipLibCheck', '--typeRoots', path.join(TOOLS, 'node_modules/@types'), '--types', 'node',
    path.join(CODE, 'sdd-lint.mjs'), path.join(CODE, 'mcp.mjs')];
  const stdout = runTsc(bin, args, REPO);
  const byCode = {};
  for (const m of stdout.matchAll(/error (TS\d+)/g)) byCode[m[1]] = (byCode[m[1]] ?? 0) + 1;
  const modules = tsChecked();
  const checked = new Set(modules);
  const errors = stdout.split('\n').filter((l) => checked.has(l.match(/^(.+?)\(\d+,\d+\): error TS/)?.[1]));
  return { total: Object.values(byCode).reduce((a, b) => a + b, 0), byCode, checked: { modules, errors } };
}

// Модули с «// @ts-check» в шапке — до первой строки кода (первая строка модуля — его назначение).
// Их типы описаны (модель — sdd-lint/model.mjs), поэтому ошибок tsc в них быть не должно.
function tsChecked() {
  const marked = (file) => {
    for (const l of source(file).split('\n')) {
      if (/^\s*\/\/\s*@ts-check\b/.test(l)) return true;
      if (l.trim() && !/^\s*\/\//.test(l)) return false;
    }
    return false;
  };
  return listMjs(CODE).filter(marked).map(rel);
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
    // Функции с ветвлениями в модулях-данных: код, спрятанный от поиска повторов.
    dataLogic: r.crap.entries.filter((e) => isData(e.key.split('#')[0]) && e.complexity > 1).map((e) => e.key),
    eslint: r.eslint,
    tscErrors: r.tsc.total,
    tsCheckModules: r.tsc.checked.modules.length,
    tsCheckErrors: r.tsc.checked.errors.length,
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
  for (const key of now.dataLogic) bad.push(`${key}: ветвления в модуле-данных — повторы в нём не ищут, логике там не место`);
  if (now.tests.total < base.tests.total) bad.push(`тестов стало меньше: ${base.tests.total} → ${now.tests.total}`);
  else if (now.tests.total > base.tests.total) better.push(`тестов: ${base.tests.total} → ${now.tests.total}`);
  for (const [key, e] of Object.entries(now.offenders)) {
    const was = base.offenders[key];
    const metric = e.crap === null ? 'complexity' : 'crap';
    if (!was) bad.push(`${key}: новая функция с ${metric} ${e[metric]} ≥ ${CRAP_MAX}`);
    else if (was[metric] !== null && e[metric] > was[metric]) bad.push(`${key}: ${metric} ${was[metric]} → ${e[metric]}`);
  }
  for (const rule of new Set([...Object.keys(now.eslint), ...Object.keys(base.eslint)])) notWorse(`eslint ${rule}`, now.eslint[rule] ?? 0, base.eslint[rule] ?? 0);
  // В модулях с @ts-check ошибок tsc нет совсем, а сами модули не теряют пометку.
  if (now.tsCheckErrors > 0) bad.push(`ошибок tsc в модулях с @ts-check: ${now.tsCheckErrors}, должно быть 0`);
  if (now.tsCheckModules < (base.tsCheckModules ?? 0)) bad.push(`модулей с @ts-check стало меньше: ${base.tsCheckModules} → ${now.tsCheckModules}`);
  else if (now.tsCheckModules > (base.tsCheckModules ?? 0)) better.push(`модулей с @ts-check: ${base.tsCheckModules ?? 0} → ${now.tsCheckModules}`);
  for (const k of ['tscErrors', 'clonesCodePercent', 'clonesTestsPercent', 'cycles', 'sideEffects', 'unusedExports']) notWorse(k, now[k], base[k]);
  return { bad, better };
}

function print(s) {
  const t = s.tests;
  console.log(`Тесты: ${t.pass}/${t.total}, упало ${t.fail}, ${t.seconds} с`);
  console.log(`Функций: ${s.functions}; CRAP ≥ 10: ${s.crapAtLeast10}, CRAP > 30: ${s.crapOver30}; сложность ≥ 10: ${s.complexityAtLeast10}`);
  console.log(`ESLint: ${Object.entries(s.eslint).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`tsc --checkJs: ${s.tscErrors} ошибок; модулей с @ts-check: ${s.tsCheckModules}, ошибок в них: ${s.tsCheckErrors}; повторы: код ${s.clonesCodePercent}%, тесты ${s.clonesTestsPercent}%`);
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
    clonesCode: clones(CODE, CLONE_WINDOW.code, isData),
    clonesTests: clones(TESTS, CLONE_WINDOW.tests),
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
  if (r.tsc.checked.errors.length) console.log(`\nОшибки tsc в модулях с @ts-check:\n${r.tsc.checked.errors.join('\n')}`);
  if (bad.length) {
    console.log(`\nГЕЙТ НЕ ПРОЙДЕН — хуже базовой линии:\n${bad.map((x) => `- ${x}`).join('\n')}`);
    process.exitCode = 1;
  } else console.log('\nГейт пройден: не хуже базовой линии.');
}

await main();
