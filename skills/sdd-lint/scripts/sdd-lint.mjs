#!/usr/bin/env node
// sdd-lint — детерминированные проверки артефактов планирования SDD.
// Всё, что можно проверить или вывести скриптом, делает скрипт; модели остаётся смысл.
// Без зависимостей, Node 18+. Справка: node sdd-lint.mjs help

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

// ---------- как человек вызывает команды ----------
// Подсказки печатаются готовыми командами со slug фичи, чтобы их можно было скопировать.
// Ветки-адаптеры меняют здесь значения по умолчанию; переменные окружения переопределяют их.
const SKILL_PREFIX = process.env.SDD_SKILL_PREFIX ?? '/skills ';
const LINT_CMD = process.env.SDD_LINT_CMD ?? '/skills sdd-lint';
const skill = (name, ...args) => [`${SKILL_PREFIX}${name}`, ...args].join(' ');
const lintCmd = (...args) => [LINT_CMD, ...args].join(' ');
// «/sdd-decide» в текстах правил → команда в форме этого агента.
const cmds = (text) => text.replace(/(?<![\w/])\/(sdd-[a-z]+|humanizer)\b/g, (_, n) => skill(n));

const HELP = `sdd-lint — проверки артефактов планирования SDD

  sdd-lint [check] docs/<feature> [--snapshot] [--json]
      все проверки и текущий этап. Код 1 — есть ошибки.
      --snapshot — заодно снять снимок защищённых частей для guard
  sdd-lint gate <spec|slices|adr|decide|build> docs/<feature>
      ворота перед этапом. Код 3 — этап начинать нельзя
  sdd-lint approve <spec|slices> docs/<feature>
  sdd-lint approve adr docs/<feature> [NNNN]
      поставить «одобрено <дата>» («принято» для ADR), если нет ошибок lint
      и защищённые части не менялись после снимка. Запускает только человек
  sdd-lint diff docs/<feature> [--base <ref>]
      проверки по git (по умолчанию против HEAD): протокол только дописывается,
      ID не пропадают, одобренный файл не меняется без сброса статуса
  sdd-lint snapshot <файл | docs/<feature>>
      снимок защищённых частей перед humanizer
  sdd-lint guard <файл | docs/<feature>> [--base <ref>]
      что humanizer менять не должен: блоки кода, шапки, заголовки, таблицы,
      «тексты», числа, ID. Сверка со снимком, без снимка — с git
  sdd-lint gen readme docs/<feature>
      таблица slices, «Покрытие Dev Spec» и «Порядок работ» в slices/README.md
  sdd-lint gen guessed docs/<feature>
      таблица «Где агент угадал бы не так» в протоколе
  sdd-lint next <FR|NFR|slice|adr> docs/<feature>
  sdd-lint next AC docs/<feature> <NNN> [B|F]
      следующий свободный номер

Коды выхода: 0 — порядок, 1 — ошибки, 2 — неверный вызов, 3 — ворота закрыты.

Форма команд в подсказках: SDD_SKILL_PREFIX (по умолчанию «/skills ») и SDD_LINT_CMD
(по умолчанию «/skills sdd-lint»).`;

// ---------- правила: уровень и как исправить ----------
// err — блокер, warn — стоит поправить, info — к сведению.
const RULES = {
  'PR-01': ['warn', 'добавь под заголовком «Статус: идёт», после «Понимание общее? — да» — «Статус: готов»'],
  'PR-02': ['err', 'номер строки в «Решения» — предыдущий + 1; строки только дописываются, не перенумеровываются'],
  'PR-03': ['err', 'у строки нет решения человека: задай вопрос ещё раз или запиши «вне scope»'],
  'PR-04': ['warn', 'заполни «Чем плоха догадка» словами: что сломалось бы, если бы агент решил сам'],
  'PR-05': ['warn', 'таблицу «Где агент угадал бы не так» не пиши руками: sdd-lint gen guessed docs/<feature>'],

  'SP-01': ['warn', 'добавь строку «Статус: черновик | на ревью | одобрено <дата>» под заголовком'],
  'SP-02': ['err', 'каждый FR/NFR — в своём блоке кода ``` … ```'],
  'SP-03': ['err', 'у каждого требования свой номер: новое — sdd-lint next FR docs/<feature>'],
  'SP-04': ['err', 'в Dev Spec нет требований: FR-1 … в блоках кода'],
  'SP-05': ['warn', 'опиши, что видит пользователь; технология — в ADR и контрактах'],
  'SP-06': ['err', 'одобрять spec с открытыми вопросами нельзя: закрой их через /sdd-decide или верни статус «на ревью»'],
  'SP-07': ['info', 'открытые вопросы закрываются через /sdd-decide до одобрения'],
  'SP-08': ['err', 'после правила добавь «Пример:» с персонажем и конкретным исходом'],
  'SP-09': ['warn', 'пример должен опираться на персонажа или объект из «Данные для примеров»'],
  'SP-10': ['err', 'NFR — с числом и условием объёма: «p95 ≤ 300 мс при 500 участниках»'],
  'SP-11': ['warn', 'граница задаётся парой «проходит / не проходит»: N и N+1 (или N−1)'],
  'SP-12': ['warn', 'число взято из рекомендации агента, а человек его не выбирал: убери или вынеси в «Открытые вопросы»'],
  'SP-13': ['err', 'добавь раздел «## Трассировка»: | Протокол | Куда | — каждая строка протокола → FR/NFR, «вне scope», «открытый вопрос» или «не про поведение: причина»'],
  'SP-14': ['err', 'строка протокола потеряна: добавь её в «Трассировка» с целью'],
  'SP-15': ['err', 'трассировка ссылается на то, чего нет: проверь номер строки протокола или ID требования'],
  'SP-16': ['err', 'требование без опоры на протокол: укажи строку протокола в «Трассировка» или перенеси правило в «Открытые вопросы»'],
  'SP-17': ['warn', 'цель трассировки — ID требования, «вне scope», «открытый вопрос» или «не про поведение: причина»'],
  'SP-18': ['warn', 'используй персонажей из «Данные для примеров» или добавь туда нового'],
  'SP-19': ['err', 'в одном блоке кода одно требование'],
  'SP-20': ['warn', 'число в NFR берётся из решения человека в протоколе; нет решения — «Открытые вопросы»'],

  'SL-01': ['err', 'шапка slice: Тип, Основание, Зависимости, Половины, Результат, Почему отдельно — см. шаблон'],
  'SL-02': ['err', '«Почему отдельно: Р1 | Р2 | Р3 — пояснение»; без причины slice склеивается с соседом'],
  'SL-03': ['err', 'каждый AC — в своём блоке кода'],
  'SL-04': ['err', 'номер в AC-NNN-… совпадает с номером файла slice'],
  'SL-05': ['err', 'у каждого AC свой номер: sdd-lint next AC docs/<feature> <NNN> [B|F]'],
  'SL-06': ['err', 'в одном блоке кода один AC'],
  'SL-07': ['err', 'у slice типа «поведение» должны быть AC'],
  'SL-08': ['warn', 'больше 10 AC в половине: проверь Р2 — резать по наблюдаемому результату, не по слою'],
  'SL-09': ['info', 'открытые вопросы к Dev Spec закрываются через /sdd-decide'],
  'SL-10': ['err', 'одобрять slices с открытыми вопросами нельзя: /sdd-decide или статус «на ревью»'],
  'SL-11': ['err', 'зависимости — номера существующих slices, без циклов'],
  'SL-12': ['err', '«Основание» ссылается на требование, которого нет в spec.md'],
  'SL-13': ['err', 'каждый FR/NFR должен стоять в «Основание» хотя бы одного slice'],
  'SL-14': ['err', 'AC: строка «ID имя [FR-n]», затем WHEN, потом AND / THEN — каждое на своей строке'],
  'SL-15': ['warn', 'каждая строка AC начинается с WHEN, AND или THEN (продолжение — с бóльшим отступом)'],
  'SL-16': ['err', 'в строку AC допиши требование, из которого он выведен: «AC-003-B2 Имя [FR-1]»'],
  'SL-17': ['err', 'AC выводится только из FR своего slice: добавь FR в «Основание» или проведи решение через /sdd-decide'],
  'SL-18': ['warn', 'AC проверяет FR зависимости: проверь, не место ли ему в том slice'],
  'SL-19': ['err', 'FR из «Основание» не проверяется ни одним AC: добавь AC или убери FR из «Основание»'],
  'SL-20': ['err', 'AC-NNN-k — в «Общая приёмка», AC-NNN-Bk — в разделе «<Сервис>-половина», AC-NNN-Fk — в «Frontend-половина»'],
  'SL-21': ['warn', 'сервис из заголовка половины должен быть в строке «Половины:»'],
  'SL-22': ['warn', 'AC — про наблюдаемое на границе: без моков, стендов, классов, файлов и «через сервис X»'],
  'SL-23': ['warn', 'текст сообщения берётся из Dev Spec дословно; новый текст — через /sdd-decide'],
  'SL-24': ['warn', 'используй персонажей из «Данные для примеров» Dev Spec'],
  'SL-25': ['warn', '«Границы» ссылаются на существующие slices'],
  'SL-26': ['info', 'у каждого slice сверх ориентира 3–6 должна быть причина Р1–Р3'],
  'SL-27': ['warn', 'ссылка на AC, которого нет'],

  'RM-01': ['warn', 'создай README: sdd-lint gen readme docs/<feature>'],
  'RM-02': ['warn', 'README расходится со slices — не правь руками: sdd-lint gen readme docs/<feature>'],
  'RM-03': ['warn', 'FR делят несколько slices: опиши в «Пересечения», где граница; если это один экран или обработчик — кандидат на склейку (С4)'],
  'RM-04': ['warn', 'сквозная «Проверка фичи» проходит через каждый FR: добавь шаг'],

  'AD-01': ['warn', 'добавь «Статус: предложено | принято | отклонено»'],
  'AD-02': ['err', 'разделы ADR: Контекст, Варианты, Решение, Последствия, Не выяснено'],
  'AD-03': ['err', 'нужно не меньше двух вариантов («### A. …», «### B. …»)'],
  'AD-04': ['err', 'у каждого варианта строка «Отклонён | Выбран | Отложен: причина», выбран ровно один'],
  'AD-05': ['err', 'отклоняй через требование: «Отклонён: не выполняет NFR-3»'],
  'AD-06': ['err', '«Контекст» перечисляет FR/NFR из spec.md, которые решение обязано выполнить'],
  'AD-07': ['err', 'номера slices в шапке и «Последствия» — существующие, каждый затронутый slice описан в «Последствия»'],
  'AD-08': ['warn', 'у каждого пункта «Не выяснено» сказано, блокирует ли он slices и какие'],
  'AD-09': ['err', 'номер ADR в имени файла и в заголовке совпадают и не повторяются: sdd-lint next adr docs/<feature>'],
  'AD-10': ['warn', 'slices одобрены — ADR, на которые они опираются, должны быть «принято» до старта реализации'],

  'RV-01': ['warn', 'блокер ревью закрывается до одобрения: решение — /sdd-decide <feature> R<n> «<решение>», правка — исправь файл и впиши в «Решение» «исправлено»; несогласие — «отклонено: причина»'],
  'RV-02': ['warn', 'файл ревью — по шаблону sdd-review: таблица с колонками #, Важность, Где, Что не так, Пункт, Предложение, Решение и ID R1, R2 …'],

  'DF-01': ['err', 'протокол только дописывается: верни строку как была, новое решение — строкой в «Решения после brainstorming» (/sdd-decide)'],
  'DF-02': ['err', 'ID постоянные: верни требование или AC с пометкой «(удалён: причина)»'],
  'DF-03': ['err', 'одобрение давалось прошлой версии: верни статус «на ревью»'],
  'DF-04': ['warn', 'новый AC после одобрения: «(добавлен после: <источник>)» в строке AC и «Изменён после: …» в шапке slice'],

  'HG-01': ['err', 'humanizer меняет только прозу: верни защищённую часть как была (снимок или git), затем sdd-lint guard ещё раз'],
};

// ---------- аргументы ----------
const argv = process.argv.slice(2);
const flags = { json: false, snapshot: false, base: null };
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json') flags.json = true;
  else if (a === '--snapshot') flags.snapshot = true;
  else if (a === '--base') flags.base = argv[++i];
  else if (a.startsWith('--base=')) flags.base = a.slice(7);
  else pos.push(a);
}
const COMMANDS = ['check', 'gate', 'approve', 'diff', 'snapshot', 'guard', 'gen', 'next', 'help'];
const cmd = COMMANDS.includes(pos[0]) ? pos.shift() : 'check';
const usage = (msg) => {
  console.error(msg ? `${msg}\nСправка: ${lintCmd('help')}` : HELP);
  process.exit(2);
};
if (cmd === 'help' || argv.includes('--help') || argv.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}

// ---------- общее ----------
const read = (f) => (f && fs.existsSync(f) && fs.statSync(f).isFile() ? fs.readFileSync(f, 'utf8') : null);
const rel = (f) => (f ? path.relative(process.cwd(), f) || f : '');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const uniq = (a) => [...new Set(a)];
const isEmptyCell = (s) => !s || /^[—–\-?]*$/.test(s.trim());
const approved = (status) => !!status && /одобрен|принят/i.test(status);
const noneText = (t) => !t || /^нет(?!\p{L})/iu.test(t.trim());

const findings = [];
const add = (rule, file, line, msg) => {
  const [level] = RULES[rule];
  findings.push({ rule, level, file: rel(file), line: line || null, msg });
};

// Делит markdown на строки: внутри ли блока кода, номер блока, текущий раздел второго уровня.
function scan(md) {
  const lines = [];
  const blocks = [];
  let inCode = false;
  let block = -1;
  let h2 = null;
  (md || '').split(/\r?\n/).forEach((text, i) => {
    const n = i + 1;
    if (/^\s*```/.test(text)) {
      inCode = !inCode;
      if (inCode) {
        block += 1;
        blocks.push({ idx: block, start: n, h2, lines: [] });
      }
      return;
    }
    if (!inCode && /^##\s/.test(text)) h2 = text.replace(/^##\s+/, '').trim();
    const l = { text, n, inCode, block: inCode ? block : null, h2 };
    lines.push(l);
    if (inCode) blocks[block].lines.push(l);
  });
  return { lines, blocks };
}

const isH2 = (l) => !l.inCode && /^##\s/.test(l.text);
const inSection = (sc, re) => sc.lines.filter((l) => l.h2 && re.test(l.h2) && !isH2(l));
const hasSection = (sc, re) => sc.lines.some((l) => isH2(l) && re.test(l.h2));
const sectionText = (sc, re) => inSection(sc, re).map((l) => l.text).join('\n').trim();

const header = (md, key) => {
  const m = (md || '').match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  return m ? m[1].trim() : null;
};
const headerLine = (md, key) => {
  const i = (md || '').split(/\r?\n/).findIndex((t) => new RegExp(`^${key}:`).test(t));
  return i < 0 ? null : i + 1;
};

const splitRow = (t) => t.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
function tables(ls) {
  const out = [];
  let cur = null;
  for (const l of ls) {
    const t = l.text.trim();
    if (!l.inCode && t.startsWith('|')) {
      const cells = splitRow(t);
      if (!cur) {
        cur = { header: cells, rows: [], start: l.n, end: l.n };
        out.push(cur);
        continue;
      }
      cur.end = l.n;
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      cur.rows.push({ cells, n: l.n });
    } else cur = null;
  }
  return out;
}
const col = (t, m) => t.header.findIndex((h) => (typeof m === 'string' ? h === m : m.test(h)));

const REQ_RE = /\bN?FR-\d+\b/g;
const reqIds = (s) => uniq([...(s || '').matchAll(REQ_RE)].map((m) => m[0]));
const NUM_RE = /(?<![\p{L}\d\-])\d+(?:[.,]\d+)?(?![\p{L}\d])/gu;
const numbers = (s) => [...(s || '').matchAll(NUM_RE)].map((m) => m[0]);
const quotes = (s) => [...(s || '').matchAll(/«([^«»]+)»/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());

const word = (re) => new RegExp(`(?<![\\p{L}\\d_])(?:${re})(?![\\p{L}\\d_])`, 'iu');
const SPEC_STOP_WORDS = [
  ['эндпоинт', word('эндпоинт\\p{L}*|endpoint\\p{L}*')],
  ['БД / база данных', word('бд|баз\\p{L}* данных|database')],
  ['технология', word('kafka|rabbitmq|redis|postgres\\p{L}*|postgresql|mysql|mongo\\p{L}*|elastic\\p{L}*|outbox|websocket\\p{L}*|grpc|graphql')],
  ['формат данных', word('json|yaml|xml|sql|utf-?8|bom|base64')],
  ['хранилище или очередь', word('s3|minio|очеред\\p{L}*|брокер\\p{L}*|кэш\\p{L}*|cache')],
  ['HTTP', word('http|rest|get|post|put|patch|delete')],
  ['имя файла', /[\w-]+\.(?:ts|tsx|js|mjs|py|java|kt|go|cs|yaml|yml|json|sql)\b/],
];
const AC_STOP_WORDS = [
  ['мок или заглушка', word('мок\\p{L}*|mock\\p{L}*|stub\\p{L}*|заглушк\\p{L}*|фикстур\\p{L}*|fixture\\p{L}*')],
  ['стенд', word('стенд\\p{L}*')],
  ['класс', word('класс\\p{L}*')],
  ['«через сервис»', word('через сервис\\p{L}*')],
  ['имя файла', /[\w-]+\.(?:ts|tsx|js|mjs|py|java|kt|go|cs|yaml|yml|json|sql)\b/],
  ['имя класса', /\b[A-Z][a-z]+[A-Z][A-Za-z]*\b/],
];

// ---------- персонажи и объекты из «Данные для примеров» ----------
const stem = (w) => (w.length <= 4 ? w.slice(0, 3) : w.slice(0, -1));
const NAME_PAIR = /(?<![\p{L}])([А-ЯЁ][а-яё]{2,})\s+([А-ЯЁ][а-яё]{2,})(?![\p{L}])/gu;

function parseData(sc) {
  const ls = inSection(sc, /^Данные для примеров/);
  const people = [];
  const objects = new Set();
  const objNames = new Set();
  const addPerson = (s) => {
    const m = s.match(/([А-ЯЁ][а-яё]+)(?:\s+([А-ЯЁ][а-яё]+))?/u);
    if (m) people.push({ first: m[1], last: m[2] || null });
  };
  const addObjects = (s) => {
    for (const m of s.matchAll(/\b[A-Z][A-Z0-9]*-\d+\b/g)) objects.add(m[0]);
    for (const q of quotes(s)) objNames.add(q);
  };
  for (const t of tables(ls)) {
    const persons = /персонаж|участник|пользовател|кто/i.test(t.header[0] || '');
    for (const r of t.rows) {
      if (persons) addPerson(r.cells[0] || '');
      for (const c of r.cells) addObjects(c);
    }
  }
  for (const l of ls) {
    if (l.inCode || l.text.trim().startsWith('|')) continue;
    const m = l.text.match(/^\s*[-*]\s+([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?)/u);
    if (m) addPerson(m[1]);
    addObjects(l.text);
  }
  return { people, objects, objNames };
}

function mentionsData(text, data) {
  const starts = (w) => new RegExp(`(?<![\\p{L}])${esc(stem(w))}`, 'u').test(text);
  return (
    data.people.some((p) => starts(p.first) || (p.last && starts(p.last))) ||
    [...data.objects].some((o) => text.includes(o)) ||
    [...data.objNames].some((o) => text.includes(o))
  );
}

function unknownNames(text, data) {
  if (!data.people.length) return [];
  const bare = text.replace(/«[^«»]*»/g, ' ');
  const known = (a, b) =>
    data.people.some(
      (p) =>
        p.last &&
        ((a.startsWith(stem(p.first)) && b.startsWith(stem(p.last))) ||
          (a.startsWith(stem(p.last)) && b.startsWith(stem(p.first)))),
    );
  return uniq([...bare.matchAll(NAME_PAIR)].filter((m) => !known(m[1], m[2])).map((m) => `${m[1]} ${m[2]}`));
}

// ---------- разбор артефактов ----------
function parseProtocol(file, md) {
  if (md == null) return null;
  const sc = scan(md);
  const rows = [];
  const main = tables(inSection(sc, /^Решения\s*$/))[0];
  if (main) {
    const ci = col(main, '#');
    const cr = col(main, /рекоменд/i);
    const cd = col(main, /^решени/i);
    const cq = col(main, /вопрос/i);
    for (const r of main.rows) {
      rows.push({
        id: (r.cells[ci] ?? '').trim(),
        q: r.cells[cq] ?? '',
        rec: cr >= 0 ? r.cells[cr] ?? '' : '',
        dec: cd >= 0 ? r.cells[cd] ?? '' : '',
        n: r.n,
        raw: r.cells.join(' | '),
      });
    }
  }
  const post = [];
  const postT = tables(inSection(sc, /^Решения после/))[0];
  if (postT) {
    const ci = col(postT, '#');
    const cd = col(postT, /^решени/i);
    postT.rows.forEach((r, k) => {
      let id = ci >= 0 ? (r.cells[ci] || '').trim() : '';
      if (/^\d+$/.test(id)) id = `П${id}`;
      if (!id) id = `П${k + 1}`;
      post.push({ id, dec: cd >= 0 ? r.cells[cd] ?? '' : '', n: r.n, raw: r.cells.join(' | ') });
    });
  }
  const outScope = inSection(sc, /^Вне scope/)
    .filter((l) => !l.inCode && /^\s*[-*]\s+\S/.test(l.text))
    .map((l) => ({ text: l.text.trim(), n: l.n }));
  const guessedT = tables(inSection(sc, /^Где агент/))[0] || null;
  return { file, md, sc, status: header(md, 'Статус'), rows, post, outScope, guessedT, hasGuessed: hasSection(sc, /^Где агент/) };
}

function parseSpec(file, md) {
  if (md == null) return null;
  const sc = scan(md);
  const reqs = new Map();
  const dups = [];
  const outside = [];
  const multi = [];
  for (const b of sc.blocks) {
    const idLines = b.lines.filter((l) => /^\s*N?FR-\d+\b/.test(l.text));
    if (idLines.length > 1) multi.push({ n: b.start, ids: idLines.map((l) => l.text.trim().split(/\s/)[0]) });
    for (const l of idLines) {
      const id = l.text.trim().match(/^N?FR-\d+/)[0];
      if (reqs.has(id)) {
        dups.push({ id, n: l.n });
        continue;
      }
      const text = b.lines.map((x) => x.text).join('\n');
      reqs.set(id, { id, n: l.n, text, first: l.text, deleted: /\(удал[её]н/i.test(l.text), h2: b.h2 });
    }
  }
  for (const l of sc.lines) {
    if (!l.inCode && /^\s*N?FR-\d+\b/.test(l.text)) outside.push({ id: l.text.trim().match(/^N?FR-\d+/)[0], n: l.n });
  }
  const traceT = tables(inSection(sc, /^Трассировка/))[0] || null;
  return {
    file,
    md,
    sc,
    status: header(md, 'Статус'),
    reqs,
    dups,
    outside,
    multi,
    data: parseData(sc),
    traceT,
    hasTrace: hasSection(sc, /^Трассировка/),
    title: ((md.match(/^#\s+(.*)$/m) || [])[1] || '').replace(/\s+—\s+Dev Spec\s*$/i, '').trim(),
  };
}

const AC_LINE = /^\s*(AC-(\d{3})-([BF]?)(\d+))\b(.*)$/;
function parseSlice(file, md) {
  const sc = scan(md);
  const num = path.basename(file).slice(0, 3);
  const basisRaw = header(md, 'Основание') ?? '';
  const depsRaw = header(md, 'Зависимости') ?? '';
  const acs = [];
  const outside = [];
  const multi = [];
  for (const b of sc.blocks) {
    const idLines = b.lines.filter((l) => AC_LINE.test(l.text));
    if (idLines.length > 1) multi.push({ n: b.start, count: idLines.length });
    for (const l of idLines) {
      const [, id, acNum, side, k, rest] = l.text.match(AC_LINE);
      acs.push({
        id,
        acNum,
        side,
        k: Number(k),
        n: l.n,
        h2: b.h2,
        deleted: /\(удал[её]н/i.test(rest),
        added: /\(добавлен после/i.test(rest),
        refs: reqIds((rest.match(/\[([^\]]*)\]/) || [])[1]),
        body: b.lines.slice(b.lines.indexOf(l) + 1),
        text: b.lines.map((x) => x.text).join('\n'),
      });
    }
  }
  for (const l of sc.lines) if (!l.inCode && AC_LINE.test(l.text)) outside.push({ id: l.text.match(AC_LINE)[1], n: l.n });
  return {
    file,
    md,
    sc,
    num,
    name: path.basename(file),
    title: ((md.match(/^#\s+\d{3}\s+[—-]\s+(.*)$/m) || [])[1] || '').trim(),
    type: header(md, 'Тип'),
    basisRaw,
    basis: new Set(reqIds(basisRaw)),
    depsRaw,
    deps: /^(нет|—|-)?$/i.test(depsRaw.trim()) ? [] : uniq([...depsRaw.matchAll(/\b\d{3}\b/g)].map((m) => m[0])),
    halves: header(md, 'Половины'),
    why: header(md, 'Почему отдельно'),
    acs,
    outside,
    multi,
  };
}

function parseAdr(file, md) {
  const sc = scan(md);
  const variants = [];
  let cur = null;
  for (const l of inSection(sc, /^Варианты/)) {
    if (!l.inCode && /^###\s/.test(l.text)) {
      cur = { title: l.text.replace(/^###\s+/, '').trim(), n: l.n, lines: [] };
      variants.push(cur);
    } else if (cur) cur.lines.push(l);
  }
  for (const v of variants) {
    v.text = v.lines.map((l) => l.text).join('\n');
    const m = v.text.match(/^\**\s*(Отклон[её]н|Выбран|Отложен)/im);
    v.verdict = m ? m[1].toLowerCase().replace('ё', 'е') : null;
  }
  return {
    file,
    md,
    sc,
    num: path.basename(file).slice(0, 4),
    headNum: (md.match(/^#\s+ADR-(\d+)/m) || [])[1] || null,
    status: header(md, 'Статус'),
    variants,
  };
}

// Находки /sdd-review: docs/<feature>/review/<spec|slices|adr-NNNN>.md, таблица с колонкой «Решение».
function parseReview(file, md) {
  const sc = scan(md);
  const t = tables(sc.lines.filter((l) => !l.inCode)).find((x) => col(x, '#') >= 0 && col(x, /^Решени/i) >= 0);
  if (!t) return { file, md, table: false, rows: [] };
  const [ci, cv, cd] = ['#', /^Важност/i, /^Решени/i].map((m) => col(t, m));
  const rows = t.rows.map((r) => ({
    id: (r.cells[ci] || '').trim(),
    blocker: /блокер/i.test(r.cells[cv] || ''),
    decision: (r.cells[cd] || '').trim(),
    n: r.n,
  }));
  return { file, md, table: true, rows };
}
const openBlockers = (rv) => (rv ? rv.rows.filter((r) => r.blocker && isEmptyCell(r.decision)) : []);
const reviewKey = (what, adrNum) => (what === 'adr' ? `adr-${adrNum}` : what);

function loadFeature(dir, readFn = read, listFn = null) {
  const featureDir = path.resolve(dir);
  const name = path.basename(featureDir);
  const protocolFile = path.join(featureDir, 'brainstorming.md');
  const specFile = path.join(featureDir, 'spec.md');
  const slicesDir = path.join(featureDir, 'slices');
  const readmeFile = path.join(slicesDir, 'README.md');
  const adrDir = path.join(featureDir, '..', 'adr');
  const list = listFn || ((d) => (fs.existsSync(d) ? fs.readdirSync(d) : []));
  const slices = new Map();
  for (const f of list(slicesDir).filter((x) => /^\d{3}-.+\.md$/.test(x)).sort()) {
    const file = path.join(slicesDir, f);
    const md = readFn(file);
    if (md != null) slices.set(f.slice(0, 3), parseSlice(file, md));
  }
  const adrs = [];
  for (const f of list(adrDir).filter((x) => /^\d{4}-.+\.md$/.test(x)).sort()) {
    const file = path.join(adrDir, f);
    const md = readFn(file);
    if (md != null) adrs.push(parseAdr(file, md));
  }
  const readme = readFn(readmeFile);
  const reviewDir = path.join(featureDir, 'review');
  const reviews = new Map();
  for (const f of list(reviewDir).filter((x) => /\.md$/.test(x)).sort()) {
    const file = path.join(reviewDir, f);
    const md = readFn(file);
    if (md != null) reviews.set(f.replace(/\.md$/, ''), parseReview(file, md));
  }
  return {
    reviewDir,
    reviews,
    dir: featureDir,
    name,
    protocol: parseProtocol(protocolFile, readFn(protocolFile)),
    spec: parseSpec(specFile, readFn(specFile)),
    slicesDir,
    slices,
    readmeFile,
    readme,
    readmeSc: readme != null ? scan(readme) : null,
    slicesStatus: readme != null ? header(readme, 'Статус') : null,
    adrDir,
    adrs,
    featureAdrs: adrs.filter((a) => a.md.includes(`${name}/`)),
    protocolFile,
    specFile,
  };
}

const featureFiles = (m) =>
  [m.protocolFile, m.specFile, m.readmeFile, ...[...m.slices.values()].map((s) => s.file), ...m.featureAdrs.map((a) => a.file)].filter((f) =>
    fs.existsSync(f),
  );

// ---------- проверки: протокол ----------
const agreed = (rec, dec) => {
  const norm = (s) => s.toLowerCase().replace(/[«»"'.,!;:—–\-()]/g, ' ').replace(/\s+/g, ' ').trim();
  return norm(rec) === norm(dec) || /^(=|да|ок|ok|согласен|согласна|согласны|принято|как рекомендовано)$/i.test(norm(dec) || dec.trim());
};
const guessedRows = (p) => p.rows.filter((r) => !isEmptyCell(r.rec) && !isEmptyCell(r.dec) && !agreed(r.rec, r.dec));

function checkProtocol(m) {
  const p = m.protocol;
  if (!p) return;
  if (!p.status) add('PR-01', p.file, 1, 'нет строки «Статус:»');
  p.rows.forEach((r, k) => {
    if (r.id !== String(k + 1)) add('PR-02', p.file, r.n, `строка ${k + 1} таблицы «Решения» имеет номер «${r.id}», ожидался ${k + 1}`);
  });
  if (!/готов/i.test(p.status || '')) return;
  for (const r of p.rows) if (isEmptyCell(r.dec)) add('PR-03', p.file, r.n, `статус «готов», а у строки #${r.id} нет решения`);
  const expected = guessedRows(p).map((r) => r.id);
  const ct = p.guessedT;
  const have = ct ? ct.rows.map((r) => (r.cells[col(ct, '#')] ?? '').trim()) : [];
  if (expected.length !== have.length || expected.some((id) => !have.includes(id))) {
    add('PR-05', p.file, ct ? ct.start : null, `«Где агент угадал бы не так»: по протоколу строки ${expected.join(', ') || '—'}, в таблице ${have.join(', ') || '—'}`);
  }
  if (ct) {
    const cw = col(ct, /чем плох/i);
    for (const r of ct.rows) if (cw >= 0 && isEmptyCell(r.cells[cw])) add('PR-04', p.file, r.n, `строка #${r.cells[col(ct, '#')]} без «Чем плоха догадка»`);
  }
}

// ---------- проверки: Dev Spec ----------
const BOUND_RE = /(не длиннее|не короче|не больше|не более|не меньше|не менее|не позже|не раньше|максимум|минимум|до|от|≤|≥|<=|>=)\s+(\d+)(?![.,]\d)/giu;
function checkSpec(m) {
  const s = m.spec;
  if (!s) return;
  if (!s.status) add('SP-01', s.file, 1, 'нет строки «Статус:»');
  for (const o of s.outside) add('SP-02', s.file, o.n, `${o.id} вне блока кода`);
  for (const d of s.dups) add('SP-03', s.file, d.n, `${d.id} определён повторно`);
  for (const mb of s.multi) add('SP-19', s.file, mb.n, `в блоке кода ${mb.ids.length} требования: ${mb.ids.join(', ')}`);
  if (s.reqs.size === 0) add('SP-04', s.file, null, 'не найдено ни одного FR/NFR в блоках кода');

  for (const l of s.sc.lines) {
    if (l.h2 && /^Трассировка/.test(l.h2)) continue;
    if (/^Протокол:/.test(l.text)) continue;
    for (const [label, re] of SPEC_STOP_WORDS) {
      const mm = l.text.match(re);
      if (mm) add('SP-05', s.file, l.n, `«${mm[0]}» — ${label} в Dev Spec`);
    }
  }

  const open = sectionText(s.sc, /^Открытые вопросы/);
  if (open && !noneText(open)) {
    if (approved(s.status)) add('SP-06', s.file, null, 'статус «одобрено», но есть открытые вопросы');
    else add('SP-07', s.file, null, 'есть открытые вопросы');
  }

  // числа из рекомендаций агента, которых человек не выбирал
  const p = m.protocol;
  const decided = new Set();
  const recOnly = new Map();
  if (p) {
    for (const r of [...p.rows, ...p.post]) for (const x of numbers(r.dec)) decided.add(x);
    for (const r of p.rows) for (const x of numbers(r.rec)) if (!numbers(r.dec).includes(x)) recOnly.set(x, r.id);
  }

  for (const r of s.reqs.values()) {
    if (r.deleted) continue;
    const isNfr = r.id.startsWith('NFR');
    const body = r.text.replace(REQ_RE, ' ');
    if (!isNfr) {
      if (!/Пример/.test(r.text)) add('SP-08', s.file, r.n, `${r.id} без «Пример:»`);
      else if ((s.data.people.length || s.data.objects.size) && !mentionsData(r.text, s.data))
        add('SP-09', s.file, r.n, `${r.id}: в примере нет персонажа или объекта из «Данные для примеров»`);
      const nums = numbers(body).map((x) => Number(x.replace(',', '.')));
      for (const mm of body.matchAll(BOUND_RE)) {
        const n = Number(mm[2]);
        if (n < 2) continue;
        if (!nums.includes(n + 1) && !nums.includes(n - 1)) add('SP-11', s.file, r.n, `${r.id}: «${mm[0]}» без парного значения ${n + 1} (или ${n - 1})`);
      }
    } else if (!numbers(body).length) add('SP-10', s.file, r.n, `${r.id} без числа`);
    else if (p && p.rows.length) for (const x of uniq(numbers(body))) if (!decided.has(x)) add('SP-20', s.file, r.n, `${r.id}: числа ${x} нет в решениях протокола`);
    for (const x of uniq(numbers(body))) {
      if (Number(x.replace(',', '.')) >= 10 && recOnly.has(x) && !decided.has(x))
        add('SP-12', s.file, r.n, `${r.id}: число ${x} есть только в рекомендации агента (строка #${recOnly.get(x)} протокола)`);
    }
    for (const nm of unknownNames(r.text, s.data)) add('SP-18', s.file, r.n, `${r.id}: «${nm}» нет в «Данные для примеров»`);
  }

  // трассировка протокол → требования
  if (!p) return;
  if (!s.hasTrace || !s.traceT) {
    add('SP-13', s.file, null, s.hasTrace ? 'в разделе «Трассировка» нет таблицы' : 'нет раздела «Трассировка»');
    return;
  }
  const t = s.traceT;
  const protoIds = new Set([...p.rows.map((r) => r.id), ...p.post.map((r) => r.id)]);
  const traced = new Set();
  const targets = new Set();
  const ct = Math.max(1, col(t, /куда|цель|требован/i));
  for (const r of t.rows) {
    const refs = [...(r.cells[0] || '').matchAll(/П?\d+/gu)].map((x) => x[0]);
    for (const ref of refs) {
      if (!protoIds.has(ref)) add('SP-15', s.file, r.n, `«Трассировка»: строки ${ref} нет в протоколе`);
      traced.add(ref);
    }
    const cell = r.cells[ct] || '';
    const ids = reqIds(cell);
    for (const id of ids) {
      if (!s.reqs.has(id)) add('SP-15', s.file, r.n, `«Трассировка»: ${id} нет в spec.md`);
      targets.add(id);
    }
    if (!ids.length && !/вне scope|открыт|не про поведение|adr/i.test(cell)) add('SP-17', s.file, r.n, `«Трассировка»: непонятная цель «${cell}»`);
  }
  for (const r of [...p.rows, ...p.post]) if (!traced.has(r.id)) add('SP-14', s.file, t.start, `строки протокола #${r.id} нет в «Трассировка»`);
  for (const r of s.reqs.values()) if (!r.deleted && !targets.has(r.id)) add('SP-16', s.file, r.n, `${r.id} не выводится ни из одной строки протокола`);
}

// ---------- проверки: slices ----------
const KW = /^(WHEN|AND|THEN|OR|BUT)\b/;
const indent = (t) => t.match(/^\s*/)[0].length;
const sideOfHeading = (h) => {
  if (!h) return null;
  if (/общ/i.test(h)) return '';
  if (/front|фронт/i.test(h)) return 'F';
  if (/половин/i.test(h)) return 'B';
  return null;
};

function checkSlices(m) {
  const s = m.spec;
  const slices = m.slices;
  if (!slices.size) return;
  const behaviour = [...slices.values()].filter((x) => /поведение/i.test(x.type || '')).map((x) => x.num).sort();
  const firstBehaviour = behaviour[0];
  const acDefs = new Map();

  for (const sl of slices.values()) {
    const f = sl.file;
    for (const key of ['Тип', 'Основание', 'Зависимости', 'Половины', 'Результат'])
      if (header(sl.md, key) === null) add('SL-01', f, null, `нет строки «${key}:» в шапке`);
    const isPrep = /подготов/i.test(sl.type || '');
    if (!isPrep && sl.num !== firstBehaviour && sl.num !== '001') {
      if (sl.why === null) add('SL-02', f, null, 'нет строки «Почему отдельно:»');
      else if (!/^\**\s*Р[123](?!\d)/u.test(sl.why)) add('SL-02', f, headerLine(sl.md, 'Почему отдельно'), `«Почему отдельно: ${sl.why}» — нет Р1, Р2 или Р3`);
    }

    for (const o of sl.outside) add('SL-03', f, o.n, `${o.id} вне блока кода`);
    for (const mb of sl.multi) add('SL-06', f, mb.n, `в блоке кода ${mb.count} AC`);

    // FR зависимостей (транзитивно)
    const depBasis = new Set();
    const seen = new Set();
    const walk = (num) => {
      for (const d of slices.get(num)?.deps || []) {
        if (seen.has(d) || !slices.has(d)) continue;
        seen.add(d);
        for (const id of slices.get(d).basis) depBasis.add(id);
        walk(d);
      }
    };
    walk(sl.num);
    const checked = new Set();

    for (const ac of sl.acs) {
      if (ac.acNum !== sl.num) add('SL-04', f, ac.n, `${ac.id} — номер не совпадает с файлом ${sl.num}`);
      if (acDefs.has(ac.id)) add('SL-05', f, ac.n, `${ac.id} уже определён в ${rel(acDefs.get(ac.id))}`);
      acDefs.set(ac.id, f);
      if (ac.deleted) continue;

      const side = sideOfHeading(ac.h2);
      if (side !== ac.side) {
        const where = ac.side === '' ? '«Общая приёмка»' : ac.side === 'F' ? '«Frontend-половина»' : '«<Сервис>-половина»';
        add('SL-20', f, ac.n, `${ac.id} стоит в разделе «${ac.h2 || '—'}», его место — ${where}`);
      }
      if (ac.side === 'B' && ac.h2 && sl.halves) {
        const svc = ac.h2.replace(/[-–—\s]*половина.*$/i, '').trim().toLowerCase();
        if (svc && !sl.halves.toLowerCase().includes(svc)) add('SL-21', f, ac.n, `раздел «${ac.h2}», а в «Половины:» — «${sl.halves}»`);
      }

      // структура WHEN / AND / THEN
      const content = ac.body.filter((l) => l.text.trim());
      if (!content.length || !/^WHEN\b/.test(content[0].text.trim())) add('SL-14', f, ac.n, `${ac.id}: первая строка после имени — не WHEN`);
      else if (!content.some((l) => /^THEN\b/.test(l.text.trim()))) add('SL-14', f, ac.n, `${ac.id}: нет THEN`);
      let lastKw = null;
      for (const l of content) {
        if (KW.test(l.text.trim())) lastKw = indent(l.text);
        else if (lastKw === null || indent(l.text) <= lastKw) add('SL-15', f, l.n, `${ac.id}: строка без WHEN / AND / THEN`);
      }

      // AC выводится из FR
      if (!ac.refs.length) add('SL-16', f, ac.n, `${ac.id} без ссылки на FR`);
      for (const id of ac.refs) {
        checked.add(id);
        if (s && !s.reqs.has(id)) add('SL-17', f, ac.n, `${ac.id} ссылается на ${id}, его нет в spec.md`);
        else if (sl.basis.has(id)) continue;
        else if (depBasis.has(id)) add('SL-18', f, ac.n, `${ac.id} проверяет ${id} из зависимости`);
        else add('SL-17', f, ac.n, `${ac.id} ссылается на ${id}, а в «Основание» slice его нет`);
      }

      const plain = ac.text.replace(/«[^«»]*»/g, ' ').replace(/\[[^\]]*\]/g, ' ');
      for (const [label, re] of AC_STOP_WORDS) {
        const mm = plain.match(re);
        if (mm) add('SL-22', f, ac.n, `${ac.id}: «${mm[0]}» — ${label}`);
      }
      if (s) {
        const specFlat = s.md.replace(/\s+/g, ' ');
        for (const q of quotes(ac.text)) if (!q.includes('<') && !specFlat.includes(q)) add('SL-23', f, ac.n, `${ac.id}: «${q}» нет в Dev Spec`);
        for (const nm of unknownNames(ac.text, s.data)) add('SL-24', f, ac.n, `${ac.id}: «${nm}» нет в «Данные для примеров»`);
      }
    }

    if (/поведение/i.test(sl.type || '')) {
      if (!sl.acs.length) add('SL-07', f, null, 'slice типа «поведение» без AC');
      // пока у части AC нет ссылок на FR (SL-16), покрытие по ним не считаем
      else if (sl.acs.every((a) => a.deleted || a.refs.length))
        for (const id of sl.basis) {
          if (s?.reqs.get(id)?.deleted) continue;
          if (!checked.has(id)) add('SL-19', f, headerLine(sl.md, 'Основание'), `${id} из «Основание» не проверяет ни один AC`);
        }
    }
    for (const side of ['B', 'F']) {
      const n = sl.acs.filter((a) => a.side === side && !a.deleted).length;
      if (n > 10) add('SL-08', f, null, `${n} AC в ${side === 'B' ? 'серверной' : 'фронтенд'}-половине`);
    }

    const open = sectionText(sl.sc, /^Открытые вопросы/);
    if (open && !noneText(open)) {
      if (approved(m.slicesStatus)) add('SL-10', f, null, 'slices одобрены, но в slice есть открытые вопросы');
      else add('SL-09', f, null, 'есть открытые вопросы к Dev Spec');
    }

    const bounds = sectionText(sl.sc, /^Границы/);
    const refs = [
      ...[...bounds.matchAll(/\((\d{3}(?:\s*(?:,|и)\s*\d{3})*)\)/g)].flatMap((x) => x[1].match(/\d{3}/g)),
      ...[...bounds.matchAll(/slice\s+(\d{3})/gi)].map((x) => x[1]),
    ];
    for (const r of uniq(refs)) if (!slices.has(r)) add('SL-25', f, null, `«Границы»: slice ${r} нет`);
  }

  // зависимости
  for (const [num, sl] of slices) {
    for (const d of sl.deps) {
      if (d === num) add('SL-11', sl.file, headerLine(sl.md, 'Зависимости'), 'slice зависит сам от себя');
      else if (!slices.has(d)) add('SL-11', sl.file, headerLine(sl.md, 'Зависимости'), `зависимость ${d} — такого slice нет`);
    }
  }
  const state = new Map();
  const cycle = (num, stack) => {
    if (state.get(num) === 'done') return;
    if (state.get(num) === 'visiting') {
      add('SL-11', slices.get(num).file, null, `цикл зависимостей: ${[...stack, num].join(' → ')}`);
      return;
    }
    state.set(num, 'visiting');
    for (const d of slices.get(num).deps) if (slices.has(d) && d !== num) cycle(d, [...stack, num]);
    state.set(num, 'done');
  };
  for (const num of slices.keys()) cycle(num, []);

  // покрытие spec ↔ slices
  if (s) {
    for (const sl of slices.values())
      for (const id of sl.basis) if (!s.reqs.has(id)) add('SL-12', sl.file, headerLine(sl.md, 'Основание'), `«Основание»: ${id} нет в spec.md`);
    const covered = coverage(m);
    for (const r of s.reqs.values()) if (!r.deleted && !covered.has(r.id)) add('SL-13', m.slicesDir, null, `${r.id} не покрыт ни одним slice`);
  }
  if (slices.size > 6) add('SL-26', m.slicesDir, null, `${slices.size} slices — больше ориентира 3–6`);

  // ссылки на AC
  const refFiles = [m.specFile, m.readmeFile, ...[...slices.values()].map((x) => x.file), ...m.featureAdrs.map((a) => a.file)];
  for (const file of uniq(refFiles)) {
    const md = read(file);
    if (!md) continue;
    for (const l of scan(md).lines)
      for (const x of l.text.matchAll(/\bAC-\d{3}-[BF]?\d+\b/g)) if (!acDefs.has(x[0])) add('SL-27', file, l.n, `ссылка на ${x[0]}, такого AC нет`);
  }

  checkReadme(m);
}

const coverage = (m) => {
  const covered = new Map();
  for (const [num, sl] of m.slices)
    for (const id of sl.basis) {
      if (!covered.has(id)) covered.set(id, new Set());
      covered.get(id).add(num);
    }
  return covered;
};
const sameSet = (a, b) => {
  const A = new Set(a);
  const B = new Set(b);
  return A.size === B.size && [...A].every((x) => B.has(x));
};

// слои порядка работ: внутри слоя slices можно делать параллельно
function layers(m) {
  const left = new Set(m.slices.keys());
  const done = new Set();
  const out = [];
  while (left.size) {
    const layer = [...left].filter((n) => m.slices.get(n).deps.every((d) => done.has(d) || !m.slices.has(d) || d === n)).sort();
    if (!layer.length) {
      out.push([...left].sort());
      break;
    }
    layer.forEach((n) => {
      left.delete(n);
      done.add(n);
    });
    out.push(layer);
  }
  return out;
}

function checkReadme(m) {
  const f = m.readmeFile;
  if (m.readme == null) {
    add('RM-01', f, null, 'нет README со списком slices, покрытием и порядком');
    return;
  }
  const sc = m.readmeSc;
  const t = tables(sc.lines.filter((l) => !l.inCode)).find((x) => /^slice$/i.test(x.header[0] || ''));
  if (!t) add('RM-02', f, null, 'нет таблицы slices');
  else {
    const cb = col(t, /основани/i);
    const cd = col(t, /завис/i);
    const rows = new Map();
    for (const r of t.rows) {
      const num = ((r.cells[0] || '').match(/\b\d{3}\b/) || [])[0];
      if (num) rows.set(num, r);
    }
    for (const [num, sl] of m.slices) {
      const r = rows.get(num);
      if (!r) {
        add('RM-02', f, t.start, `в таблице нет slice ${num}`);
        continue;
      }
      if (cb >= 0 && !sameSet(reqIds(r.cells[cb]), sl.basis)) add('RM-02', f, r.n, `${num}: «Основание» в README не совпадает со slice`);
      const deps = uniq((r.cells[cd] || '').match(/\b\d{3}\b/g) || []);
      if (cd >= 0 && !sameSet(deps, sl.deps)) add('RM-02', f, r.n, `${num}: «Зависит от» в README не совпадает со slice`);
    }
    for (const num of rows.keys()) if (!m.slices.has(num)) add('RM-02', f, rows.get(num).n, `в таблице slice ${num}, файла нет`);
  }

  const covered = coverage(m);
  const cov = tables(inSection(sc, /^Покрытие/))[0];
  if (!cov) add('RM-02', f, null, 'нет раздела «Покрытие Dev Spec»');
  else {
    const inReadme = new Map();
    for (const r of cov.rows) {
      const id = reqIds(r.cells[0])[0];
      if (id) inReadme.set(id, { set: r.cells.slice(1).join(' ').match(/\b\d{3}\b/g) || [], n: r.n });
    }
    for (const [id, nums] of covered) {
      const x = inReadme.get(id);
      if (!x) add('RM-02', f, cov.start, `«Покрытие»: нет строки ${id}`);
      else if (!sameSet(x.set, nums)) add('RM-02', f, x.n, `«Покрытие» ${id}: в README ${uniq(x.set).join(', ') || '—'}, по «Основание» ${[...nums].join(', ')}`);
    }
  }

  const order = sectionText(sc, /^Порядок/);
  if (!order) add('RM-02', f, null, 'нет раздела «Порядок работ»');
  else {
    const pos = new Map();
    for (const x of order.matchAll(/\b\d{3}\b/g)) if (!pos.has(x[0])) pos.set(x[0], x.index);
    for (const [num, sl] of m.slices) {
      if (!pos.has(num)) add('RM-02', f, null, `«Порядок работ»: нет ${num}`);
      for (const d of sl.deps) if (pos.has(d) && pos.has(num) && pos.get(d) > pos.get(num)) add('RM-02', f, null, `«Порядок работ»: ${num} раньше своей зависимости ${d}`);
    }
  }

  const cross = sectionText(sc, /^Пересечения/);
  for (const [id, nums] of covered) {
    const beh = [...nums].filter((n) => /поведение/i.test(m.slices.get(n).type || ''));
    if (beh.length > 1 && !reqIds(cross).includes(id)) add('RM-03', f, null, `${id} в slices ${beh.join(', ')}, в «Пересечения» не описан`);
  }

  if (m.spec) {
    const inCheck = new Set(reqIds(sectionText(sc, /^Проверка фичи/)));
    for (const r of m.spec.reqs.values())
      if (!r.deleted && r.id.startsWith('FR') && !inCheck.has(r.id)) add('RM-04', f, null, `${r.id} не встречается в «Проверка фичи»`);
  }
}

// ---------- проверки: ADR ----------
function checkAdrs(m) {
  const seen = new Map();
  for (const a of m.adrs) {
    if (seen.has(a.num)) add('AD-09', a.file, null, `номер ${a.num} уже у ${rel(seen.get(a.num))}`);
    seen.set(a.num, a.file);
  }
  for (const a of m.featureAdrs) {
    const f = a.file;
    if (!a.status) add('AD-01', f, null, 'нет строки «Статус:»');
    if (a.headNum && a.headNum.padStart(4, '0') !== a.num) add('AD-09', f, 1, `файл ${a.num}, в заголовке ADR-${a.headNum}`);
    for (const sec of ['Контекст', 'Варианты', 'Решение', 'Последствия', 'Не выяснено'])
      if (!hasSection(a.sc, new RegExp(`^${sec}`))) add('AD-02', f, null, `нет раздела «${sec}»`);
    if (hasSection(a.sc, /^Варианты/)) {
      if (a.variants.length < 2) add('AD-03', f, null, `вариантов: ${a.variants.length}`);
      for (const v of a.variants) {
        if (!v.verdict) add('AD-04', f, v.n, `«${v.title}» без строки «Отклонён | Выбран | Отложен»`);
        else if (v.verdict.startsWith('отклон') && !reqIds(v.text).length) add('AD-05', f, v.n, `«${v.title}» отклонён без ссылки на FR/NFR`);
      }
      const chosen = a.variants.filter((v) => v.verdict === 'выбран').length;
      if (a.variants.length && chosen !== 1) add('AD-04', f, null, `выбрано вариантов: ${chosen}, нужен ровно один`);
    }
    if (hasSection(a.sc, /^Контекст/)) {
      const ids = reqIds(sectionText(a.sc, /^Контекст/));
      if (!ids.length) add('AD-06', f, null, '«Контекст» без FR/NFR');
      if (m.spec) for (const id of ids) if (!m.spec.reqs.has(id)) add('AD-06', f, null, `«Контекст»: ${id} нет в spec.md`);
    }
    const touched = (header(a.md, 'Затрагивает slices') || '').match(/\b\d{3}\b/g) || [];
    const consNums = [...sectionText(a.sc, /^Последствия/).matchAll(/slices?\s+(\d{3})/gi)].map((x) => x[1]);
    if (m.slices.size) {
      for (const n of uniq([...touched, ...consNums])) if (!m.slices.has(n)) add('AD-07', f, null, `slice ${n} нет`);
      for (const n of touched) if (!consNums.includes(n)) add('AD-07', f, null, `slice ${n} из шапки не описан в «Последствия»`);
    }
    for (const l of inSection(a.sc, /^Не выяснено/).filter((x) => !x.inCode && /^\s*[-*]\s+\S/.test(x.text)))
      if (!/блокир/i.test(l.text) && !/блокир/i.test(l.h2)) add('AD-08', f, l.n, 'не сказано, блокирует ли пункт slices');
    if (approved(m.slicesStatus) && !/принят/i.test(a.status || '')) add('AD-10', f, null, `статус «${a.status || '—'}», slices уже одобрены`);
  }
}

// ---------- этап ----------
// Где фича и что делать дальше — готовыми командами со slug.
const pendingAdrs = (m) => m.featureAdrs.filter((a) => !/принят/i.test(a.status || ''));
function handoff(m, what) {
  const dir = rel(m.dir);
  const target = what === 'spec' ? rel(m.specFile) : `${dir}/slices/`;
  const human = what === 'spec' ? `${skill('humanizer', target)}` : `${skill('humanizer')} по каждому файлу в ${target}`;
  const guard = lintCmd('guard', what === 'spec' ? target : dir);
  const rv = m.reviews.get(what);
  const open = openBlockers(rv);
  return [
    `по желанию убрать следы ИИ из прозы: ${human}, затем ${guard}`,
    rv ? `ревью уже было: ${rel(rv.file)}; повторить — ${skill('sdd-review', m.name, what)} в новой сессии` : `ревью в новой сессии: ${skill('sdd-review', m.name, what)}`,
    ...(open.length ? [blockersStep(m, rv, open)] : []),
    `одобрить: ${lintCmd('approve', what, dir)}`,
  ];
}
function blockersStep(m, rv, open) {
  const ids = open.map((r) => r.id);
  return `закрыть блокеры ревью ${ids.join(', ')} (${rel(rv.file)}): решение — ${skill('sdd-decide', m.name, ids[0], '"<решение>"')}, правка — исправьте файл и впишите «исправлено» в колонку «Решение»`;
}
function adrSteps(m) {
  return pendingAdrs(m).flatMap((a) => {
    const rv = m.reviews.get(reviewKey('adr', a.num));
    const open = openBlockers(rv);
    return [
      rv ? `ADR ${a.num} «${a.status || '—'}» — ревью уже было: ${rel(rv.file)}` : `ADR ${a.num} «${a.status || '—'}» — ревью: ${skill('sdd-review', m.name, 'adr', a.num)}`,
      ...(open.length ? [blockersStep(m, rv, open)] : []),
      `ADR ${a.num} — принять: ${lintCmd('approve', 'adr', rel(m.dir), a.num)}`,
    ];
  });
}
function stageOf(m) {
  const st = (now, next = []) => ({ now, next: [...next, ...adrSteps(m)] });
  // Неодобренный spec важнее всего ниже: после /sdd-decide он возвращается «на ревью»,
  // и одобрение slices относилось к другой его версии.
  if (m.slices.size && m.spec && !approved(m.spec.status))
    return st(
      approved(m.slicesStatus)
        ? `Dev Spec «${m.spec.status || '—'}», а slices уже есть — после одобрения spec проверьте и одобрите slices заново`
        : `Dev Spec «${m.spec.status || '—'}» — slices ждут его одобрения`,
      handoff(m, 'spec'),
    );
  if (m.slices.size && approved(m.slicesStatus)) {
    const pending = pendingAdrs(m);
    return pending.length
      ? { now: `Slices одобрены. Перед реализацией примите ADR: ${pending.map((a) => a.num).join(', ')}`, next: adrSteps(m) }
      : { now: 'Планирование завершено: slices одобрены, ADR приняты', next: [] };
  }
  if (m.slices.size) return st('Slices на ревью', handoff(m, 'slices'));
  if (m.spec && approved(m.spec.status)) return st('Dev Spec одобрен', [skill('sdd-slices', m.name)]);
  if (m.spec) return st(`Dev Spec «${m.spec.status || '—'}»`, handoff(m, 'spec'));
  if (m.protocol && /готов/i.test(m.protocol.status || '')) return st('Протокол готов', [skill('sdd-spec', m.name)]);
  if (m.protocol) return st('Brainstorming идёт', [`продолжить: ${skill('sdd-grill', m.name)}`]);
  return st('Brainstorming не начат', [skill('sdd-grill', m.name)]);
}
function stageText({ now, next }) {
  if (!next.length) return now;
  if (next.length === 1) return `${now}. Следующий шаг: ${next[0]}`;
  return `${now}. Следующий шаг:\n${next.map((x, i) => `  ${i + 1}. ${x}`).join('\n')}`;
}

function checkReviews(m) {
  for (const [key, rv] of m.reviews) {
    if (!rv.table || !rv.rows.every((r) => /^R\d+$/.test(r.id))) {
      add('RV-02', rv.file, null, rv.table ? 'ID находок — R1, R2 …' : 'нет таблицы находок с колонкой «Решение»');
      continue;
    }
    for (const r of openBlockers(rv)) add('RV-01', rv.file, r.n, `${r.id}: блокер без решения (ревью ${key})`);
  }
}

function runChecks(m) {
  checkProtocol(m);
  checkSpec(m);
  checkSlices(m);
  checkAdrs(m);
  checkReviews(m);
}

// ---------- вывод ----------
const LEVEL = { err: 'ОШИБКА  ', warn: 'ВНИМАНИЕ', info: 'ИНФО    ' };
const line = (x) => `${LEVEL[x.level]}  ${x.rule}  ${x.file}${x.line ? `:${x.line}` : ''}  ${x.msg}`;
function report(extra = {}) {
  const order = { err: 0, warn: 1, info: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level] || a.file.localeCompare(b.file) || (a.line || 0) - (b.line || 0));
  const counts = { err: 0, warn: 0, info: 0 };
  for (const x of findings) counts[x.level] += 1;
  if (flags.json) {
    const hints = Object.fromEntries(uniq(findings.map((x) => x.rule)).map((r) => [r, cmds(RULES[r][1])]));
    console.log(JSON.stringify({ findings, hints, counts, ...extra }, null, 2));
    return counts;
  }
  for (const x of findings) console.log(line(x));
  const fired = uniq(findings.filter((x) => x.level !== 'info').map((x) => x.rule)).sort();
  if (fired.length) {
    console.log('\nКак исправить:');
    for (const r of fired) console.log(`  ${r}  ${cmds(RULES[r][1])}`);
  }
  return counts;
}

// ---------- снимки для guard ----------
const snapDir = path.join(os.tmpdir(), 'sdd-lint-snapshots');
const snapPath = (f) => path.join(snapDir, `${crypto.createHash('sha1').update(fs.realpathSync(f)).digest('hex')}.json`);
function protectedParts(md) {
  const sc = scan(md);
  const outside = sc.lines.filter((l) => !l.inCode);
  const firstH2 = outside.findIndex((l) => /^##\s/.test(l.text));
  const top = outside.slice(0, firstH2 < 0 ? outside.length : firstH2);
  return {
    'блок кода': sc.blocks.map((b) => b.lines.map((l) => l.text.trimEnd()).join('\n')),
    заголовок: outside.filter((l) => /^#{1,6}\s/.test(l.text)).map((l) => l.text.trim()),
    'строка шапки': top.filter((l) => /^[\p{Lu}][^:|]{0,40}:\s*\S/u.test(l.text)).map((l) => l.text.trim()),
    'строка таблицы': outside.filter((l) => l.text.trim().startsWith('|')).map((l) => l.text.trim().replace(/\s+/g, ' ')),
    текст: quotes(md).map((q) => `«${q}»`),
    число: numbers(md),
    ID: [...md.matchAll(/\b(?:N?FR-\d+|AC-\d{3}-[BF]?\d+|ADR-\d+)\b/g)].map((x) => x[0]),
  };
}
function saveSnapshot(f) {
  fs.mkdirSync(snapDir, { recursive: true });
  fs.writeFileSync(snapPath(f), JSON.stringify({ file: fs.realpathSync(f), time: new Date().toISOString(), parts: protectedParts(fs.readFileSync(f, 'utf8')) }));
}
function diffParts(before, after) {
  const out = [];
  const short = (s) => (s.length > 70 ? `${s.slice(0, 67)}…` : s).replace(/\n/g, ' ⏎ ');
  for (const kind of Object.keys(before)) {
    const left = new Map();
    for (const x of before[kind]) left.set(x, (left.get(x) || 0) + 1);
    const right = new Map();
    for (const x of after[kind] || []) right.set(x, (right.get(x) || 0) + 1);
    for (const [x, c] of left) if ((right.get(x) || 0) < c) out.push(`${kind} — было: ${short(x)}`);
    for (const [x, c] of right) if ((left.get(x) || 0) < c) out.push(`${kind} — стало: ${short(x)}`);
  }
  return out;
}

// ---------- git ----------
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
function gitInfo(dir) {
  try {
    return { top: fs.realpathSync(git(['rev-parse', '--show-toplevel'], dir).trim()) };
  } catch {
    return null;
  }
}
const realish = (f) => (fs.existsSync(f) ? fs.realpathSync(f) : path.join(realish(path.dirname(f)), path.basename(f)));
const gitPath = (g, f) => path.relative(g.top, realish(f)).split(path.sep).join('/');
function gitShow(g, ref, f) {
  try {
    return git(['show', `${ref}:${gitPath(g, f)}`], g.top);
  } catch {
    return null;
  }
}
function gitList(g, ref, d) {
  try {
    return git(['ls-tree', '--name-only', ref, `${gitPath(g, d)}/`], g.top)
      .split('\n')
      .filter(Boolean)
      .map((x) => path.basename(x));
  } catch {
    return [];
  }
}

// ---------- команды ----------
function needDir(d) {
  if (!d) usage('Укажи папку фичи: docs/<feature>');
  if (fs.existsSync(d) && fs.statSync(d).isDirectory()) return d;
  const parent = path.dirname(path.resolve(d));
  const slug = path.basename(path.resolve(d));
  if (!fs.existsSync(parent)) {
    console.error(`Нет папки ${rel(parent)}. Запускайте из корня репозитория с доками.`);
    process.exit(2);
  }
  const known = fs
    .readdirSync(parent)
    .filter((x) => x !== 'adr' && fs.statSync(path.join(parent, x)).isDirectory())
    .filter((x) => ['brainstorming.md', 'spec.md'].some((f) => fs.existsSync(path.join(parent, x, f))));
  console.error(
    [
      `Нет папки ${d}.`,
      known.length ? `Фичи в ${rel(parent)}/: ${known.join(', ')}.` : `В ${rel(parent)}/ пока нет фич.`,
      `Новая фича начинается с ${skill('sdd-grill', slug)}.`,
    ].join(' '),
  );
  process.exit(2);
}

function cmdCheck() {
  const m = loadFeature(needDir(pos[0]));
  runChecks(m);
  if (flags.snapshot) for (const f of featureFiles(m)) saveSnapshot(f);
  const st = stageOf(m);
  const c = report({ stage: st.now, next: st.next });
  if (!flags.json) {
    const acs = [...m.slices.values()].reduce((x, s) => x + s.acs.length, 0);
    console.log(`\n${stageText(st)}`);
    console.log(`Ошибок: ${c.err}, предупреждений: ${c.warn}. FR/NFR: ${m.spec ? m.spec.reqs.size : 0}, slices: ${m.slices.size}, AC: ${acs}`);
  }
  process.exit(c.err ? 1 : 0);
}

function cmdGate() {
  const stage = pos[0];
  const gates = ['spec', 'slices', 'adr', 'decide', 'build'];
  if (!gates.includes(stage)) usage(`Этап для gate: ${gates.join(', ')}`);
  const m = loadFeature(needDir(pos[1]));
  runChecks(m);
  const errorsIn = (files) => findings.filter((x) => x.level === 'err' && files.map(rel).includes(x.file));
  const dir = rel(m.dir);
  const check = lintCmd(dir);
  let closed = null;
  if (stage === 'spec') {
    if (!m.protocol) closed = ['нет brainstorming.md', `Сначала проведите brainstorming: ${skill('sdd-grill', m.name)}`];
    else if (!/готов/i.test(m.protocol.status || '')) closed = [`статус протокола «${m.protocol.status || '—'}»`, `Сначала закончите brainstorming: ${skill('sdd-grill', m.name)}`];
    else if (errorsIn([m.protocolFile]).length) closed = ['ошибки в протоколе', `В протоколе ошибки lint — поправьте его, список: ${check}`];
  } else if (stage === 'slices') {
    if (!m.spec) closed = ['нет spec.md', `Сначала соберите Dev Spec: ${skill('sdd-spec', m.name)}`];
    else if (!approved(m.spec.status)) closed = [`статус spec «${m.spec.status || '—'}»`, `Сначала одобрите spec.md: ${lintCmd('approve', 'spec', dir)}`];
    else if (errorsIn([m.protocolFile, m.specFile]).length) closed = ['ошибки в протоколе или spec', `В spec ошибки lint — исправьте и одобрите заново, список: ${check}`];
  } else if (stage === 'adr' || stage === 'decide') {
    if (!m.spec) closed = ['нет spec.md', `Сначала соберите Dev Spec: ${skill('sdd-spec', m.name)}`];
  } else if (stage === 'build') {
    const pending = pendingAdrs(m);
    if (!m.slices.size || !approved(m.slicesStatus)) closed = ['slices не одобрены', `Сначала одобрите slices: ${lintCmd('approve', 'slices', dir)}`];
    else if (pending.length) closed = [`ADR не приняты: ${pending.map((a) => a.num).join(', ')}`, `Сначала примите ADR: ${pending.map((a) => lintCmd('approve', 'adr', dir, a.num)).join('; ')}`];
    else if (findings.some((x) => x.level === 'err')) closed = ['есть ошибки lint', `Исправьте ошибки lint, список: ${check}`];
  }
  if (closed) {
    const relevant = stage === 'build' ? findings : errorsIn([m.protocolFile, m.specFile]);
    for (const x of relevant.filter((y) => y.level === 'err')) console.log(line(x));
    console.log(`ВОРОТА ${stage}: закрыты — ${closed[0]}.\nСкажи человеку: «${closed[1]}» — и остановись.`);
    process.exit(3);
  }
  console.log(`ВОРОТА ${stage}: открыты.`);
  process.exit(0);
}

// Ставит «одобрено <дата>» / «принято <дата>», если артефакт чист: lint без ошибок
// (с учётом нового статуса — например, SP-06 «одобрено с открытыми вопросами»)
// и защищённые части совпадают со снимком, если он есть.
function cmdApprove() {
  const what = pos[0];
  if (!['spec', 'slices', 'adr'].includes(what)) usage('approve spec | slices docs/<feature>, approve adr docs/<feature> [NNNN]');
  const d = needDir(pos[1]);
  const m = loadFeature(d);
  const dir = rel(m.dir);
  const refuse = (msg, code = 3) => {
    console.log(`НЕ ОДОБРЕНО: ${msg}`);
    process.exit(code);
  };
  let target;
  let scope;
  let word = 'одобрено';
  if (what === 'spec') {
    if (!m.spec) refuse(`нет spec.md. Сначала: ${skill('sdd-spec', m.name)}`);
    target = m.specFile;
    scope = [m.protocolFile, m.specFile];
  } else if (what === 'slices') {
    if (!m.slices.size || m.readme == null) refuse(`нет slices или slices/README.md. Сначала: ${skill('sdd-slices', m.name)}`);
    if (!m.spec || !approved(m.spec.status)) refuse(`Dev Spec не одобрен — slices опираются на него. Сначала: ${lintCmd('approve', 'spec', dir)}`);
    target = m.readmeFile;
    scope = [m.protocolFile, m.specFile, m.readmeFile, ...[...m.slices.values()].map((x) => x.file)];
  } else {
    word = 'принято';
    const pending = pendingAdrs(m);
    const adr = pos[2] ? m.featureAdrs.find((a) => a.num === pos[2].padStart(4, '0')) : pending.length === 1 ? pending[0] : null;
    if (!adr) {
      const list = pending.map((a) => lintCmd('approve', 'adr', dir, a.num));
      refuse(
        pos[2]
          ? `ADR ${pos[2]} не найден среди ADR фичи ${m.name}`
          : pending.length
            ? `у фичи ${pending.length} ADR без «принято» — укажите номер: ${list.join('; ')}`
            : `у фичи ${m.name} нет ADR, ждущих «принято»`,
        2,
      );
    }
    target = adr.file;
    scope = [adr.file];
  }
  const md = fs.readFileSync(target, 'utf8');
  const cur = header(md, 'Статус');
  if (cur === null) refuse(`в ${rel(target)} нет строки «Статус:» — добавьте её по шаблону`);
  if (/одобрен|принят/i.test(cur)) {
    console.log(`${rel(target)}: уже «${cur}».`);
    process.exit(0);
  }
  const t = new Date();
  const date = [t.getDate(), t.getMonth() + 1].map((x) => String(x).padStart(2, '0')).join('.') + `.${t.getFullYear()}`;
  const next = md.replace(/^Статус:.*$/m, `Статус: ${word} ${date}`);

  // lint по будущему состоянию: ошибки в файлах артефакта блокируют одобрение
  const inScope = new Set(scope.map(rel));
  const after = loadFeature(d, (f) => (path.resolve(f) === path.resolve(target) ? next : read(f)));
  findings.length = 0;
  runChecks(after);
  const errs = findings.filter((x) => x.level === 'err' && inScope.has(x.file));
  findings.length = 0;
  findings.push(...errs);

  // блокеры последнего ревью этого артефакта
  const rv = m.reviews.get(reviewKey(what, what === 'adr' ? path.basename(target).slice(0, 4) : null));
  for (const r of openBlockers(rv)) findings.push({ rule: 'RV-01', level: 'err', file: rel(rv.file), line: r.n, msg: `${r.id}: блокер без решения` });

  // guard: защищённые части против снимка, если он снят
  for (const f of scope.filter((x) => fs.existsSync(x) && fs.existsSync(snapPath(x)))) {
    const before = JSON.parse(fs.readFileSync(snapPath(f), 'utf8')).parts;
    for (const x of diffParts(before, protectedParts(fs.readFileSync(f, 'utf8')))) add('HG-01', f, null, `(против: снимок) ${x}`);
  }
  if (findings.length) {
    report();
    const hg = findings.some((x) => x.rule === 'HG-01');
    console.log(`\nНЕ ОДОБРЕНО: ${rel(target)} остаётся «${cur}».`);
    if (hg) console.log(`Если защищённые части поменяли вы сами — снимите новый снимок (${lintCmd('snapshot', what === 'slices' ? dir : rel(target))}) и повторите одобрение.`);
    process.exit(1);
  }
  fs.writeFileSync(target, next);
  console.log(`${rel(target)}: Статус: ${word} ${date}`);
  console.log(stageText(stageOf(loadFeature(d))));
  process.exit(0);
}

function cmdDiff() {
  const dir = needDir(pos[0]);
  const g = gitInfo(dir);
  if (!g) usage('diff работает только в git-репозитории');
  const ref = flags.base || 'HEAD';
  const cur = loadFeature(dir);
  const base = loadFeature(
    dir,
    (f) => gitShow(g, ref, f),
    (d) => gitList(g, ref, d),
  );
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const body = (md) => (md || '').replace(/^Статус:.*$/m, '').trim();

  // протокол только дописывается
  if (base.protocol && cur.protocol) {
    const now = new Set([...cur.protocol.rows, ...cur.protocol.post].map((r) => norm(r.raw)));
    for (const r of [...base.protocol.rows, ...base.protocol.post])
      if (!now.has(norm(r.raw))) add('DF-01', cur.protocolFile, null, `строка #${r.id} изменена или удалена: «${r.raw.slice(0, 60)}»`);
    const scope = new Set(cur.protocol.outScope.map((x) => norm(x.text)));
    for (const x of base.protocol.outScope) if (!scope.has(norm(x.text))) add('DF-01', cur.protocolFile, null, `«Вне scope»: пункт изменён или удалён: «${x.text.slice(0, 60)}»`);
  } else if (base.protocol && !cur.protocol) add('DF-01', cur.protocolFile, null, 'протокол удалён');

  // ID не пропадают
  if (base.spec) for (const id of base.spec.reqs.keys()) if (!cur.spec?.reqs.has(id)) add('DF-02', cur.specFile, null, `${id} пропал`);
  const curAcs = new Set([...cur.slices.values()].flatMap((s) => s.acs.map((a) => a.id)));
  for (const s of base.slices.values()) for (const a of s.acs) if (!curAcs.has(a.id)) add('DF-02', s.file, null, `${a.id} пропал`);

  // одобренное не меняется молча
  if (base.spec && cur.spec && approved(base.spec.status) && approved(cur.spec.status) && body(base.spec.md) !== body(cur.spec.md))
    add('DF-03', cur.specFile, headerLine(cur.spec.md, 'Статус'), 'spec.md изменён, а статус остался «одобрено»');
  if (approved(base.slicesStatus) && approved(cur.slicesStatus)) {
    const changed = [...cur.slices.values()].filter((s) => base.slices.get(s.num)?.md !== s.md).map((s) => s.num);
    const gone = [...base.slices.keys()].filter((n) => !cur.slices.has(n));
    if (changed.length || gone.length || body(base.readme) !== body(cur.readme))
      add('DF-03', cur.readmeFile, headerLine(cur.readme, 'Статус'), `slices изменены (${[...changed, ...gone].join(', ') || 'README'}), а статус остался «одобрено»`);
  }
  for (const a of cur.featureAdrs) {
    const b = base.adrs.find((x) => x.num === a.num);
    if (b && /принят/i.test(b.status || '') && /принят/i.test(a.status || '') && body(b.md) !== body(a.md))
      add('DF-03', a.file, headerLine(a.md, 'Статус'), 'ADR изменён, а статус остался «принято»');
  }
  if (approved(base.slicesStatus)) {
    const baseAcs = new Set([...base.slices.values()].flatMap((s) => s.acs.map((a) => a.id)));
    for (const s of cur.slices.values()) {
      const fresh = s.acs.filter((a) => !baseAcs.has(a.id));
      for (const a of fresh) if (!a.added) add('DF-04', s.file, a.n, `${a.id} без «(добавлен после: …)»`);
      if (fresh.length && header(s.md, 'Изменён после') === null) add('DF-04', s.file, null, 'нет строки «Изменён после:» в шапке');
    }
  }
  const c = report({ base: ref });
  if (!flags.json) console.log(`\nСверка с ${ref}. Ошибок: ${c.err}, предупреждений: ${c.warn}`);
  process.exit(c.err ? 1 : 0);
}

const targetFiles = (t) => {
  if (!t || !fs.existsSync(t)) usage(`Нет файла или папки ${t || ''}`);
  return fs.statSync(t).isDirectory() ? featureFiles(loadFeature(t)) : [path.resolve(t)];
};

function cmdSnapshot() {
  const files = targetFiles(pos[0]);
  for (const f of files) saveSnapshot(f);
  console.log(`Снимок защищённых частей: ${files.map(rel).join(', ')}. После humanizer: ${lintCmd('guard', pos[0])}`);
}

function cmdGuard() {
  const files = targetFiles(pos[0]);
  let bad = 0;
  const noBase = [];
  for (const f of files) {
    let before = null;
    let from = null;
    if (!flags.base && fs.existsSync(snapPath(f))) {
      before = JSON.parse(fs.readFileSync(snapPath(f), 'utf8')).parts;
      from = 'снимок';
    } else {
      const g = gitInfo(path.dirname(f));
      const md = g ? gitShow(g, flags.base || 'HEAD', f) : null;
      if (md != null) {
        before = protectedParts(md);
        from = flags.base || 'HEAD';
      }
    }
    if (!before) {
      noBase.push(f);
      continue;
    }
    const diffs = diffParts(before, protectedParts(fs.readFileSync(f, 'utf8')));
    if (!diffs.length) {
      saveSnapshot(f);
      continue;
    }
    bad += 1;
    for (const d of diffs) add('HG-01', f, null, `(против: ${from}) ${d}`);
  }
  report({ noBase: noBase.map(rel) });
  if (!flags.json) {
    const ok = files.length - bad - noBase.length;
    const out = [];
    if (bad) out.push(`Защищённые части изменены в ${bad} файл(ах) — верните их как были.`);
    if (noBase.length)
      out.push(
        `Не с чем сверить ${noBase.length} файл(ов): нет снимка и версии в git — ${noBase.map(rel).join(', ')}.`,
        `  Снимок снимают до humanizer: ${lintCmd('snapshot', '<файл>')}. Если humanizer уже прошёл, сверьте защищённые части глазами.`,
      );
    if (ok) out.push(`Защищённые части не тронуты в ${ok} файл(ах).`);
    console.log(`\n${out.join('\n')}`);
  }
  process.exit(bad || noBase.length ? 1 : 0);
}

function replaceSection(md, titleRe, title, body) {
  const ls = md.split('\n');
  const sc = scan(md);
  const h = sc.lines.find((l) => isH2(l) && titleRe.test(l.h2));
  if (!h) return `${md.replace(/\s*$/, '')}\n\n## ${title}\n${body}\n`;
  const next = sc.lines.find((l) => isH2(l) && l.n > h.n);
  const end = next ? next.n - 1 : ls.length;
  return [...ls.slice(0, h.n), body, ...(next ? [''] : []), ...ls.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n');
}

function genReadme(m) {
  if (!m.slices.size) usage('В slices/ нет файлов NNN-*.md');
  const row = (sl) =>
    `| [${sl.num} ${sl.title || sl.name}](${sl.name}) | ${sl.type || '—'} | ${sl.halves || '—'} | ${sl.basisRaw || '—'} | ${sl.deps.join(', ') || '—'} | ${sl.why || '—'} |`;
  const table = ['| Slice | Тип | Стороны | Основание | Зависит от | Почему отдельно |', '|---|---|---|---|---|---|', ...[...m.slices.values()].map(row)].join('\n');
  const covered = coverage(m);
  const ids = m.spec ? [...m.spec.reqs.values()].filter((r) => !r.deleted).map((r) => r.id) : [...covered.keys()];
  const covTable = ['| Требование | Slice |', '|---|---|', ...ids.map((id) => `| ${id} | ${[...(covered.get(id) || [])].sort().join(', ') || '—'} |`)].join('\n');
  const order = layers(m).map((l) => l.join(', ')).join(' → ');
  const orderText = `${order}\n\nЧерез запятую — slices, которые можно делать параллельно.`;

  let md = m.readme;
  if (md == null) {
    const adrs = m.featureAdrs.map((a) => `[${a.num}](../../adr/${path.basename(a.file)})`).join(', ') || 'нет';
    md = [
      `# ${m.spec?.title || m.name} — slices`,
      '',
      'Статус: черновик',
      '',
      'Dev Spec: [../spec.md](../spec.md)',
      '',
      `ADR: ${adrs}`,
      '',
      table,
      '',
      '## Покрытие Dev Spec',
      covTable,
      '',
      '## Порядок работ',
      orderText,
      '',
      '## Пересечения',
      '- Что делят соседние slices и где граница.',
      '',
      '## Проверка фичи (после всех slices)',
      '| Шаг | Действие | Ожидание | Требования |',
      '|---|---|---|---|',
      '| 1 | … | … | FR-… |',
      '',
    ].join('\n');
  } else {
    const sc = scan(md);
    const t = tables(sc.lines.filter((l) => !l.inCode)).find((x) => /^slice$/i.test(x.header[0] || ''));
    const ls = md.split('\n');
    if (t) md = [...ls.slice(0, t.start - 1), table, ...ls.slice(t.end)].join('\n');
    else {
      const firstH2 = sc.lines.find(isH2);
      const at = firstH2 ? firstH2.n - 1 : ls.length;
      md = [...ls.slice(0, at), table, '', ...ls.slice(at)].join('\n');
    }
    md = replaceSection(md, /^Покрытие/, 'Покрытие Dev Spec', covTable);
    md = replaceSection(md, /^Порядок/, 'Порядок работ', orderText);
  }
  fs.writeFileSync(m.readmeFile, md.endsWith('\n') ? md : `${md}\n`);
  console.log(`${rel(m.readmeFile)}: таблица slices, «Покрытие Dev Spec», «Порядок работ» собраны из файлов slices. Порядок: ${order}`);
}

function genGuessed(m) {
  const p = m.protocol;
  if (!p) usage('Нет brainstorming.md');
  const old = new Map();
  if (p.guessedT) {
    const ci = col(p.guessedT, '#');
    const cw = col(p.guessedT, /чем плох/i);
    for (const r of p.guessedT.rows) old.set((r.cells[ci] || '').trim(), cw >= 0 ? r.cells[cw] : '');
  }
  const cell = (s) => s.replace(/\|/g, '/');
  const rows = guessedRows(p).map((r) => `| ${r.id} | ${cell(r.rec)} | ${cell(r.dec)} | ${old.get(r.id) || ''} |`);
  const body = ['', '| # | Рекомендация агента | Решение человека | Чем плоха догадка |', '|---|---|---|---|', ...rows, ''].join('\n');
  let md;
  if (p.hasGuessed) md = replaceSection(p.md, /^Где агент/, 'Где агент угадал бы не так', body);
  else {
    const sc = scan(p.md);
    const post = sc.lines.find((l) => isH2(l) && /^Решения после/.test(l.h2));
    const ls = p.md.split('\n');
    const at = post ? post.n - 1 : ls.length;
    md = [...ls.slice(0, at), '## Где агент угадал бы не так', body, ...ls.slice(at)].join('\n');
  }
  fs.writeFileSync(p.file, md);
  const empty = guessedRows(p).filter((r) => isEmptyCell(old.get(r.id))).map((r) => r.id);
  console.log(
    `${rel(p.file)}: в «Где агент угадал бы не так» ${rows.length} строк (решение человека ≠ рекомендации).` +
      (empty.length ? ` Заполни «Чем плоха догадка» в строках: ${empty.join(', ')}.` : ''),
  );
}

function cmdGen() {
  const what = pos[0];
  if (what !== 'readme' && what !== 'guessed') usage('gen readme | gen guessed');
  const m = loadFeature(needDir(pos[1]));
  if (what === 'readme') genReadme(m);
  else genGuessed(m);
}

function cmdNext() {
  const kind = (pos[0] || '').toLowerCase();
  const m = loadFeature(needDir(pos[1]));
  const max = (arr) => arr.reduce((a, b) => Math.max(a, b), 0);
  if (kind === 'fr' || kind === 'nfr') {
    const pre = kind.toUpperCase();
    const n = max([...(m.spec?.reqs.keys() || [])].filter((id) => id.startsWith(`${pre}-`)).map((id) => Number(id.split('-')[1])));
    console.log(`${pre}-${n + 1}`);
  } else if (kind === 'ac') {
    const num = pos[2];
    if (!/^\d{3}$/.test(num || '')) usage('next AC docs/<feature> <NNN> [B|F]');
    const side = (pos[3] || '').toUpperCase().replace(/[^BF]/g, '');
    const all = [...m.slices.values()].flatMap((s) => s.acs).filter((a) => a.acNum === num && a.side === side);
    console.log(`AC-${num}-${side}${max(all.map((a) => a.k)) + 1}`);
  } else if (kind === 'slice') {
    console.log(String(max([...m.slices.keys()].map(Number)) + 1).padStart(3, '0'));
  } else if (kind === 'adr') {
    console.log(String(max(m.adrs.map((a) => Number(a.num))) + 1).padStart(4, '0'));
  } else usage('next FR | NFR | AC | slice | adr');
}

({ check: cmdCheck, gate: cmdGate, approve: cmdApprove, diff: cmdDiff, snapshot: cmdSnapshot, guard: cmdGuard, gen: cmdGen, next: cmdNext })[cmd]();
