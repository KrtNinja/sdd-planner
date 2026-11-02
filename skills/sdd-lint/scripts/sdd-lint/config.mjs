// Форма команд в подсказках: префикс скиллов и команда lint.

// Подсказки печатаются готовыми командами со slug фичи, чтобы их можно было скопировать.
// Ветки-адаптеры меняют здесь значения по умолчанию; переменные окружения переопределяют их.
const SKILL_PREFIX = process.env.SDD_SKILL_PREFIX ?? '/';
const LINT_CMD = process.env.SDD_LINT_CMD ?? '/sdd-lint';
export const skill = (name, ...args) => [`${SKILL_PREFIX}${name}`, ...args].join(' ');
export const lintCmd = (...args) => [LINT_CMD, ...args].join(' ');
// Команда в тексте для человека — inline-кодом: агент выводит текст скрипта как есть, и markdown
// подсвечивает команду всегда, а не когда модель сама догадалась поставить бэктики.
// Сырые skill()/lintCmd() — для аргументов, JSON-действий и строки Tip.
export const code = (s) => `\`${s}\``;
export const skillCode = (...a) => code(skill(...a));
export const lintCode = (...a) => code(lintCmd(...a));

// Строка для подсказки в поле ввода GigaCode (followup suggestions, унаследованы от Qwen Code).
// Её модель-предсказатель ищет в последних строках ответа явную подсказку (в его промпте пример —
// «Tip: type X to …») и берёт X. Пишем по-русски, префикс «Tip:» оставляем как маркер. Запятой перед
// «чтобы» нет намеренно: она прилипла бы к команде в подсказке. Бэктиков тоже нет: предсказатель мог бы
// перенести их в поле ввода, и команда не начиналась бы с «/».
// Подсказку длиннее 12 слов или от 100 символов, с переносом, «*» или границей предложения CLI отбросит,
// а заготовку с «<…>» нельзя отправить как есть, — такую строку не печатаем вовсе.
export function tipOk(cmd) {
  if (!cmd) return false;
  const words = cmd.trim().split(/\s+/).length;
  return words <= 12 && cmd.length < 100 && !/[\n*<>`]/.test(cmd) && !/[.!?]\s+[A-ZА-ЯЁ]/.test(cmd);
}
export const tipLine = (cmd) => (tipOk(cmd) ? `Tip: Введите ${cmd} чтобы продолжить` : null);
// Команду, которую человек запускает сам, — кодом, и следом строка Tip: её подхватит строка ввода.
export const showCmd = (cmd) => [code(cmd), tipLine(cmd)].filter(Boolean).join('\n\n');
// «/sdd-decide» в текстах правил → команда в форме этого агента.
export const cmds = (text) => text.replace(/(?<![\w/])\/(sdd-[a-z]+|humanizer)\b/g, (_, n) => skill(n));

// Папка временных артефактов фичи: ревью, план нарезки, черновики агента. Коммитится вместе с фичей,
// целиком удаляется в close. Не «memory»: так в GigaCode называется /memory и save_memory (GIGACODE.md).
export const WORK_DIR = '_work';
