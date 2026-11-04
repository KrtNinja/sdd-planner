# Golden: состояние «good»

Снято tests/golden.test.mjs. Не правится руками: UPDATE_GOLDEN=1.

### `sdd-lint start`

код 0

~~~~text
Какую задачу будем делать? Опишите одной-двумя фразами, что должно появиться или измениться. Задача уже записана в файле — укажите его: `@путь` (Tab дополнит).

⚙ sdd: жди ответ → ["start","<ответ человека>"]
~~~~

### `sdd-lint start comments`

код 0

~~~~text
Протокол `docs/comments` готов: обсуждение задачи закончено, новое решение — через `/sdd-decide comments`.

**Части работы «на ревью». Что дальше?**

1. **Проверить отдельным агентом** (рекомендую) — новая сессия, результаты — в `docs/comments/_work/review/slices.md`
2. **Проверить в новой сессии** — вы запускаете команду сами
3. **Упростить формулировки частей работы** — упростить текст и проверить сохранность структуры
4. **Одобрить** — `/sdd-lint approve slices docs/comments`

⚙ sdd: вопрос «Части работы» → ["choose","docs/comments","<id>"] · варианты: 1=review-here:slices, 2=review-window:slices, 3=humanize:slices, 4=approve:slices
~~~~

### `sdd-lint research`

код 2

~~~~text
research — выбери вариант:

- `/sdd-lint research context comments` — изучить источники в _work/context.md
- `/sdd-lint research fact comments` — найти один факт
- `/sdd-lint research check comments` — проверить _work/context.md
~~~~

### `sdd-lint research context`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint research context comments`
~~~~

### `sdd-lint research context comments`

код 0

~~~~text
# Исследование источников: docs/comments

Ты исследователь в чистом контексте. Твой результат — файл docs/comments/_work/context.md. Его читает агент, который
ведёт планирование фичи (сейчас этап «slices»), на этом и следующих этапах: что ты нашёл,
он у человека не спросит. Поэтому пиши только то, что видишь в источниках, и у каждого факта —
откуда он.

Задача фичи: «Добавьте комментарии в задачи, чтобы можно было звать коллег через @»

Источники:
- репозиторий — текущая папка целиком

Корень репозитория — текущая папка.

## Шаги

1. Осмотрись: README, оглавления, названия папок и файлов. Целиком читай только то, что относится
   к задаче. Готово, когда понятно, какие файлы про неё (обычно 5–15).
2. Задача пришла файлом или ссылкой — прочитай её целиком. В «Задача» — 3–7 пунктов: что просят.
   В «Уже решено в задаче» — каждое решение о поведении, которое в ней уже есть, близко к тексту.
   У каждого пункта — строка задачи: «- <пункт> — `файл:строка`». Задача пришла фразой — в оба
   раздела «-».
3. Выпиши факты о том, как устроено сейчас и что понадобится для этой задачи: роли и права,
   объекты и статусы, сервисы и как они связаны, контракты между ними (API, события, поля),
   лимиты и ограничения компании. Одна строка — один факт:
   «- <факт> — `путь:строка`» или «- <факт> — <ссылка>».
4. Чего для задачи нет в источниках — в «Не нашёл», вопросом, который агент задаст человеку.
   Источник не открылся (нет доступа, вне папки проекта, нужен вход) — в «Не удалось прочитать»
   с причиной. Содержание не угадывай.
5. Заполни docs/comments/_work/context.md. Файл уже создан: строки «Задача:» и «Источники:» и заголовки разделов не меняй,
   пиши под заголовками. Пустой раздел — «-». Всего до 6 000 символов.
6. sdd_lint ["research","check","docs/comments"] — исправь, что он скажет, и повтори; не больше двух раз.
7. Последним сообщением — 2–4 строки: сколько фактов, чего не нашёл, что не открылось.
   Файл не пересказывай.

Нельзя: рекомендации и оценки («лучше», «рекомендую») — решения примет человек; выбор технологий;
правка любых файлов, кроме docs/comments/_work/context.md.
~~~~

### `sdd-lint research fact`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint research fact comments`
~~~~

### `sdd-lint research fact comments`

код 2

~~~~text
Укажи вопрос: research fact docs/<feature> "<вопрос>"
Справка: `/sdd-lint help research`
~~~~

### `sdd-lint research check`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint research check comments`
~~~~

### `sdd-lint research check comments`

код 0

~~~~text

`docs/comments/_work/context.md`: проверено, фактов о проекте — 0.

⚙ sdd:
~~~~

### `sdd-lint fix`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint fix comments`
~~~~

### `sdd-lint fix --json`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint fix comments`
~~~~

### `sdd-lint fix comments`

код 0

~~~~text
Скрипту поправлять нечего.

не git-репозиторий: сверка с git (DF-*) пропущена

Части работы ожидают проверки. Следующий шаг:

1. по желанию упростить формулировки: `/humanizer` по каждому файлу в `docs/comments/slices/`, затем `/sdd-lint guard docs/comments`
2. проверка ИИ в новой сессии: `/sdd-review comments slices`
3. одобрить: `/sdd-lint approve slices docs/comments`

Ошибок: 0, предупреждений: 0. FR/NFR: 13, частей работы: 3, AC: 14

Tip: Введите /sdd-review comments slices чтобы продолжить
~~~~

### `sdd-lint fix comments --json`

код 0

~~~~text
{
  "findings": [],
  "hints": {},
  "counts": {
    "err": 0,
    "warn": 0,
    "info": 0
  },
  "stage": "Части работы ожидают проверки",
  "next": [
    "по желанию упростить формулировки: `/humanizer` по каждому файлу в `docs/comments/slices/`, затем `/sdd-lint guard docs/comments`",
    "проверка ИИ в новой сессии: `/sdd-review comments slices`",
    "одобрить: `/sdd-lint approve slices docs/comments`"
  ],
  "tip": "Tip: Введите /sdd-review comments slices чтобы продолжить",
  "fixed": [],
  "notes": [
    "не git-репозиторий: сверка с git (DF-*) пропущена"
  ]
}
~~~~

### `sdd-lint done`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint done comments`
~~~~

### `sdd-lint done comments`

код 0

~~~~text
Скрипту поправлять нечего.

не git-репозиторий: сверка с git (DF-*) пропущена

Этап готов: ошибок 0, предупреждений 0.

**Части работы «на ревью». Что дальше?**

1. **Проверить отдельным агентом** (рекомендую) — новая сессия, результаты — в `docs/comments/_work/review/slices.md`
2. **Проверить в новой сессии** — вы запускаете команду сами
3. **Упростить формулировки частей работы** — упростить текст и проверить сохранность структуры
4. **Одобрить** — `/sdd-lint approve slices docs/comments`

⚙ sdd: вопрос «Части работы» → ["choose","docs/comments","<id>"] · варианты: 1=review-here:slices, 2=review-window:slices, 3=humanize:slices, 4=approve:slices
~~~~

### `sdd-lint plan`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint plan comments`
~~~~

### `sdd-lint plan comments`

код 2

~~~~text
Плана разбиения работы ещё нет: docs/comments/_work/plan.md.

⚙ sdd: запиши docs/comments/_work/plan.md по шаблону assets/plan.md скилла sdd-slices · затем ["plan","docs/comments"]
~~~~

### `sdd-lint gate`

код 2

~~~~text
gate — выбери вариант:

- `/sdd-lint gate spec comments` — можно ли подготовить требования
- `/sdd-lint gate slices comments` — можно ли разбить работу на части
- `/sdd-lint gate adr comments` — можно ли подготовить архитектурное решение (ADR)
- `/sdd-lint gate decide comments` — можно ли обновить документы по решению
- `/sdd-lint gate review comments` — что ждёт проверки ИИ
- `/sdd-lint gate build comments` — можно ли начинать реализацию
~~~~

### `sdd-lint gate spec`

код 2

~~~~text
Задач, где можно подготовить требования, нет.

Задачи и этапы:
- comments — Части работы ожидают проверки

Новая задача начинается с `/sdd-grill`.

⚙ sdd: стоп
~~~~

### `sdd-lint gate spec comments`

код 0

~~~~text
Готовлю требования по docs/comments: только решения из протокола, ничего от себя. В конце — проверка ИИ и ваше одобрение.

⚙ sdd: ворота spec открыты · фича docs/comments · дальше по скиллу
~~~~

### `sdd-lint gate slices`

код 0

~~~~text
Задача не указана — беру единственную, где можно разбить работу на части: docs/comments.

Продолжаю разбиение работы по docs/comments с того места, где остановились.

Требования spec.md (13) — каждое попадёт в «Основание» хотя бы одной части работы:
- **FR-1** Комментировать задачу может любой, кто её видит.
- **FR-2** Текст комментария обязателен, не длиннее 5000 символов.
- **FR-3** Комментарии показываются в карточке от старых к новым: автор, время, текст.
- **FR-4** Автор может изменить свой комментарий в течение 15 минут после публикации.
- **FR-5** Удалить комментарий может автор и руководитель проекта.
- **FR-6** Упоминание: после «@» и 2 символов показываются до 10 подсказок — участники, которые видят задачу, по алфав…
- **FR-7** Упомянуть можно только того, кто видит задачу.
- **FR-8** Упомянутый получает уведомление в колокольчике.
- **FR-9** Изменение комментария не присылает повторное уведомление тому, кто уже был упомянут; новый упомянутый получ…
- **FR-10** Уведомление может прийти с задержкой, но не теряется и не дублируется: одно упоминание — одно уведомление.
- **NFR-1** Публикация комментария: p95 ≤ 300 мс при 2000 комментариев в задаче.
- **NFR-2** Подсказки упоминаний: p95 ≤ 200 мс в проекте до 500 участников.
- **NFR-3** Уведомление об упоминании: p95 ≤ 2 с с момента публикации (без учёта сбоев доставки).

Сервисы: frontend, tasks-core, notify-service — так они и называются в «Половины».

Архитектурные решения (ADR) задачи:
- `docs/adr/0001-mention-notifications.md` «принято <ДАТА>» — Доставка уведомлений об упоминаниях через брокер

⚙ sdd: ворота slices открыты · фича docs/comments · прочитай ADR фичи · файлы slices есть и заполнены — нарезку заново не начинай; поправить поведение — через sdd-decide; закончить этап — вызови ["done","docs/comments"] · дальше по скиллу
~~~~

### `sdd-lint gate slices comments`

код 0

~~~~text
Продолжаю разбиение работы по docs/comments с того места, где остановились.

Требования spec.md (13) — каждое попадёт в «Основание» хотя бы одной части работы:
- **FR-1** Комментировать задачу может любой, кто её видит.
- **FR-2** Текст комментария обязателен, не длиннее 5000 символов.
- **FR-3** Комментарии показываются в карточке от старых к новым: автор, время, текст.
- **FR-4** Автор может изменить свой комментарий в течение 15 минут после публикации.
- **FR-5** Удалить комментарий может автор и руководитель проекта.
- **FR-6** Упоминание: после «@» и 2 символов показываются до 10 подсказок — участники, которые видят задачу, по алфав…
- **FR-7** Упомянуть можно только того, кто видит задачу.
- **FR-8** Упомянутый получает уведомление в колокольчике.
- **FR-9** Изменение комментария не присылает повторное уведомление тому, кто уже был упомянут; новый упомянутый получ…
- **FR-10** Уведомление может прийти с задержкой, но не теряется и не дублируется: одно упоминание — одно уведомление.
- **NFR-1** Публикация комментария: p95 ≤ 300 мс при 2000 комментариев в задаче.
- **NFR-2** Подсказки упоминаний: p95 ≤ 200 мс в проекте до 500 участников.
- **NFR-3** Уведомление об упоминании: p95 ≤ 2 с с момента публикации (без учёта сбоев доставки).

Сервисы: frontend, tasks-core, notify-service — так они и называются в «Половины».

Архитектурные решения (ADR) задачи:
- `docs/adr/0001-mention-notifications.md` «принято <ДАТА>» — Доставка уведомлений об упоминаниях через брокер

⚙ sdd: ворота slices открыты · фича docs/comments · прочитай ADR фичи · файлы slices есть и заполнены — нарезку заново не начинай; поправить поведение — через sdd-decide; закончить этап — вызови ["done","docs/comments"] · дальше по скиллу
~~~~

### `sdd-lint gate adr`

код 0

~~~~text
Задача не указана — беру единственную, где можно подготовить архитектурное решение (ADR): docs/comments.

Тема ADR не указана; части работы не требуют ADR. Отдельный агент найдёт неописанные технические решения — покажу список тем.

⚙ sdd: сабагент ["research","fact","docs/comments","Какие технические решения нужны этой фиче и ещё не описаны в ADR: брокер, хранилище, доставка событий, порядок, кэш, лимиты? Каждое — тема и где в spec или slices оно нужно."] · кандидаты — покажи человеку списком и спроси, какую тему берём; жди ответ → ["gate","adr","docs/comments","<ответ человека>"] · кандидатов нет — скажи «ADR этой фиче не нужен» и стоп · без сабагентов — то же здесь
~~~~

### `sdd-lint gate adr comments`

код 0

~~~~text
Тема ADR не указана; части работы не требуют ADR. Отдельный агент найдёт неописанные технические решения — покажу список тем.

⚙ sdd: сабагент ["research","fact","docs/comments","Какие технические решения нужны этой фиче и ещё не описаны в ADR: брокер, хранилище, доставка событий, порядок, кэш, лимиты? Каждое — тема и где в spec или slices оно нужно."] · кандидаты — покажи человеку списком и спроси, какую тему берём; жди ответ → ["gate","adr","docs/comments","<ответ человека>"] · кандидатов нет — скажи «ADR этой фиче не нужен» и стоп · без сабагентов — то же здесь
~~~~

### `sdd-lint gate decide`

код 0

~~~~text
Задача не указана — беру единственную, где можно обновить документы по решению: docs/comments.

Обновляю протокол, требования и критерии приёмки по решению для docs/comments; в конце покажу, что изменилось.

⚙ sdd: ворота decide открыты · фича docs/comments · дальше по скиллу
~~~~

### `sdd-lint gate decide comments`

код 0

~~~~text
Обновляю протокол, требования и критерии приёмки по решению для docs/comments; в конце покажу, что изменилось.

⚙ sdd: ворота decide открыты · фича docs/comments · дальше по скиллу
~~~~

### `sdd-lint gate review`

код 0

~~~~text
Задача не указана — беру единственную, где можно проверить документы: docs/comments.

⚙ sdd: ворота review открыты · фича docs/comments · режим slices · дальше по скиллу
~~~~

### `sdd-lint gate review comments`

код 0

~~~~text
⚙ sdd: ворота review открыты · фича docs/comments · режим slices · дальше по скиллу
~~~~

### `sdd-lint gate build`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint gate build comments`
~~~~

### `sdd-lint gate build comments`

код 3

~~~~text
Пока нельзя начать реализацию: части работы не одобрены. Сначала одобрите части работы: `/sdd-lint approve slices docs/comments`

⚙ sdd: стоп
~~~~

### `sdd-lint approve`

код 2

~~~~text
approve — выбери вариант:

- `/sdd-lint approve spec comments` — одобрить требования
- `/sdd-lint approve slices comments` — одобрить части работы
- `/sdd-lint approve adr comments` — принять ADR
~~~~

### `sdd-lint approve spec`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint approve spec comments`
~~~~

### `sdd-lint approve spec comments`

код 0

~~~~text
docs/comments/spec.md: уже «одобрено <ДАТА>».
~~~~

### `sdd-lint approve slices`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint approve slices comments`
~~~~

### `sdd-lint approve slices comments`

код 0

~~~~text
docs/comments/slices/README.md: Статус: одобрено <ДАТА> · <ОТПЕЧАТОК>

Части работы одобрены, ADR приняты. Следующий шаг: перед слиянием ветки убрать временные файлы (`docs/comments/brainstorming.md`): `/sdd-close comments`

Tip: Введите /sdd-close comments чтобы продолжить
~~~~

### `sdd-lint approve adr`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint approve adr comments`
~~~~

### `sdd-lint approve adr comments`

код 2

~~~~text
НЕ ОДОБРЕНО: у задачи comments нет ADR, ждущих «принято»
~~~~

### `sdd-lint approve adr comments 0001`

код 0

~~~~text
docs/adr/0001-mention-notifications.md: уже «принято <ДАТА>».
~~~~

### `sdd-lint gen`

код 2

~~~~text
gen — выбери вариант:

- `/sdd-lint gen readme comments` — slices/README.md: таблица, покрытие, порядок
- `/sdd-lint gen links comments` — ссылки на строки протокола и spec
- `/sdd-lint gen slices comments` — файлы частей работы по согласованному плану
~~~~

### `sdd-lint gen readme`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint gen readme comments`
~~~~

### `sdd-lint gen readme comments`

код 0

~~~~text
docs/comments/slices/README.md: таблица slices, «Покрытие Dev Spec», «Порядок работ» собраны из файлов slices. Порядок: 001 → 002 → 003
~~~~

### `sdd-lint gen links`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint gen links comments`
~~~~

### `sdd-lint gen links comments`

код 0

~~~~text
docs/comments/spec.md: Ссылок на строки протокола: 14.

slices: «Основание» — ссылка на spec.md, FR в «Проверяет:» — ссылки на их строки.

docs/comments/slices/README.md: таблицы собраны заново со ссылками.
~~~~

### `sdd-lint gen slices`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint gen slices comments`
~~~~

### `sdd-lint gen slices comments`

код 1

~~~~text
Нет docs/comments/_work/plan.md — сначала план нарезки (скилл sdd-slices).
~~~~

### `sdd-lint guard`

код 2

~~~~text
Укажи файл или фичу. Фичи в `docs/`:

- `/sdd-lint guard comments`
~~~~

### `sdd-lint guard --json`

код 2

~~~~text
Укажи файл или фичу. Фичи в `docs/`:

- `/sdd-lint guard comments`
~~~~

### `sdd-lint guard docs/comments/spec.md`

код 1

~~~~text

Не с чем сверить 1 файл(ов): нет снимка и версии в git — `docs/comments/spec.md`. Снимок снимают до humanizer: `/sdd-lint snapshot <файл>`. Если humanizer уже прошёл, сверьте защищённые части глазами.
~~~~

### `sdd-lint guard docs/comments/spec.md --json`

код 1

~~~~text
{
  "findings": [],
  "hints": {},
  "counts": {
    "err": 0,
    "warn": 0,
    "info": 0
  },
  "noBase": [
    "docs/comments/spec.md"
  ]
}
~~~~

### `sdd-lint snapshot`

код 2

~~~~text
Укажи файл или фичу. Фичи в `docs/`:

- `/sdd-lint snapshot comments`
~~~~

### `sdd-lint snapshot docs/comments/spec.md`

код 0

~~~~text
Снимок защищённых частей: docs/comments/spec.md. После humanizer: `/sdd-lint guard docs/comments/spec.md`
~~~~

### `sdd-lint trace`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint trace comments`
~~~~

### `sdd-lint trace comments`

код 0

~~~~text
- **#1** `docs/comments/brainstorming.md:15` Любой, кто видит задачу → FR-1 `docs/comments/spec.md:29`
- **#2** `docs/comments/brainstorming.md:16` 5000 символов, пробелы-only нельзя → FR-2 `docs/comments/spec.md:36`
- **#3** `docs/comments/brainstorming.md:17` Старые сверху → FR-3 `docs/comments/spec.md:43`
- **#4** `docs/comments/brainstorming.md:18` 15 минут, пометка «изменён» → FR-4 `docs/comments/spec.md:49`
- **#5** `docs/comments/brainstorming.md:19` Автор и руководитель, остаётся «Комментарий удалён» → FR-5 `docs/comments/spec.md:57`
- **#6** `docs/comments/brainstorming.md:20` С 2 символов, до 10, по алфавиту → FR-6 `docs/comments/spec.md:66`
- **#7** `docs/comments/brainstorming.md:21` да → FR-7 `docs/comments/spec.md:74`
- **#8** `docs/comments/brainstorming.md:22` Асинхронно через notify-service, сбой не мешает публикации → FR-8 `docs/comments/spec.md:81`; FR-10 `docs/comments/spec.md:95`
- **#9** `docs/comments/brainstorming.md:23` Только новых упомянутых → FR-9 `docs/comments/spec.md:88`
- **#10** `docs/comments/brainstorming.md:24` Публикация 300 мс при 2000 комментариев, подсказки 200 мс… → NFR-1 `docs/comments/spec.md:105`; NFR-2 `docs/comments/spec.md:110`; NFR-3 `docs/comments/spec.md:115`
- **#П1** `docs/comments/brainstorming.md:34` Все, кто видит задачу → FR-4 `docs/comments/spec.md:49`
~~~~

### `sdd-lint diff`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint diff comments`
~~~~

### `sdd-lint diff --json`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint diff comments`
~~~~

### `sdd-lint diff comments`

код 2

~~~~text
diff работает только в git-репозитории
Справка: `/sdd-lint help diff`
~~~~

### `sdd-lint diff comments --json`

код 2

~~~~text
diff работает только в git-репозитории
Справка: `/sdd-lint help diff`
~~~~

### `sdd-lint close`

код 0

~~~~text
**Закрытие docs/comments** — пока ничего не удалено.

Удалится:
- `docs/comments/brainstorming.md`
- `docs/comments/spec.md`: уберутся ссылки на протокол («Из протокола: П<n>»)

Последствия:
- Планирование не закончено (части работы не одобрены): протокол и результаты проверки нужны для доработки; после удаления останутся только в Git.
- Не git-репозиторий: удалённое не восстановить.

Подтвердить: `/sdd-lint close docs/comments --yes`
~~~~

### `sdd-lint close --json`

код 0

~~~~text
**Закрытие docs/comments** — пока ничего не удалено.

Удалится:
- `docs/comments/brainstorming.md`
- `docs/comments/spec.md`: уберутся ссылки на протокол («Из протокола: П<n>»)

Последствия:
- Планирование не закончено (части работы не одобрены): протокол и результаты проверки нужны для доработки; после удаления останутся только в Git.
- Не git-репозиторий: удалённое не восстановить.

**Удалить временные файлы docs/comments, несмотря на последствия выше?**

1. **Не удалять** (рекомендую) — ничего не делать
2. **Удалить** — скрипт удалит перечисленное и проверит документы задачи

⚙ sdd: вопрос «Завершить задачу» → ["choose","docs/comments","<id>"] · варианты: 1=close:no, 2=close:yes
~~~~

### `sdd-lint close comments`

код 0

~~~~text
**Закрытие docs/comments** — пока ничего не удалено.

Удалится:
- `docs/comments/brainstorming.md`
- `docs/comments/spec.md`: уберутся ссылки на протокол («Из протокола: П<n>»)

Последствия:
- Планирование не закончено (части работы не одобрены): протокол и результаты проверки нужны для доработки; после удаления останутся только в Git.
- Не git-репозиторий: удалённое не восстановить.

Подтвердить: `/sdd-lint close docs/comments --yes`
~~~~

### `sdd-lint close comments --json`

код 0

~~~~text
**Закрытие docs/comments** — пока ничего не удалено.

Удалится:
- `docs/comments/brainstorming.md`
- `docs/comments/spec.md`: уберутся ссылки на протокол («Из протокола: П<n>»)

Последствия:
- Планирование не закончено (части работы не одобрены): протокол и результаты проверки нужны для доработки; после удаления останутся только в Git.
- Не git-репозиторий: удалённое не восстановить.

**Удалить временные файлы docs/comments, несмотря на последствия выше?**

1. **Не удалять** (рекомендую) — ничего не делать
2. **Удалить** — скрипт удалит перечисленное и проверит документы задачи

⚙ sdd: вопрос «Завершить задачу» → ["choose","docs/comments","<id>"] · варианты: 1=close:no, 2=close:yes
~~~~

### `sdd-lint export`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint export comments`
~~~~

### `sdd-lint export comments`

код 3

~~~~text
{
  "feature": "comments",
  "dir": "docs/comments",
  "stage": "Части работы ожидают проверки",
  "gate": {
    "build": "closed",
    "reason": "части работы не одобрены",
    "hint": "Сначала одобрите части работы: `/sdd-lint approve slices docs/comments`"
  },
  "ref": {
    "format": "comments/<AC-ID>",
    "pattern": "comments/AC-\\d{3}-[BF]?\\d+"
  },
  "spec": {
    "file": "docs/comments/spec.md",
    "status": "одобрено <ДАТА>"
  },
  "slicesStatus": "на ревью",
  "slices": [
    {
      "num": "001",
      "title": "Контракты",
      "file": "docs/comments/slices/001-contracts.md",
      "type": "подготовка",
      "deps": [],
      "layer": 1,
      "services": [
        "tasks-core",
        "notify-service",
        "frontend"
      ],
      "basis": [],
      "acs": []
    },
    {
      "num": "002",
      "title": "Комментарии в задаче",
      "file": "docs/comments/slices/002-comments.md",
      "type": "поведение",
      "deps": [
        "001"
      ],
      "layer": 2,
      "services": [
        "tasks-core",
        "frontend"
      ],
      "basis": [
        "FR-1",
        "FR-2",
        "FR-3",
        "FR-4",
        "FR-5",
        "FR-6",
        "FR-7",
        "NFR-1",
        "NFR-2"
      ],
      "acs": [
        {
          "id": "AC-002-1",
          "ref": "comments/AC-002-1",
          "name": "Обсуждение в карточке",
          "half": "common",
          "service": null,
          "checks": [
            "FR-1",
            "FR-3"
          ],
          "line": 17,
          "deleted": false
        },
        {
          "id": "AC-002-B1",
          "ref": "comments/AC-002-B1",
          "name": "Кто комментирует",
          "half": "backend",
          "service": "tasks-core",
          "checks": [
            "FR-1"
          ],
          "line": 25,
          "deleted": false
        },
        {
          "id": "AC-002-B2",
          "ref": "comments/AC-002-B2",
          "name": "Длина текста",
          "half": "backend",
          "service": "tasks-core",
          "checks": [
            "FR-2"
          ],
          "line": 32,
          "deleted": false
        },
        {
          "id": "AC-002-B3",
          "ref": "comments/AC-002-B3",
          "name": "Правка через 15 минут",
          "half": "backend",
          "service": "tasks-core",
          "checks": [
            "FR-4"
          ],
          "line": 41,
          "deleted": false
        },
        {
          "id": "AC-002-B4",
          "ref": "comments/AC-002-B4",
          "name": "Удаление чужого",
          "half": "backend",
          "service": "tasks-core",
          "checks": [
            "FR-5"
          ],
          "line": 48,
          "deleted": false
        },
        {
          "id": "AC-002-B5",
          "ref": "comments/AC-002-B5",
          "name": "Кого можно упомянуть",
          "half": "backend",
          "service": "tasks-core",
          "checks": [
            "FR-6",
            "FR-7"
          ],
          "line": 55,
          "deleted": false
        },
        {
          "id": "AC-002-B6",
          "ref": "comments/AC-002-B6",
          "name": "Скорость",
          "half": "backend",
          "service": "tasks-core",
          "checks": [
            "NFR-1",
            "NFR-2"
          ],
          "line": 62,
          "deleted": false
        },
        {
          "id": "AC-002-F1",
          "ref": "comments/AC-002-F1",
          "name": "Правка и пометка",
          "half": "frontend",
          "service": "frontend",
          "checks": [
            "FR-4"
          ],
          "line": 71,
          "deleted": false
        },
        {
          "id": "AC-002-F2",
          "ref": "comments/AC-002-F2",
          "name": "Удалённый комментарий",
          "half": "frontend",
          "service": "frontend",
          "checks": [
            "FR-5"
          ],
          "line": 78,
          "deleted": false
        },
        {
          "id": "AC-002-F3",
          "ref": "comments/AC-002-F3",
          "name": "Подсказки упоминаний",
          "half": "frontend",
          "service": "frontend",
          "checks": [
            "FR-6"
          ],
          "line": 85,
          "deleted": false
        }
      ]
    },
    {
      "num": "003",
      "title": "Уведомления об упоминаниях",
      "file": "docs/comments/slices/003-mention-notifications.md",
      "type": "поведение",
      "deps": [
        "001",
        "002"
      ],
      "layer": 3,
      "services": [
        "tasks-core",
        "notify-service",
        "frontend"
      ],
      "basis": [
        "FR-8",
        "FR-9",
        "FR-10",
        "NFR-3"
      ],
      "acs": [
        {
          "id": "AC-003-1",
          "ref": "comments/AC-003-1",
          "name": "Уведомление об упоминании",
          "half": "common",
          "service": null,
          "checks": [
            "FR-8"
          ],
          "line": 17,
          "deleted": false
        },
        {
          "id": "AC-003-B1",
          "ref": "comments/AC-003-B1",
          "name": "Без дублей",
          "half": "backend",
          "service": "notify-service",
          "checks": [
            "FR-10"
          ],
          "line": 25,
          "deleted": false
        },
        {
          "id": "AC-003-B2",
          "ref": "comments/AC-003-B2",
          "name": "Сбой доставки",
          "half": "backend",
          "service": "notify-service",
          "checks": [
            "FR-10",
            "NFR-3"
          ],
          "line": 32,
          "deleted": false
        },
        {
          "id": "AC-003-F1",
          "ref": "comments/AC-003-F1",
          "name": "Правка не шлёт повтор",
          "half": "frontend",
          "service": "frontend",
          "checks": [
            "FR-9"
          ],
          "line": 41,
          "deleted": false
        }
      ]
    }
  ],
  "adrs": [
    {
      "num": "0001",
      "file": "docs/adr/0001-mention-notifications.md",
      "status": "принято <ДАТА>",
      "title": "Доставка уведомлений об упоминаниях через брокер"
    }
  ]
}
~~~~

### `sdd-lint next`

код 2

~~~~text
next — выбери вариант:

- `/sdd-lint next FR comments` — номер нового FR
- `/sdd-lint next NFR comments` — номер нового NFR
- `/sdd-lint next AC comments` — номер нового AC в части работы
- `/sdd-lint next slice comments` — номер новой части работы
- `/sdd-lint next adr comments` — номер нового ADR
~~~~

### `sdd-lint next FR`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint next FR comments`
~~~~

### `sdd-lint next FR comments`

код 0

~~~~text
FR-11
~~~~

### `sdd-lint next NFR`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint next NFR comments`
~~~~

### `sdd-lint next NFR comments`

код 0

~~~~text
NFR-4
~~~~

### `sdd-lint next AC`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint next AC comments`
~~~~

### `sdd-lint next AC comments`

код 2

~~~~text
next AC docs/<feature> <NNN> [B|F]
Справка: `/sdd-lint help next`
~~~~

### `sdd-lint next AC comments 001`

код 0

~~~~text
AC-001-1
~~~~

### `sdd-lint next AC comments 002`

код 0

~~~~text
AC-002-2
~~~~

### `sdd-lint next AC comments 003`

код 0

~~~~text
AC-003-2
~~~~

### `sdd-lint next slice`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint next slice comments`
~~~~

### `sdd-lint next slice comments`

код 0

~~~~text
004
~~~~

### `sdd-lint next adr`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint next adr comments`
~~~~

### `sdd-lint next adr comments`

код 0

~~~~text
0002
~~~~

### `sdd-lint ask`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint ask comments`
~~~~

### `sdd-lint ask comments`

код 0

~~~~text
**Части работы «на ревью». Что дальше?**

1. **Проверить отдельным агентом** (рекомендую) — новая сессия, результаты — в `docs/comments/_work/review/slices.md`
2. **Проверить в новой сессии** — вы запускаете команду сами
3. **Упростить формулировки частей работы** — упростить текст и проверить сохранность структуры
4. **Одобрить** — `/sdd-lint approve slices docs/comments`

⚙ sdd: вопрос «Части работы» → ["choose","docs/comments","<id>"] · варианты: 1=review-here:slices, 2=review-window:slices, 3=humanize:slices, 4=approve:slices
~~~~

### `sdd-lint choose`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint choose comments`
~~~~

### `sdd-lint choose comments`

код 2

~~~~text
Вариант не указан.

⚙ sdd: вызови ["ask","docs/comments"]
~~~~

### `sdd-lint choose comments review-here:slices`

код 0

~~~~text
Запускаю проверку частей работы отдельным агентом. Выявленные проблемы будут в таблице, затем разберём их по одной.

⚙ sdd: сабагент ["prompt","sdd-review","comments","slices"] · отчёт сабагента — человеку · затем ["ask","docs/comments"] · без сабагентов — вызови ["choose","docs/comments","review-here:slices","--fallback"]
~~~~

### `sdd-lint choose comments review-window:slices`

код 0

~~~~text
`/sdd-review comments slices`

Tip: Введите /sdd-review comments slices чтобы продолжить

⚙ sdd: стоп
~~~~

### `sdd-lint choose comments humanize:slices`

код 0

~~~~text
Упрощаю формулировки частей работы отдельным агентом, затем проверю скриптом, что ID, таблицы и тексты на месте.

⚙ sdd: сабагент ["prompt","humanize","docs/comments"] · отчёт сабагента — человеку · затем ["ask","docs/comments"] · без сабагентов — вызови ["choose","docs/comments","humanize:slices","--fallback"]
~~~~

### `sdd-lint choose comments approve:slices`

код 0

~~~~text
docs/comments/slices/README.md: Статус: одобрено <ДАТА> · <ОТПЕЧАТОК>

Части работы одобрены, ADR приняты. Следующий шаг: перед слиянием ветки убрать временные файлы (`docs/comments/brainstorming.md`): `/sdd-close comments`

Tip: Введите /sdd-close comments чтобы продолжить

⚙ sdd: вызови ["ask","docs/comments"]
~~~~

### `sdd-lint triage`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint triage comments`
~~~~

### `sdd-lint triage comments`

код 2

~~~~text
Укажите пункт проверки и решение: triage docs/<feature> <ревью>:R<n> open|ignore|П<n>|исправлено или triage docs/<feature> <ревью> remarks all|none|<номера>
Справка: `/sdd-lint help triage`
~~~~

### `sdd-lint prompt`

код 2

~~~~text
Укажи скилл. Скиллы: sdd-adr, sdd-close, sdd-decide, sdd-grill, sdd-review, sdd-slices, sdd-spec
~~~~

### `sdd-lint prompt sdd-adr`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint prompt sdd-adr comments`
~~~~

### `sdd-lint prompt sdd-adr comments`

код 0

~~~~text
# Скилл sdd-adr: comments

Человек выбрал этот шаг — выполняй скилл ниже здесь, в этом окне.
Аргументы скилла: `comments`. Lint — инструмент MCP `sdd_lint`. Нет его в списке — найди поиском инструментов; вызов не удался — вопрос из «Если sdd_lint не отвечает» в правилах планирования; скрипт для вариантов 2 и 3 — `<REPO>/skills/sdd-lint/scripts/sdd-lint.mjs`.
Файлы, на которые ссылается скилл, приложены в конце — их не открывай.

---

# sdd-adr — техническое решение до кода

Lint — инструмент MCP `sdd_lint`: `sdd_lint ["help","gen"]` — это вызов с `{"args": ["help","gen"]}`.
Не видишь `sdd_lint` — найди его поиском инструментов, пробуя разные запросы. Вызов не удался — остановись и задай вопрос из «Если sdd_lint не отвечает» в правилах планирования. Скрипт для вариантов 2 и 3 — `../sdd-lint/scripts/sdd-lint.mjs` от папки этого скилла.
Фичу из аргументов передай в gate как пришла (`comments`, `docs/comments`, `@docs/comments/`): он напечатает путь фичи, дальше подставляй его как `<f>`. Фичи нет — вызови gate без неё: скрипт возьмёт единственную подходящую или задаст вопрос. Сам не спрашивай.

Вход: фича и тема («доставка событий о передаче»). Темы нет — её предложит gate: темы, которых
ждут slices, или кандидатов от сабагента.
Выход: `docs/adr/NNNN-<slug>.md` со статусом «предложено».

ADR фиксирует решение, которое иначе агент при реализации примет молча и по-своему в каждом сервисе.
Но ADR на каждую мелочь — шум, который никто не читает. Поэтому сначала фильтр.

## Шаги

1. Ворота. `sdd_lint ["gate","adr","<фича>","<тема>"]` (фичи или темы нет — без них). Делай по строке ⚙:
   вопрос — задай его, ответ уйдёт в gate; ворота закрыты — вопрос этапа или стоп; «ворота … открыты» —
   продолжай. Дальше `<f>` — путь из части «фича …» строки ⚙.
   Готово, когда в карточке есть «Тема ADR: …».
2. Проверь три условия ADR:
   - **дорого откатить** — смена потребует миграций, переписывания сервисов или инфраструктуры;
   - **удивит без контекста** — читатель кода спросит «почему так?»;
   - **был реальный выбор** — есть хотя бы две рабочие альтернативы.
   Нет хотя бы одного — напиши, какого, и что решение пойдёт в описание PR или через
   `/sdd-decide`. Остановись.
3. Выпиши требования, которые решение обязано выполнить: FR и NFR с ID и одной фразой.
   Выпиши ограничения — что не обсуждается: решения компании, бюджет, ресурсы, сроки. Каждое —
   `ОГР-n`, что именно и кто поставил. Источник не знаешь — спроси человека, не придумывай.
4. Факты — что уже есть: инфраструктура, брокеры и хранилища, другие ADR в `docs/adr/`, запреты
   компании. Сначала `<f>/_work/context.md`; нет там: один-два файла — посмотри сам; больше —
   сабагенту, его задача целиком: «Вызови инструмент sdd_lint с args ["research","fact","<f>","<вопрос>"]
   и выполни то, что он вернёт». В окно — только его ответ; сабагентов нет — тот же вызов сам.
   Вопросы, которые не зависят друг от друга, — разным сабагентам. Чего найти нельзя — в «Не выяснено».
5. Предложи 2–3 варианта. Плюсы и минусы каждого — через ID требований и ограничений:
   «минус: при падении после коммита событие теряется — NFR-3 не выполняется»,
   «минус: нужен новый брокер — нарушает ОГР-1».
6. Задай выбор инструментом выбора: варианты из шага 5, рекомендованный — первым, с «(рекомендую)»;
   плюсы и минусы — коротким сообщением перед вопросом. Инструмента нет — вопрос `grilling`:
   «❓ Q1 — …», затем «➡️ рекомендация». Жди ответа.
7. Номер ADR — вывод `sdd_lint ["next","adr","<f>"]`. Напиши ADR по [assets/adr.md](assets/adr.md).
   В «Последствия» перечисли затронутые slices по номерам и что в них меняется, и чем платим за выбор.
   Соглашения о коде сервисов (слои, обработку событий, модули) в ADR не пиши — их место в
   репозитории сервиса.
   Если решение меняет поведение для пользователя, это вопрос к Dev Spec: предложи `/sdd-decide`.
8. Конец этапа. `sdd_lint ["done","<f>"]` и делай, что он скажет. Готово, когда done вернул вопрос
   этапа (ревью ADR, humanizer, «принято»): задай его, как сказано в выводе, и остановись.

Условия из шага 2 взяты из скилла `domain-modeling` Matt Pocock (MIT).

---

Файл скилла assets/adr.md:

# ADR-NNNN: <Решение одной фразой>

Статус: предложено

Фича: [<фича>](../<feature>/spec.md)

Затрагивает slices: NNN, NNN

## Контекст
Какие требования решение обязано выполнить (FR-…, NFR-…) и в чём проблема.

Ограничения — то, что в этом решении не обсуждается (нет — убери абзац):
- ОГР-1 <решение компании, бюджет, ресурсы, сроки> (<кто или что его поставило>)

## Варианты

### A. <Название>
- плюс: …
- минус: … (не выполняет NFR-… | нарушает ОГР-…)

Отклонён | Выбран | Отложен: причина — требование или ограничение.

### B. <Название>
…

## Решение
Что выбрано и почему — через требования и ограничения.
Соглашений о коде сервисов (слои, обработка событий, модули) здесь нет: они живут в репозитории сервиса.
Компоненты и контракты — по имени, без путей к файлам и вызовов.

## Последствия
- Slice NNN: что меняется.
- Чем платим: что становится хуже для пользователя или команды. Меняет поведение — через /sdd-decide.

## Не выяснено
- Вопрос — блокирует ли он slices и какие.
~~~~

### `sdd-lint prompt sdd-close`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint prompt sdd-close comments`
~~~~

### `sdd-lint prompt sdd-close comments`

код 0

~~~~text
# Скилл sdd-close: comments

Человек выбрал этот шаг — выполняй скилл ниже здесь, в этом окне.
Аргументы скилла: `comments`. Lint — инструмент MCP `sdd_lint`. Нет его в списке — найди поиском инструментов; вызов не удался — вопрос из «Если sdd_lint не отвечает» в правилах планирования; скрипт для вариантов 2 и 3 — `<REPO>/skills/sdd-lint/scripts/sdd-lint.mjs`.

---

# sdd-close — закрыть фичу перед merge

Lint — инструмент MCP `sdd_lint`: `sdd_lint ["help","gen"]` — это вызов с `{"args": ["help","gen"]}`.
Не видишь `sdd_lint` — найди его поиском инструментов, пробуя разные запросы. Вызов не удался — остановись и задай вопрос из «Если sdd_lint не отвечает» в правилах планирования. Скрипт для вариантов 2 и 3 — `../sdd-lint/scripts/sdd-lint.mjs` от папки этого скилла.

Вход: фича — slug (`comments`), путь (`docs/comments`) или `@docs/comments/`; передай скрипту как пришла.
Фичи нет — вызови close без неё: скрипт возьмёт единственную с временными артефактами или задаст вопрос.
Выход: в `docs/<feature>/` остаются spec.md и slices/, в `docs/adr/` — ADR. Удалены
`brainstorming.md` и `_work/`; в spec нет ссылок на протокол.

Команда человека — первое подтверждение, вопрос скрипта — второе. Что удалится и какие последствия
(незакоммиченное, блокеры ревью без решения, неодобренные spec и slices, ошибки lint), считает скрипт.
Сам файлы не удаляй, ссылки не правь, `--yes` не добавляй.

## Шаги

1. `sdd_lint ["close","<фича>","--json"]` (фичи нет — `sdd_lint ["close","--json"]`; вопрос в выводе —
   задай его и передай ответ, как сказано).
   - «Временных артефактов нет» — человек это видит; остановись.
2. Что удалится и последствия — в карточке, человек их видит: не пересказывай. Задай вопрос по строке ⚙.
   Вариант за человека не выбирай.
3. Ответ — `sdd_lint ["choose","<фича>","<id>"]`; что удалено, человек видит в его карточке.
4. Остановись.
~~~~

### `sdd-lint prompt sdd-decide`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint prompt sdd-decide comments`
~~~~

### `sdd-lint prompt sdd-decide comments`

код 0

~~~~text
# Скилл sdd-decide: comments

Человек выбрал этот шаг — выполняй скилл ниже здесь, в этом окне.
Аргументы скилла: `comments`. Lint — инструмент MCP `sdd_lint`. Нет его в списке — найди поиском инструментов; вызов не удался — вопрос из «Если sdd_lint не отвечает» в правилах планирования; скрипт для вариантов 2 и 3 — `<REPO>/skills/sdd-lint/scripts/sdd-lint.mjs`.

---

# sdd-decide — решение сверху вниз

Lint — инструмент MCP `sdd_lint`: `sdd_lint ["help","gen"]` — это вызов с `{"args": ["help","gen"]}`.
Не видишь `sdd_lint` — найди его поиском инструментов, пробуя разные запросы. Вызов не удался — остановись и задай вопрос из «Если sdd_lint не отвечает» в правилах планирования. Скрипт для вариантов 2 и 3 — `../sdd-lint/scripts/sdd-lint.mjs` от папки этого скилла.
Фичу из аргументов передай в gate как пришла (`comments`, `docs/comments`, `@docs/comments/`): он напечатает путь фичи, дальше подставляй его как `<f>`. Фичи нет — вызови gate без неё: скрипт возьмёт единственную подходящую или задаст вопрос. Сам не спрашивай.

Вход: вопрос, решение человека (дословно) и источник: «ревью slices», «реализация, tasks-core 003».
Вместо вопроса может быть номер находки ревью — `R2` или `spec:R2` (ревью и номер): вопрос — её «Что не так»,
источник — «ревью <режим> R2». Ответ «да» значит «принять её „Предложение“».
Выход: обновлённые протокол (пока он есть), spec.md и slices; список изменений в ответе.

Решение, записанное сразу в AC или в коде, расходится со спекой: через месяц никто не знает,
какой документ прав. Поэтому решение всегда спускается сверху: протокол → FR → AC.

## Шаги

1. Ворота. `sdd_lint ["gate","decide","<фича>","<вопрос или R-номер>"]` (фичи нет — без неё). Делай по строке ⚙:
   вопрос — задай его, ответ уйдёт в gate; ворота закрыты — вопрос этапа или стоп; «ворота … открыты» —
   продолжай. Дальше `<f>` — путь из части «фича …» строки ⚙.
2. Пришёл номер находки — её нашёл gate: «Где», «Что не так», «Предложение» и что на неё завязано
   (FR, AC с файлом и строкой). Находки нет или их несколько — gate задал вопрос; ответ передай в gate.
   Решение «да» раскрой текстом «Предложения».
3. Есть `<f>/brainstorming.md` — допиши строку в раздел «Решения после brainstorming»:
   `П<n>` (следующий номер), когда, вопрос, решение. Старые строки протокола не меняй.
   Протокола нет — фича закрыта (`/sdd-close`): шаг пропусти. Решение живёт в самих FR и AC,
   история — в git; пометок «изменено», дат и источников в документы не пиши.
4. Найди затронутые FR в `spec.md`: по ID из вопроса или по ключевым словам.
   - решение уточняет правило — поправь FR и добавь пример с этим решением;
   - решение вводит новое правило — новый FR, вместо номера `FR-?`;
   - решение закрывает открытый вопрос spec — убери его оттуда.
   Есть протокол — под блоком каждого затронутого FR допиши `П<n>` в «Из протокола:», у нового FR
   заведи эту строку.
   Есть новый FR — `sdd_lint ["fix","<f>"]`: он поставит номер, на который сошлются AC.
   Технический выбор без изменения поведения не трогает spec — предложи `/sdd-adr` и переходи к шагу 6.
5. Что держится на FR — `sdd_lint ["trace","<f>","FR-n"]` (можно несколько ID): строки протокола,
   slices из «Основание» и AC с файлом и строкой. Сам по файлам не ищи. В каждом slice из вывода:
   - поправь AC или добавь новый — `AC-NNN-?` (`B?`, `F?`) вместо номера, под блоком — «Проверяет: FR-n»;
   - убери закрытый вопрос из «Открытые вопросы к Dev Spec».
   Новый FR без slice — добавь его в «Основание» подходящего slice.
6. Источник — находка ревью и файл ревью есть: `sdd_lint ["triage","<f>","<ревью>:R<n>","П<n>"]` (без протокола —
   `"исправлено"` вместо `П<n>`); `<ревью>` — из строки «Находка … — ревью <ревью>» gate. Таблицу ревью сам не правь.
7. Конец этапа. `sdd_lint ["done","<f>"]`: номера, ссылки и README поставит он; одобренному
   документу, который ты поменял, сам вернёт «на ревью» — одобрение давалось другой версии; в git
   сверит, что протокол только дописан и ID на месте. Делай, что он скажет.
8. Когда done вернул вопрос этапа: выведи список изменений (файл → ID → что изменилось) и какие
   статусы done вернул в «на ревью», затем задай вопрос, как сказано в выводе, и остановись.
~~~~

### `sdd-lint prompt sdd-grill`

код 0

~~~~text
# Скилл sdd-grill:

Человек выбрал этот шаг — выполняй скилл ниже здесь, в этом окне.
Аргументы скилла: ``. Lint — инструмент MCP `sdd_lint`. Нет его в списке — найди поиском инструментов; вызов не удался — вопрос из «Если sdd_lint не отвечает» в правилах планирования; скрипт для вариантов 2 и 3 — `<REPO>/skills/sdd-lint/scripts/sdd-lint.mjs`.
Файлы, на которые ссылается скилл, приложены в конце — их не открывай.

---

# sdd-grill — brainstorming фичи

Lint — инструмент MCP `sdd_lint`: `sdd_lint ["help","gen"]` — это вызов с `{"args": ["help","gen"]}`.
Не видишь `sdd_lint` — найди его поиском инструментов, пробуя разные запросы. Вызов не удался — остановись и задай вопрос из «Если sdd_lint не отвечает» в правилах планирования. Скрипт для вариантов 2 и 3 — `../sdd-lint/scripts/sdd-lint.mjs` от папки этого скилла.

Вход: всё, что человек написал после `/sdd-grill`, — задача словами, `@файл` с задачей, имя начатой
фичи или ничего. Что спросить и что сделать, решает `start`: человек может не знать процесса.
Выход: `docs/<feature>/brainstorming.md` — протокол: вопрос, рекомендация агента, решение человека.

Протокол — единственный вход для Dev Spec. Решение, которого нет в протоколе, позже придумает
агент на этапе spec или кода, и ошибка всплывёт в проде. Поэтому каждую ветку доводим до решения
человека или до явного «вне scope».

## Шаги

1. Старт. `sdd_lint ["start","<всё после /sdd-grill одной строкой, как пришло>"]`; ничего не пришло —
   `sdd_lint ["start"]`. Вывод — один следующий шаг: спросить человека, задать вопрос с вариантами,
   запустить сабагента, вызвать `start` снова — по строке ⚙. Делай ровно его; ответ человека передавай дословно,
   не пересказывая. Задачу, имя папки и источники сам не выясняй и не придумывай вопросы — их даёт `start`.
   Готово, когда в строке ⚙ есть «старт готов». Дальше `<f>` — путь из части «фича …» строки ⚙.
2. Загрузи скилл `grilling` инструментом Skill.
   Готово, когда текст `grilling` в контексте. Он входит в sdd-planner; если его нет — напиши
   «Не найден скилл grilling: переустановите расширение sdd-planner» и остановись.
3. Прочитай `<f>/brainstorming.md` и контекст, если строка ⚙ его назвала (`<f>/_work/context.md`).
   Факты из контекста известны: у человека их не спрашивай, опирайся на них в вопросах и рекомендациях.
   «Уже решено в задаче» допиши в «Решения», как сказал `start`. Протокол не пуст — продолжи с веток без решения.
4. Построй design tree. Стартовые узлы — темы из [references/questions.md](references/questions.md):
   ветки «Продукт и UI» и «Сервер» всегда, «Стыки сервисов» — когда сервисов больше одного.
5. Веди раунды по `grilling`. Пиши по-русски. Каждый вопрос показывает ситуацию на конкретных
   людях и данных: «Анна нажала „Передать“ дважды — что она видит?». Так человек отвечает
   про поведение, а не про реализацию.
   Есть инструмент выбора — frontier раунда задавай им, а не текстом по формату `grilling`:
   блок до 4 вопросов, остальные — следующим блоком после ответа. Вопрос — «Q<n>: суть»
   с ситуацией в одну-две фразы; варианты 2–4, рекомендованный — первым, с «(рекомендую)».
   Нумерация Q сквозная между блоками. Инструмента нет — формат `grilling`.
   Нужен факт, которого нет в контексте: хватит одного-двух файлов — посмотри сам; больше —
   сабагенту, его задача целиком: «Вызови инструмент sdd_lint с args ["research","fact","<f>","<вопрос>"]
   и выполни то, что он вернёт». В это окно — только его строка с ответом. Сабагентов нет — тот же вызов сам.
   Вопросы, которые ждут факта, — в следующий блок; остальные задавай сейчас.
6. После ответов на блок (без инструмента — на раунд) допиши строки в таблицу «Решения»: номер,
   ветка, вопрос, рекомендация, ответ человека дословно. Принял рекомендацию словом «да» или выбрал
   вариант «(рекомендую)» — пиши «да». Выбрал другой вариант — его текст; свой ответ — дословно.
7. Frontier пуст → сверь с `references/questions.md`: каждая тема нужных веток решена или стоит
   «вне scope». Пропущенные темы — следующим раундом.
8. Спроси: «Понимание общее? Если да — протокол готов для Dev Spec.»
   Готово, когда человек ответил «да».
9. Поставь «Статус: готов» и запусти `sdd_lint ["fix","<f>"]`.
10. Конец этапа. `sdd_lint ["done","<f>"]` и делай, что он скажет. Готово, когда done
    вернул вопрос этапа: задай его, как сказано в выводе, и остановись.

Технические решения (брокер, хранилище, протокол доставки) записывай в протокол как требования
к поведению: «брокер недоступен → передача проходит, события доходят позже». Выбор технологии
делает `/sdd-adr` после slices.

Человек вернулся в новом окне — `/sdd-grill <feature>`: `start` скажет, где остановились; история чата
не нужна, всё в протоколе и контексте.

---

Файл скилла references/questions.md:

# Стартовые темы для design tree

Темы — узлы, с которых растёт дерево, а не анкета. Задавай их как ситуации на людях и данных.
Тема закрыта, когда в протоколе есть решение или «вне scope».

## Продукт и UI
- Цель: что пользователь не может сделать сейчас и чем это мешает.
- Кто может: роли и права; что видит тот, кому нельзя.
- Над чем: объекты, статусы, в которых действие доступно и недоступно.
- Кому и с кем: получатель, участники, согласие второй стороны.
- Что видят остальные после действия: списки, карточки, доступ.
- Ввод: обязательные поля, пределы длины и значений, пробелы, пустые значения.
- Где в UI и как выглядит результат: экран, тексты сообщений дословно.
- Отклик: ждать сервер или показывать сразу; повторное нажатие.
- Несохранённое: правки в текущей вкладке, в других вкладках и на других устройствах.
- Уведомления: кому, каким каналом, что с теми, кто офлайн.
- Массовые действия, история, отмена действия.

## Сервер
- Источник данных о людях и ролях; что, если он недоступен.
- Повтор запроса: тот же результат или отказ.
- Гонки: два одновременных действия над одним объектом.
- Отказы: полный список с текстами для пользователя.
- Лимиты и NFR: время ответа (p95) и объём данных, на котором оно гарантировано.
- Поиск и списки: что ищем, с какого символа, сколько показываем, порядок, регистр.
- Аудит и персональные данные: что пишем, кто видит.

## Стыки сервисов (если сервисов больше одного)
- Связь: синхронно или асинхронно; кто владелец события.
- Сбой второй стороны: действие проходит или откатывается; что потом.
- Порядок: важна ли очерёдность событий по одному объекту.
- Дубли: что, если событие придёт дважды.
- Задержка: сколько можно ждать появления результата у другой стороны.
- Офлайн-получатель: досылать пропущенное или показать актуальное при входе.
~~~~

### `sdd-lint prompt sdd-grill comments`

код 0

~~~~text
# Скилл sdd-grill: comments

Человек выбрал этот шаг — выполняй скилл ниже здесь, в этом окне.
Аргументы скилла: `comments`. Lint — инструмент MCP `sdd_lint`. Нет его в списке — найди поиском инструментов; вызов не удался — вопрос из «Если sdd_lint не отвечает» в правилах планирования; скрипт для вариантов 2 и 3 — `<REPO>/skills/sdd-lint/scripts/sdd-lint.mjs`.
Файлы, на которые ссылается скилл, приложены в конце — их не открывай.

---

# sdd-grill — brainstorming фичи

Lint — инструмент MCP `sdd_lint`: `sdd_lint ["help","gen"]` — это вызов с `{"args": ["help","gen"]}`.
Не видишь `sdd_lint` — найди его поиском инструментов, пробуя разные запросы. Вызов не удался — остановись и задай вопрос из «Если sdd_lint не отвечает» в правилах планирования. Скрипт для вариантов 2 и 3 — `../sdd-lint/scripts/sdd-lint.mjs` от папки этого скилла.

Вход: всё, что человек написал после `/sdd-grill`, — задача словами, `@файл` с задачей, имя начатой
фичи или ничего. Что спросить и что сделать, решает `start`: человек может не знать процесса.
Выход: `docs/<feature>/brainstorming.md` — протокол: вопрос, рекомендация агента, решение человека.

Протокол — единственный вход для Dev Spec. Решение, которого нет в протоколе, позже придумает
агент на этапе spec или кода, и ошибка всплывёт в проде. Поэтому каждую ветку доводим до решения
человека или до явного «вне scope».

## Шаги

1. Старт. `sdd_lint ["start","<всё после /sdd-grill одной строкой, как пришло>"]`; ничего не пришло —
   `sdd_lint ["start"]`. Вывод — один следующий шаг: спросить человека, задать вопрос с вариантами,
   запустить сабагента, вызвать `start` снова — по строке ⚙. Делай ровно его; ответ человека передавай дословно,
   не пересказывая. Задачу, имя папки и источники сам не выясняй и не придумывай вопросы — их даёт `start`.
   Готово, когда в строке ⚙ есть «старт готов». Дальше `<f>` — путь из части «фича …» строки ⚙.
2. Загрузи скилл `grilling` инструментом Skill.
   Готово, когда текст `grilling` в контексте. Он входит в sdd-planner; если его нет — напиши
   «Не найден скилл grilling: переустановите расширение sdd-planner» и остановись.
3. Прочитай `<f>/brainstorming.md` и контекст, если строка ⚙ его назвала (`<f>/_work/context.md`).
   Факты из контекста известны: у человека их не спрашивай, опирайся на них в вопросах и рекомендациях.
   «Уже решено в задаче» допиши в «Решения», как сказал `start`. Протокол не пуст — продолжи с веток без решения.
4. Построй design tree. Стартовые узлы — темы из [references/questions.md](references/questions.md):
   ветки «Продукт и UI» и «Сервер» всегда, «Стыки сервисов» — когда сервисов больше одного.
5. Веди раунды по `grilling`. Пиши по-русски. Каждый вопрос показывает ситуацию на конкретных
   людях и данных: «Анна нажала „Передать“ дважды — что она видит?». Так человек отвечает
   про поведение, а не про реализацию.
   Есть инструмент выбора — frontier раунда задавай им, а не текстом по формату `grilling`:
   блок до 4 вопросов, остальные — следующим блоком после ответа. Вопрос — «Q<n>: суть»
   с ситуацией в одну-две фразы; варианты 2–4, рекомендованный — первым, с «(рекомендую)».
   Нумерация Q сквозная между блоками. Инструмента нет — формат `grilling`.
   Нужен факт, которого нет в контексте: хватит одного-двух файлов — посмотри сам; больше —
   сабагенту, его задача целиком: «Вызови инструмент sdd_lint с args ["research","fact","<f>","<вопрос>"]
   и выполни то, что он вернёт». В это окно — только его строка с ответом. Сабагентов нет — тот же вызов сам.
   Вопросы, которые ждут факта, — в следующий блок; остальные задавай сейчас.
6. После ответов на блок (без инструмента — на раунд) допиши строки в таблицу «Решения»: номер,
   ветка, вопрос, рекомендация, ответ человека дословно. Принял рекомендацию словом «да» или выбрал
   вариант «(рекомендую)» — пиши «да». Выбрал другой вариант — его текст; свой ответ — дословно.
7. Frontier пуст → сверь с `references/questions.md`: каждая тема нужных веток решена или стоит
   «вне scope». Пропущенные темы — следующим раундом.
8. Спроси: «Понимание общее? Если да — протокол готов для Dev Spec.»
   Готово, когда человек ответил «да».
9. Поставь «Статус: готов» и запусти `sdd_lint ["fix","<f>"]`.
10. Конец этапа. `sdd_lint ["done","<f>"]` и делай, что он скажет. Готово, когда done
    вернул вопрос этапа: задай его, как сказано в выводе, и остановись.

Технические решения (брокер, хранилище, протокол доставки) записывай в протокол как требования
к поведению: «брокер недоступен → передача проходит, события доходят позже». Выбор технологии
делает `/sdd-adr` после slices.

Человек вернулся в новом окне — `/sdd-grill <feature>`: `start` скажет, где остановились; история чата
не нужна, всё в протоколе и контексте.

---

Файл скилла references/questions.md:

# Стартовые темы для design tree

Темы — узлы, с которых растёт дерево, а не анкета. Задавай их как ситуации на людях и данных.
Тема закрыта, когда в протоколе есть решение или «вне scope».

## Продукт и UI
- Цель: что пользователь не может сделать сейчас и чем это мешает.
- Кто может: роли и права; что видит тот, кому нельзя.
- Над чем: объекты, статусы, в которых действие доступно и недоступно.
- Кому и с кем: получатель, участники, согласие второй стороны.
- Что видят остальные после действия: списки, карточки, доступ.
- Ввод: обязательные поля, пределы длины и значений, пробелы, пустые значения.
- Где в UI и как выглядит результат: экран, тексты сообщений дословно.
- Отклик: ждать сервер или показывать сразу; повторное нажатие.
- Несохранённое: правки в текущей вкладке, в других вкладках и на других устройствах.
- Уведомления: кому, каким каналом, что с теми, кто офлайн.
- Массовые действия, история, отмена действия.

## Сервер
- Источник данных о людях и ролях; что, если он недоступен.
- Повтор запроса: тот же результат или отказ.
- Гонки: два одновременных действия над одним объектом.
- Отказы: полный список с текстами для пользователя.
- Лимиты и NFR: время ответа (p95) и объём данных, на котором оно гарантировано.
- Поиск и списки: что ищем, с какого символа, сколько показываем, порядок, регистр.
- Аудит и персональные данные: что пишем, кто видит.

## Стыки сервисов (если сервисов больше одного)
- Связь: синхронно или асинхронно; кто владелец события.
- Сбой второй стороны: действие проходит или откатывается; что потом.
- Порядок: важна ли очерёдность событий по одному объекту.
- Дубли: что, если событие придёт дважды.
- Задержка: сколько можно ждать появления результата у другой стороны.
- Офлайн-получатель: досылать пропущенное или показать актуальное при входе.
~~~~

### `sdd-lint prompt sdd-review`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint prompt sdd-review comments`
~~~~

### `sdd-lint prompt sdd-review comments`

код 2

~~~~text
Режим ревью: /sdd-lint prompt sdd-review comments spec, /sdd-lint prompt sdd-review comments slices, /sdd-lint prompt sdd-review comments adr
~~~~

### `sdd-lint prompt sdd-slices`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint prompt sdd-slices comments`
~~~~

### `sdd-lint prompt sdd-slices comments`

код 0

~~~~text
# Скилл sdd-slices: comments

Человек выбрал этот шаг — выполняй скилл ниже здесь, в этом окне.
Аргументы скилла: `comments`. Lint — инструмент MCP `sdd_lint`. Нет его в списке — найди поиском инструментов; вызов не удался — вопрос из «Если sdd_lint не отвечает» в правилах планирования; скрипт для вариантов 2 и 3 — `<REPO>/skills/sdd-lint/scripts/sdd-lint.mjs`.
Файлы, на которые ссылается скилл, приложены в конце — их не открывай.

---

# sdd-slices — нарезка Dev Spec

Lint — инструмент MCP `sdd_lint`: `sdd_lint ["help","gen"]` — это вызов с `{"args": ["help","gen"]}`.
Не видишь `sdd_lint` — найди его поиском инструментов, пробуя разные запросы. Вызов не удался — остановись и задай вопрос из «Если sdd_lint не отвечает» в правилах планирования. Скрипт для вариантов 2 и 3 — `../sdd-lint/scripts/sdd-lint.mjs` от папки этого скилла.

Вход: одобренный `spec.md` фичи. Выход: `slices/NNN-*.md` и `slices/README.md` со статусом «на ревью».

Slice — единица приёмки: его вливают и проверяют целиком. Режь крупно, отдельный slice — только по причине.

## Как резать

Начни с минимума:
- **001 «Контракты»**, если фича вводит или меняет контракты между двумя и более сервисами.
  В «Половины» 001 — все, кто отдаёт или потребляет новый контракт, включая потребителей событий;
- **один slice на результат, который видит пользователь**: «исполнитель передаёт задачу»,
  а не «валидация», «отказы», «доступ» по отдельности. Результат — возможность, которую продукт
  называет одной фразой («комментарии в задаче»). Варианты одного действия (создать, изменить,
  удалить), его отказы и права — внутри этого slice, пока их не отделит Р2.

Сервисы не режут slice: у slice бывает несколько половин, по одной на сервис, каждая со своим PR.

Отдели часть, только если есть причина:
- **Р1** часть ждёт ADR или инфраструктуру, а остальное может идти без неё: «Р1 — ждёт ADR-0001».
  ADR ещё нет — «Р1 — ADR: <тема>», вопрос этапа предложит его написать;
- **Р2** у половины выходит больше 10 AC — режь по наблюдаемому результату, а не по слою;
- **Р3** человек хочет выпустить часть раньше остальной фичи.

Склей slices, если верно хоть одно:
- **С1** без соседа нарушается безопасность или целостность: проходит запрещённое действие,
  остаётся лишний доступ, портятся данные;
- **С2** результат slice нельзя проверить на собранном приложении без соседа;
- **С3** slice состоит только из отказов, краевых случаев или NFR к чужому успешному пути;
- **С4** два slice меняют один экран или один обработчик ради одного FR.

С1 сильнее Р2: то, что нельзя выкатить по отдельности, остаётся вместе, даже если slice большой.
Ориентир — 3–6 slices вместе с 001. Как эти правила превращают 9 slices в 5 на реальной фиче —
[references/calibration.md](references/calibration.md).

## Шаги

1. Ворота. `sdd_lint ["gate","slices","<фича>"]` (фичи нет — без неё). Делай по строке ⚙:
   вопрос — задай его, ответ уйдёт в gate; ворота закрыты — вопрос этапа или стоп; «ворота … открыты» —
   продолжай. Дальше `<f>` — путь из части «фича …» строки ⚙.
   Открыты — в карточке требования, сервисы и ADR, в строке ⚙ — с какого шага продолжать.
2. План. Прочитай `<f>/spec.md`, ADR из вывода и `<f>/_work/context.md`, если он есть: факты
   о сервисах и контрактах в нём проверены скриптом, у человека их не спрашивай. Нарежь по
   «Как резать» и запиши план в `<f>/_work/plan.md` по [assets/plan.md](assets/plan.md). Запусти `sdd_lint ["plan","<f>"]`
   и делай, что он скажет. Готово, когда plan ответил «План нарезки без ошибок».
3. Согласие. `sdd_lint ["ask","<f>"]`: план и вопрос уже в карточке — задай вопрос по строке ⚙.
   Человек просит поправить — поправь plan.md и вернись к проверке из шага 2.
   Файлы slices создаёт вариант «Да», не ты.
4. Заполни заготовки `<…>` в созданных файлах `<f>/slices/`:
   - `AC-NNN-?` — общая приёмка на собранном приложении, `AC-NNN-B?` — сервис своей половины,
     `AC-NNN-F?` — фронтенд. Нужно больше AC — скопируй блок; номер не ставь, его поставит скрипт;
   - «Проверяет: FR-n, …» под блоком — требования из «Основание», которые AC проверяет;
   - персонажи, данные и тексты сообщений — из Dev Spec, дословно;
   - AC — то, что видно на границе своей половины: экран или ответ по контракту. Как это
     проверить (моки, стенды), в AC не пишут;
   - «Контракты» — внешний контракт по смыслу и владельцу: «tasks-core: событие об упоминании —
     не меняется». Без путей, файлов, классов и вызовов: после переименования они солгут.
     Есть ли контракт и какие у него поля — факт. Сначала `<f>/_work/context.md`; нет там:
     один-два файла — посмотри сам; больше — сабагенту, его задача целиком: «Вызови инструмент
     sdd_lint с args ["research","fact","<f>","<вопрос>"] и выполни то, что он вернёт». В окно —
     только его ответ со ссылками; сабагентов нет — тот же вызов сам. Не нашлось — в «Открытые
     вопросы к Dev Spec»;
   - в `slices/README.md` — «Пересечения» и «Проверка фичи».
   Чего spec не решает — в «Открытые вопросы к Dev Spec» этого slice, ответ не придумывай.
   Slice опирается на техническое решение без ADR и не отделён по Р1 — скажи человеку:
   «нужен ADR: /sdd-adr <фича> "<тема>"».
5. Конец этапа. `sdd_lint ["done","<f>"]` — номера, ссылки, README и проверки делает он.
   Делай, что он скажет. Готово, когда done вернул вопрос этапа: задай его, как сказано в выводе,
   и остановись.

---

Файл скилла references/calibration.md:

# Калибровка: «Передача задачи» — 9 slices → 5

Фича из [sdd-workflow-demo2](https://github.com/KrtNinja/sdd-workflow-demo2): исполнитель передаёт
задачу другому участнику проекта. Сервисы: frontend, tasks-core, audit, socket-service.
Первая нарезка дала 9 slices. По правилам «Как резать» остаётся 5.

| Было | Стало | Правило |
|---|---|---|
| 001 Контракты | 001 Контракты | контракты между четырьмя сервисами |
| 002 Поиск получателя | 002 Поиск получателя | Р2: у поиска своих правил на ~10 AC (подстрока, регистр, порядок, 20 подсказок, пауза 200 мс, ошибка) |
| 003 Передача задачи | 003 Передача задачи | первый поведенческий результат |
| 004 Отказы передачи | → в 003 | С1: без проверок получателя сервер примет передачу заблокированному или чужому; С3: только отказы к успешному пути 003 |
| 005 Доступ после передачи | → в 003 | С1: без него прежний исполнитель сохраняет доступ к задаче |
| 006 Аудит | 004 Аудит | Р1: ждёт ADR-0001 (outbox), передача без аудита безопасна |
| 007 Передача видна без перезагрузки | 005 Realtime | Р1: ждёт ADR-0001 |
| 008 Карточка закрывается | → в 005 | С2: реакция на сообщение сокета не проверяется без 007; С4: тот же экран карточки ради FR-9 |
| 009 Порядок быстрых передач | → журнал в 004, клиент в 005 | С3: порядок — краевой случай доставки аудита и realtime |

Что видно на примере:
- Отказы, доступ и успешный путь одного действия — один slice. Его половины всё равно делят
  сервисы, так что PR не раздувается на всю фичу.
- Отдельными остаются части с внешней причиной: ADR, инфраструктура, размер.
- Технический инвариант (порядок, идемпотентность) не получает своего slice, а становится
  AC в тех slices, где он наблюдается.

---

Файл скилла assets/plan.md:

# План нарезки — <Фича>

<!-- Временный артефакт этапа slices. Раздел — один slice: «## NNN-slug — Название», slug латиницей станет именем файла.
     Проверка — sdd-lint plan, файлы по плану создаёт sdd-lint gen slices (вариант «Да» в вопросе о нарезке),
     после этого план удаляется. -->

## 001-contracts — Контракты
Основание: контракты для всех FR и NFR
Зависимости: нет
Половины: tasks-core + notify-service + frontend
Результат: контракты лежат у владельцев, стороны работают независимо
Почему отдельно: —

## 002-<slug> — <результат одной фразой>
Основание: FR-1, FR-2, FR-3, NFR-1
Зависимости: 001
Половины: tasks-core + frontend
Результат: <что заработает для пользователя>
Почему отдельно: —

## 003-<slug> — <результат одной фразой>
Основание: FR-4, FR-5, NFR-2
Зависимости: 001, 002
Половины: tasks-core + notify-service + frontend
Результат: <что заработает для пользователя>
Почему отдельно: Р1 — ADR: <тема решения, которого ещё нет>
~~~~

### `sdd-lint prompt sdd-spec`

код 2

~~~~text
Укажи фичу. Фичи в `docs/`:

- `/sdd-lint prompt sdd-spec comments`
~~~~

### `sdd-lint prompt sdd-spec comments`

код 0

~~~~text
# Скилл sdd-spec: comments

Человек выбрал этот шаг — выполняй скилл ниже здесь, в этом окне.
Аргументы скилла: `comments`. Lint — инструмент MCP `sdd_lint`. Нет его в списке — найди поиском инструментов; вызов не удался — вопрос из «Если sdd_lint не отвечает» в правилах планирования; скрипт для вариантов 2 и 3 — `<REPO>/skills/sdd-lint/scripts/sdd-lint.mjs`.
Файлы, на которые ссылается скилл, приложены в конце — их не открывай.

---

# sdd-spec — Dev Spec из протокола

Lint — инструмент MCP `sdd_lint`: `sdd_lint ["help","gen"]` — это вызов с `{"args": ["help","gen"]}`.
Не видишь `sdd_lint` — найди его поиском инструментов, пробуя разные запросы. Вызов не удался — остановись и задай вопрос из «Если sdd_lint не отвечает» в правилах планирования. Скрипт для вариантов 2 и 3 — `../sdd-lint/scripts/sdd-lint.mjs` от папки этого скилла.
Фичу из аргументов передай в gate как пришла (`comments`, `docs/comments`, `@docs/comments/`): он напечатает путь фичи, дальше подставляй его как `<f>`. Фичи нет — вызови gate без неё: скрипт возьмёт единственную подходящую или задаст вопрос. Сам не спрашивай.

Вход: `docs/<feature>/brainstorming.md` со статусом «готов».
Выход: `docs/<feature>/spec.md` со статусом «на ревью»; у каждого требования — «Из протокола:» со ссылками на строки протокола.

Dev Spec — постоянный источник правды о поведении: по нему режут slices, пишут AC и тесты.
Поэтому в нём только то, что решил человек, и только словами пользователя. Технологии меняются,
поведение остаётся — им место в ADR и контрактах.

Структуру проверяет скрипт: трассировку, «Пример:», персонажей, числа, пары границ, стоп-слова.
Твоя работа — перевести решения человека в правила, ничего не добавив от себя.

## Шаги

1. Ворота. `sdd_lint ["gate","spec","<фича>"]` (фичи нет — без неё). Делай по строке ⚙:
   вопрос — задай его, ответ уйдёт в gate; ворота закрыты — вопрос этапа или стоп; «ворота … открыты» —
   продолжай. Дальше `<f>` — путь из части «фича …» строки ⚙.
2. Прочитай `<f>/brainstorming.md` целиком, включая «Вне scope» и «Решения после brainstorming».
   Фактов о проекте здесь не ищи и сабагентов за ними не запускай: Dev Spec — только решения
   протокола, а чего в нём нет — открытый вопрос (шаг 5).
3. Раздели строки протокола: каждая → `FR-n`, `NFR-n`, «вне scope», «открытый вопрос»
   или «не про поведение: причина». Источник — колонка «Решение». Рекомендация агента не решение:
   её числа и варианты в FR не попадают, даже в примеры. Решение «уточнит продукт» → открытый вопрос.
4. Подбери персонажей и данные для примеров. На каждое правило «можно / нельзя» нужен персонаж
   для обоих исходов: Анна-исполнитель и Вера-не-исполнитель, активный и заблокированный.
   Обычно хватает 4–7 персонажей и 2–4 объектов.
5. Напиши `<f>/spec.md` по [assets/spec.md](assets/spec.md):
   - одно правило — один FR; сначала правило, затем «Пример:» с конкретным исходом;
     номер не считай: `FR-?` / `NFR-?` — номера по порядку поставит скрипт;
   - тексты сообщений — дословно в «ёлочках»;
   - код не упоминай: ни путей и файлов, ни классов и методов; ссылки — только на доки;
   - граничные значения — парой «проходит / не проходит» (2048 и 2049 символов);
   - техническое решение протокола переводи в то, что видит пользователь: «UTF-8 с BOM» →
     «кириллица открывается в Excel без настройки», «очередь и S3» → «ссылка на файл приходит
     в колокольчик»;
   - NFR — с числом и условием из протокола: «p95 ≤ 300 мс в проекте до 500 участников»;
   - «Вне scope» — всё, что протокол отложил, и всё, что агент мог бы додумать сам;
   - чего нет в протоколе, но нужно для правила, — в «Открытые вопросы»; ответ даст человек через `/sdd-decide`;
   - разбор из шага 3 — строкой «Из протокола: 4, П1» сразу под блоком кода каждого FR/NFR;
     строки «вне scope», «открытый вопрос» — хвостом «(из протокола: 5)» у пункта раздела;
     «не про поведение» — пунктом в разделе «Не про поведение» с причиной и тем же хвостом.
     Пиши номера, не ссылки: ссылки на строку протокола ставит скрипт.
6. Конец этапа. `sdd_lint ["done","<f>"]` — номера, ссылки на протокол, статус «на ревью»
   и проверки делает он. Делай, что он скажет. Готово, когда done вернул вопрос этапа (ревью,
   humanizer, одобрение): задай его, как сказано в выводе, и остановись.

## Пример FR

```
FR-3  Причина передачи обязательна, не длиннее 2048 символов. Пустая причина,
      причина из одних пробелов или длиннее 2048 символов не принимается.
      Пример: Анна выбрала Бориса, причину не заполнила → передать нельзя.
      Причина из 2048 символов принимается, из 2049 — нет.
```
Из протокола: 3, П2

---

Файл скилла assets/spec.md:

# <Фича> — Dev Spec

Статус: черновик

Протокол: [brainstorming.md](brainstorming.md)

## Цель

- **Что сможет пользователь:** одно-два предложения — что и зачем.
- **Как было до фичи:** …

## Данные для примеров

| Персонаж | Роль | Состояние |
|---|---|---|
| <Имя Фамилия> | <роль> | активен / заблокирован / другой проект |

| Объект | Название | Статус | Владелец |
|---|---|---|---|
| <ID> | «<название>» | <статус> | <персонаж> |

## Функциональные требования

<!-- Под каждым блоком — строки протокола, из которых требование выведено (П<n> — «Решения после
brainstorming»). Пиши номерами, ссылки на строку ставит sdd-lint fix. -->

```
FR-1  Правило одним-двумя предложениями.
      Пример: <персонаж> делает <действие> → <наблюдаемый исход>.
```
Из протокола: 1, П1

## Нефункциональные требования

```
NFR-1 <Что> : p95 ≤ <число> <единица> при <условие объёма>.
```
Из протокола: 7

## Вне scope
- <что отложено> (из протокола: 4)

## Открытые вопросы
Нет.

## Не про поведение
- <технический выбор протокола и куда он ушёл: ADR, контракты> (из протокола: 6)
~~~~

### `sdd-lint help`

код 0

~~~~text
sdd-lint — проверки артефактов планирования SDD

  sdd-lint
      без аргументов — фичи в docs/ с текущим этапом и готовые команды
  sdd-lint start [<что человек написал после /sdd-grill>] [--name <ответ человека> | --slug <имя>]
  sdd-lint start docs/<feature> [--sources "<ответ человека>"] [--accept] [--rename <имя>]
      старт brainstorming (скилл /sdd-grill) по шагам, каждый вызов — один следующий шаг:
      нет задачи — вопрос «Какую задачу будем делать?»; задача фразой или файлом — вопрос
      «Как назвать папку?» (автоматически или своё), затем папка фичи и протокол; источники
      не названы — вопрос «Есть документация или код?» с описью папки; названы — задание
      сабагенту изучить их; «Старт готов» — можно вести grilling
  sdd-lint research <context|fact|check> docs/<feature> ["<вопрос>"]
      задания сабагенту: context — изучить источники и заполнить _work/context.md,
      fact — найти один факт и дописать его туда же; check — проверки CX-*: разделы,
      у каждого факта источник, путь и строка источника существуют. Код 1 — ошибки
  sdd-lint [check] docs/<feature> [--snapshot] [--json]
      все проверки и текущий этап. Код 1 — есть ошибки.
      --snapshot — заодно снять снимок защищённых частей для guard
  sdd-lint fix docs/<feature> [--snapshot] [--json]
      после правки — механику делает скрипт: номера вместо FR-? / NFR-? / AC-NNN-? (B? F?),
      ссылки (gen links), slices/README.md (gen readme);
      затем все проверки и сверка с git (diff). Код 1 — есть ошибки
  sdd-lint done docs/<feature>
      конец этапа одной командой: fix, затем «черновик» → «на ревью», снимок для guard
      и вопрос этапа (как у ask). Код 1 — доработать: ошибки или первый проход
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
      решения, неодобренные spec и slices, ошибки lint; --json — то же вопросом с вариантами. С --yes удаляет, убирает из spec ссылки на протокол, обновляет
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
      вопросы этапа: карточка человеку и строка ⚙ агенту (SDD_VIEW=json — структурой)
  sdd-lint choose docs/<feature> <id> ["<ответ человека>"]
      выполнить выбранный вариант: команду lint — сам, остальное — строкой ⚙ агенту
      (сабагент, скилл в этом окне, команда человеку). Вариант, где человек отвечает
      своими словами («Напишу решение»), — ответ третьим аргументом; --fallback — что
      сказать человеку, если у агента нет сабагентов
  sdd-lint triage docs/<feature> <ревью>:R<n> <open|ignore|П<n>|исправлено>
  sdd-lint triage docs/<feature> <ревью> remarks <all|none|R3,R5>
      решение по находке ревью — в файлы скриптом (ревью: spec, slices, adr-NNNN):
      open — пункт в открытые вопросы артефакта; ignore — «отклонено» и строка в «Снято
      на ревью» протокола; П<n> / исправлено — пишет /sdd-decide; remarks — какие замечания
      разбирать по одному, остальные снять. Код 2 — нет такой находки или номера не поняты
  sdd-lint prompt <скилл> <аргументы скилла> [--sub] [--note "<уточнение>"]
  sdd-lint prompt humanize <файл | docs/<feature>>
      скилл sdd-* и его файлы одним текстом — так агент и сабагент получают скилл,
      который вызывает человек (disable-model-invocation), по выбору человека;
      --sub — для сабагента: человеку вопросов не задаёт, итог — последним сообщением;
      humanize — задача сабагенту: humanizer, затем guard
  sdd-lint help [<команда>]
      справка: вся или по одной команде
  sdd-lint completion <bash|zsh>
      скрипт Tab-дополнения для терминала: source <(sdd-lint completion bash)

Фича — docs/<feature>, просто <feature> или любой путь внутри неё (@docs/<feature>/spec.md).

Коды выхода: 0 — порядок, 1 — ошибки (у done — доработать), 2 — неверный вызов, 3 — ворота закрыты.

Форма команд в подсказках: SDD_SKILL_PREFIX (по умолчанию «/») и SDD_LINT_CMD
(по умолчанию «/sdd-lint»).
~~~~

### `sdd-lint help start`

код 0

~~~~text
  sdd-lint start [<что человек написал после /sdd-grill>] [--name <ответ человека> | --slug <имя>]
  sdd-lint start docs/<feature> [--sources "<ответ человека>"] [--accept] [--rename <имя>]
      старт brainstorming (скилл /sdd-grill) по шагам, каждый вызов — один следующий шаг:
      нет задачи — вопрос «Какую задачу будем делать?»; задача фразой или файлом — вопрос
      «Как назвать папку?» (автоматически или своё), затем папка фичи и протокол; источники
      не названы — вопрос «Есть документация или код?» с описью папки; названы — задание
      сабагенту изучить их; «Старт готов» — можно вести grilling

Все команды: /sdd-lint help
~~~~

### `sdd-lint help research`

код 0

~~~~text
  sdd-lint research <context|fact|check> docs/<feature> ["<вопрос>"]
      задания сабагенту: context — изучить источники и заполнить _work/context.md,
      fact — найти один факт и дописать его туда же; check — проверки CX-*: разделы,
      у каждого факта источник, путь и строка источника существуют. Код 1 — ошибки

Все команды: /sdd-lint help
~~~~

### `sdd-lint help check`

код 0

~~~~text
  sdd-lint [check] docs/<feature> [--snapshot] [--json]
      все проверки и текущий этап. Код 1 — есть ошибки.
      --snapshot — заодно снять снимок защищённых частей для guard

Все команды: /sdd-lint help
~~~~

### `sdd-lint help fix`

код 0

~~~~text
  sdd-lint fix docs/<feature> [--snapshot] [--json]
      после правки — механику делает скрипт: номера вместо FR-? / NFR-? / AC-NNN-? (B? F?),
      ссылки (gen links), slices/README.md (gen readme);
      затем все проверки и сверка с git (diff). Код 1 — есть ошибки

Все команды: /sdd-lint help
~~~~

### `sdd-lint help done`

код 0

~~~~text
  sdd-lint done docs/<feature>
      конец этапа одной командой: fix, затем «черновик» → «на ревью», снимок для guard
      и вопрос этапа (как у ask). Код 1 — доработать: ошибки или первый проход
      по предупреждениям; после 3 прогонов с ошибками — вопрос человеку

Все команды: /sdd-lint help
~~~~

### `sdd-lint help plan`

код 0

~~~~text
  sdd-lint plan docs/<feature>
      план нарезки _work/plan.md: покрытие FR/NFR, причины Р1–Р3, зависимости,
      сервисы из протокола, кандидаты на склейку. Код 1 — ошибки в плане

Все команды: /sdd-lint help
~~~~

### `sdd-lint help gate`

код 0

~~~~text
  sdd-lint gate <spec|slices|adr|decide|review|build> [docs/<feature>] [<тема ADR | R-находка | режим ревью>]
      ворота перед этапом. Фича не указана — одна подходящая берётся сама, несколько —
      вопрос с вариантами. Код 3 — этап начинать нельзя: причина и вопрос этапа, что делать
      сейчас. Открыты — путь фичи и строка человеку о том, что будет; для slices — требования,
      сервисы, ADR и с какого шага продолжать; для adr — тема (нет — темы из slices или
      задание сабагенту найти кандидатов); для decide R2 — находка ревью и что на неё
      завязано; для review — режим (нет — что ждёт ревью)

Все команды: /sdd-lint help
~~~~

### `sdd-lint help approve`

код 0

~~~~text
  sdd-lint approve <spec|slices> docs/<feature>
  sdd-lint approve adr docs/<feature> [NNNN]
      поставить «одобрено <дата>» («принято» для ADR), если нет ошибок lint
      и защищённые части не менялись после снимка. Запускает только человек

Все команды: /sdd-lint help
~~~~

### `sdd-lint help gen`

код 0

~~~~text
  sdd-lint gen readme docs/<feature>
      таблица slices, «Покрытие Dev Spec» и «Порядок работ» в slices/README.md
  sdd-lint gen slices docs/<feature>
      файлы slices по согласованному плану: шапка из плана, заготовки AC по сервисам,
      README; план удаляется. Запускает вариант «Да» в вопросе о нарезке
  sdd-lint gen links docs/<feature>
      ссылки: «Из протокола:» в spec → строка протокола; «Проверяет:» в slices и «Покрытие»
      в README → строка FR в spec.md; «Основание:» → spec.md одной ссылкой. Устаревшие обновляет, старые форматы
      («Трассировка», «[FR-n]» в строке AC) переносит

Все команды: /sdd-lint help
~~~~

### `sdd-lint help guard`

код 0

~~~~text
  sdd-lint guard <файл | docs/<feature>> [--base <ref>]
      что humanizer менять не должен: блоки кода, шапки, заголовки, таблицы,
      «тексты», числа, ID, ссылки «Из протокола:». Сверка со снимком, без снимка — с git

Все команды: /sdd-lint help
~~~~

### `sdd-lint help snapshot`

код 0

~~~~text
  sdd-lint snapshot <файл | docs/<feature>>
      снимок защищённых частей перед humanizer

Все команды: /sdd-lint help
~~~~

### `sdd-lint help trace`

код 0

~~~~text
  sdd-lint trace docs/<feature> [FR-n | AC-NNN-… …]
      каждая строка протокола: решение → куда ушла (FR/NFR, вне scope, открытый вопрос);
      с ID — что держится на требовании: строки протокола, slices, AC с файлом и строкой

Все команды: /sdd-lint help
~~~~

### `sdd-lint help diff`

код 0

~~~~text
  sdd-lint diff docs/<feature> [--base <ref>]
      проверки по git (по умолчанию против HEAD): протокол только дописывается,
      ID не пропадают, одобренный файл не меняется без сброса статуса

Все команды: /sdd-lint help
~~~~

### `sdd-lint help close`

код 0

~~~~text
  sdd-lint close docs/<feature> [--json] [--yes]
      перед merge (скилл /sdd-close). Без --yes ничего не удаляет: печатает, что удалит
      (brainstorming.md, всё в _work/), и последствия — незакоммиченное, блокеры ревью без
      решения, неодобренные spec и slices, ошибки lint; --json — то же вопросом с вариантами. С --yes удаляет, убирает из spec ссылки на протокол, обновляет
      ссылки на FR

Все команды: /sdd-lint help
~~~~

### `sdd-lint help export`

код 0

~~~~text
  sdd-lint export docs/<feature>
      требования в JSON для зоны реализации: slices, сервисы, AC со ссылкой
      <feature>/<AC-ID> для названий тестов, статус ворот build. Код 3 — ворота build закрыты

Все команды: /sdd-lint help
~~~~

### `sdd-lint help next`

код 0

~~~~text
  sdd-lint next <FR|NFR|slice|adr> docs/<feature>
  sdd-lint next AC docs/<feature> <NNN> [B|F]
      следующий свободный номер

Все команды: /sdd-lint help
~~~~

### `sdd-lint help ask`

код 0

~~~~text
  sdd-lint ask docs/<feature>
      вопросы этапа: карточка человеку и строка ⚙ агенту (SDD_VIEW=json — структурой)

Все команды: /sdd-lint help
~~~~

### `sdd-lint help choose`

код 0

~~~~text
  sdd-lint choose docs/<feature> <id> ["<ответ человека>"]
      выполнить выбранный вариант: команду lint — сам, остальное — строкой ⚙ агенту
      (сабагент, скилл в этом окне, команда человеку). Вариант, где человек отвечает
      своими словами («Напишу решение»), — ответ третьим аргументом; --fallback — что
      сказать человеку, если у агента нет сабагентов

Все команды: /sdd-lint help
~~~~

### `sdd-lint help triage`

код 0

~~~~text
  sdd-lint triage docs/<feature> <ревью>:R<n> <open|ignore|П<n>|исправлено>
  sdd-lint triage docs/<feature> <ревью> remarks <all|none|R3,R5>
      решение по находке ревью — в файлы скриптом (ревью: spec, slices, adr-NNNN):
      open — пункт в открытые вопросы артефакта; ignore — «отклонено» и строка в «Снято
      на ревью» протокола; П<n> / исправлено — пишет /sdd-decide; remarks — какие замечания
      разбирать по одному, остальные снять. Код 2 — нет такой находки или номера не поняты

Все команды: /sdd-lint help
~~~~

### `sdd-lint help prompt`

код 0

~~~~text
  sdd-lint prompt <скилл> <аргументы скилла> [--sub] [--note "<уточнение>"]
  sdd-lint prompt humanize <файл | docs/<feature>>
      скилл sdd-* и его файлы одним текстом — так агент и сабагент получают скилл,
      который вызывает человек (disable-model-invocation), по выбору человека;
      --sub — для сабагента: человеку вопросов не задаёт, итог — последним сообщением;
      humanize — задача сабагенту: humanizer, затем guard

Все команды: /sdd-lint help
~~~~

### `sdd-lint help help`

код 0

~~~~text
  sdd-lint help [<команда>]
      справка: вся или по одной команде

Все команды: /sdd-lint help
~~~~

### `sdd-lint help completion`

код 0

~~~~text
  sdd-lint completion <bash|zsh>
      скрипт Tab-дополнения для терминала: source <(sdd-lint completion bash)

Все команды: /sdd-lint help
~~~~

### `sdd-lint completion`

код 2

~~~~text
completion — выбери вариант:

- `sdd-lint completion bash` — source <(sdd-lint completion bash)
- `sdd-lint completion zsh` — source <(sdd-lint completion zsh)
~~~~

### `sdd-lint completion bash`

код 0

~~~~text
# sdd-lint: Tab-дополнение для bash. В ~/.bashrc: source <(sdd-lint completion bash)
_sdd_lint() {
  local IFS=$'\n' out
  out=$(node '<REPO>/skills/sdd-lint/scripts/sdd-lint.mjs' __complete "${COMP_WORDS[@]:1:COMP_CWORD}" 2>/dev/null) || return 0
  COMPREPLY=($(printf '%s\n' "$out" | cut -f1))
  if [[ ${#COMPREPLY[@]} -eq 1 && ${COMPREPLY[0]} == */ ]]; then compopt -o nospace; fi
}
complete -F _sdd_lint sdd-lint sdd-lint.mjs
~~~~

### `sdd-lint completion zsh`

код 0

~~~~text
# sdd-lint: Tab-дополнение для zsh. В ~/.zshrc после compinit: source <(sdd-lint completion zsh)
_sdd_lint() {
  local -a lines vals disp dirs
  local line v
  lines=("${(@f)$(node '<REPO>/skills/sdd-lint/scripts/sdd-lint.mjs' __complete "${(@)words[2,CURRENT]}" 2>/dev/null)}")
  for line in "${lines[@]}"; do
    [[ -z $line ]] && continue
    v=${line%%$'\t'*}
    if [[ $v == */ ]]; then dirs+=("$v"); continue; fi
    vals+=("$v")
    if [[ $line == *$'\t'* ]]; then disp+=("${(r:14:)v} -- ${line#*$'\t'}"); else disp+=("$v"); fi
  done
  (( ${#dirs} )) && compadd -S '' -- "${dirs[@]}"
  (( ${#vals} )) && compadd -l -d disp -- "${vals[@]}"
}
compdef _sdd_lint sdd-lint sdd-lint.mjs
~~~~

### `sdd-lint`

код 0

~~~~text
**sdd-lint** — проверки планирования SDD

Задачи в `docs/`:

- **comments** — Части работы ожидают проверки → проверка ИИ в новой сессии: `/sdd-review comments slices`

Команды:

- `/sdd-lint comments` — все проверки и текущий этап
- `/sdd-lint fix comments` — после правки: номера, ссылки, README — скриптом, затем проверки
- `/sdd-lint done comments` — конец этапа: fix, снимок, «на ревью» и вопрос этапа
- `/sdd-lint plan comments` — проверить план разбиения работы _work/plan.md
- `/sdd-lint approve spec|slices|adr comments` — одобрить требования, части работы или принять ADR
- `/sdd-lint gate spec|slices|adr|decide|build comments` — проверить, можно ли начать этап
- `/sdd-lint gen readme|links|slices comments` — собрать README, ссылки, файлы частей работы по плану
- `/sdd-lint guard docs/comments/spec.md` — проверка сохранности структуры после humanizer
- `/sdd-lint trace comments` — протокол → FR/NFR
- `/sdd-lint diff comments` — изменения относительно версии в Git
- `/sdd-lint next FR|NFR|AC|slice|adr comments` — следующий свободный номер
- `/sdd-lint export comments` — требования в JSON для зоны реализации

Завершить задачу перед слиянием ветки — `/sdd-close comments`: убирает протокол и `_work/` (результаты проверки, план разбиения работы) — после подтверждения.

Справка по команде: `/sdd-lint help <команда>`. Путь к задаче дописывает Tab после @: `@docs/comments/`

Tip: Введите /sdd-review comments slices чтобы продолжить
~~~~

### `sdd-lint check comments`

код 0

~~~~text

Части работы ожидают проверки. Следующий шаг:

1. по желанию упростить формулировки: `/humanizer` по каждому файлу в `docs/comments/slices/`, затем `/sdd-lint guard docs/comments`
2. проверка ИИ в новой сессии: `/sdd-review comments slices`
3. одобрить: `/sdd-lint approve slices docs/comments`

Ошибок: 0, предупреждений: 0. FR/NFR: 13, частей работы: 3, AC: 14

Tip: Введите /sdd-review comments slices чтобы продолжить
~~~~

### `sdd-lint check comments --json`

код 0

~~~~text
{
  "findings": [],
  "hints": {},
  "counts": {
    "err": 0,
    "warn": 0,
    "info": 0
  },
  "stage": "Части работы ожидают проверки",
  "next": [
    "по желанию упростить формулировки: `/humanizer` по каждому файлу в `docs/comments/slices/`, затем `/sdd-lint guard docs/comments`",
    "проверка ИИ в новой сессии: `/sdd-review comments slices`",
    "одобрить: `/sdd-lint approve slices docs/comments`"
  ],
  "tip": "Tip: Введите /sdd-review comments slices чтобы продолжить"
}
~~~~

### `sdd-lint comments`

код 0

~~~~text

Части работы ожидают проверки. Следующий шаг:

1. по желанию упростить формулировки: `/humanizer` по каждому файлу в `docs/comments/slices/`, затем `/sdd-lint guard docs/comments`
2. проверка ИИ в новой сессии: `/sdd-review comments slices`
3. одобрить: `/sdd-lint approve slices docs/comments`

Ошибок: 0, предупреждений: 0. FR/NFR: 13, частей работы: 3, AC: 14

Tip: Введите /sdd-review comments slices чтобы продолжить
~~~~

### `sdd-lint aprove docs/comments`

код 2

~~~~text
Нет команды «aprove». Может, approve? `/sdd-lint approve docs/comments`
~~~~
