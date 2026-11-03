// mutator в CI: изменённые файлы с нуля; снимок хранится в логе прогона.
// files --shard 3/12 [--base origin/main] — файлы части (без базы — весь код).
// collect <dir> <files.txt> — сверить с *.inventory.json и собрать снимки части в артефакт.
// gate [--base origin/main] [--from <dir>] — полнота результатов и гейт; без базы/при изменении измерителя — весь код.
// survivors --run <run-id> [модуль ...] — выжившие из лога, строки по исходникам прогона.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readEdn } from './edn.mjs';
import { inventories, verifyResults } from './mutate-results.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CODE = 'skills/sdd-lint/scripts';
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

// Изменение измерителя проверяется полным прогоном; обычный тестовый PR код не выбирает.
function runnerChanged(base) {
  return base && lines(git('diff', '--name-only', `${base}...HEAD`)).some((f) =>
    f === '.github/workflows/quality.yml' || /^tools\/metrics\/(mutate[^/]*|edn)\.(mjs|py)$/.test(f));
}

// В PR — только добавленные и изменённые файлы кода; тестовый PR не выбирает код.
function sources(base) {
  const files = base && !runnerChanged(base)
    ? git('diff', '--name-only', '--no-renames', '--diff-filter=AM', `${base}...HEAD`, '--', CODE)
    : git('ls-files', '--', CODE);
  return uniqSorted(lines(files).filter(isCode));
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
  verifyResults(files.map((f) => readSnap(RUN, f)), [...mine], inventories(dir), (f) => fs.readFileSync(path.join(REPO, f)));
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

function assemble(from) {
  fs.rmSync(RUN, { recursive: true, force: true });
  fs.mkdirSync(RUN, { recursive: true });
  if (from) for (const f of ednFiles(from)) fs.copyFileSync(path.join(from, f), path.join(RUN, f));
  // Файл кода удалён или переименован — его снимок больше не нужен.
  for (const f of ednFiles(RUN)) if (!fs.existsSync(path.join(REPO, readSnap(RUN, f).source))) fs.rmSync(path.join(RUN, f));
  return ednFiles(RUN).map((f) => readSnap(RUN, f));
}

// Выжившие мутанты формы: id мутанта — JSON [файл, namespace, форма, начало, конец, было, стало], смещения в байтах.
function survivors(snap, form, readSource = (file) => fs.readFileSync(path.join(REPO, file))) {
  const src = readSource(form.file);
  return Object.entries(snap.outcomes ?? {})
    .filter(([, status]) => status === 'survived')
    .map(([id]) => JSON.parse(id))
    .filter(([file, , formId]) => file === form.file && formId === form.id)
    .map(([, , , start, , was, now]) => `${form.file}:${src.subarray(0, start).toString().split('\n').length} ${was} → ${now}`);
}

function cmdSurvivors() {
  const args = process.argv.slice(3);
  if (args[0] !== '--run' || !/^\d+$/.test(args[1] ?? ''))
    throw new Error('нужен номер прогона CI: survivors --run <run-id> [модуль ...]');
  const [, id, ...want] = args;
  if (want.some((x) => x.startsWith('--'))) throw new Error('неизвестный флаг survivors');
  const payload = unpack(gh('run', 'view', id, '--log'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-mutants-'));
  try {
    for (const [f, text] of Object.entries(payload.files)) fs.writeFileSync(path.join(dir, path.basename(f)), text);
    const snaps = ednFiles(dir).map((f) => readSnap(dir, f))
      .filter((s) => !want.length || want.includes(path.basename(s.source, '.mjs')));
    const cache = new Map();
    let sha;
    const readSource = (file) => {
      if (!cache.has(file)) {
        if (payload.sources) {
          if (!Object.hasOwn(payload.sources, file)) throw new Error(`в снимке нет исходника ${file}`);
          cache.set(file, Buffer.from(payload.sources[file]));
        } else {
          // Логи до 8.5 содержали только EDN: исходник берём с SHA прогона через GitHub.
          sha ??= gh('run', 'view', id, '--json', 'headSha', '--jq', '.headSha').trim();
          const content = gh('api', `repos/{owner}/{repo}/contents/${file}?ref=${sha}`, '--jq', '.content');
          cache.set(file, Buffer.from(content.replace(/\s/g, ''), 'base64'));
        }
      }
      return cache.get(file);
    };
    const forms = snaps.flatMap((snap) => (snap.forms ?? []).filter((form) => form.survived > 0).map((form) => ({ snap, form })));
    for (const { snap, form } of forms) for (const s of survivors(snap, form, readSource)) console.log(`${s} [${form.id}]`);
    console.log(`Выживших: ${forms.reduce((acc, { form }) => acc + form.survived, 0)} в ${forms.length} функциях`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const gh = (...args) => execFileSync('gh', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 256 << 20 });

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
  const sources = Object.fromEntries(ednFiles(RUN).map((f) => readSnap(RUN, f).source)
    .map((f) => [f, fs.readFileSync(path.join(REPO, f), 'utf8')]));
  const b64 = zlib.gzipSync(JSON.stringify({ version: 2, files, sources })).toString('base64');
  console.log(`\nВыжившие из этого прогона: npm --prefix tools run mutate:survivors -- --run <run-id>.`);
  console.log([BEGIN, ...b64.match(/.{1,76}/g), END].join('\n'));
}

function cmdGate() {
  const from = arg('--from');
  const base = arg('--base');
  const snaps = assemble(from && path.resolve(from));
  const expected = sources(base);
  verifyResults(snaps, expected, inventories(from), (f) => fs.readFileSync(path.join(REPO, f)));
  console.log(`Полнота прогона подтверждена: выбранных файлов ${expected.length}.`);
  const forms = summary(snaps);
  if (base && !runnerChanged(base)) gateChanged(forms, base);
  else if (forms.some(({ form }) => form.survived > 0)) {
    console.error('ГЕЙТ НЕ ПРОЙДЕН — выжившие мутанты в полном прогоне.');
    process.exitCode = 1;
  }
  printSnapshot();
}

// Строка лога `gh run view --log`: «джоба<TAB>шаг<TAB>время текст» — берём текст.
export function unpack(log) {
  const text = lines(log).map((l) => l.replace(/^[^\t]*\t[^\t]*\t\S+ ?/, '').replace(/^\d{4}-\S+Z /, ''));
  const from = text.lastIndexOf(BEGIN);
  const to = text.indexOf(END, from);
  if (from < 0 || to < 0) throw new Error(`в логе нет снимка между «${BEGIN}» и «${END}»`);
  const data = JSON.parse(zlib.gunzipSync(Buffer.from(text.slice(from + 1, to).join(''), 'base64')).toString('utf8'));
  return data.version === 2 ? data : { files: data, sources: null };
}

const COMMANDS = { files: cmdFiles, collect: cmdCollect, gate: cmdGate, survivors: cmdSurvivors };
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cmd = COMMANDS[process.argv[2]];
  if (!cmd) {
    console.error(`mutate.mjs: ${Object.keys(COMMANDS).join(' | ')} — см. шапку файла`);
    process.exit(1);
  }
  try { cmd(); } catch (error) {
    console.error(`ГЕЙТ НЕ ПРОЙДЕН — ${error.message}`);
    process.exitCode = 1;
  }
}
