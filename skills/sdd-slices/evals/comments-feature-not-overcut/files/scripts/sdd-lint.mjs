#!/usr/bin/env node
// sdd-lint — механические проверки артефактов планирования SDD.
// Использование: node scripts/sdd-lint.mjs docs/<feature>
// Код выхода 1, если есть ошибки. Без зависимостей, Node 18+.

import fs from 'node:fs';
import path from 'node:path';

const featureDir = process.argv[2];
if (!featureDir) {
  console.error('Использование: node scripts/sdd-lint.mjs docs/<feature>');
  process.exit(2);
}
if (!fs.existsSync(featureDir)) {
  console.error(`Нет папки ${featureDir}`);
  process.exit(2);
}

const errors = [];
const warnings = [];
const infos = [];
const rel = (f) => path.relative(process.cwd(), f) || f;
const err = (f, m) => errors.push(`${rel(f)}: ${m}`);
const warn = (f, m) => warnings.push(`${rel(f)}: ${m}`);
const info = (f, m) => infos.push(`${rel(f)}: ${m}`);

const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);

// Делит markdown на строки с пометкой «внутри блока кода» и номером блока.
function lines(md) {
  const out = [];
  let inCode = false;
  let block = -1;
  md.split(/\r?\n/).forEach((text, i) => {
    if (/^\s*```/.test(text)) {
      inCode = !inCode;
      if (inCode) block += 1;
      return;
    }
    out.push({ text, n: i + 1, inCode, block: inCode ? block : null });
  });
  return out;
}

const header = (md, key) => {
  const m = md.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  return m ? m[1].trim() : null;
};

// Текст раздела «## <title>…» до следующего заголовка второго уровня.
const section = (md, title) => {
  const re = new RegExp(`^##\\s+${title}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'm');
  const m = md.match(re);
  return m ? m[1].trim() : null;
};

const approved = (status) => !!status && /одобрен|принят/i.test(status);
const noneText = (t) => !t || /^нет(?!\p{L})/iu.test(t);

// ---------- spec.md ----------
const specFile = path.join(featureDir, 'spec.md');
const spec = read(specFile);
const specIds = new Set();
let specStatus = null;

const word = (re) => new RegExp(`(?<![\\p{L}\\d_])(?:${re})(?![\\p{L}\\d_])`, 'iu');
const STOP_WORDS = [
  ['эндпоинт', word('эндпоинт\\p{L}*|endpoint\\p{L}*')],
  ['БД / база данных', word('бд|баз\\p{L}* данных|database')],
  ['таблица в БД', word('таблиц\\p{L}* (?:в|из) (?:бд|баз\\p{L}*)')],
  ['технология', word('kafka|rabbitmq|redis|postgres\\p{L}*|postgresql|mysql|mongo\\p{L}*|elastic\\p{L}*|outbox|websocket\\p{L}*|grpc|graphql')],
  ['формат данных', word('json|yaml|xml|sql|utf-?8|bom|base64')],
  ['хранилище или очередь', word('s3|minio|очеред\\p{L}*|брокер\\p{L}*|кэш\\p{L}*|cache')],
  ['HTTP', word('http|rest|get|post|put|patch|delete')],
  ['имя файла', /[\w-]+\.(?:ts|tsx|js|mjs|py|java|kt|go|cs|yaml|yml|json|sql)\b/],
];

if (!spec) {
  // этап ещё не дошёл до spec — проверять нечего
} else {
  specStatus = header(spec, 'Статус');
  if (!specStatus) warn(specFile, 'нет строки «Статус:» (черновик / на ревью / одобрено <дата>)');

  const ls = lines(spec);
  for (const l of ls) {
    const m = l.text.match(/^\s*(N?FR-\d+)\b/);
    if (!m) continue;
    if (!l.inCode) {
      err(specFile, `строка ${l.n}: ${m[1]} вне блока кода`);
      continue;
    }
    if (specIds.has(m[1])) err(specFile, `строка ${l.n}: ${m[1]} определён повторно`);
    specIds.add(m[1]);
  }
  if (specIds.size === 0) err(specFile, 'не найдено ни одного FR/NFR в блоках кода');

  // стоп-слова — только в требованиях и целях, «Вне scope» тоже проверяем: там тоже поведение
  for (const l of ls) {
    for (const [label, re] of STOP_WORDS) {
      const m = l.text.match(re);
      if (m) warn(specFile, `строка ${l.n}: «${m[0]}» — ${label} в Dev Spec; поведение словами пользователя, техника — в ADR и контрактах`);
    }
  }

  const open = section(spec, 'Открытые вопросы');
  if (open && !noneText(open)) {
    if (approved(specStatus)) err(specFile, 'статус «одобрено», но есть открытые вопросы');
    else info(specFile, 'есть открытые вопросы — закрыть через /sdd-decide до checkpoint 1');
  }
}

// ---------- slices ----------
const slicesDir = path.join(featureDir, 'slices');
const sliceFiles = fs.existsSync(slicesDir)
  ? fs.readdirSync(slicesDir).filter((f) => /^\d{3}-.+\.md$/.test(f)).sort()
  : [];
const readmeFile = path.join(slicesDir, 'README.md');
const readme = read(readmeFile);
const slicesStatus = readme ? header(readme, 'Статус') : null;

const slices = new Map(); // num -> {file, deps, basis, acs}
const acDefs = new Map(); // id -> file

for (const name of sliceFiles) {
  const file = path.join(slicesDir, name);
  const md = read(file);
  const num = name.slice(0, 3);
  const s = { file, deps: [], basis: new Set(), acs: [] };
  slices.set(num, s);

  for (const key of ['Тип', 'Основание', 'Зависимости', 'Результат']) {
    if (header(md, key) === null) err(file, `нет строки «${key}:» в шапке`);
  }
  const why = header(md, 'Почему отдельно');
  if (why === null) warn(file, 'нет строки «Почему отдельно:» (Р1 / Р2 / Р3 или «—»)');

  const deps = header(md, 'Зависимости') || '';
  s.deps = /^(нет|—|-)?$/i.test(deps.trim()) ? [] : [...deps.matchAll(/\b\d{3}\b/g)].map((m) => m[0]);

  const basis = header(md, 'Основание') || '';
  for (const m of basis.matchAll(/\bN?FR-\d+\b/g)) s.basis.add(m[0]);

  const perBlock = new Map();
  for (const l of lines(md)) {
    const m = l.text.match(/^\s*(AC-(\d{3})-([BF]?)(\d+))\b/);
    if (!m) continue;
    const [, id, acNum, side] = m;
    if (!l.inCode) { err(file, `строка ${l.n}: ${id} вне блока кода`); continue; }
    if (acNum !== num) err(file, `строка ${l.n}: ${id} — номер не совпадает с файлом ${num}`);
    if (acDefs.has(id)) err(file, `строка ${l.n}: ${id} уже определён в ${rel(acDefs.get(id))}`);
    acDefs.set(id, file);
    s.acs.push({ id, side });
    perBlock.set(l.block, (perBlock.get(l.block) || 0) + 1);
  }
  for (const [block, count] of perBlock) {
    if (count > 1) err(file, `в блоке кода №${block + 1} ${count} AC — каждый AC в своём блоке`);
  }

  const type = header(md, 'Тип') || '';
  if (/поведение/i.test(type) && s.acs.length === 0) err(file, 'slice типа «поведение» без AC');
  for (const side of ['B', 'F']) {
    const n = s.acs.filter((a) => a.side === side).length;
    if (n > 10) warn(file, `${n} AC в ${side === 'B' ? 'серверной' : 'фронтенд'}-половине — проверь Р2`);
  }

  const open = section(md, 'Открытые вопросы');
  if (open && !noneText(open)) {
    if (approved(slicesStatus)) err(file, 'slices одобрены, но в slice есть открытые вопросы');
    else info(file, 'есть открытые вопросы к Dev Spec');
  }
}

// зависимости
for (const [num, s] of slices) {
  for (const d of s.deps) {
    if (d === num) err(s.file, 'slice зависит сам от себя');
    else if (!slices.has(d)) err(s.file, `зависимость ${d} — такого slice нет`);
  }
}
const state = new Map();
const cycle = (num, stack) => {
  if (state.get(num) === 'done') return;
  if (state.get(num) === 'visiting') {
    err(slices.get(num).file, `цикл зависимостей: ${[...stack, num].join(' → ')}`);
    return;
  }
  state.set(num, 'visiting');
  for (const d of slices.get(num).deps) if (slices.has(d) && d !== num) cycle(d, [...stack, num]);
  state.set(num, 'done');
};
for (const num of slices.keys()) cycle(num, []);

// покрытие spec ↔ slices
if (spec && slices.size) {
  const covered = new Map();
  for (const [num, s] of slices) {
    for (const id of s.basis) {
      if (!specIds.has(id)) err(s.file, `«Основание»: ${id} нет в spec.md`);
      if (!covered.has(id)) covered.set(id, new Set());
      covered.get(id).add(num);
    }
  }
  for (const id of specIds) if (!covered.has(id)) err(slicesDir, `${id} не покрыт ни одним slice`);

  if (!readme) warn(readmeFile, 'нет README со списком slices, покрытием и порядком');
  else {
    const cov = section(readme, 'Покрытие');
    if (!cov) warn(readmeFile, 'нет раздела «Покрытие Dev Spec»');
    else {
      for (const row of cov.split('\n')) {
        const m = row.match(/^\|\s*(N?FR-\d+)\s*\|(.*)\|\s*$/);
        if (!m) continue;
        const inReadme = new Set([...m[2].matchAll(/\b\d{3}\b/g)].map((x) => x[0]));
        const inSlices = covered.get(m[1]) || new Set();
        const same = inReadme.size === inSlices.size && [...inReadme].every((x) => inSlices.has(x));
        if (!same) {
          warn(readmeFile, `покрытие ${m[1]}: в README ${[...inReadme].join(', ') || '—'}, по «Основание» slices ${[...inSlices].join(', ') || '—'}`);
        }
      }
    }
  }
  const behaviour = [...slices.keys()].length;
  if (behaviour > 6) info(slicesDir, `${behaviour} slices — больше ориентира 3–6; у каждого лишнего нужна причина Р1–Р3`);
}

// ---------- ссылки на AC и ADR ----------
const adrDir = path.join(featureDir, '..', 'adr');
const adrFiles = fs.existsSync(adrDir)
  ? fs.readdirSync(adrDir).filter((f) => /^\d{4}-.+\.md$/.test(f)).map((f) => path.join(adrDir, f))
  : [];
const featureName = path.basename(path.resolve(featureDir));
const featureAdrs = adrFiles.filter((f) => read(f).includes(`${featureName}/`));

const refFiles = [specFile, readmeFile, ...[...slices.values()].map((s) => s.file), ...featureAdrs];
if (acDefs.size) {
  for (const f of refFiles) {
    const md = read(f);
    if (!md) continue;
    for (const l of lines(md)) {
      for (const m of l.text.matchAll(/\bAC-\d{3}-[BF]?\d+\b/g)) {
        if (!acDefs.has(m[0])) warn(f, `строка ${l.n}: ссылка на ${m[0]}, такого AC нет`);
      }
    }
  }
}
for (const f of featureAdrs) {
  if (!header(read(f), 'Статус')) warn(f, 'нет строки «Статус:»');
}

// ---------- этап ----------
const brainstorm = read(path.join(featureDir, 'brainstorming.md'));
let stage;
if (slices.size && approved(slicesStatus)) stage = 'Планирование завершено: slices одобрены. ADR, на которые они опираются, должны быть «принято»';
else if (slices.size) stage = 'Этап 3, slices не одобрены. Следующий шаг: /sdd-review slices, затем checkpoint 2';
else if (spec && approved(specStatus)) stage = 'Этап 3, Dev Spec одобрен. Следующий шаг: /sdd-slices';
else if (spec) stage = 'Этап 2, Dev Spec не одобрен. Следующий шаг: /sdd-review spec, затем checkpoint 1';
else if (brainstorm) stage = 'Этап 1–2, есть протокол. Следующий шаг: /sdd-spec (если протокол готов) или продолжить /sdd-grill';
else stage = 'Этап 1, brainstorming не начат. Следующий шаг: /sdd-grill';

// ---------- вывод ----------
for (const e of errors) console.log(`ОШИБКА    ${e}`);
for (const w of warnings) console.log(`ВНИМАНИЕ  ${w}`);
for (const i of infos) console.log(`ИНФО      ${i}`);
console.log(`\n${stage}`);
console.log(`Ошибок: ${errors.length}, предупреждений: ${warnings.length}. FR/NFR: ${specIds.size}, slices: ${slices.size}, AC: ${acDefs.size}`);
process.exit(errors.length ? 1 : 0);
