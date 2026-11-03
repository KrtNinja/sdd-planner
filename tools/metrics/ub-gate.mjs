// Гейт по отчётам инструментов ub-mode (unclebob/crapper, dryer, mutator) — их запускает CI.
// Читает .metrics/crap.edn, .metrics/dry.edn и снимок mutator tools/metrics/mutate/*.edn, сравнивает с metrics/ub-baseline.json.
//
//   node metrics/ub-gate.mjs             — сводка и код 1, если хуже базовой линии (нет её — только сводка)
//   node metrics/ub-gate.mjs --baseline  — записать базовую линию (коммитит человек)
//   node metrics/ub-gate.mjs --baseline-mutate — в базовой линии обновить только mutate: он считается по снимку
//                                           в репозитории и локально совпадает с CI; crap и dry — из лога ub-mode
//
// Пороги ub-mode: CRAP < 10 у каждой функции, повторов со сходством ≥ 0.8 нет, выживших мутантов нет.
// Пока код до них не дорос, гейт держит «не хуже»: новых нарушителей нет, старые не ухудшились.
import fs from 'node:fs';
import path from 'node:path';
import { readEdn } from './edn.mjs';
import { REPO, rel } from './lib.mjs';

const METRICS = path.join(REPO, '.metrics');
const BASELINE = path.join(REPO, 'tools/metrics/ub-baseline.json');
const MUTATE = path.join(REPO, 'tools/metrics/mutate');
const CRAP_MAX = 10;
const DRY_MIN = 0.8;

const readIf = (file) => (fs.existsSync(file) ? readEdn(fs.readFileSync(file, 'utf8')) : null);

function collect() {
  const crap = readIf(path.join(METRICS, 'crap.edn'));
  const dry = readIf(path.join(METRICS, 'dry.edn'));
  // Снимок mutator — в репозитории (tools/metrics/mutate/, его обновляет полный прогон или PR, см. mutate.mjs).
  const mut = fs.existsSync(MUTATE) ? fs.readdirSync(MUTATE).filter((f) => f.endsWith('.edn')).map((f) => readIf(path.join(MUTATE, f))) : [];
  const offenders = {};
  for (const e of crap?.entries ?? []) if ((e.crap ?? e.complexity) >= CRAP_MAX) offenders[`${e.namespace}#${e.name}`] = { complexity: e.complexity, coverage: e.coverage, crap: e.crap };
  // CI кладёт для dryer копию кода в dry-src/ с .ts вместо .mjs — возвращаем исходные пути.
  const at = (s) => `${s.file.replace(/^(.*\/)?dry-src\//, '').replace(/\.ts$/, '.mjs')}:${s['start-line']}-${s['end-line']}`;
  const pairs = (dry?.candidates ?? []).filter((c) => c.score >= DRY_MIN).map((c) => ({ score: +c.score.toFixed(2), left: at(c.left), right: at(c.right) }));
  const survived = mut.flatMap((m) => (m.forms ?? []).filter((f) => f.survived > 0).map((f) => `${m.namespace}#${f.id}: ${f.survived}`));
  return {
    crap: crap ? { functions: crap.entries.length, over10: Object.keys(offenders).length, offenders } : null,
    dry: dry ? { candidates: pairs.length, pairs } : null,
    mutate: mut.length ? { namespaces: mut.length, survivedForms: survived.length, survived } : null,
  };
}

function compare(now, base) {
  const bad = [];
  for (const [key, e] of Object.entries(now.crap?.offenders ?? {})) {
    const was = base.crap?.offenders?.[key];
    if (!was) bad.push(`crapper: новая функция ${key}, CRAP ${e.crap ?? `— (CC ${e.complexity})`}`);
    else if ((e.crap ?? e.complexity) > (was.crap ?? was.complexity)) bad.push(`crapper: ${key} ${was.crap} → ${e.crap}`);
  }
  if (now.dry && base.dry && now.dry.candidates > base.dry.candidates) bad.push(`dryer: пар ≥ ${DRY_MIN} было ${base.dry.candidates}, стало ${now.dry.candidates}`);
  if (now.mutate && base.mutate && now.mutate.survivedForms > base.mutate.survivedForms) bad.push(`mutator: функций с выжившими мутантами было ${base.mutate.survivedForms}, стало ${now.mutate.survivedForms}`);
  return bad;
}

const now = collect();
console.log(`crapper: ${now.crap ? `${now.crap.functions} функций, CRAP ≥ ${CRAP_MAX}: ${now.crap.over10}` : 'нет .metrics/crap.edn'}`);
for (const [k, e] of Object.entries(now.crap?.offenders ?? {}).sort((a, b) => (b[1].crap ?? 0) - (a[1].crap ?? 0)).slice(0, 15)) console.log(`  ${e.crap}\tCC ${e.complexity}\tcov ${e.coverage}%\t${k}`);
console.log(`dryer: ${now.dry ? `пар со сходством ≥ ${DRY_MIN}: ${now.dry.candidates}` : 'нет .metrics/dry.edn'}`);
for (const p of now.dry?.pairs.slice(0, 15) ?? []) console.log(`  ${p.score}\t${p.left}  ↔  ${p.right}`);
console.log(`mutator: ${now.mutate ? `функций с выжившими: ${now.mutate.survivedForms}` : 'снимка нет'}`);

if (process.argv.includes('--baseline-mutate')) {
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  console.log(`mutate: функций с выжившими ${base.mutate?.survivedForms ?? '—'} → ${now.mutate?.survivedForms ?? '—'}`);
  fs.writeFileSync(BASELINE, `${JSON.stringify({ ...base, mutate: now.mutate }, null, 1)}\n`);
} else if (process.argv.includes('--baseline')) {
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
  const count = (x) => [x.crap?.over10, x.dry?.candidates, x.mutate?.survivedForms].map((n) => n ?? 0);
  if (!bad.length && now.mutate && !base.mutate) printBaseline('Появился снимок mutator — базовую линию нужно обновить');
  else if (!bad.length && count(now).some((n, i) => n < count(base)[i])) printBaseline('Стало лучше базовой линии — её можно обновить');
} else printBaseline(`Базовой линии нет (${rel(BASELINE)}) — только сводка`);

// Отчёты лежат и в артефакте ub-metrics, но базовую линию удобнее взять прямо из лога CI.
function printBaseline(why) {
  console.log(`\n${why}: npm run ub:baseline после прогона инструментов или JSON ниже в tools/metrics/ub-baseline.json.`);
  console.log(`--- ub-baseline.json ---\n${JSON.stringify(now)}\n--- конец ---`);
}
