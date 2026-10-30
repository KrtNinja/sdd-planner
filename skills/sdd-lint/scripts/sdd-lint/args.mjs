// Разбор process.argv и описание команд: варианты, слоты аргументов, флаги.

export const argv = process.argv.slice(2);
export const flags = { json: false, snapshot: false, yes: false, base: null, slug: null, sources: null, accept: false, rename: null };
export const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json') flags.json = true;
  else if (a === '--snapshot') flags.snapshot = true;
  else if (a === '--yes') flags.yes = true;
  else if (a === '--base') flags.base = argv[++i];
  else if (a.startsWith('--base=')) flags.base = a.slice(7);
  // start: значения — ответы человека и имя папки, по одному элементу args.
  else if (a === '--slug' || a === '--sources' || a === '--rename') flags[a.slice(2)] = argv[++i] ?? '';
  else if (/^--(slug|sources|rename)=/.test(a)) flags[a.slice(2, a.indexOf('='))] = a.slice(a.indexOf('=') + 1);
  else if (a === '--accept') flags.accept = true;
  // «@docs/comments/» — так путь дописывает Tab в строке GigaCode.
  else pos.push(a.replace(/^@(?=.)/, ''));
}
// Команды и их аргументы — одно описание для меню, подсказок и Tab-дополнения.
export const CMD_INFO = {
  start: 'старт /sdd-grill по шагам: задача, папка фичи, источники, исследование сабагентом',
  research: 'задания сабагенту: изучить источники, найти факт; проверка _work/context.md',
  check: 'все проверки и текущий этап',
  fix: 'после правки: номера, ссылки, README — скриптом, затем проверки',
  done: 'конец этапа: fix, снимок, «на ревью» и вопрос этапа',
  plan: 'проверить план нарезки _work/plan.md',
  gate: 'ворота перед этапом',
  approve: 'одобрить spec, slices или принять ADR',
  gen: 'собрать README, «угадал бы», ссылки, файлы slices по плану',
  guard: 'сверка после humanizer',
  snapshot: 'снимок перед humanizer',
  trace: 'протокол → FR/NFR',
  diff: 'изменения против git',
  close: 'перед merge убрать временные артефакты: протокол и _work/ — после подтверждения (скилл /sdd-close)',
  export: 'требования в JSON для зоны реализации',
  next: 'следующий свободный номер',
  ask: 'вопросы этапа с вариантами',
  choose: 'выполнить выбранный вариант',
  prompt: 'скилл одним текстом для агента',
  help: 'справка по команде',
  completion: 'Tab-дополнение для bash / zsh',
};
export const CHOICES = {
  gate: { spec: 'можно ли писать Dev Spec', slices: 'можно ли резать slices', adr: 'можно ли писать ADR', decide: 'можно ли проводить решение', review: 'что ждёт ревью', build: 'можно ли начинать реализацию' },
  approve: { spec: 'одобрить Dev Spec', slices: 'одобрить slices', adr: 'принять ADR' },
  gen: { readme: 'slices/README.md: таблица, покрытие, порядок', guessed: '«Где агент угадал бы не так»', links: 'ссылки на строки протокола и spec', slices: 'файлы slices по согласованному плану' },
  next: { FR: 'номер нового FR', NFR: 'номер нового NFR', AC: 'номер нового AC в slice', slice: 'номер нового slice', adr: 'номер нового ADR' },
  research: { context: 'изучить источники в _work/context.md', fact: 'найти один факт', check: 'проверить _work/context.md' },
  completion: { bash: 'source <(sdd-lint completion bash)', zsh: 'source <(sdd-lint completion zsh)' },
};
// Что идёт после команды: варианты из CHOICES, фича, файл или папка, номер.
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
export const FLAGS = { start: ['--slug', '--sources', '--accept', '--rename'], check: ['--json', '--snapshot'], fix: ['--json', '--snapshot'], diff: ['--json', '--base'], guard: ['--json', '--base'], close: ['--json', '--yes'] };
export const COMMANDS = Object.keys(CMD_INFO);
export const cmd = argv[0] === '__complete' ? '__complete' : COMMANDS.includes(pos[0]) ? pos.shift() : 'check';
