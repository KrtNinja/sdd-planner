// Справка и ошибки вызова.
import { cmd } from './args.mjs';
import { lintCmd } from './config.mjs';

export const HELP = `sdd-lint — проверки артефактов планирования SDD

  sdd-lint
      без аргументов — фичи в docs/ с текущим этапом и готовые команды
  sdd-lint [check] docs/<feature> [--snapshot] [--json]
      все проверки и текущий этап. Код 1 — есть ошибки.
      --snapshot — заодно снять снимок защищённых частей для guard
  sdd-lint fix docs/<feature> [--snapshot] [--json]
      после правки — механику делает скрипт: номера вместо FR-? / NFR-? / AC-NNN-? (B? F?),
      ссылки (gen links), slices/README.md (gen readme), «угадал бы» (gen guessed);
      затем все проверки и сверка с git (diff). Код 1 — есть ошибки
  sdd-lint done docs/<feature>
      конец этапа одной командой: fix, затем «черновик» → «на ревью», снимок для guard
      и вопрос этапа (JSON, как у ask). Код 1 — доработать: ошибки или первый проход
      по предупреждениям; после 3 прогонов с ошибками — вопрос человеку
  sdd-lint gate <spec|slices|adr|decide|build> docs/<feature>
      ворота перед этапом. Код 3 — этап начинать нельзя. Открыты — путь фичи,
      для slices ещё требования, сервисы, ADR и с какого шага продолжать
  sdd-lint plan docs/<feature>
      план нарезки slices/plan.md: покрытие FR/NFR, причины Р1–Р3, зависимости,
      сервисы из протокола, кандидаты на склейку. Код 1 — ошибки в плане
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
  sdd-lint gen slices docs/<feature>
      файлы slices по согласованному плану: шапка из плана, заготовки AC по сервисам,
      README; план удаляется. Запускает вариант «Да» в вопросе о нарезке
  sdd-lint gen links docs/<feature>
      ссылки: «Из протокола:» в spec → строка протокола; «Проверяет:» в slices и «Покрытие»
      в README → строка FR в spec.md; «Основание:» → spec.md одной ссылкой. Устаревшие обновляет, старые форматы
      («Трассировка», «[FR-n]» в строке AC) переносит
  sdd-lint close docs/<feature>
      перед merge (скилл /sdd-close): spec и slices одобрены, ADR приняты, блокеров ревью
      и ошибок нет → удаляет brainstorming.md, review/ и slices/plan.md, убирает из spec
      ссылки на протокол, обновляет ссылки на FR
  sdd-lint export docs/<feature>
      требования в JSON для зоны реализации: slices, сервисы, AC со ссылкой
      <feature>/<AC-ID> для названий тестов, статус ворот build. Код 3 — ворота build закрыты
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

Коды выхода: 0 — порядок, 1 — ошибки (у done — доработать), 2 — неверный вызов, 3 — ворота закрыты.

Форма команд в подсказках: SDD_SKILL_PREFIX (по умолчанию «/») и SDD_LINT_CMD
(по умолчанию «/sdd-lint»).`;

export const usage = (msg) => {
  console.error(msg ? `${msg}\nСправка: ${lintCmd('help', cmd === 'check' ? '' : cmd).trim()}` : HELP);
  process.exit(2);
};
// Справка по одной команде — её блок из HELP.
export function helpFor(name) {
  const blocks = HELP.split('\n\n')[1].split(/\n(?=  sdd-lint)/);
  const own = blocks.filter((b) => b.match(/^\s*sdd-lint\s+\[?(\S+?)\]?(\s|$)/)?.[1] === name);
  return own.length ? own.join('\n') : null;
}
