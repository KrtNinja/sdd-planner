// Разбор process.argv и описание команд: варианты, слоты аргументов, флаги.

export const argv = process.argv.slice(2);
export const flags = { json: false, snapshot: false, base: null };
export const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json') flags.json = true;
  else if (a === '--snapshot') flags.snapshot = true;
  else if (a === '--base') flags.base = argv[++i];
  else if (a.startsWith('--base=')) flags.base = a.slice(7);
  // «@docs/comments/» — так путь дописывает Tab в строке GigaCode.
  else pos.push(a.replace(/^@(?=.)/, ''));
}
// Команды и их аргументы — одно описание для меню, подсказок и Tab-дополнения.
export const CMD_INFO = {
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
export const CHOICES = {
  gate: { spec: 'можно ли писать Dev Spec', slices: 'можно ли резать slices', adr: 'можно ли писать ADR', decide: 'можно ли проводить решение', build: 'можно ли начинать реализацию' },
  approve: { spec: 'одобрить Dev Spec', slices: 'одобрить slices', adr: 'принять ADR' },
  gen: { readme: 'slices/README.md: таблица, покрытие, порядок', guessed: '«Где агент угадал бы не так»', links: 'ссылки на строки протокола и spec' },
  next: { FR: 'номер нового FR', NFR: 'номер нового NFR', AC: 'номер нового AC в slice', slice: 'номер нового slice', adr: 'номер нового ADR' },
  completion: { bash: 'source <(sdd-lint completion bash)', zsh: 'source <(sdd-lint completion zsh)' },
};
// Что идёт после команды: варианты из CHOICES, фича, файл или папка, номер.
export const SLOTS = {
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
export const FLAGS = { check: ['--json', '--snapshot'], fix: ['--json', '--snapshot'], diff: ['--json', '--base'], guard: ['--json', '--base'] };
export const COMMANDS = Object.keys(CMD_INFO);
export const cmd = argv[0] === '__complete' ? '__complete' : COMMANDS.includes(pos[0]) ? pos.shift() : 'check';
