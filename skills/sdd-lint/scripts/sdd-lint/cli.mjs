// Справка и ошибки вызова.
import { cmd } from './args.mjs';
import { lintCmd } from './config.mjs';

export const HELP = `sdd-lint — проверки артефактов планирования SDD

  sdd-lint
      без аргументов — фичи в docs/ с текущим этапом и готовые команды
  sdd-lint start [<что человек написал после /sdd-grill>] [--slug <имя>]
  sdd-lint start docs/<feature> [--sources "<ответ человека>"] [--accept] [--rename <имя>]
      старт brainstorming (скилл /sdd-grill) по шагам, каждый вызов — один следующий шаг:
      нет задачи — вопрос «Какую задачу будем делать?»; задача фразой или файлом — папка
      фичи и протокол; источники не названы — вопрос «Есть документация или код?» с описью
      папки; названы — задание сабагенту изучить их; «Старт готов» — можно вести grilling
  sdd-lint research <context|fact|check> docs/<feature> ["<вопрос>"]
      задания сабагенту: context — изучить источники и заполнить _work/context.md,
      fact — найти один факт и дописать его туда же; check — проверки CX-*: разделы,
      у каждого факта источник, путь и строка источника существуют. Код 1 — ошибки
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
  sdd-lint gate <spec|slices|adr|decide|review|build> [docs/<feature>] [<тема ADR | R-находка | режим ревью>]
      ворота перед этапом. Фича не указана — одна подходящая берётся сама, несколько —
      вопрос с вариантами. Код 3 — этап начинать нельзя: причина и вопрос этапа, что делать
      сейчас. Открыты — путь фичи и строка человеку о том, что будет; для slices — требования,
      сервисы, ADR и с какого шага продолжать; для adr — тема (нет — темы из slices или
      задание сабагенту найти кандидатов); для decide R2 — находка ревью и что на неё
      завязано; для review — режим (нет — что ждёт ревью)
  sdd-lint plan docs/<feature>
      план нарезки _work/plan.md: покрытие FR/NFR, причины Р1–Р3, зависимости,
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
  sdd-lint close docs/<feature> [--json] [--yes]
      перед merge (скилл /sdd-close). Без --yes ничего не удаляет: печатает, что удалит
      (brainstorming.md, всё в _work/), и последствия — незакоммиченное, блокеры ревью без
      решения, неодобренные spec и slices, ошибки lint; --json — то же вопросом для
      инструмента выбора. С --yes удаляет, убирает из spec ссылки на протокол, обновляет
      ссылки на FR
  sdd-lint export docs/<feature>
      требования в JSON для зоны реализации: slices, сервисы, AC со ссылкой
      <feature>/<AC-ID> для названий тестов, статус ворот build. Код 3 — ворота build закрыты
  sdd-lint trace docs/<feature> [FR-n | AC-NNN-… …]
      каждая строка протокола: решение → куда ушла (FR/NFR, вне scope, открытый вопрос);
      с ID — что держится на требовании: строки протокола, slices, AC с файлом и строкой
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
