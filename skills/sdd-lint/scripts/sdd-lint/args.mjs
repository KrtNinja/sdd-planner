// Разбор аргументов (parseArgs — чистая функция) и описание команд: варианты, слоты аргументов, флаги.
// @ts-check

// Команды и их аргументы — одно описание для меню, подсказок и Tab-дополнения.
// Словари по имени команды: команду берут из ввода человека — строкой, поэтому тип — Record.
/** @type {Record<string, string>} */
export const CMD_INFO = {
  questions: 'единый реестр нового процесса: вопрос, откладывание, сводка, независимый черновик',
  start: 'начало /sdd-grill: задача, её папка, источники, исследование отдельным агентом',
  research: 'задания отдельному агенту: изучить источники, найти факт; проверка _work/context.md',
  check: 'все проверки и текущий этап',
  fix: 'после правки: номера, ссылки, README — скриптом, затем проверки',
  done: 'конец этапа: fix, снимок, «на ревью» и вопрос этапа',
  plan: 'проверить план разбиения работы _work/plan.md',
  gate: 'проверить, можно ли начать этап',
  approve: 'одобрить требования, части работы или принять ADR',
  gen: 'собрать README, ссылки, файлы частей работы по плану',
  guard: 'проверка сохранности структуры после humanizer',
  snapshot: 'снимок перед humanizer',
  trace: 'протокол → FR/NFR',
  diff: 'изменения относительно версии в Git',
  close: 'перед слиянием ветки убрать временные файлы: протокол и _work/ — после подтверждения (скилл /sdd-close)',
  export: 'требования в JSON для зоны реализации',
  next: 'следующий свободный номер',
  ask: 'вопросы этапа с вариантами',
  choose: 'выполнить выбранный вариант',
  triage: 'сохранить решение по выявленной проблеме: открытый вопрос, отклонение, П<n>, выбор замечаний',
  prompt: 'скилл одним текстом для агента',
  help: 'справка по команде',
  completion: 'Tab-дополнение для bash / zsh',
};
/** @type {Record<string, Record<string, string>>} */
export const CHOICES = {
  gate: {
    spec: 'можно ли подготовить требования',
    slices: 'можно ли разбить работу на части',
    adr: 'можно ли подготовить архитектурное решение (ADR)',
    decide: 'можно ли обновить документы по решению',
    review: 'что ждёт проверки ИИ',
    build: 'можно ли начинать реализацию',
  },
  approve: { spec: 'одобрить требования', slices: 'одобрить части работы', adr: 'принять ADR' },
  gen: {
    readme: 'slices/README.md: таблица, покрытие, порядок', links: 'ссылки на строки протокола и spec',
    slices: 'файлы частей работы по согласованному плану' },
  next: { FR: 'номер нового FR', NFR: 'номер нового NFR', AC: 'номер нового AC в части работы', slice: 'номер новой части работы', adr: 'номер нового ADR' },
  research: { context: 'изучить источники в _work/context.md', fact: 'найти один факт', check: 'проверить _work/context.md' },
  completion: { bash: 'source <(sdd-lint completion bash)', zsh: 'source <(sdd-lint completion zsh)' },
};
// Что идёт после команды: варианты из CHOICES, фича, файл или папка, номер.
/** @type {Record<string, string[]>} */
export const SLOTS = {
  start: ['feature'],
  research: ['choice', 'feature'],
  check: ['feature'],
  fix: ['feature'],
  done: ['feature'],
  plan: ['feature'],
  gate: ['choice', 'feature'],
  approve: ['choice', 'feature', 'adr'],
  gen: ['choice', 'feature'],
  next: ['choice', 'feature', 'slice', 'side'],
  ask: ['feature'],
  choose: ['feature', 'option'],
  triage: ['feature'],
  prompt: ['skill', 'feature'],
  diff: ['feature'],
  close: ['feature'],
  export: ['feature'],
  trace: ['feature'],
  guard: ['target'],
  snapshot: ['target'],
  help: ['command'],
  completion: ['choice'],
};
/** @type {Record<string, string[]>} */
export const FLAGS = {
  start: ['--slug', '--name', '--sources', '--accept', '--rename'],
  check: ['--json', '--snapshot'],
  fix: ['--json', '--snapshot'],
  diff: ['--json', '--base'],
  guard: ['--json', '--base'],
  close: ['--json', '--yes'],
  prompt: ['--sub', '--note'],
  choose: ['--fallback'],
};
export const COMMANDS = Object.keys(CMD_INFO);

// Флаги: булевы — есть или нет; со значением — «--имя значение» или «--имя=значение».
// start: --slug — имя придумал агент, --name — ответ человека на «Как назвать папку?» (id варианта или имя),
// --sources и --rename — ответы человека; prompt: --sub — задача сабагенту, --note — уточнение к ней;
// choose --fallback — вариант без сабагентов.
const BOOL_FLAGS = ['json', 'snapshot', 'yes', 'accept', 'sub', 'fallback'];
// Значение по умолчанию у флага без значения: --base — null (в git — HEAD), остальные — пустая строка.
/** @type {Record<string, string | null>} */
const VALUE_FLAGS = { base: null, slug: '', name: '', sources: '', rename: '', note: '' };

/**
 * @typedef {{ json: boolean, snapshot: boolean, yes: boolean, accept: boolean, sub: boolean, fallback: boolean,
 *   base: string | null, slug: string | null, name: string | null, sources: string | null, rename: string | null, note: string | null }} Flags
 * @typedef {{ argv: string[], flags: Flags, pos: string[], cmd: string }} Args
 */
// argv — то, что пришло после имени скрипта. Возвращает { argv, flags, pos, cmd }; ничего не читает из процесса.
/** @param {string[]} argv @returns {Args} */
export function parseArgs(argv) {
  /** @type {Record<string, boolean | string | null>} */
  const flags = { ...Object.fromEntries(BOOL_FLAGS.map((k) => [k, false])), ...Object.fromEntries(Object.keys(VALUE_FLAGS).map((k) => [k, null])) };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const [, name, inline] = argv[i].match(/^--([a-z]+)(?:=(.*))?$/s) || [];
    if (BOOL_FLAGS.includes(name) && inline === undefined) flags[name] = true;
    else if (name in VALUE_FLAGS) flags[name] = inline ?? argv[++i] ?? VALUE_FLAGS[name];
    // «@docs/comments/» — так путь дописывает Tab в строке GigaCode.
    else pos.push(argv[i].replace(/^@(?=.)/, ''));
  }
  return { argv, flags: /** @type {Flags} */ (flags), pos, cmd: commandOf(argv, pos) };
}
// Команда — первое позиционное, если это команда (её убираем из pos); иначе check. __complete — служебная.
/** @param {string[]} argv @param {string[]} pos */
function commandOf(argv, pos) {
  if (argv[0] === '__complete') return '__complete';
  return COMMANDS.includes(pos[0]) ? /** @type {string} */ (pos.shift()) : 'check';
}
