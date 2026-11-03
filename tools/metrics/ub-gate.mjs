// Гейт по отчётам инструментов ub-mode (unclebob/crapper, dryer, mutator) — их запускает CI.
// Читает .metrics/crap.edn, .metrics/dry.edn  сравнивает с metrics/ub-baseline.json.
//
//   node metrics/ub-gate.mjs             — сводка и код 1, если хуже базовой линии (нет её — только сводка)
//   node metrics/ub-gate.mjs --baseline  — записать базовую линию (коммитит человек)
//
// Пороги ub-mode: CRAP < 10 у каждой функции, повторов со сходством ≥ 0.8 нет, выживших мутантов нет.
// Пока код до них не дорос, гейт держит «не хуже»: новых нарушителей нет, старые не ухудшились.
import fs from 'node:fs';
import path from 'node:path';
import { readEdn } from './edn.mjs';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rel = (file) => path.relative(REPO, file);

const METRICS = path.join(REPO, '.metrics');
const BASELINE = path.join(REPO, 'tools/metrics/ub-baseline.json');
const CRAP_MAX = 10;
const DRY_MIN = 0.8;

const finite = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const location = (x) => x && typeof x.file === 'string' && x.file.length > 0
  && Number.isInteger(x['start-line']) && x['start-line'] > 0
  && Number.isInteger(x['end-line']) && x['end-line'] >= x['start-line'];
const validEntry = (e) => e && typeof e.namespace === 'string' && e.namespace.length > 0
  && typeof e.name === 'string' && e.name.length > 0 && finite(e.complexity) && e.complexity >= 1
  && finite(e.coverage) && e.coverage <= 100 && finite(e.crap) && e.crap >= e.complexity;
const validPair = (e) => e && finite(e.score) && e.score <= 1 && location(e.left) && location(e.right);

function readReport(name, field, valid, nonempty = false) {
  const file = path.join(METRICS, name);
  const data = readEdn(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(data?.[field]) || (nonempty && !data[field].length) || !data[field].every(valid)) {
    throw new Error(`Некорректный отчёт ${rel(file)}: ${field}`);
  }
  return data;
}

function collect() {
  const crap = readReport('crap.edn', 'entries', validEntry, true);
  const dry = readReport('dry.edn', 'candidates', validPair);
  const offenders = {};
  for (const e of crap?.entries ?? []) if ((e.crap ?? e.complexity) >= CRAP_MAX) offenders[`${e.namespace}#${e.name}`] = { complexity: e.complexity, coverage: e.coverage, crap: e.crap };
  // CI кладёт для dryer копию кода в dry-src/ с .ts вместо .mjs — возвращаем исходные пути.
  const at = (s) => `${s.file.replace(/^(.*\/)?dry-src\//, '').replace(/\.ts$/, '.mjs')}:${s['start-line']}-${s['end-line']}`;
  const pairs = (dry?.candidates ?? []).filter((c) => c.score >= DRY_MIN).map((c) => ({ score: +c.score.toFixed(2), left: at(c.left), right: at(c.right) }));
  return {
    crap: crap ? { functions: crap.entries.length, over10: Object.keys(offenders).length, offenders } : null,
    dry: dry ? { candidates: pairs.length, pairs } : null,
  };
}

function compare(now, base) {
  const bad = [];
  if (now.crap.over10 !== 0) bad.push('crapper: функций с CRAP >= 10 должно быть 0');
  if (now.dry.candidates !== 0) bad.push('dryer: пар >= 0.8 должно быть 0');
  for (const [key, e] of Object.entries(now.crap?.offenders ?? {})) {
    const was = base.crap?.offenders?.[key];
    if (!was) bad.push(`crapper: новая функция ${key}, CRAP ${e.crap ?? `— (CC ${e.complexity})`}`);
    else if ((e.crap ?? e.complexity) > (was.crap ?? was.complexity)) bad.push(`crapper: ${key} ${was.crap} → ${e.crap}`);
  }
  if (now.dry && base.dry && now.dry.candidates > base.dry.candidates) bad.push(`dryer: пар ≥ ${DRY_MIN} было ${base.dry.candidates}, стало ${now.dry.candidates}`);
  return bad;
}

let now;
try { now = collect(); } catch (error) {
  console.error(`ГЕЙТ НЕ ПРОЙДЕН — отчёты ub-mode: ${error.message}`);
  process.exit(1);
}
console.log(`crapper: ${now.crap ? `${now.crap.functions} функций, CRAP ≥ ${CRAP_MAX}: ${now.crap.over10}` : 'нет .metrics/crap.edn'}`);
for (const [k, e] of Object.entries(now.crap?.offenders ?? {}).sort((a, b) => (b[1].crap ?? 0) - (a[1].crap ?? 0)).slice(0, 15)) console.log(`  ${e.crap}\tCC ${e.complexity}\tcov ${e.coverage}%\t${k}`);
console.log(`dryer: ${now.dry ? `пар со сходством ≥ ${DRY_MIN}: ${now.dry.candidates}` : 'нет .metrics/dry.edn'}`);
for (const p of now.dry?.pairs.slice(0, 15) ?? []) console.log(`  ${p.score}\t${p.left}  ↔  ${p.right}`);

if (process.argv.includes('--baseline')) {
  fs.writeFileSync(BASELINE, `${JSON.stringify(now, null, 1)}\n`);
  console.log(`Базовая линия записана: ${rel(BASELINE)}`);
} else if (fs.existsSync(BASELINE)) {
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const bad = compare(now, base);
  if (bad.length) {
    console.log(`\nГЕЙТ НЕ ПРОЙДЕН:\n${bad.map((x) => `- ${x}`).join('\n')}`);
    process.exitCode = 1;
    // Хуже бывает и не из-за кода (сменился инструмент замера) — тогда базовую линию меняет человек, осознанно.
    printBaseline('Если ухудшение ожидаемо и решено принять — новая базовая линия');
  } else console.log('\nГейт пройден: не хуже базовой линии.');
  const count = (x) => [x.crap?.over10, x.dry?.candidates].map((n) => n ?? 0);
  if (!bad.length && count(now).some((n, i) => n < count(base)[i])) printBaseline('Стало лучше базовой линии — её можно обновить');
} else printBaseline(`Базовой линии нет (${rel(BASELINE)}) — только сводка`);

// Отчёты лежат и в артефакте ub-metrics, но базовую линию удобнее взять прямо из лога CI.
function printBaseline(why) {
  console.log(`\n${why}: npm run ub:baseline после прогона инструментов или JSON ниже в tools/metrics/ub-baseline.json.`);
  console.log(`--- ub-baseline.json ---\n${JSON.stringify(now)}\n--- конец ---`);
}
