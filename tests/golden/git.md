# Golden: состояние «git»

Снято tests/golden.test.mjs. Не правится руками: UPDATE_GOLDEN=1.

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
  "notes": []
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

Этап готов: ошибок 0, предупреждений 0.

**Части работы «на ревью». Что дальше?**

1. **Проверить отдельным агентом** (рекомендую) — новая сессия, результаты — в `docs/comments/_work/review/slices.md`
2. **Проверить в новой сессии** — вы запускаете команду сами
3. **Упростить формулировки частей работы** — упростить текст и проверить сохранность структуры
4. **Одобрить** — `/sdd-lint approve slices docs/comments`

⚙ sdd: вопрос «Части работы» → ["choose","docs/comments","<id>"] · варианты: 1=review-here:slices, 2=review-window:slices, 3=humanize:slices, 4=approve:slices
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

код 0

~~~~text

Защищённые части не тронуты в 1 файл(ах).
~~~~

### `sdd-lint guard docs/comments/spec.md --json`

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
  "noBase": []
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

код 0

~~~~text

Сверка с HEAD. Ошибок: 0, предупреждений: 0
~~~~

### `sdd-lint diff comments --json`

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
  "base": "HEAD"
}
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

**Удалить временные файлы docs/comments, несмотря на последствия выше?**

1. **Не удалять** (рекомендую) — ничего не делать
2. **Удалить** — скрипт удалит перечисленное и проверит документы задачи

⚙ sdd: вопрос «Завершить задачу» → ["choose","docs/comments","<id>"] · варианты: 1=close:no, 2=close:yes
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
