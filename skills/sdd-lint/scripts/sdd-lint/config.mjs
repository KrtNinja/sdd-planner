// Форма команд в подсказках: префикс скиллов и команда lint.

// Подсказки печатаются готовыми командами со slug фичи, чтобы их можно было скопировать.
// Ветки-адаптеры меняют здесь значения по умолчанию; переменные окружения переопределяют их.
const SKILL_PREFIX = process.env.SDD_SKILL_PREFIX ?? '/';
const LINT_CMD = process.env.SDD_LINT_CMD ?? '/sdd-lint';
export const skill = (name, ...args) => [`${SKILL_PREFIX}${name}`, ...args].join(' ');
export const lintCmd = (...args) => [LINT_CMD, ...args].join(' ');
// «/sdd-decide» в текстах правил → команда в форме этого агента.
export const cmds = (text) => text.replace(/(?<![\w/])\/(sdd-[a-z]+|humanizer)\b/g, (_, n) => skill(n));

// Папка временных артефактов фичи: ревью, план нарезки, черновики агента. Коммитится вместе с фичей,
// целиком удаляется в close. Не «memory»: так в GigaCode называется /memory и save_memory (GIGACODE.md).
export const WORK_DIR = '_work';
