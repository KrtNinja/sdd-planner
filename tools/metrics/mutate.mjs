// mutator в CI: какие файлы мутировать, гейт по изменённым функциям, снимок в репозитории.
// Только встроенные модули Node: CI зовёт скрипт до npm install.
//
//   node metrics/mutate.mjs files --shard 3/12 [--base origin/main]
//       файлы одной части прогона, части поровну по размеру; с --base — только добавленные и изменённые в PR
//       (менялись тесты — и файлы, где в снимке есть выжившие)
//   node metrics/mutate.mjs collect <dir> <files.txt>
//       снимки из .metrics/mutate/ файлов этой части (список — вывод files) → в <dir> (артефакт части)
//   node metrics/mutate.mjs gate [--base origin/main] [--from <dir>] [--fresh]
//       собрать снимок в .metrics/mutate/: tools/metrics/mutate/ (без --fresh) и поверх него части из <dir>;
//       сводка; с --base — код 1, если в функциях, которые задел diff, выжили мутанты; печатает снимок для коммита
//   node metrics/mutate.mjs pull <run-id>
//       снимок из лога CI → tools/metrics/mutate/ (коммитит человек, отдельным коммитом, как базовые линии)
//
// Снимок — файлы mutator .metrics/mutate/<namespace>.edn: формы (функции) с хешем текста и исходы мутантов.
// mutator с ним дифференциальный: убитые мутанты в функциях, чей текст не менялся, не гоняет заново.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readEdn } from './edn.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CODE = 'skills/sdd-lint/scripts';
const SNAPSHOT = path.join(REPO, 'tools/metrics/mutate');
const RUN = path.join(REPO, '.metrics/mutate');
const BEGIN = '--- mutate snapshot ---';
const END = '--- конец ---';

const git = (...args) => execFileSync('git', ['-c', 'core.quotepath=off', ...args], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 });
const lines = (text) => text.split('\n').filter(Boolean);
const isCode = (f) => f.endsWith('.mjs') && fs.existsSync(path.join(REPO, f));
const ednFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.edn')).sort() : []);
const readSnap = (dir, f) => readEdn(fs.readFileSync(path.join(dir, f), 'utf8'));
const uniqSorted = (a) => [...new Set(a)].sort();

function arg(name) {
  const i = process.argv.indexOf(name);
  return i < 0 ? null : process.argv[i + 1];
}

// Файлы, где в снимке есть выжившие мутанты: новые тесты могли их убить.
function withSurvivors() {
  return ednFiles(SNAPSHOT)
    .map((f) => readSnap(SNAPSHOT, f))
    .filter((s) => (s.forms ?? []).some((form) => form.survived > 0))
    .map((s) => s.source);
}

// Файлы кода: все или добавленные и изменённые относительно base. Переименование — новый файл (--no-renames).
// Менялись тесты — плюс файлы с выжившими: mutator перепроверит только выживших, убитые в снимке не повторяет.
function sources(base) {
  if (!base) return lines(git('ls-files', '--', CODE)).filter(isCode).sort();
  const changed = (...paths) => lines(git('diff', '--name-only', '--no-renames', '--diff-filter=AM', `${base}...HEAD`, '--', ...paths));
  const tests = changed('tests').length ? withSurvivors() : [];
  return uniqSorted([...changed(CODE), ...tests].filter(isCode));
}

// Части поровну по размеру: самый большой файл — в самую лёгкую часть. Порядок детерминированный.
export function shards(files, n, size) {
  const load = Array(n).fill(0);
  const out = Array.from({ length: n }, () => []);
  for (const f of [...files].sort((a, b) => size(b) - size(a) || a.localeCompare(b))) {
    const i = load.indexOf(Math.min(...load));
    out[i].push(f);
    load[i] += size(f);
  }
  return out.map((part) => part.sort());
}

function cmdFiles() {
  const [k, n] = (arg('--shard') ?? '0/1').split('/').map(Number);
  const size = (f) => fs.statSync(path.join(REPO, f)).size;
  for (const f of shards(sources(arg('--base')), n, size)[k]) console.log(f);
}

// Снимки файлов этой части. mutator переписывает и чужие namespace (та же копия, но новое tested-at), поэтому
// «отличается от репозитория» не годится: при сборке частей копия одной части затёрла бы свежий снимок другой.
function cmdCollect() {
  const dir = path.resolve(process.argv[3]);
  const mine = new Set(lines(fs.readFileSync(path.resolve(process.argv[4]), 'utf8')));
  fs.mkdirSync(dir, { recursive: true });
  const files = ednFiles(RUN).filter((f) => mine.has(readSnap(RUN, f).source));
  for (const f of files) fs.copyFileSync(path.join(RUN, f), path.join(dir, f));
  console.log(`Снимков файлов этой части: ${files.length} из ${mine.size}`);
}

// Строки нового файла, которые задел diff: добавленные и изменённые; на месте удаления — соседние две.
export function parseHunks(diff) {
  const out = new Map();
  let file = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line.startsWith('+++ b/') ? line.slice(6) : null;
      if (file) out.set(file, []);
      continue;
    }
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!m || !file) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    out.get(file).push(count ? [start, start + count - 1] : [start, start + 1]);
  }
  return out;
}

const touches = (ranges, form) => ranges.some(([a, b]) => a <= form['end-line'] && b >= form.line);

function assemble(from, fresh) {
  fs.rmSync(RUN, { recursive: true, force: true });
  fs.mkdirSync(RUN, { recursive: true });
  if (!fresh) for (const f of ednFiles(SNAPSHOT)) fs.copyFileSync(path.join(SNAPSHOT, f), path.join(RUN, f));
  if (from) for (const f of ednFiles(from)) fs.copyFileSync(path.join(from, f), path.join(RUN, f));
  // Файл кода удалён или переименован — его снимок больше не нужен.
  for (const f of ednFiles(RUN)) if (!fs.existsSync(path.join(REPO, readSnap(RUN, f).source))) fs.rmSync(path.join(RUN, f));
  return ednFiles(RUN).map((f) => readSnap(RUN, f));
}

// Выжившие мутанты формы: id мутанта — JSON [файл, namespace, форма, начало, конец, было, стало], смещения в байтах.
function survivors(snap, form) {
  const src = fs.readFileSync(path.join(REPO, form.file));
  return Object.entries(snap.outcomes ?? {})
    .filter(([, status]) => status === 'survived')
    .map(([id]) => JSON.parse(id))
    .filter(([file, , formId]) => file === form.file && formId === form.id)
    .map(([, , , start, , was, now]) => `${form.file}:${src.subarray(0, start).toString().split('\n').length} ${was} → ${now}`);
}

function summary(snaps) {
  const forms = snaps.flatMap((s) => (s.forms ?? []).map((form) => ({ snap: s, form })));
  const sum = (k) => forms.reduce((acc, { form }) => acc + form[k], 0);
  const bad = forms.filter(({ form }) => form.survived > 0);
  console.log(`mutator: файлов ${snaps.length}, функций ${forms.length}; мутантов убито ${sum('killed')}, выжило ${sum('survived')}, ` +
    `без покрытия ${sum('uncovered')}; функций с выжившими ${bad.length}`);
  return forms;
}

function gateChanged(forms, base) {
  const hunks = parseHunks(git('diff', '--unified=0', '--no-renames', `${base}...HEAD`, '--', CODE));
  const hit = forms.filter(({ form }) => hunks.has(form.file) && touches(hunks.get(form.file), form));
  const bad = hit.filter(({ form }) => form.survived > 0);
  const uncovered = hit.reduce((acc, { form }) => acc + form.uncovered, 0);
  console.log(`Изменённых функций: ${hit.length}, с выжившими: ${bad.length}, мутантов без покрытия: ${uncovered}`);
  if (!bad.length) return console.log('Гейт пройден: в изменённых функциях выживших мутантов нет.');
  console.log('\nГЕЙТ НЕ ПРОЙДЕН — выжили мутанты в изменённых функциях (нужен тест, который их убьёт):');
  for (const { snap, form } of bad) {
    console.log(`- ${form.file}:${form.line}-${form['end-line']} ${form.id}: выжило ${form.survived}`);
    for (const s of survivors(snap, form)) console.log(`    ${s}`);
  }
  process.exitCode = 1;
}

// Снимок в лог — gzip и base64 строками по 76: лог CI читается `gh run view --log`, артефакты не нужны.
function printSnapshot() {
  const files = Object.fromEntries(ednFiles(RUN).map((f) => [f, fs.readFileSync(path.join(RUN, f), 'utf8')]));
  const b64 = zlib.gzipSync(JSON.stringify(files)).toString('base64');
  console.log(`\nСнимок для tools/metrics/mutate/: npm --prefix tools run mutate:pull -- <run-id> (отдельным коммитом).`);
  console.log([BEGIN, ...b64.match(/.{1,76}/g), END].join('\n'));
}

function cmdGate() {
  const from = arg('--from');
  const forms = summary(assemble(from && path.resolve(from), process.argv.includes('--fresh')));
  const base = arg('--base');
  if (base) gateChanged(forms, base);
  printSnapshot();
}

// Строка лога `gh run view --log`: «джоба<TAB>шаг<TAB>время текст» — берём текст.
export function unpack(log) {
  const text = lines(log).map((l) => l.replace(/^[^\t]*\t[^\t]*\t\S+ ?/, ''));
  const from = text.lastIndexOf(BEGIN);
  const to = text.indexOf(END, from);
  if (from < 0 || to < 0) throw new Error(`в логе нет снимка между «${BEGIN}» и «${END}»`);
  return JSON.parse(zlib.gunzipSync(Buffer.from(text.slice(from + 1, to).join(''), 'base64')).toString('utf8'));
}

function cmdPull() {
  const id = process.argv[3];
  if (!/^\d+$/.test(id ?? '')) throw new Error('нужен номер прогона CI: mutate.mjs pull <run-id>');
  const files = unpack(execFileSync('gh', ['run', 'view', id, '--log'], { cwd: REPO, encoding: 'utf8', maxBuffer: 256 << 20 }));
  fs.rmSync(SNAPSHOT, { recursive: true, force: true });
  fs.mkdirSync(SNAPSHOT, { recursive: true });
  for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(SNAPSHOT, path.basename(f)), text);
  console.log(`tools/metrics/mutate/: ${Object.keys(files).length} файлов из прогона ${id}`);
}

const COMMANDS = { files: cmdFiles, collect: cmdCollect, gate: cmdGate, pull: cmdPull };
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cmd = COMMANDS[process.argv[2]];
  if (!cmd) {
    console.error(`mutate.mjs: ${Object.keys(COMMANDS).join(' | ')} — см. шапку файла`);
    process.exit(1);
  }
  cmd();
}
