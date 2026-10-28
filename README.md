# sdd-workflow — пул для этапа «Планирование»

Скиллы, правила и проверки, чтобы вести фичу по Spec-Driven Development от одной фразы до
одобренных slices: brainstorming → Dev Spec → slices → ADR. Реализация (slice 001, OpenSpec Change)
— следующий этап, сюда не входит.

## Ветки

Это ветка-адаптер `gigacode`: общая база из [`main`](https://github.com/KrtNinja/sdd-workflow/tree/main)
плюс то, что нужно GigaCode CLI — манифест расширения, правила как контекст, lint внутри скилла,
встроенные grilling и humanizer. Изменения процесса делаются в `main`, сюда переносятся
перебазированием на неё.

## Поток

| Этап | Команда | Результат | Ворота (решает человек) |
|---|---|---|---|
| 1 Brainstorming | `/sdd-grill <feature>` | `docs/<feature>/brainstorming.md` | «понимание общее» |
| 2 Dev Spec | `/sdd-spec <feature>` | `docs/<feature>/spec.md` | человек ставит «одобрено» |
| 3 Slices | `/sdd-slices <feature>` | `docs/<feature>/slices/` | согласие с таблицей нарезки, затем «одобрено» |
| 4 ADR | `/sdd-adr <feature> "<тема>"` | `docs/adr/NNNN-*.md` | «принято» |
| Ревью | `/sdd-review <feature> spec\|slices\|adr` | `docs/<feature>/review/<режим>.md`, находки R1, R2 … | блокеры закрыты до одобрения |
| Позднее решение | `/sdd-decide <feature> "<вопрос>" "<решение>"` или `/sdd-decide <feature> R2 "<решение>"` | протокол → FR → AC | — |

`/sdd-lint <feature>` в любой момент показывает ошибки и следующий шаг, `/sdd-lint` без аргументов —
все фичи с текущим этапом и готовые команды.

### Подсказки при вводе

- **Что принимает скилл.** После имени скилла в списке команд серым показан `argument-hint`:
  `/sdd-review` → `<feature> spec|slices|adr [NNNN]`. Сборка без поддержки поля просто его не покажет.
- **Путь по Tab.** В строке GigaCode `@` после команды включает дополнение путей:
  `/sdd-lint guard @docs/com⇥` → `@docs/comments/` → `@docs/comments/sp⇥`. Скиллы и lint понимают
  фичу в любом виде: `comments`, `docs/comments`, `@docs/comments/`, файл внутри фичи.
- **Забыли аргумент — получите варианты.** `sdd-lint approve` без варианта, `sdd-lint gate spec` без
  фичи, опечатка `aprove` — в ответ список готовых команд со slug ваших фич, а не «неверный вызов».
  `sdd-lint help <команда>` — справка по одной команде.
- **Tab в терминале.** `sdd-lint` дополняет команды, варианты, фичи, номера ADR и slices, а пути —
  по папкам, как `cd` (установка — шаг 5 ниже).

Свой Tab-дополнитель аргументов у скилла (как у `/directory add`) GigaCode и Qwen Code расширениям
пока не дают: функции дополнения есть только у встроенных команд, расширение задаёт лишь `argument-hint`.

В GigaCode CLI скилл вызывается `/skills sdd-grill <feature>`; если сборка показывает скиллы как команды — `/sdd-grill <feature>`.

`sdd-lint` печатает следующий шаг готовыми командами со slug фичи: `/skills sdd-review comments slices`,
`/skills sdd-lint approve slices docs/comments`. Если ваша сборка понимает `/sdd-review`, задайте
`export SDD_SKILL_PREFIX=/ SDD_LINT_CMD=/sdd-lint` в профиле оболочки.

## sdd-lint: механика — скрипту, смысл — модели

Всё, что можно проверить или вывести из файлов, делает скрипт. Скиллы вызывают его на каждом
этапе, а модель занимается только тем, что требует суждения.

| Команда | Что делает | Вместо чего |
|---|---|---|
| `/sdd-lint` | фичи с этапом и готовые команды; `help <команда>` — справка по одной | поиска нужной команды по README |
| `/sdd-lint <feature>` | ~70 проверок с ID правила и подсказкой «как исправить» | чеклистов, которые модель проходила сама |
| `sdd-lint gate <этап> docs/<feature>` | ворота этапа: код 3 — начинать нельзя | «прочитай статус и остановись» |
| `sdd-lint approve spec\|slices\|adr docs/<feature>` | ставит «одобрено <дата>» («принято» для ADR), если lint чист и humanizer не тронул защищённые части | ручной правки строки «Статус:» |
| `sdd-lint gen readme docs/<feature>` | таблица slices, «Покрытие», «Порядок работ» из файлов slices | ручной сборки README и сверки |
| `sdd-lint gen guessed docs/<feature>` | «Где агент угадал бы не так» из протокола | ручного поиска расхождений |
| `sdd-lint gen links docs/<feature>` | ссылки: «Из протокола:» в spec → строка протокола (`#L`); «Проверяет:» под AC и «Покрытие» в README → строка FR в spec.md; «Основание:» → spec.md одной ссылкой в конце. Держит их актуальными, переносит старые форматы («Трассировка», `[FR-n]` в строке AC) | ручных номеров строк, которые съезжают |
| `sdd-lint close docs/<feature>` | перед merge: spec и slices одобрены, ошибок нет → удаляет brainstorming.md и всё, что в spec на него ссылается | ручной чистки лесов этапа требований |
| `sdd-lint trace docs/<feature>` | каждая строка протокола: решение → FR/NFR, с `файл:строка` для перехода из терминала | сверки двух файлов глазами |
| `sdd-lint next FR\|NFR\|AC\|slice\|adr …` | следующий свободный номер | подсчёта номеров моделью |
| `sdd-lint diff docs/<feature>` | по git: протокол только дописывается, ID не пропадают, одобренное не меняется молча | правил в AGENTS.md, которые держались на памяти модели |
| `sdd-lint snapshot` / `guard <файл>` | после humanizer сверяет блоки кода, шапки, заголовки, таблицы, «тексты», числа, ID и «Из протокола:» | правила «humanizer не трогает …» |

Что проверяется, по группам: `PR-*` протокол, `SP-*` Dev Spec (трассировка, примеры, персонажи,
числа из протокола, пары границ, стоп-слова), `SL-*` slices (AC → FR, WHEN / THEN, разделы половин,
тексты и персонажи из Dev Spec, Р1–Р3), `RM-*` README, `AD-*` ADR, `DF-*` изменения по git,
`HG-*` humanizer. Полный список с подсказками — в начале `skills/sdd-lint/scripts/sdd-lint.mjs`, `--json` даёт
машинный вывод. Тесты скрипта: `node --test tests/*.test.mjs`.

## Что внутри

```
gigacode-extension.json    — манифест расширения GigaCode CLI (qwen-extension.json — то же для Qwen Code)
rules/AGENTS.planning.md   — правила этапов и артефактов; расширение подключает их как контекст
tests/                     — тесты sdd-lint на эталонной фиче и её порче
skills/
  sdd-lint/     — scripts/sdd-lint.mjs: проверки, ворота, генерация README и номеров, diff по git,
                  guard после humanizer; scripts/pre-commit — git hook
  sdd-grill/    — brainstorming поверх grilling; стартовые темы, шаблон протокола
  sdd-spec/     — Dev Spec из протокола; у каждого FR — «Из протокола:» со ссылками на строки
  sdd-slices/   — нарезка с правилами против перенарезки и калибровкой на demo2 (9 → 5)
  sdd-adr/      — фильтр «нужен ли ADR», варианты через требования, шаблон
  sdd-review/   — чеклисты spec / slices / adr; находки пишет в docs/<feature>/review/
  sdd-decide/   — решение сверху вниз: протокол → FR → AC
  grilling/     — копия из mattpocock/skills (MIT), нужна sdd-grill и sdd-adr
  humanizer/    — копия из blader/humanizer (MIT), запускается вручную перед одобрением
  */evals/      — тестовые кейсы: запрос, данные (docs/), проверки; правила
                  place-files.sh берёт из репозитория
```

## Установка в GigaCode CLI

Репозиторий — расширение GigaCode: скиллы, правила и lint ставятся одной командой, ничего не копируется.

1. Подключить папку с репозиторием — ту, где лежат `gigacode-extension.json` и `skills/`:
   ```bash
   gigacode extensions link ~/tools/sdd-workflow
   ```
   Если сборка не знает `link`: `gigacode extensions install ~/tools/sdd-workflow`.
2. Перезапустить GigaCode и проверить: `gigacode extensions list`, внутри сессии — `/extensions`
   и `/skills` (в списке sdd-grill … sdd-lint, grilling, humanizer).
3. Правила из `rules/AGENTS.planning.md` расширение добавляет в контекст само. Чтобы они не
   попадали в другие проекты, включите расширение только в репозитории с доками:
   ```bash
   gigacode extensions disable sdd-workflow
   cd ~/work/docs-repo && gigacode extensions enable sdd-workflow --scope=workspace
   ```
   Если `--scope` ваша сборка не поддерживает, оставьте расширение включённым: правила
   говорят только о файлах в `docs/` и в коде ничего не меняют.
4. Git hook в репозитории с доками — lint срабатывает на каждый коммит, даже если агент его пропустил:
   ```bash
   ln -s ~/tools/sdd-workflow/skills/sdd-lint/scripts/pre-commit .git/hooks/pre-commit
   ```
   Hook проверяет рабочую копию фич, чьи файлы в коммите. Обойти разово — `git commit --no-verify`.
5. По желанию — `sdd-lint` в терминале с Tab-дополнением:
   ```bash
   ln -s ~/tools/sdd-workflow/skills/sdd-lint/scripts/sdd-lint.mjs ~/.local/bin/sdd-lint
   echo 'source <(sdd-lint completion bash)' >> ~/.bashrc   # zsh: completion zsh в ~/.zshrc после compinit
   ```
   Дальше `sdd-lint ⇥` показывает фичи и команды, `sdd-lint guard docs/⇥` спускается по папкам.

Нужен Node 18+ для `sdd-lint`.

## Установка в другие агенты

- Codex, opencode, Cursor и другие агенты со скиллами: `npx skills@latest add KrtNinja/sdd-workflow`
  (или скопировать `skills/*` в папку скиллов агента), затем вставить `rules/AGENTS.planning.md`
  в `AGENTS.md` репозитория с доками.
- Qwen Code: `qwen extensions link <путь к репозиторию>` — тот же манифест (`qwen-extension.json`).

CI (GitLab), если нужен: скопируйте `skills/sdd-lint/scripts/sdd-lint.mjs` в `scripts/` репозитория с доками и
```yaml
sdd-lint:
  image: node:20-alpine
  rules:
    - changes: [docs/**/*]
  script:
    - for f in docs/*/; do [ "$(basename "$f")" = adr ] || node scripts/sdd-lint.mjs "$f" || exit 1; done
```

Если grilling задаёт вопросы по одному удобнее, чем раундами, добавьте в AGENTS.md строку
`When grilling, ask one question at a time.`

## Почему так: расчёт на flash-модели

Пул запускается на GLM-5.3-flash, Qwen3.8-flash-next, DeepSeek-4.1-flash. Поэтому:

- **Один скилл — один этап.** Короткие нумерованные шаги, у каждого шага «Готово, когда…»,
  в конце «Следующий шаг: …» и остановка. Быстрые модели склонны проскакивать ворота, а явная
  точка остановки и правило в AGENTS.md это держат.
- **Скиллы вызывает человек** (`disable-model-invocation: true`): нет постоянной нагрузки на контекст
  и нет случайных срабатываний. Поле понимают GigaCode и Qwen Code; агенты, которые его не знают, просто
  покажут скилл в списке.
- **Механику проверяет и собирает скрипт, а не модель.** Ворота, трассировка, ссылки AC на FR,
  номера, README, неизменность протокола и одобренных файлов — `sdd-lint`. Чеклисты `sdd-review`
  содержат только смысловые пункты и прямо говорят, что lint уже проверил.
- **Генерация и ревью разделены.** `/sdd-review` запускается в новой сессии и ничего не правит.
- **Lint — инструмент MCP расширения.** Манифест поднимает `skills/sdd-lint/scripts/mcp.mjs`
  (stdio, без зависимостей) по `${extensionPath}`, скиллы вызывают `sdd_lint {"args": [...]}`. Путь к
  скрипту вне проекта не попадает в shell-команды агента, поэтому GigaCode не отказывает в доступе,
  а скрипт не нужно копировать в проект или ставить в PATH. Без MCP (другие агенты) скиллы вызывают
  `../sdd-lint/scripts/sdd-lint.mjs` от своей папки.
- **Humanizer — отдельно, перед одобрением.** Его ~400 строк в контексте сбивали бы flash-модель
  на последнем шаге, поэтому скиллы только подсказывают `/humanizer <файл>`. Что он не тронул FR/AC, ID,
  тексты сообщений, числа и таблицы, проверяет `/sdd-lint guard` по снимку, снятому скиллом.
- **Шаблоны и справка — в отдельных файлах** (`assets/`, `references/`) и грузятся, когда нужны.

## Против перенарезки slices

Нарезка начинается с минимума: 001 «Контракты» и один slice на результат, который пользователь
называет одной фразой. Отдельный slice нужен только по причине: **Р1** ждёт ADR или инфраструктуру,
**Р2** больше 10 AC в половине, **Р3** продукт хочет выпустить часть раньше. Склейка обязательна,
если без соседа ломается безопасность (**С1**), результат не проверить (**С2**), slice — только
отказы или NFR к чужому пути (**С3**), два slice правят один экран ради одного FR (**С4**).
Сначала согласуется таблица нарезки, файлы пишутся после «да». Подробности —
[skills/sdd-slices/SKILL.md](skills/sdd-slices/SKILL.md), пример на demo2 —
[calibration.md](skills/sdd-slices/references/calibration.md).

## Источники

- `grilling` и условия для ADR — [mattpocock/skills](https://github.com/mattpocock/skills) (MIT).
- `humanizer` — [blader/humanizer](https://github.com/blader/humanizer) (MIT).
