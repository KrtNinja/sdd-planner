// Гейт по отчётам инструментов ub-mode (unclebob/crapper, dryer, mutator) — их запускает CI.
// Читает .metrics/crap.edn, .metrics/dry.edn и .metrics/mutate/*.edn, сравнивает с metrics/ub-baseline.json.
//
//   node metrics/ub-gate.mjs             — сводка и код 1, если хуже базовой линии (нет её — только сводка)
//   node metrics/ub-gate.mjs --baseline  — записать базовую линию (коммитит человек)
//
// Пороги ub-mode: CRAP < 10 у каждой функции, повторов со сходством ≥ 0.8 нет, выживших мутантов нет.
// Пока код до них не дорос, гейт держит «не хуже»: новых нарушителей нет, старые не ухудшились.
import fs from 'node:fs';
import path from 'node:path';
import { REPO, rel } from './lib.mjs';

const METRICS = path.join(REPO, '.metrics');
const BASELINE = path.join(REPO, 'tools/metrics/ub-baseline.json');
const CRAP_MAX = 10;
const DRY_MIN = 0.8;

// Подмножество EDN, которое пишут crapper/dryer/mutator: карты, векторы, строки, ключевые слова, числа, nil.
export function readEdn(text) {
  let i = 0;
  const ws = () => { while (i < text.length && /[\s,]/.test(text[i])) i++; };
  const value = () => {
    ws();
    const c = text[i];
    if (c === '{' || c === '[') return coll(c === '{' ? '}' : ']', c === '{');
    if (c === '"') { const m = text.slice(i).match(/^"((?:[^"\\]|\\.)*)"/); i += m[0].length; return JSON.parse(m[0]); }
    const m = text.slice(i).match(/^[^\s,{}[\]]+/);
    i += m[0].length;
    const atom = m[0];
    if (atom === 'nil') return null;
    if (atom === 'true' || atom === 'false') return atom === 'true';
    if (atom.startsWith(':')) return atom.slice(1);
    return Number.isNaN(Number(atom)) ? atom : Number(atom);
  };
  const coll = (close, isMap) => {
    i++;
    const items = [];
    for (ws(); text[i] !== close; ws()) items.push(value());
    i++;
    if (!isMap) return items;
    const o = {};
    for (let k = 0; k < items.length; k += 2) o[items[k]] = items[k + 1];
    return o;
  };
  return value();
}

const readIf = (file) => (fs.existsSync(file) ? readEdn(fs.readFileSync(file, 'utf8')) : null);

function collect() {
  const crap = readIf(path.join(METRICS, 'crap.edn'));
  const dry = readIf(path.join(METRICS, 'dry.edn'));
  const mutDir = path.join(METRICS, 'mutate');
  const mut = fs.existsSync(mutDir) ? fs.readdirSync(mutDir).filter((f) => f.endsWith('.edn')).map((f) => readIf(path.join(mutDir, f))) : [];
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
console.log(`mutator: ${now.mutate ? `функций с выжившими: ${now.mutate.survivedForms}` : 'не запускался'}`);

if (process.argv.includes('--baseline')) {
  fs.writeFileSync(BASELINE, `${JSON.stringify(now, null, 1)}\n`);
  console.log(`Базовая линия записана: ${rel(BASELINE)}`);
} else if (fs.existsSync(BASELINE)) {
  const bad = compare(now, JSON.parse(fs.readFileSync(BASELINE, 'utf8')));
  if (bad.length) { console.log(`\nГЕЙТ НЕ ПРОЙДЕН:\n${bad.map((x) => `- ${x}`).join('\n')}`); process.exitCode = 1; }
  else console.log('\nГейт пройден: не хуже базовой линии.');
} else {
  // Отчёты лежат и в артефакте ub-metrics, но базовую линию удобнее взять прямо из лога CI.
  console.log(`\nБазовой линии нет (${rel(BASELINE)}) — только сводка. Снять: npm run ub:baseline или скопировать JSON ниже.`);
  console.log(`--- ub-baseline.json ---\n${JSON.stringify(now)}\n--- конец ---`);
}
