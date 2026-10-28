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

  sdd-lint
      без аргументов — фичи в docs/ с текущим этапом и готовые команды
  sdd-lint [check] docs/<feature> [--snapshot] [--json]
      все проверки и текущий этап. Код 1 — есть ошибки.
      --snapshot — заодно снять снимок защищённых частей для guard
  sdd-lint fix docs/<feature> [--snapshot] [--json]
      после правки — механику делает скрипт: номера вместо FR-? / NFR-? / AC-NNN-? (B? F?),
      ссылки (gen links), slices/README.md (gen readme), «угадал бы» (gen guessed);
      затем все проверки и сверка с git (diff). Код 1 — есть ошибки
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
      «тексты», числа, ID, ссылки «Из протокола:». Сверка со снимком, без снимка — с git
  sdd-lint gen readme docs/<feature>
      таблица slices, «Покрытие Dev Spec» и «Порядок работ» в slices/README.md
  sdd-lint gen guessed docs/<feature>
      таблица «Где агент угадал бы не так» в протоколе
  sdd-lint gen links docs/<feature>
      ссылки: «Из протокола:» в spec → строка протокола; «Проверяет:» в slices и «Покрытие»
      в README → строка FR в spec.md; «Основание:» → spec.md одной ссылкой. Устаревшие обновляет, старые форматы
      («Трассировка», «[FR-n]» в строке AC) переносит
  sdd-lint close docs/<feature>
      перед merge: spec и slices одобрены, ошибок нет → удаляет brainstorming.md
      и всё, что в spec на него ссылается, обновляет ссылки на FR
  sdd-lint trace docs/<feature>
      каждая строка протокола: решение → куда ушла (FR/NFR, вне scope, открытый вопрос)
  sdd-lint next <FR|NFR|slice|adr> docs/<feature>
  sdd-lint next AC docs/<feature> <NNN> [B|F]
      следующий свободный номер
  sdd-lint ask docs/<feature>
      вопросы этапа с вариантами (JSON): агент задаёт их инструментом выбора
  sdd-lint choose docs/<feature> <id>
      выполнить выбранный вариант: команду lint — сам, остальное — готовым
      заданием агенту (сабагент, скилл в этом окне, команда человеку)
  sdd-lint prompt <скилл> <аргументы скилла>
      скилл sdd-* и его файлы одним текстом — так агент и сабагент получают скилл,
      который вызывает человек (disable-model-invocation), по выбору человека
  sdd-lint help [<команда>]
      справка: вся или по одной команде
  sdd-lint completion <bash|zsh>
      скрипт Tab-дополнения для терминала: source <(sdd-lint completion bash)

Фича — docs/<feature>, просто <feature> или любой путь внутри неё (@docs/<feature>/spec.md).

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
  'PR-05': ['warn', 'таблицу «Где агент угадал бы не так» не пиши руками: sdd-lint fix docs/<feature>'],

  'SP-01': ['warn', 'добавь строку «Статус: черновик | на ревью | одобрено <дата>» под заголовком'],
  'SP-02': ['err', 'каждый FR/NFR — в своём блоке кода ``` … ```'],
  'SP-03': ['err', 'у каждого требования свой номер: новое пиши как FR-? — номер поставит sdd-lint fix docs/<feature>'],
  'SP-04': ['err', 'в Dev Spec нет требований: FR-1 … в блоках кода'],
  'SP-05': ['warn', 'опиши, что видит пользователь; технология — в ADR и контрактах'],
  'SP-06': ['err', 'одобрять spec с открытыми вопросами нельзя: закрой их через /sdd-decide или верни статус «на ревью»'],
  'SP-07': ['info', 'открытые вопросы закрываются через /sdd-decide до одобрения'],
  'SP-08': ['err', 'после правила добавь «Пример:» с персонажем и конкретным исходом'],
  'SP-09': ['warn', 'пример должен опираться на персонажа или объект из «Данные для примеров»'],
  'SP-10': ['err', 'NFR — с числом и условием объёма: «p95 ≤ 300 мс при 500 участниках»'],
  'SP-11': ['warn', 'граница задаётся парой «проходит / не проходит»: N и N+1 (или N−1)'],
  'SP-12': ['warn', 'число взято из рекомендации агента, а человек его не выбирал: убери или вынеси в «Открытые вопросы»'],
  'SP-13': ['err', 'раздел «Трассировка» заменён строками «Из протокола:»: sdd-lint fix docs/<feature> перенесёт его сам'],
  'SP-14': ['err', 'строка протокола потеряна: укажи её номер в «Из протокола:» под FR/NFR или в «Вне scope», «Открытые вопросы», «Не про поведение»'],
  'SP-15': ['err', '«Из протокола:» указывает на строку, которой нет в протоколе: проверь номер (П<n> — «Решения после brainstorming»)'],
  'SP-16': ['err', 'требование без опоры на протокол: под блоком кода добавь «Из протокола: <номера строк>» или перенеси правило в «Открытые вопросы»'],
  'SP-17': ['warn', '«Из протокола:» ставится сразу под блоком FR/NFR или в разделах «Вне scope», «Открытые вопросы», «Не про поведение»'],
  'SP-18': ['warn', 'используй персонажей из «Данные для примеров» или добавь туда нового'],
  'SP-19': ['err', 'в одном блоке кода одно требование'],
  'SP-20': ['warn', 'число в NFR берётся из решения человека в протоколе; нет решения — «Открытые вопросы»'],
  'SP-21': ['err', 'номера в «Из протокола:» — ссылки на строку протокола, их ставит и обновляет скрипт: sdd-lint fix docs/<feature>'],
  'SP-22': ['err', 'пометок правок не пишем: решение живёт в самом требовании, история — в git. Убери «изменено / добавлено после ревью», дату правки и ссылку на находку'],

  'SL-01': ['err', 'шапка slice: Тип, Основание, Зависимости, Половины, Результат, Почему отдельно — см. шаблон'],
  'SL-02': ['err', '«Почему отдельно: Р1 | Р2 | Р3 — пояснение»; без причины slice склеивается с соседом'],
  'SL-03': ['err', 'каждый AC — в своём блоке кода'],
  'SL-04': ['err', 'номер в AC-NNN-… совпадает с номером файла slice'],
  'SL-05': ['err', 'у каждого AC свой номер: новый пиши как AC-NNN-? (AC-NNN-B?, AC-NNN-F?) — номер поставит sdd-lint fix docs/<feature>'],
  'SL-06': ['err', 'в одном блоке кода один AC'],
  'SL-07': ['err', 'у slice типа «поведение» должны быть AC'],
  'SL-08': ['warn', 'больше 10 AC в половине: проверь Р2 — резать по наблюдаемому результату, не по слою'],
  'SL-09': ['info', 'открытые вопросы к Dev Spec закрываются через /sdd-decide'],
  'SL-10': ['err', 'одобрять slices с открытыми вопросами нельзя: /sdd-decide или статус «на ревью»'],
  'SL-11': ['err', 'зависимости — номера существующих slices, без циклов'],
  'SL-12': ['err', '«Основание» ссылается на требование, которого нет в spec.md'],
  'SL-13': ['err', 'каждый FR/NFR должен стоять в «Основание» хотя бы одного slice'],
  'SL-14': ['err', 'AC: строка «ID имя», затем WHEN, потом AND / THEN — каждое на своей строке'],
  'SL-15': ['warn', 'каждая строка AC начинается с WHEN, AND или THEN (продолжение — с бóльшим отступом)'],
  'SL-16': ['err', 'сразу под блоком AC — строка «Проверяет: FR-n, …»: требования, из которых AC выведен; старый «[FR-n]» в строке AC перенесёт sdd-lint fix docs/<feature>'],
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
  'SL-28': ['err', 'ссылки на spec.md ставит и обновляет скрипт: «Основание» — FR текстом и одна ссылка на spec.md, «Проверяет:» и «Покрытие» в README — ссылки на строки FR: sdd-lint fix docs/<feature>'],
  'SL-29': ['err', 'пометок правок не пишем: решение живёт в самом AC, история — в git. Убери «изменено / добавлено после ревью», дату правки и ссылку на находку'],

  'RM-01': ['warn', 'создай README: sdd-lint fix docs/<feature>'],
  'RM-02': ['warn', 'README расходится со slices — не правь руками: sdd-lint fix docs/<feature>'],
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

  'RV-01': ['warn', 'блокер ревью закрывается до одобрения: решение — /sdd-decide <feature> R<n> «<решение>», правка — исправь файл и впиши в «Решение» «исправлено»; несогласие — человек сам пишет «отклонено: причина»'],
  'RV-02': ['warn', 'файл ревью — по шаблону sdd-review: таблица с колонками #, Важность, Где, Что не так, Пункт, Предложение, Решение и ID R1, R2 …'],

  'DF-01': ['err', 'протокол только дописывается: верни строку как была, новое решение — строкой в «Решения после brainstorming» (/sdd-decide)'],
  'DF-02': ['err', 'ID постоянные: верни требование или AC с пометкой «(удалён: причина)»'],
  'DF-03': ['err', 'одобрение давалось прошлой версии: верни статус «на ревью»'],

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
  // «@docs/comments/» — так путь дописывает Tab в строке GigaCode / Qwen Code.
  else pos.push(a.replace(/^@(?=.)/, ''));
}
// Команды и их аргументы — одно описание для меню, подсказок и Tab-дополнения.
const CMD_INFO = {
  check: 'все проверки и текущий этап',
  fix: 'после правки: номера, ссылки, README — скриптом, затем проверки',
  gate: 'ворота перед этапом',
  approve: 'одобрить spec, slices или принять ADR',
  gen: 'собрать README, «угадал бы», ссылки',
  guard: 'сверка после humanizer',
  snapshot: 'снимок перед humanizer',
  trace: 'протокол → FR/NFR',
  diff: 'изменения против git',
  close: 'убрать протокол перед merge',
  next: 'следующий свободный номер',
  ask: 'вопросы этапа с вариантами',
  choose: 'выполнить выбранный вариант',
  prompt: 'скилл одним текстом для агента',
  help: 'справка по команде',
  completion: 'Tab-дополнение для bash / zsh',
};
const CHOICES = {
  gate: { spec: 'можно ли писать Dev Spec', slices: 'можно ли резать slices', adr: 'можно ли писать ADR', decide: 'можно ли проводить решение', build: 'можно ли начинать реализацию' },
  approve: { spec: 'одобрить Dev Spec', slices: 'одобрить slices', adr: 'принять ADR' },
  gen: { readme: 'slices/README.md: таблица, покрытие, порядок', guessed: '«Где агент угадал бы не так»', links: 'ссылки на строки протокола и spec' },
  next: { FR: 'номер нового FR', NFR: 'номер нового NFR', AC: 'номер нового AC в slice', slice: 'номер нового slice', adr: 'номер нового ADR' },
  completion: { bash: 'source <(sdd-lint completion bash)', zsh: 'source <(sdd-lint completion zsh)' },
};
// Что идёт после команды: варианты из CHOICES, фича, файл или папка, номер.
const SLOTS = {
  check: ['feature'],
  fix: ['feature'],
  gate: ['choice', 'feature'],
  approve: ['choice', 'feature', 'adr'],
  gen: ['choice', 'feature'],
  next: ['choice', 'feature', 'slice', 'side'],
  ask: ['feature'],
  choose: ['feature', 'option'],
  prompt: ['skill', 'feature'],
  diff: ['feature'],
  close: ['feature'],
  trace: ['feature'],
  guard: ['target'],
  snapshot: ['target'],
  help: ['command'],
  completion: ['choice'],
};
const FLAGS = { check: ['--json', '--snapshot'], fix: ['--json', '--snapshot'], diff: ['--json', '--base'], guard: ['--json', '--base'] };
const COMMANDS = Object.keys(CMD_INFO);
const cmd = argv[0] === '__complete' ? '__complete' : COMMANDS.includes(pos[0]) ? pos.shift() : 'check';
const usage = (msg) => {
  console.error(msg ? `${msg}\nСправка: ${lintCmd('help', cmd === 'check' ? '' : cmd).trim()}` : HELP);
  process.exit(2);
};
// Справка по одной команде — её блок из HELP.
function helpFor(name) {
  const blocks = HELP.split('\n\n')[1].split(/\n(?=  sdd-lint)/);
  const own = blocks.filter((b) => b.match(/^\s*sdd-lint\s+\[?(\S+?)\]?(\s|$)/)?.[1] === name);
  return own.length ? own.join('\n') : null;
}
if (cmd === 'help' || (cmd !== '__complete' && (argv.includes('--help') || argv.includes('-h')))) {
  const one = cmd === 'help' && pos[0] ? helpFor(pos[0]) : cmd !== 'help' && cmd !== 'check' ? helpFor(cmd) : null;
  console.log(one ? `${one}\n\nВсе команды: ${lintCmd('help')}` : HELP);
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

// ---------- «Из протокола:» — откуда пришло требование ----------
// Под блоком FR/NFR: «Из протокола: [4](brainstorming.md#L18), [П1](brainstorming.md#L47)».
// В «Вне scope», «Открытые вопросы», «Не про поведение» — в любой строке раздела.
// Ссылки на строку ставит gen links: модель пишет номера, скрипт держит #L актуальными.
const SRC_RE = /из протокола:/iu;
const SRC_REF_RE = /\[(П?\d+)\]\(([^)\s]*)\)|(?<![\p{L}\d#[])(П?\d+)(?![\p{L}\d\]])/gu;
const SRC_SECTIONS = [
  [/^Вне scope/, 'вне scope'],
  [/^Открытые вопросы/, 'открытый вопрос'],
  [/^Не про поведение/, 'не про поведение'],
];
const srcTail = (text) => text.slice(text.search(SRC_RE)).replace(SRC_RE, '');
const srcRefs = (text) => [...srcTail(text).matchAll(SRC_REF_RE)].map((m) => ({ id: m[1] || m[3], href: m[1] ? m[2] : null }));
// Всё, что в spec ведёт в протокол: после close протокола нет, а документ остаётся чистым.
const PROTO_TAIL_RE = /\s*\(из протокола:(?:[^()]|\([^()]*\))*\)/giu;
const hasProtocolTraces = (md) => /^Протокол:|из протокола:|^##\s+Не про поведение/imu.test(md || '');
function stripProtocol(md) {
  let out = (md || '')
    .split('\n')
    .filter((t) => !/^Протокол:/.test(t) && !/^\s*Из протокола:/iu.test(t))
    .map((t) => t.replace(PROTO_TAIL_RE, ''))
    .join('\n')
    .replace(/<!--[\s\S]*?-->\n?/g, (c) => (/протокол/i.test(c) ? '' : c));
  if (/^##\s+Не про поведение/m.test(out)) out = setSection(out, /^Не про поведение/, null, '');
  return out.replace(/\n{3,}/g, '\n\n');
}
const protoHref = (spec, proto, row) => `${path.relative(path.dirname(spec), proto).split(path.sep).join('/')}#L${row.n}`;

// Строка прозы сразу под блоком кода (пустые строки между ними допустимы): блок → строка.
function underBlocks(sc, re) {
  const out = new Map();
  let after = null;
  for (const l of sc.lines) {
    if (l.inCode) {
      after = l.block;
      continue;
    }
    if (!l.text.trim()) continue;
    if (after !== null && re.test(l.text)) out.set(after, { n: l.n, text: l.text });
    after = null;
  }
  return out;
}

// ---------- ссылки на FR/NFR: «Основание:», «Проверяет:», README ----------
const REQ_REF_RE = /\[(N?FR-\d+)\]\(([^)\s]*)\)|(?<![\p{L}\d[-])(N?FR-\d+)(?![\d\]])/gu;
const CHECKS_RE = /^\s*Проверяет:/u;
const reqRefs = (text) => [...(text || '').matchAll(REQ_REF_RE)].map((m) => ({ id: m[1] || m[3], href: m[1] ? m[2] : null }));
const specHref = (from, spec, req) => `${path.relative(path.dirname(from), spec).split(path.sep).join('/')}#L${req.n}`;
const linkReqs = (text, from, spec) =>
  text.replace(REQ_REF_RE, (all, a, _h, b) => {
    const r = spec.reqs.get(a || b);
    return r ? `[${r.id}](${specHref(from, spec.file, r)})` : all;
  });

// «Основание:» — FR простым текстом и одна ссылка на spec.md в конце: десять ссылок подряд не читаются.
const BASIS_LINK_RE = /\s*\(\[Dev Spec\]\(([^)\s]*)\)\)\s*$/u;
const specFileHref = (from, spec) => path.relative(path.dirname(from), spec).split(path.sep).join('/');
const basisPlain = (text) => (text || '').replace(BASIS_LINK_RE, '').replace(REQ_REF_RE, (all, a, _h, b) => a || b).trim();
const linkBasis = (line, from, specFile) =>
  line.replace(/^(Основание:\s*)(.*)$/u, (_, kw, rest) => `${kw}${basisPlain(rest)} ([Dev Spec](${specFileHref(from, specFile)}))`);

function parseSources(sc, reqs) {
  const byBlock = new Map();
  for (const r of reqs.values()) byBlock.set(r.block, [...(byBlock.get(r.block) || []), r.id]);
  const out = [];
  let after = null; // блок кода, под которым ещё не было прозы
  for (const l of sc.lines) {
    if (l.inCode) {
      after = l.block;
      continue;
    }
    if (!l.text.trim()) continue;
    if (SRC_RE.test(l.text)) {
      const sec = SRC_SECTIONS.find(([re]) => l.h2 && re.test(l.h2));
      let target = null;
      if (after !== null && byBlock.has(after)) target = { kind: 'req', ids: byBlock.get(after) };
      else if (sec) target = { kind: sec[1] };
      out.push({ n: l.n, text: l.text, refs: srcRefs(l.text), target });
    }
    after = null;
  }
  return out;
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
      reqs.set(id, { id, n: l.n, text, first: l.text, deleted: /\(удал[её]н/i.test(l.text), h2: b.h2, block: b.idx });
    }
  }
  for (const l of sc.lines) {
    if (!l.inCode && /^\s*N?FR-\d+\b/.test(l.text)) outside.push({ id: l.text.trim().match(/^N?FR-\d+/)[0], n: l.n });
  }
  const traceH = sc.lines.find((l) => isH2(l) && /^Трассировка/.test(l.h2));
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
    sources: parseSources(sc, reqs),
    oldTraceT: tables(inSection(sc, /^Трассировка/))[0] || null,
    oldTraceLine: traceH ? traceH.n : null,
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
  const checks = underBlocks(sc, CHECKS_RE);
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
        oldRefs: reqIds((rest.match(/\[([^\]]*)\]/) || [])[1]),
        refs: uniq([...reqIds((rest.match(/\[([^\]]*)\]/) || [])[1]), ...reqIds(checks.get(b.idx)?.text)]),
        checks: checks.get(b.idx) || null,
        block: b.idx,
        body: b.lines.slice(b.lines.indexOf(l) + 1),
        text: b.lines.map((x) => x.text).join('\n'),
      });
    }
  }
  for (const l of sc.lines) if (!l.inCode && AC_LINE.test(l.text)) outside.push({ id: l.text.match(AC_LINE)[1], n: l.n });
  const used = new Set([...checks.values()].map((x) => x.n));
  const strayChecks = sc.lines.filter((l) => !l.inCode && CHECKS_RE.test(l.text) && !used.has(l.n)).map((l) => l.n);
  return {
    strayChecks,
    basisLine: headerLine(md, 'Основание'),
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
    if (l.h2 && /^(Трассировка|Не про поведение)/.test(l.h2)) continue;
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

  // откуда пришло: каждая строка протокола куда-то ушла, у каждого требования есть источник
  if (!p) {
    if (hasProtocolTraces(s.md)) add('SP-21', s.file, s.sources[0]?.n || headerLine(s.md, 'Протокол'), 'протокола нет, а spec на него ссылается');
    return;
  }
  if (s.oldTraceLine) {
    add('SP-13', s.file, s.oldTraceLine, 'раздел «Трассировка» — старый формат');
    return;
  }
  const byId = new Map([...p.rows, ...p.post].map((r) => [r.id, r]));
  const traced = new Set();
  const sourced = new Set();
  for (const src of s.sources) {
    if (!src.target) add('SP-17', s.file, src.n, '«Из протокола:» не относится ни к требованию, ни к разделу');
    else if (src.target.kind === 'req') for (const id of src.target.ids) sourced.add(id);
    if (!src.refs.length) add('SP-15', s.file, src.n, 'после «Из протокола:» нет номеров строк');
    const plain = [];
    const stale = [];
    for (const r of src.refs) {
      const row = byId.get(r.id);
      if (!row) {
        add('SP-15', s.file, src.n, `строки ${r.id} нет в протоколе`);
        continue;
      }
      traced.add(r.id);
      if (!r.href) plain.push(r.id);
      else if (r.href !== protoHref(s.file, p.file, row)) stale.push(r.id);
    }
    if (plain.length) add('SP-21', s.file, src.n, `не ссылки: ${plain.join(', ')}`);
    if (stale.length) add('SP-21', s.file, src.n, `ссылки ведут не на ту строку протокола: ${stale.join(', ')}`);
  }
  for (const r of [...p.rows, ...p.post]) if (!traced.has(r.id)) add('SP-14', p.file, r.n, `строка #${r.id} не указана ни в одном «Из протокола:» в spec.md`);
  for (const r of s.reqs.values()) if (!r.deleted && !sourced.has(r.id)) add('SP-16', s.file, r.n, `${r.id}: под блоком нет «Из протокола:»`);
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

// FR без ссылки или со ссылкой не на ту строку spec.md → SL-28.
function staleReqLinks(file, n, text, spec) {
  const plain = [];
  const stale = [];
  for (const r of reqRefs(text)) {
    const req = spec.reqs.get(r.id);
    if (!req) continue; // несуществующий FR ловят SL-12 / SL-17
    if (!r.href) plain.push(r.id);
    else if (r.href !== specHref(file, spec.file, req)) stale.push(r.id);
  }
  if (plain.length) add('SL-28', file, n, `не ссылки: ${plain.join(', ')}`);
  if (stale.length) add('SL-28', file, n, `ссылки ведут не на ту строку spec.md: ${stale.join(', ')}`);
}

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
    for (const n of sl.strayChecks) add('SL-16', f, n, '«Проверяет:» не стоит сразу под блоком AC');
    if (s) {
      const basis = header(sl.md, 'Основание') || '';
      const want = specFileHref(f, s.file);
      const got = (basis.match(BASIS_LINK_RE) || [])[1];
      if (got !== want || reqRefs(basis).some((r) => r.href))
        add('SL-28', f, sl.basisLine, got === undefined ? '«Основание» без ссылки на spec.md' : '«Основание»: ссылка на spec.md не та или ссылки на отдельные FR');
      for (const ac of sl.acs.filter((x) => x.checks)) staleReqLinks(f, ac.checks.n, ac.checks.text, s);
    }

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
      if (ac.oldRefs.length) add('SL-16', f, ac.n, `${ac.id}: [${ac.oldRefs.join(', ')}] в строке AC — старый формат`);
      else if (!ac.refs.length) add('SL-16', f, ac.n, `${ac.id}: под блоком нет «Проверяет:»`);
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
      if (id && m.spec) staleReqLinks(f, r.n, r.cells[0], m.spec);
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
    rv ? `ревью уже было: ${rel(rv.file)}; повторить в чистом контексте — ${skill('sdd-review', m.name, what)}` : `ревью в чистом контексте: ${skill('sdd-review', m.name, what)}`,
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
      : m.protocol
        ? { now: 'Slices одобрены, ADR приняты', next: [`перед merge убрать протокол: ${lintCmd('close', rel(m.dir))}`] }
        : { now: 'Планирование завершено: slices одобрены, ADR приняты, протокол убран', next: [] };
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

// ---------- вопрос человеку ----------
// Что спросить в конце этапа и что сделать по ответу — данные скрипта, а не текст для модели.
// Агент задаёт вопросы из ask инструментом выбора и передаёт id варианта в choose.
// Действие: lint — выполняет choose; subagent — задача сабагенту (fallback — команда человеку,
// если сабагентов нет; snapshot — снимок, который choose снимает сам до задачи);
// here — скилл в этом окне; show — команда, которую человек запускает сам; none — ничего.
const lintArgs = (args) => JSON.stringify(args);
const fetchTask = (args, tail) => `Вызови инструмент sdd_lint с args ${lintArgs(args)} и выполни то, что он вернёт.${tail ? ` ${tail}` : ''}`;
function artifactQuestion(m, what, num) {
  const key = what === 'adr' ? reviewKey('adr', num) : what;
  const a = what === 'adr' ? m.featureAdrs.find((x) => x.num === num) : null;
  const dir = rel(m.dir);
  const rv = m.reviews.get(key);
  const open = openBlockers(rv);
  const target = what === 'spec' ? rel(m.specFile) : what === 'slices' ? dir : rel(a.file);
  const files = what === 'slices' ? `каждому файлу в ${dir}/slices/` : target;
  const name = what === 'spec' ? 'Dev Spec' : what === 'slices' ? 'Slices' : `ADR ${num}`;
  const status = what === 'spec' ? m.spec.status : what === 'slices' ? m.slicesStatus : a.status;
  const rest = [what, num].filter(Boolean);
  const reviewHere = {
    id: `review-here:${key}`,
    label: rv ? 'Повторить ревью здесь' : 'Ревью здесь, в сабагенте',
    description: `свежий контекст, находки — в ${dir}/review/${key}.md`,
    action: { subagent: fetchTask(['prompt', 'sdd-review', m.name, ...rest]), fallback: skill('sdd-review', m.name, ...rest) },
  };
  const reviewWindow = {
    id: `review-window:${key}`,
    label: 'Ревью в новом окне',
    description: 'вы запускаете команду сами',
    action: { show: skill('sdd-review', m.name, ...rest) },
  };
  const humanize = {
    id: `humanize:${key}`,
    label: 'Убрать следы ИИ из прозы',
    description: 'humanizer в сабагенте, затем guard',
    action: {
      snapshot: target,
      subagent:
        `Загрузи скилл humanizer и примени его к ${files}: ` +
        'меняй только прозу вне блоков кода; ID, строки шапки, заголовки, таблицы, тексты в «ёлочках», числа и сроки не трогай. ' +
        `Затем вызови sdd_lint с args ${lintArgs(['guard', target])}; при ошибках верни защищённые части как были и повтори guard. ` +
        'Последним сообщением — итог guard.',
      fallback: `${what === 'slices' ? `${skill('humanizer')} по каждому файлу в ${dir}/slices/` : skill('humanizer', target)}, затем ${lintCmd('guard', target)}`,
    },
  };
  const finish = open.length
    ? { id: `blockers:${key}`, label: `Закрыть блокеры ${open.map((r) => r.id).join(', ')}`, description: 'решение даёте вы', action: { show: blockersStep(m, rv, open) } }
    : {
        id: `approve:${key}`,
        label: what === 'adr' ? 'Принять' : 'Одобрить',
        description: lintCmd('approve', ...(what === 'adr' ? ['adr', dir, num] : [what, dir])),
        action: { lint: what === 'adr' ? ['approve', 'adr', dir, num] : ['approve', what, dir] },
      };
  const options = [reviewHere, reviewWindow, humanize, finish];
  const rec = open.length ? finish : rv ? finish : reviewHere;
  rec.recommended = true;
  return { header: name, question: `${name} «${status || '—'}». Что дальше?`, options };
}
function nextSkillQuestion(m, now, name, label) {
  return {
    header: 'Следующий этап',
    question: `${now}. ${label}?`,
    options: [
      { id: `here:${name}`, label: 'Здесь, в этом окне', description: skill(name, m.name), recommended: true, action: { here: ['prompt', name, m.name] } },
      { id: `window:${name}`, label: 'В новом окне', description: 'вы запускаете команду сами', action: { show: skill(name, m.name) } },
    ],
  };
}
function askOf(m) {
  const st = stageOf(m);
  const adrQs = () => pendingAdrs(m).map((a) => artifactQuestion(m, 'adr', a.num));
  let qs = [];
  if (m.slices.size && m.spec && !approved(m.spec.status)) qs = [artifactQuestion(m, 'spec'), ...adrQs()];
  else if (m.slices.size && approved(m.slicesStatus)) {
    qs = adrQs();
    if (!qs.length && m.protocol)
      qs = [
        {
          header: 'Перед merge',
          question: `${st.now}. Убрать протокол brainstorming?`,
          options: [
            { id: 'close', label: 'Убрать протокол', description: lintCmd('close', rel(m.dir)), recommended: true, action: { lint: ['close', rel(m.dir)] } },
            { id: 'later', label: 'Позже', description: 'ничего не делать', action: { none: true } },
          ],
        },
      ];
  } else if (m.slices.size) qs = [artifactQuestion(m, 'slices'), ...adrQs()];
  else if (m.spec && approved(m.spec.status)) qs = [nextSkillQuestion(m, st.now, 'sdd-slices', 'Резать slices'), ...adrQs()];
  else if (m.spec) qs = [artifactQuestion(m, 'spec'), ...adrQs()];
  else if (m.protocol && /готов/i.test(m.protocol.status || '')) qs = [nextSkillQuestion(m, st.now, 'sdd-spec', 'Писать Dev Spec')];
  else if (m.protocol) qs = [nextSkillQuestion(m, st.now, 'sdd-grill', 'Продолжить brainstorming')];
  else qs = [nextSkillQuestion(m, st.now, 'sdd-grill', 'Начать brainstorming')];
  // Инструменты выбора берут до 4 вопросов за раз; остальные ADR — следующим вопросом.
  return { stage: st.now, questions: qs.slice(0, 4) };
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

// ---------- пометки правок ----------
// «Изменено 28.10.2026», «добавлен после ревью R2»: решение живёт в самом FR и AC, история — в git.
// «(удалён: причина)» — не пометка правки, а постоянный ID удалённого требования.
const MARK_VERB = '(?:изменен|изменён|добавлен|обновлен|обновлён|уточнен|уточнён|исправлен|переписан|дополнен)\\p{L}*';
const EDIT_MARK_RES = [
  // «добавлен после ревью», «уточнено по находке R2», «изменён по решению П3»
  new RegExp(`(?<![\\p{L}])${MARK_VERB}\\s+(?:после|по|на|в\\s+ходе)\\s+(?:итогам\\s+)?(?:ревью|review|brainstorming|брейншторм\\p{L}*|находк\\p{L}*|решени\\p{L}*\\s+[ПR]\\d+|[ПR]\\d+)`, 'iu'),
  // «(изменено 28.10.2026)», «Добавлено 28.10.2026: …» — дата правки в скобках или в начале строки;
  // «Анна изменила комментарий 28.10.2026» в примере — не пометка
  new RegExp(`(?:^|[(\\[_*—–])\\s*${MARK_VERB}:?\\s+\\d{1,2}\\.\\d{1,2}\\.\\d{2,4}`, 'iu'),
  // «по ревью R2», «находка R3»
  /(?<![\p{L}])(?:ревью|находк\p{L}*)\s+R\d+/iu,
];
function editMarks(file, sc, rule) {
  for (const l of sc.lines) {
    if (/^\s*Статус:/.test(l.text)) continue;
    for (const re of EDIT_MARK_RES) {
      const mm = l.text.match(re);
      if (mm) {
        add(rule, file, l.n, `«${mm[0]}» — пометка правки`);
        break;
      }
    }
  }
}
function checkEditMarks(m) {
  if (m.spec) editMarks(m.spec.file, m.spec.sc, 'SP-22');
  for (const sl of m.slices.values()) editMarks(sl.file, sl.sc, 'SL-29');
  if (m.readmeSc) editMarks(m.readmeFile, m.readmeSc, 'SL-29');
}

function runChecks(m) {
  checkProtocol(m);
  checkSpec(m);
  checkSlices(m);
  checkAdrs(m);
  checkReviews(m);
  checkEditMarks(m);
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
    'ссылка на протокол': outside.filter((l) => SRC_RE.test(l.text)).map((l) => srcRefs(l.text).map((r) => r.id).join(', ')),
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
const DOCS = 'docs';
const isDir = (d) => fs.existsSync(d) && fs.statSync(d).isDirectory();
// Фичи в docs/: папки с протоколом или spec (adr — не фича).
function listFeatures(root = DOCS) {
  if (!isDir(root)) return [];
  return fs
    .readdirSync(root)
    .filter((x) => x !== 'adr' && isDir(path.join(root, x)))
    .filter((x) => ['brainstorming.md', 'spec.md'].some((f) => fs.existsSync(path.join(root, x, f))))
    .sort();
}
// «comments», «docs/comments», «docs/comments/slices/002-x.md» → «docs/comments»; иначе null.
function resolveFeature(d) {
  if (!d) return null;
  const clean = d.replace(/^@/, '').replace(/[\\/]+$/, '');
  if (!/[\\/]/.test(clean) && isDir(path.join(DOCS, clean))) return path.join(DOCS, clean);
  if (!fs.existsSync(clean)) return null;
  const parts = path.relative(process.cwd(), path.resolve(clean)).split(path.sep);
  const i = parts.length > 1 ? parts.lastIndexOf(DOCS, parts.length - 2) : -1;
  if (i >= 0 && parts[i + 1] !== 'adr') return parts.slice(0, i + 2).join('/');
  return isDir(clean) ? clean : null;
}
// Аргументы до фичи в текущем вызове — чтобы предложить готовую команду.
const callPrefix = (n) => [cmd === 'check' ? null : cmd, ...pos.slice(0, n)].filter(Boolean);
function pickFeature(why, n) {
  const known = listFeatures();
  if (!known.length) {
    console.error(isDir(DOCS) ? `${why}. В ${DOCS}/ пока нет фич. Новая начинается с ${skill('sdd-grill', '<feature>')}.` : `${why}. Нет папки ${DOCS}/ — запускайте из корня репозитория с доками.`);
    process.exit(2);
  }
  const lines = known.map((f) => `  ${lintCmd(...callPrefix(n), f)}`);
  console.error(`${why}. Фичи в ${DOCS}/:\n${lines.join('\n')}`);
  process.exit(2);
}
// Нет варианта (approve без spec|slices|adr) — показать варианты готовыми командами.
function pickChoice(name, n = 0) {
  const ex = pos[n + 1] && resolveFeature(pos[n + 1]) ? pos[n + 1] : listFeatures()[0] || '<feature>';
  const opts = Object.entries(CHOICES[name]);
  // completion запускают в терминале, у остальных после варианта идёт фича.
  const line = (k) => (name === 'completion' ? `sdd-lint completion ${k}` : SLOTS[name].includes('feature') ? lintCmd(name, k, ex) : lintCmd(name, k));
  const cmdsList = opts.map(([k]) => line(k));
  const w = Math.max(...cmdsList.map((x) => x.length));
  const bad = pos[n] ? `Нет варианта «${pos[n]}» у ${name}` : `${name} — выбери вариант`;
  console.error(`${bad}:\n${opts.map(([, d], i) => `  ${cmdsList[i].padEnd(w)}  — ${d}`).join('\n')}`);
  process.exit(2);
}
function needDir(d, n = 0) {
  if (!d) pickFeature('Укажи фичу', n);
  const found = resolveFeature(d);
  if (found) return found;
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

// ---------- fix: механика после правки одной командой ----------
// Модель пишет «FR-?» и «AC-003-B?», номера строк не считает, README и ссылки не трогает:
// всё это скрипт делает здесь, затем проверяет фичу и сверяет её с git.
const PH_REQ = /^(\s*)(N?FR)-\?(?=\s|$)/;
const PH_AC = /^(\s*)AC-(?:\d{3}-)?([BF]?)\?(?=\s|$)/;
const firstLine = (b) => b.lines.find((l) => l.text.trim());
const maxNum = (arr) => arr.reduce((a, b) => Math.max(a, b), 0);
function numberPlaceholders(m) {
  const done = [];
  if (m.spec) {
    const ids = [...m.spec.reqs.keys()];
    const last = { FR: maxNum(ids.filter((x) => x.startsWith('FR-')).map((x) => Number(x.slice(3)))), NFR: maxNum(ids.filter((x) => x.startsWith('NFR-')).map((x) => Number(x.slice(4)))) };
    const ls = m.spec.md.split('\n');
    for (const b of m.spec.sc.blocks) {
      const l = firstLine(b);
      const mm = l && l.text.match(PH_REQ);
      if (!mm) continue;
      const id = `${mm[2]}-${(last[mm[2]] += 1)}`;
      ls[l.n - 1] = l.text.replace(PH_REQ, `$1${id}`);
      done.push(`${rel(m.spec.file)}:${l.n}  ${mm[2]}-? → ${id}`);
    }
    if (done.length) fs.writeFileSync(m.spec.file, ls.join('\n'));
  }
  const all = [...m.slices.values()].flatMap((s) => s.acs);
  for (const sl of m.slices.values()) {
    const ls = sl.md.split('\n');
    let changed = false;
    for (const b of sl.sc.blocks) {
      const l = firstLine(b);
      const mm = l && l.text.match(PH_AC);
      if (!mm) continue;
      const side = mm[2].toUpperCase();
      const k = maxNum(all.filter((a) => a.acNum === sl.num && a.side === side).map((a) => a.k)) + 1;
      const id = `AC-${sl.num}-${side}${k}`;
      all.push({ acNum: sl.num, side, k });
      ls[l.n - 1] = l.text.replace(PH_AC, `$1${id}`);
      done.push(`${rel(sl.file)}:${l.n}  ${l.text.trim().split(/\s/)[0]} → ${id}`);
      changed = true;
    }
    if (changed) fs.writeFileSync(sl.file, ls.join('\n'));
  }
  return done;
}
function cmdFix() {
  const dir = needDir(pos[0]);
  const files = (m) => uniq([...featureFiles(m), m.readmeFile].map((f) => path.resolve(f)));
  let m = loadFeature(dir);
  const before = new Map(files(m).map((f) => [f, read(f)]));
  const notes = [];
  const numbered = numberPlaceholders(m);
  m = loadFeature(dir);
  // Порядок — сверху вниз: протокол меняет строки, на которые ссылается spec, spec — строки для slices.
  if (m.protocol && /готов/i.test(m.protocol.status || '')) {
    const msg = genGuessed(m, true);
    if (/Заполни/.test(msg)) notes.push(msg.replace(/^.*?Заполни/, `${rel(m.protocolFile)}: заполни`));
  }
  m = loadFeature(dir);
  // Ссылки на протокол: без протокола их убирает только close — fix их не трогает.
  if (m.spec && m.protocol) linkSpec(m);
  else if (m.spec && hasProtocolTraces(m.spec.md))
    notes.push(`${rel(m.protocolFile)} нет, а spec ссылается на протокол: ссылки не тронуты. Если фича закрывается — ${lintCmd('close', rel(m.dir))}`);
  m = loadFeature(dir);
  if (m.spec) for (const sl of m.slices.values()) linkSlice(sl, m.spec);
  m = loadFeature(dir);
  if (m.slices.size) genReadme(m, true);

  m = loadFeature(dir);
  findings.length = 0;
  runChecks(m);
  const g = gitInfo(m.dir);
  if (g) diffChecks(dir, g, 'HEAD');
  else notes.push('не git-репозиторий: сверка с git (DF-*) пропущена');
  if (flags.snapshot) for (const f of featureFiles(m)) saveSnapshot(f);

  const detail = new Map();
  for (const x of numbered) {
    const f = path.resolve(x.split(':')[0]);
    detail.set(f, [...(detail.get(f) || []), x.split(/:\d+\s+/)[1]]);
  }
  const changed = files(m)
    .filter((f) => before.get(f) !== read(f))
    .map((f) => `${rel(f)}${before.get(f) == null ? ' — создан' : ''}${detail.has(f) ? `: ${detail.get(f).join(', ')}` : ''}`);

  const st = stageOf(m);
  if (!flags.json) {
    console.log(changed.length ? `Скрипт поправил:\n${changed.map((x) => `  ${x}`).join('\n')}` : 'Скрипту поправлять нечего.');
    for (const n of notes) console.log(n);
    if (findings.length) console.log('');
  }
  const c = report({ stage: st.now, next: st.next, fixed: changed, notes });
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
  if (!gates.includes(stage)) pickChoice('gate');
  const m = loadFeature(needDir(pos[1], 1));
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
  if (!['spec', 'slices', 'adr'].includes(what)) pickChoice('approve');
  const d = needDir(pos[1], 1);
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
  diffChecks(dir, g, ref);
  const c = report({ base: ref });
  if (!flags.json) console.log(`\nСверка с ${ref}. Ошибок: ${c.err}, предупреждений: ${c.warn}`);
  process.exit(c.err ? 1 : 0);
}
// Проверки DF-*: рабочая копия против ref. Находки — в findings.
function diffChecks(dir, g, ref) {
  const cur = loadFeature(dir);
  const base = loadFeature(
    dir,
    (f) => gitShow(g, ref, f),
    (d) => gitList(g, ref, d),
  );
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  // Номер строки в ссылке и следы протокола (их убирает close) одобрения не отменяют.
  const body = (md) =>
    stripProtocol(md || '')
      .replace(/^Статус:.*$/m, '')
      .replace(/(\]\([^)\s]*)#L\d+\)/g, '$1)')
      .trim();

  // протокол только дописывается
  if (base.protocol && cur.protocol) {
    const now = new Set([...cur.protocol.rows, ...cur.protocol.post].map((r) => norm(r.raw)));
    for (const r of [...base.protocol.rows, ...base.protocol.post])
      if (!now.has(norm(r.raw))) add('DF-01', cur.protocolFile, null, `строка #${r.id} изменена или удалена: «${r.raw.slice(0, 60)}»`);
    const scope = new Set(cur.protocol.outScope.map((x) => norm(x.text)));
    for (const x of base.protocol.outScope) if (!scope.has(norm(x.text))) add('DF-01', cur.protocolFile, null, `«Вне scope»: пункт изменён или удалён: «${x.text.slice(0, 60)}»`);
  } else if (base.protocol && !cur.protocol && !(cur.spec && approved(cur.spec.status) && !hasProtocolTraces(cur.spec.md)))
    add('DF-01', cur.protocolFile, null, `протокол удалён до закрытия фичи: удаляет его ${lintCmd('close', rel(cur.dir))}`);

  // ID не пропадают
  if (base.spec) for (const id of base.spec.reqs.keys()) if (!cur.spec?.reqs.has(id)) add('DF-02', cur.specFile, null, `${id} пропал`);
  const curAcs = new Set([...cur.slices.values()].flatMap((s) => s.acs.map((a) => a.id)));
  for (const s of base.slices.values()) for (const a of s.acs) if (!curAcs.has(a.id)) add('DF-02', s.file, null, `${a.id} пропал`);

  // одобренное не меняется молча
  if (base.spec && cur.spec && approved(base.spec.status) && approved(cur.spec.status) && body(base.spec.md) !== body(cur.spec.md))
    add('DF-03', cur.specFile, headerLine(cur.spec.md, 'Статус'), 'spec.md изменён, а статус остался «одобрено»');
  if (approved(base.slicesStatus) && approved(cur.slicesStatus)) {
    const changed = [...cur.slices.values()].filter((s) => !base.slices.has(s.num) || body(base.slices.get(s.num).md) !== body(s.md)).map((s) => s.num);
    const gone = [...base.slices.keys()].filter((n) => !cur.slices.has(n));
    if (changed.length || gone.length || body(base.readme) !== body(cur.readme))
      add('DF-03', cur.readmeFile, headerLine(cur.readme, 'Статус'), `slices изменены (${[...changed, ...gone].join(', ') || 'README'}), а статус остался «одобрено»`);
  }
  for (const a of cur.featureAdrs) {
    const b = base.adrs.find((x) => x.num === a.num);
    if (b && /принят/i.test(b.status || '') && /принят/i.test(a.status || '') && body(b.md) !== body(a.md))
      add('DF-03', a.file, headerLine(a.md, 'Статус'), 'ADR изменён, а статус остался «принято»');
  }
}

const targetFiles = (t) => {
  if (!t) pickFeature('Укажи файл или фичу', 0);
  if (!fs.existsSync(t)) {
    const f = resolveFeature(t);
    if (!f) usage(`Нет файла или папки ${t}`);
    t = f;
  }
  return fs.statSync(t).isDirectory() ? featureFiles(loadFeature(resolveFeature(t) || t)) : [path.resolve(t)];
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

function genReadme(m, quiet = false) {
  if (!m.slices.size) usage('В slices/ нет файлов NNN-*.md');
  const link = (text) => (m.spec ? linkReqs(text, m.readmeFile, m.spec) : text);
  const row = (sl) =>
    `| [${sl.num} ${sl.title || sl.name}](${sl.name}) | ${sl.type || '—'} | ${sl.halves || '—'} | ${basisPlain(sl.basisRaw) || '—'} | ${sl.deps.join(', ') || '—'} | ${sl.why || '—'} |`;
  const table = ['| Slice | Тип | Стороны | Основание | Зависит от | Почему отдельно |', '|---|---|---|---|---|---|', ...[...m.slices.values()].map(row)].join('\n');
  const covered = coverage(m);
  const ids = m.spec ? [...m.spec.reqs.values()].filter((r) => !r.deleted).map((r) => r.id) : [...covered.keys()];
  const covTable = ['| Требование | Slice |', '|---|---|', ...ids.map((id) => `| ${link(id)} | ${[...(covered.get(id) || [])].sort().join(', ') || '—'} |`)].join('\n');
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
  if (!quiet) console.log(`${rel(m.readmeFile)}: таблица slices, «Покрытие Dev Spec», «Порядок работ» собраны из файлов slices. Порядок: ${order}`);
}

function genGuessed(m, quiet = false) {
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
  const msg =
    `${rel(p.file)}: в «Где агент угадал бы не так» ${rows.length} строк (решение человека ≠ рекомендации).` +
    (empty.length ? ` Заполни «Чем плоха догадка» в строках: ${empty.join(', ')}.` : '');
  if (!quiet) console.log(msg);
  return msg;
}

// Старый раздел «Трассировка» → «Из протокола:» под требованиями и в разделах. Возвращает новый md.
function migrateTrace(s) {
  const t = s.oldTraceT;
  const perReq = new Map();
  const perSection = new Map();
  const tech = [];
  if (t) {
    const ct = Math.max(1, col(t, /куда|цель|требован/i));
    for (const r of t.rows) {
      const refs = [...(r.cells[0] || '').matchAll(/П?\d+/gu)].map((x) => x[0]);
      const cell = r.cells[ct] || '';
      const ids = reqIds(cell);
      const push = (map, key) => map.set(key, uniq([...(map.get(key) || []), ...refs]));
      if (ids.length) for (const id of ids) push(perReq, id);
      else if (/вне scope/i.test(cell)) push(perSection, 'Вне scope');
      else if (/открыт/i.test(cell)) push(perSection, 'Открытые вопросы');
      else tech.push(`- ${cell.replace(/^не про поведение:\s*/i, '').trim() || 'не про поведение'} (из протокола: ${refs.join(', ')})`);
    }
  }
  // строки под блоками кода — снизу вверх, чтобы номера строк выше не сдвигались
  const ls = s.md.split('\n');
  const ends = [];
  for (const b of s.sc.blocks) {
    const ids = [...s.reqs.values()].filter((r) => r.block === b.idx).map((r) => r.id);
    const refs = uniq(ids.flatMap((id) => perReq.get(id) || []));
    if (!refs.length) continue;
    let end = b.start;
    while (end < ls.length && !/^\s*```/.test(ls[end])) end += 1; // ls[end] — закрывающий ```
    ends.push([end + 1, `Из протокола: ${refs.join(', ')}`]);
  }
  for (const [at, text] of ends.sort((a, b) => b[0] - a[0])) ls.splice(at, 0, text);
  let md = ls.join('\n');
  for (const [title, refs] of perSection) {
    const sc = scan(md);
    const body = inSection(sc, new RegExp(`^${title}`)).map((l) => l.text).join('\n').trim();
    const keep = noneText(body) ? '' : `${body}\n\n`;
    md = replaceSection(md, new RegExp(`^${title}`), title, `${keep}Из протокола: ${refs.join(', ')}`);
  }
  md = setSection(md, /^Трассировка/, tech.length ? 'Не про поведение' : null, tech.join('\n'));
  return md;
}

// Заменяет раздел целиком (с заголовком) или убирает его, если title пуст.
function setSection(md, titleRe, title, body) {
  const ls = md.split('\n');
  const sc = scan(md);
  const h = sc.lines.find((l) => isH2(l) && titleRe.test(l.h2));
  if (!h) return md;
  const next = sc.lines.find((l) => isH2(l) && l.n > h.n);
  const end = next ? next.n - 1 : ls.length;
  const mid = title ? [`## ${title}`, body, ...(next ? [''] : [])] : [];
  return `${[...ls.slice(0, h.n - 1), ...mid, ...ls.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '')}\n`;
}

// spec: «Из протокола:» → ссылки на строку протокола (или убрать, если протокола нет).
function linkSpec(m) {
  const p = m.protocol;
  let md = m.spec.md;
  if (!p) {
    if (!hasProtocolTraces(md)) return null;
    fs.writeFileSync(m.spec.file, stripProtocol(md));
    return `${rel(m.spec.file)}: протокола нет — «Из протокола:», «Протокол:» и «Не про поведение» убраны.`;
  }
  const migrated = !!m.spec.oldTraceLine;
  if (migrated) md = migrateTrace(m.spec);
  const s = parseSpec(m.spec.file, md);
  const byId = new Map([...p.rows, ...p.post].map((r) => [r.id, r]));
  const unknown = [];
  let links = 0;
  const ls = md.split('\n');
  for (const src of s.sources) {
    const l = ls[src.n - 1];
    const i = l.search(SRC_RE);
    ls[src.n - 1] =
      l.slice(0, i) +
      l.slice(i).replace(/^(из протокола:)(.*)$/iu, (_, kw, rest) =>
        kw +
        rest.replace(SRC_REF_RE, (all, a, _h, b) => {
          const row = byId.get(a || b);
          if (!row) {
            unknown.push(a || b);
            return all;
          }
          links += 1;
          return `[${a || b}](${protoHref(s.file, p.file, row)})`;
        }),
      );
  }
  fs.writeFileSync(s.file, ls.join('\n'));
  return (
    `${rel(s.file)}: ${migrated ? 'раздел «Трассировка» перенесён в «Из протокола:» под требованиями и в разделах. ' : ''}` +
    `Ссылок на строки протокола: ${links}.` +
    (unknown.length ? ` Нет в протоколе: ${uniq(unknown).join(', ')} — исправь номер руками.` : '')
  );
}

// slice: «[FR-n]» из строки AC → «Проверяет:» под блоком; FR в «Основание» и «Проверяет:» → ссылки на spec.
function linkSlice(sl, spec) {
  const ls = sl.md.split('\n');
  const moved = [];
  for (const ac of sl.acs) {
    if (!ac.oldRefs.length) continue;
    const i = ac.n - 1;
    ls[i] = ls[i].replace(/\s*\[[^\]]*\]/, '');
    if (ac.checks) continue;
    let end = i + 1;
    while (end < ls.length && !/^\s*```/.test(ls[end])) end += 1; // закрывающий ```
    moved.push([end + 1, `Проверяет: ${ac.oldRefs.join(', ')}`]);
  }
  for (const [at, text] of moved.sort((a, b) => b[0] - a[0])) ls.splice(at, 0, text);
  const out = ls.map((t) => (/^Основание:/.test(t) ? linkBasis(t, sl.file, spec.file) : CHECKS_RE.test(t) ? linkReqs(t, sl.file, spec) : t)).join('\n');
  if (out !== sl.md) fs.writeFileSync(sl.file, out);
  return moved.length;
}

function genLinks(m) {
  if (!m.spec) usage('Нет spec.md');
  const out = [];
  const specMsg = linkSpec(m);
  if (specMsg) out.push(specMsg);
  let f = loadFeature(m.dir);
  if (f.slices.size) {
    let moved = 0;
    for (const sl of f.slices.values()) moved += linkSlice(sl, f.spec);
    out.push(`slices: «Основание» — ссылка на spec.md, FR в «Проверяет:» — ссылки на их строки.${moved ? ` Перенесено из строк AC в «Проверяет:»: ${moved}.` : ''}`);
    f = loadFeature(m.dir);
    if (f.readme != null) {
      genReadme(f, true);
      out.push(`${rel(f.readmeFile)}: таблицы собраны заново со ссылками.`);
    }
  }
  console.log(out.join('\n'));
}

// Перед merge: протокол — леса, после PR остаются spec, slices и ADR без ссылок на него.
function cmdClose() {
  const m = loadFeature(needDir(pos[0]));
  const dir = rel(m.dir);
  runChecks(m);
  const why = !m.spec
    ? 'нет spec.md'
    : !approved(m.spec.status)
      ? `spec «${m.spec.status || '—'}» — сначала ${lintCmd('approve', 'spec', dir)}`
      : !m.slices.size || !approved(m.slicesStatus)
        ? `slices не одобрены — сначала ${lintCmd('approve', 'slices', dir)}`
        : findings.some((x) => x.level === 'err')
          ? `есть ошибки lint — список: ${lintCmd(dir)}`
          : null;
  if (why) {
    for (const x of findings.filter((y) => y.level === 'err')) console.log(line(x));
    console.log(`НЕ ЗАКРЫТО: ${why}.`);
    process.exit(1);
  }
  const had = !!m.protocol;
  if (had) fs.rmSync(m.protocolFile);
  findings.length = 0;
  const f = loadFeature(m.dir);
  genLinks(f);
  findings.length = 0;
  runChecks(loadFeature(m.dir));
  const c = report();
  console.log(
    `\n${had ? `${rel(m.protocolFile)} удалён. ` : ''}Фича закрыта: в spec нет ссылок на протокол, ссылки на FR в slices обновлены.` +
      ` Закоммитьте вместе с остальными документами. Решения дальше — ${skill('sdd-decide', m.name)}: правит FR и AC напрямую.`,
  );
  process.exit(c.err ? 1 : 0);
}

// Протокол → куда ушла каждая строка: для ревью смысла трассировки.
function cmdTrace() {
  const m = loadFeature(needDir(pos[0]));
  const s = m.spec;
  const p = m.protocol;
  if (!s || !p) usage('Нужны brainstorming.md и spec.md');
  if (s.oldTraceLine) {
    console.log(`В ${rel(s.file)} старый раздел «Трассировка»: ${lintCmd('fix', pos[0])}`);
    process.exit(1);
  }
  const where = new Map();
  for (const src of s.sources) {
    const label = !src.target
      ? `? ${rel(s.file)}:${src.n}`
      : src.target.kind === 'req'
        ? src.target.ids.map((id) => `${id} ${rel(s.file)}:${s.reqs.get(id).n}`).join(', ')
        : `${src.target.kind} ${rel(s.file)}:${src.n}`;
    for (const r of src.refs) where.set(r.id, [...(where.get(r.id) || []), label]);
  }
  const short = (x) => (x.length > 60 ? `${x.slice(0, 57)}…` : x);
  let lost = 0;
  for (const r of [...p.rows, ...p.post]) {
    const to = where.get(r.id);
    if (!to) lost += 1;
    console.log(`${`#${r.id}`.padEnd(5)} ${rel(p.file)}:${r.n}  ${short(r.dec || '—')}`);
    console.log(`      → ${to ? uniq(to).join('; ') : 'НИКУДА'}`);
  }
  process.exit(lost ? 1 : 0);
}

function cmdGen() {
  const what = pos[0];
  if (!['readme', 'guessed', 'links'].includes(what)) pickChoice('gen');
  const m = loadFeature(needDir(pos[1], 1));
  if (what === 'readme') genReadme(m);
  else if (what === 'links') genLinks(m);
  else genGuessed(m);
}

function cmdNext() {
  const kind = (pos[0] || '').toLowerCase();
  if (!['fr', 'nfr', 'ac', 'slice', 'adr'].includes(kind)) pickChoice('next');
  const m = loadFeature(needDir(pos[1], 1));
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

// ---------- меню, опечатки, Tab-дополнение ----------
// Без аргументов: фичи с этапом и командами, которые можно скопировать.
function cmdMenu() {
  const known = listFeatures();
  const out = ['sdd-lint — проверки планирования SDD', ''];
  if (!isDir(DOCS)) out.push(`Нет папки ${DOCS}/ — запускайте из корня репозитория с доками.`);
  else if (!known.length) out.push(`В ${DOCS}/ пока нет фич. Новая начинается с ${skill('sdd-grill', '<feature>')}.`);
  else {
    out.push(`Фичи в ${DOCS}/:`);
    const w = Math.max(...known.map((f) => f.length));
    for (const f of known) {
      const st = stageOf(loadFeature(path.join(DOCS, f)));
      out.push(`  ${f.padEnd(w)}  ${st.now}`);
      const step = st.next.find((x) => !x.startsWith('по желанию')) || st.next[0];
      if (step) out.push(`  ${' '.repeat(w)}  → ${step}`);
    }
  }
  const ex = known[0] || '<feature>';
  const rows = [
    [lintCmd(ex), CMD_INFO.check],
    [lintCmd('fix', ex), CMD_INFO.fix],
    [lintCmd('approve', 'spec|slices|adr', ex), CMD_INFO.approve],
    [lintCmd('gate', 'spec|slices|adr|decide|build', ex), CMD_INFO.gate],
    [lintCmd('gen', 'readme|guessed|links', ex), CMD_INFO.gen],
    [lintCmd('guard', `${DOCS}/${ex}/spec.md`), CMD_INFO.guard],
    [lintCmd('trace', ex), CMD_INFO.trace],
    [lintCmd('diff', ex), CMD_INFO.diff],
    [lintCmd('next', 'FR|NFR|AC|slice|adr', ex), CMD_INFO.next],
    [lintCmd('close', ex), CMD_INFO.close],
  ];
  const w = Math.max(...rows.map(([c]) => c.length));
  out.push('', 'Команды:', ...rows.map(([c, d]) => `  ${c.padEnd(w)}  ${d}`));
  out.push('', `Справка по команде: ${lintCmd('help', '<команда>')}. Путь к фиче дописывает Tab после @: @${DOCS}/${ex === '<feature>' ? '' : `${ex}/`}`);
  console.log(out.join('\n'));
  process.exit(0);
}

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// «aprove docs/x» — не фича, а опечатка в команде.
function checkTypo() {
  const w = pos[0];
  if (!w || /[\\/.]/.test(w) || resolveFeature(w)) return;
  const near = COMMANDS.map((c) => [c, distance(w.toLowerCase(), c)]).filter(([c, n]) => n <= (c.length > 4 ? 2 : 1)).sort((a, b) => a[1] - b[1]);
  if (!near.length) return;
  const fixed = lintCmd(near[0][0], ...pos.slice(1));
  console.error(`Нет команды «${w}». Может, ${near[0][0]}? ${fixed}`);
  process.exit(2);
}

// Варианты для Tab: «значение\tописание» по строке. words — слова после имени команды, последнее — дописываемое.
function complete(words) {
  const cur = words.length ? words[words.length - 1] : '';
  const prev = words.slice(0, -1);
  const out = [];
  const emit = (v, d = '') => {
    if (v.startsWith(cur) && !out.some((x) => x.split('\t')[0] === v)) out.push(d ? `${v}\t${d}` : v);
  };
  const paths = (dirsOnly) => {
    const dirPart = cur.includes('/') ? cur.slice(0, cur.lastIndexOf('/') + 1) : '';
    const base = cur.slice(dirPart.length);
    if (!isDir(dirPart || '.')) return;
    for (const e of fs.readdirSync(dirPart || '.').sort()) {
      if (e.startsWith('.') && !base.startsWith('.')) continue;
      if (isDir(path.join(dirPart || '.', e))) emit(`${dirPart}${e}/`);
      else if (!dirsOnly && e.endsWith('.md')) emit(`${dirPart}${e}`);
    }
  };
  const features = (dirsOnly) => {
    if (cur.includes('/') || cur.startsWith('.')) return paths(dirsOnly);
    for (const f of listFeatures()) {
      let st = '';
      try {
        st = stageOf(loadFeature(path.join(DOCS, f))).now;
      } catch {}
      emit(f, st);
    }
    if (isDir(DOCS)) emit(`${DOCS}/`);
  };
  if (prev[prev.length - 1] === '--base') {
    let refs = ['HEAD'];
    try {
      refs = [...refs, ...git(['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes', 'refs/tags'], process.cwd()).split('\n').filter(Boolean)];
    } catch {}
    refs.forEach((r) => emit(r));
    return out;
  }
  const args = prev.filter((a, i) => !a.startsWith('-') && prev[i - 1] !== '--base').map((a) => a.replace(/^@/, ''));
  const c = COMMANDS.includes(args[0]) ? args.shift() : 'check';
  if (cur.startsWith('-')) {
    (FLAGS[c] || []).forEach((f) => emit(f));
    return out;
  }
  if (c === 'check' && !args.length) {
    features(true);
    for (const k of COMMANDS.filter((k) => k !== 'check')) emit(k, CMD_INFO[k]);
    return out;
  }
  const slot = (SLOTS[c] || [])[args.length];
  const feature = () => resolveFeature(args[1]);
  if (slot === 'choice') Object.entries(CHOICES[c]).forEach(([k, d]) => emit(k, d));
  else if (slot === 'command') COMMANDS.forEach((k) => emit(k, CMD_INFO[k]));
  else if (slot === 'feature') features(true);
  else if (slot === 'target') features(false);
  else if (slot === 'adr' && args[0] === 'adr' && feature())
    loadFeature(feature()).featureAdrs.forEach((a) => emit(a.num, a.status || ''));
  else if (slot === 'slice' && /^ac$/i.test(args[0]) && feature())
    [...loadFeature(feature()).slices].forEach(([num, s]) => emit(num, s.title || ''));
  else if (slot === 'option' && resolveFeature(args[0])) askOf(loadFeature(resolveFeature(args[0]))).questions.forEach((q) => q.options.forEach((o) => emit(o.id, o.label)));
  else if (slot === 'skill') promptSkills().forEach((k) => emit(k));
  else if (slot === 'side' && /^ac$/i.test(args[0])) {
    emit('B', 'AC сервисной половины');
    emit('F', 'AC frontend-половины');
  }
  return out;
}

// Скилл одним текстом: SKILL.md без шапки и файлы, на которые он ссылается.
// Агент получает его через MCP и не читает файлы расширения вне проекта; disable-model-invocation
// не снимается — скилл попадает к агенту только через вариант, который выбрал человек.
const SELF = fs.realpathSync(process.argv[1]);
const SKILLS_DIR = path.resolve(path.dirname(SELF), '..', '..');
const promptSkills = () => (isDir(SKILLS_DIR) ? fs.readdirSync(SKILLS_DIR).filter((x) => /^sdd-[a-z]+$/.test(x) && x !== 'sdd-lint' && fs.existsSync(path.join(SKILLS_DIR, x, 'SKILL.md'))) : []);
// Аргументы с пробелами — в кавычках: у /sdd-decide вопрос и решение не должны слиться в одну строку.
const shownArgs = (args) => args.map((a) => (/\s/.test(a) || a === '' ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ');
function skillPrompt(name, args) {
  const dir = path.join(SKILLS_DIR, name);
  const body = read(path.join(dir, 'SKILL.md')).replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  let links = uniq([...body.matchAll(/\]\(((?:references|assets)\/[^)\s]+\.md)\)/g)].map((x) => x[1]));
  // Ревьюеру — только чеклист своего режима.
  if (name === 'sdd-review') links = links.filter((f) => !f.startsWith('references/') || f === `references/${args[1]}.md`);
  const head =
    name === 'sdd-review'
      ? [
          `# Ревью SDD: ${shownArgs(args)}`,
          '',
          'Ты ревьюер в чистом контексте: как писали артефакт, тебе не передано. Суди только по файлам',
          `в ${DOCS}/${args[0]}/ и ${DOCS}/adr/; корень репозитория — текущая папка.`,
          'Последним сообщением выведи таблицу находок и итог из шага 5 — его прочитает человек;',
          'свои шаги не пересказывай.',
        ]
      : [`# Скилл ${name}: ${shownArgs(args)}`, '', 'Человек выбрал этот шаг — выполняй скилл ниже здесь, в этом окне.'];
  return [
    ...head,
    `Аргументы скилла: \`${shownArgs(args)}\`. Lint — инструмент MCP \`sdd_lint\`; его нет — \`node ${SELF}\`.`,
    links.length ? 'Файлы, на которые ссылается скилл, приложены в конце — их не открывай.' : null,
    '',
    '---',
    '',
    body,
    ...links.flatMap((f) => {
      const t = read(path.join(dir, f));
      return t == null ? [] : ['', '---', '', `Файл скилла ${f}:`, '', t.trim()];
    }),
  ]
    .filter((x) => x !== null)
    .join('\n');
}
function cmdPrompt() {
  const known = promptSkills();
  const name = pos[0];
  if (!known.includes(name)) {
    console.error(`${name ? `Нет скилла «${name}»` : 'Укажи скилл'}. Скиллы: ${known.join(', ')}`);
    process.exit(2);
  }
  const args = pos.slice(1);
  if (args.length) {
    const m = loadFeature(needDir(args[0], 1));
    args[0] = m.name;
    if (name === 'sdd-review') {
      if (!['spec', 'slices', 'adr'].includes(args[1])) {
        console.error(`Режим ревью: ${['spec', 'slices', 'adr'].map((x) => lintCmd('prompt', name, m.name, x)).join(', ')}`);
        process.exit(2);
      }
      if (args[1] === 'adr') {
        const nums = m.featureAdrs.map((a) => a.num);
        const num = args[2] ? args[2].padStart(4, '0') : nums.length === 1 ? nums[0] : null;
        if (!num || !nums.includes(num)) {
          const list = nums.length ? nums.map((n) => `  ${lintCmd('prompt', name, m.name, 'adr', n)}`).join('\n') : '  у фичи нет ADR';
          console.error(`${args[2] ? `ADR ${args[2]} у фичи нет` : 'Укажи номер ADR'}:\n${list}`);
          process.exit(2);
        }
        args[2] = num;
      }
    }
  } else if (name !== 'sdd-grill') pickFeature('Укажи фичу', 1);
  console.log(skillPrompt(name, args));
  process.exit(0);
}
// Вопросы этапа. Действия в вывод не идут: их выполняет choose по id.
// Как задать вопрос, вывод говорит сам (instruction): правило приходит в момент действия,
// а не из контекста агента. text — тот же вопрос списком для агента без инструмента выбора.
function askView(m) {
  const { stage, questions } = askOf(m);
  let n = 0;
  const qs = questions.map((q) => ({
    ...q,
    options: q.options.map(({ action, ...o }) => ({ n: ++n, ...o, label: o.recommended ? `${o.label} (рекомендую)` : o.label })),
  }));
  const text = qs.map((q) => [q.question, ...q.options.map((o) => `${o.n}. ${o.label}${o.description ? ` — ${o.description}` : ''}`)].join('\n')).join('\n\n');
  const dir = rel(m.dir);
  const instruction =
    'Задай questions инструментом выбора как есть: текст, порядок, варианты и «(рекомендую)» не меняй, своих вариантов не добавляй. ' +
    'Инструмента выбора нет — выведи text дословно и жди ответа. ' +
    `Выбран вариант — sdd_lint с args ${lintArgs(['choose', dir, '<id>'])}; ответ номером — id варианта с этим n; выбрано несколько — по одному, по порядку. ` +
    'Человек ответил словами: однозначно назвал один вариант — его id, иначе отвечай как в обычном диалоге. Вариант за человека не выбирай.';
  return { instruction, stage, choose: ['choose', dir, '<id>'], questions: qs, text };
}
function cmdAsk() {
  const m = loadFeature(needDir(pos[0]));
  console.log(JSON.stringify(askView(m), null, 2));
  process.exit(0);
}
function cmdChoose() {
  const m = loadFeature(needDir(pos[0]));
  const id = pos[1];
  const all = askOf(m).questions.flatMap((q) => q.options);
  const opt = all.find((o) => o.id === id);
  const again = `Следующий вопрос: sdd_lint с args ${lintArgs(['ask', rel(m.dir)])}.`;
  if (!opt) {
    console.error(`${id ? `Варианта «${id}» сейчас нет — этап изменился` : 'Укажи вариант'}. Варианты: ${all.map((o) => o.id).join(', ') || 'нет'}. Задай вопрос заново: sdd_lint с args ${lintArgs(['ask', rel(m.dir)])}.`);
    process.exit(2);
  }
  const a = opt.action;
  if (a.lint) {
    let out = '';
    let code = 0;
    try {
      out = execFileSync(process.execPath, [SELF, ...a.lint], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      out = `${e.stdout || ''}${e.stderr || ''}`;
      code = typeof e.status === 'number' ? e.status : 1;
    }
    console.log(`${out.trimEnd()}\n\nПередай вывод человеку как есть. ${code ? 'Остановись.' : again}`);
    process.exit(code);
  }
  if (a.subagent) {
    if (a.snapshot) for (const f of targetFiles(a.snapshot)) saveSnapshot(f);
    const none = a.fallback ? `\n\nСабагентов у тебя нет — задание сам не выполняй: передай человеку дословно «${a.fallback}» и остановись.` : '';
    console.log(`Запусти сабагента. Его задача целиком, ничего не добавляй и не пересказывай:\n\n${a.subagent}\n\nОтвет сабагента передай человеку как есть. ${again}${none}`);
  } else if (a.here) console.log(skillPrompt(a.here[1], a.here.slice(2)));
  else if (a.show) console.log(`Передай человеку дословно и остановись:\n\n${a.show}`);
  else console.log('Ничего не делай, остановись.');
  process.exit(0);
}

// Скрипт для bash / zsh с путём к этому файлу: работает и через alias, и через ссылку в PATH.
function cmdCompletion() {
  const shell = pos[0];
  if (!['bash', 'zsh'].includes(shell)) pickChoice('completion');
  const self = fs.realpathSync(process.argv[1]).replace(/'/g, `'\\''`);
  const run = `node '${self}' __complete`;
  if (shell === 'bash') {
    console.log(`# sdd-lint: Tab-дополнение для bash. В ~/.bashrc: source <(sdd-lint completion bash)
_sdd_lint() {
  local IFS=$'\\n' out
  out=$(${run} "\${COMP_WORDS[@]:1:COMP_CWORD}" 2>/dev/null) || return 0
  COMPREPLY=($(printf '%s\\n' "$out" | cut -f1))
  if [[ \${#COMPREPLY[@]} -eq 1 && \${COMPREPLY[0]} == */ ]]; then compopt -o nospace; fi
}
complete -F _sdd_lint sdd-lint sdd-lint.mjs`);
  } else {
    console.log(`# sdd-lint: Tab-дополнение для zsh. В ~/.zshrc после compinit: source <(sdd-lint completion zsh)
_sdd_lint() {
  local -a lines vals disp dirs
  local line v
  lines=("\${(@f)$(${run} "\${(@)words[2,CURRENT]}" 2>/dev/null)}")
  for line in "\${lines[@]}"; do
    [[ -z $line ]] && continue
    v=\${line%%$'\\t'*}
    if [[ $v == */ ]]; then dirs+=("$v"); continue; fi
    vals+=("$v")
    if [[ $line == *$'\\t'* ]]; then disp+=("\${(r:14:)v} -- \${line#*$'\\t'}"); else disp+=("$v"); fi
  done
  (( \${#dirs} )) && compadd -S '' -- "\${dirs[@]}"
  (( \${#vals} )) && compadd -l -d disp -- "\${vals[@]}"
}
compdef _sdd_lint sdd-lint sdd-lint.mjs`);
  }
  process.exit(0);
}

if (cmd === '__complete') {
  console.log(complete(argv.slice(1)).join('\n'));
  process.exit(0);
}
if (cmd === 'check' && !argv.length) cmdMenu();
if (cmd === 'check') checkTypo();

({ completion: cmdCompletion, check: cmdCheck, fix: cmdFix, gate: cmdGate, approve: cmdApprove, diff: cmdDiff, snapshot: cmdSnapshot, guard: cmdGuard, gen: cmdGen, trace: cmdTrace, close: cmdClose, next: cmdNext, ask: cmdAsk, choose: cmdChoose, prompt: cmdPrompt })[cmd]();
