# sdd-workflow — пул для этапа «Планирование»

Скиллы, правила и проверки, чтобы вести фичу по Spec-Driven Development от одной фразы до
одобренных slices: brainstorming → Dev Spec → slices → ADR. Реализация (slice 001, OpenSpec Change)
— следующий этап, сюда не входит.

Примеры процесса: [sdd-workflow-demo](https://github.com/KrtNinja/sdd-workflow-demo) (один сервис),
[sdd-workflow-demo2](https://github.com/KrtNinja/sdd-workflow-demo2) (несколько сервисов).

## Ветки

`main` — общая база: процесс, скиллы, правила и lint без привязки к конкретному агенту.
Остальные ветки — адаптеры: `main` плюс то, что нужно одному инструменту (манифест, пути,
установка). Изменения процесса делаются в `main`, адаптеры обновляются от неё.

| Ветка | Для чего |
|---|---|
| [`gigacode`](https://github.com/KrtNinja/sdd-workflow/tree/gigacode) | GigaCode CLI: расширение с манифестом, правила подключаются как контекст |

## Поток

| Этап | Команда | Результат | Ворота (решает человек) |
|---|---|---|---|
| 1 Brainstorming | `/sdd-grill <feature>` | `docs/<feature>/brainstorming.md` | «понимание общее» |
| 2 Dev Spec | `/sdd-spec <feature>` | `docs/<feature>/spec.md` | checkpoint 1: «одобрено» |
| 3 Slices | `/sdd-slices <feature>` | `docs/<feature>/slices/` | согласие с таблицей нарезки, затем checkpoint 2 |
| 4 ADR | `/sdd-adr <feature> "<тема>"` | `docs/adr/NNNN-*.md` | «принято» |
| Ревью | `/sdd-review <feature> spec\|slices\|adr` | таблица находок | — |
| Позднее решение | `/sdd-decide <feature> "<вопрос>" "<решение>"` | протокол → FR → AC | — |

`node scripts/sdd-lint.mjs docs/<feature>` в любой момент показывает ошибки и следующий шаг.

## Что внутри

```
rules/AGENTS.planning.md   — раздел для AGENTS.md проекта: этапы, ворота, правила артефактов
scripts/sdd-lint.mjs       — механические проверки: ID, блоки кода, покрытие FR↔slices,
                             зависимости и циклы, стоп-слова в Dev Spec, открытые вопросы, этап
skills/
  sdd-grill/    — brainstorming поверх grilling; стартовые темы, шаблон протокола
  sdd-spec/     — Dev Spec из протокола с таблицей трассировки
  sdd-slices/   — нарезка с правилами против перенарезки и калибровкой на demo2 (9 → 5)
  sdd-adr/      — фильтр «нужен ли ADR», варианты через требования, шаблон
  sdd-review/   — чеклисты spec / slices / adr, только находки
  sdd-decide/   — решение сверху вниз: протокол → FR → AC
  */evals/      — тестовые кейсы: запрос, входные файлы, проверки
```

## Установка в репозиторий с доками

1. Скиллы grilling (нужны для `/sdd-grill` и выбора в `/sdd-adr`):
   ```bash
   npx skills@latest add mattpocock/skills      # выбрать grilling
   ```
2. Humanizer — по желанию, убирает следы ИИ из прозы spec, slices и ADR перед checkpoint
   (скиллы напоминают о нём в конце, запускаете вы):
   ```bash
   npx skills@latest add blader/humanizer
   ```
3. Этот пул:
   ```bash
   npx skills@latest add KrtNinja/sdd-workflow
   ```
   или скопировать `skills/*` в папку скиллов вашего агента.
4. Вставить `rules/AGENTS.planning.md` в файл правил агента (`AGENTS.md` или аналог) репозитория с доками.
5. Скопировать `scripts/sdd-lint.mjs` в `scripts/` репозитория с доками (нужен Node 18+).

Если grilling задаёт вопросы по одному удобнее, чем раундами, добавьте в AGENTS.md строку
`When grilling, ask one question at a time.`

## Почему так: расчёт на flash-модели

Пул запускается на GLM-5.3-flash, Qwen3.8-flash-next, DeepSeek-4.1-flash. Поэтому:

- **Один скилл — один этап.** Короткие нумерованные шаги, у каждого шага «Готово, когда…»,
  в конце «Следующий шаг: …» и остановка. Быстрые модели склонны проскакивать ворота, а явная
  точка остановки и правило в AGENTS.md это держат.
- **Скиллы вызывает человек** (`disable-model-invocation: true`): нет постоянной нагрузки на контекст
  и нет случайных срабатываний. Агенты, которые не знают это поле,
  просто покажут скилл в списке.
- **Механику проверяет скрипт, а не модель.** Покрытие, ID, циклы, стоп-слова — `sdd-lint`.
  Модели остаются смысловые проверки по чеклисту.
- **Генерация и ревью разделены.** `/sdd-review` запускается в новой сессии и ничего не правит.
- **Humanizer — отдельно, перед checkpoint.** Его ~400 строк в контексте сбивали бы flash-модель
  на последнем шаге, поэтому скиллы только подсказывают `/humanizer <файл>`. Правило в AGENTS.md
  не даёт ему трогать FR/AC, ID, тексты сообщений, числа и варианты.
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
