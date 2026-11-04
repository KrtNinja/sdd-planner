// Модель данных фичи: JSDoc-типы того, что собирают разбор (parse*) и loadFeature. Кода здесь нет.
// @ts-check
//
// Форму объекта ищут здесь, а не по коду разбора: модуль подключает тип через
// /** @typedef {import('./model.mjs').Spec} Spec */, а tsc сверяет разбор с описанием.
// Номера строк (n, start, end) — с 1, как в редакторе. Пути (file) — абсолютные; в находках — от корня.

// ── Markdown ─────────────────────────────────────────────────────────────────

/**
 * Строка markdown после scan().
 * @typedef {object} Line
 * @property {string} text
 * @property {number} n
 * @property {boolean} inCode внутри блока ``` … ```
 * @property {number | null} block номер блока кода (CodeBlock.idx), вне блока — null
 * @property {string | null} h2 текущий раздел второго уровня, до первого ## — null
 */

/**
 * Блок кода ``` … ```: FR, AC, mermaid.
 * @typedef {object} CodeBlock
 * @property {number} idx номер блока в файле, с 0
 * @property {number} start строка открывающих ```
 * @property {string | null} h2
 * @property {string} lang язык после ``` в нижнем регистре; у FR и AC — пусто
 * @property {Line[]} lines строки внутри блока, без ```
 */

/** @typedef {{ lines: Line[], blocks: CodeBlock[] }} Scan */

/** Таблица markdown: шапка, строки без |---|, первая и последняя строка. @typedef {{ header: string[], rows: TableRow[], start: number, end: number }} Table */
/** @typedef {{ cells: string[], n: number }} TableRow */

/** Ссылка на строку: что и где. @typedef {{ id: string, n: number }} IdAt */

// ── Находки ──────────────────────────────────────────────────────────────────

/**
 * Находка проверки. Уровень — из каталога rules.mjs, file — от корня репозитория.
 * @typedef {object} Finding
 * @property {string} rule ID правила: SP-03, SL-28…
 * @property {'err' | 'warn' | 'info'} level
 * @property {string} file
 * @property {number | null} line
 * @property {string} msg
 */

// ── Протокол brainstorming.md ────────────────────────────────────────────────

/**
 * Строка таблицы «Решения».
 * @typedef {object} ProtocolRow
 * @property {string} id номер строки, как записан: «1», «2»…
 * @property {string} q вопрос
 * @property {string} rec рекомендация агента
 * @property {string} dec решение человека
 * @property {number} n
 * @property {string} raw ячейки строки через « | »
 */

/**
 * Строка «Решения после brainstorming»: id — П1, П2…
 * @typedef {{ id: string, dec: string, n: number, raw: string }} PostRow
 */

/**
 * Находка ревью, которую человек снял (раздел «Снято на ревью» пишет triage).
 * @typedef {{ when: string, review: string, where: string, what: string, status: string, n: number }} DroppedRow
 */

/**
 * @typedef {object} Protocol
 * @property {string} file
 * @property {string} md
 * @property {Scan} sc
 * @property {string | null} status строка «Статус:»
 * @property {ProtocolRow[]} rows
 * @property {PostRow[]} post
 * @property {DroppedRow[]} dropped
 * @property {{ text: string, n: number }[]} outScope пункты «Вне scope»
 */

// ── Dev Spec spec.md ─────────────────────────────────────────────────────────

/**
 * Требование FR-n / NFR-n — свой блок кода.
 * @typedef {object} Req
 * @property {string} id
 * @property {number} n строка с ID
 * @property {string} text весь блок
 * @property {string} first строка с ID
 * @property {boolean} deleted «(удалён: …)»
 * @property {string | null} h2
 * @property {number} block CodeBlock.idx
 */

/** «[4](brainstorming.md#L18)» → { id: '4', href }, «П1» без ссылки → { id: 'П1', href: null }. @typedef {{ id: string, href: string | null }} SourceRef */

/** Раздел, где «Из протокола:» стоит без блока требования. @typedef {'вне scope' | 'открытый вопрос' | 'не про поведение'} SourceSection */

/**
 * Строка «Из протокола:» и к чему она относится: к требованиям блока над ней или к разделу.
 * @typedef {object} SourceLine
 * @property {number} n
 * @property {string} text
 * @property {SourceRef[]} refs
 * @property {{ kind: 'req', ids: string[] } | { kind: SourceSection } | null} target требования блока над строкой или раздел
 */

/**
 * «Данные для примеров»: персонажи и объекты.
 * @typedef {object} ExampleData
 * @property {{ first: string, last: string | null }[]} people
 * @property {Set<string>} objects ID объектов: TASK-12
 * @property {Set<string>} objNames названия в «ёлочках»
 */

/**
 * @typedef {object} Spec
 * @property {string} file
 * @property {string} md
 * @property {Scan} sc
 * @property {string | null} status после verifyApprovals — как его видят ворота
 * @property {Map<string, Req>} reqs ID → требование, первое по файлу
 * @property {IdAt[]} dups повторы ID
 * @property {IdAt[]} outside ID вне блока кода
 * @property {{ n: number, ids: string[] }[]} multi блоки с несколькими ID
 * @property {ExampleData} data
 * @property {SourceLine[]} sources
 * @property {Table | null} oldTraceT таблица старого раздела «Трассировка»
 * @property {number | null} oldTraceLine
 * @property {string} title заголовок без «— Dev Spec»
 */

// ── Slices slices/NNN-*.md ───────────────────────────────────────────────────

/** Строка «Проверяет:» под блоком AC. @typedef {{ n: number, text: string }} ChecksLine */

/**
 * Критерий приёмки AC-NNN-[B|F]k.
 * @typedef {object} Ac
 * @property {string} id латиницей, даже если в файле кириллица (SL-31)
 * @property {string} acNum NNN — номер slice в ID
 * @property {string} side '' — общая приёмка, B — бэкенд, F — фронтенд
 * @property {boolean} stub в блоке или «Проверяет:» осталась заготовка <…>
 * @property {number} k номер AC
 * @property {number} n строка с ID
 * @property {string | null} h2
 * @property {boolean} deleted
 * @property {string[]} oldRefs FR в [ … ] после ID — старая форма
 * @property {string[]} refs FR из [ … ] и «Проверяет:»
 * @property {ChecksLine | null} checks
 * @property {number} block
 * @property {Line[]} body строки блока после ID
 * @property {string} text весь блок
 */

/**
 * @typedef {object} Slice
 * @property {number[]} strayChecks «Проверяет:» не под блоком AC
 * @property {number | null} basisLine строка «Основание:»
 * @property {string} file
 * @property {string} md
 * @property {Scan} sc
 * @property {string} num NNN из имени файла
 * @property {string} name имя файла
 * @property {string} title
 * @property {string | null} type «Тип:»
 * @property {string} basisRaw «Основание:» как написано
 * @property {Set<string>} basis FR/NFR из «Основание:»
 * @property {string[]} deps номера slices из «Зависимости:»
 * @property {string | null} halves «Половины:»
 * @property {string | null} why «Почему отдельно:»
 * @property {Ac[]} acs
 * @property {number} pending AC без номера: AC-002-?
 * @property {IdAt[]} outside AC-ID вне блока кода
 * @property {{ n: number, count: number }[]} multi блоки с несколькими AC
 */

// ── ADR adr/NNNN-*.md ────────────────────────────────────────────────────────

/**
 * Вариант «### …» в разделе «Варианты»: строки под заголовком и вердикт из первой строки.
 * @typedef {{ title: string, n: number, lines: Line[], text: string, verdict: 'отклонен' | 'выбран' | 'отложен' | null }} AdrVariant
 */

/**
 * @typedef {object} Adr
 * @property {string} file
 * @property {string} md
 * @property {Scan} sc
 * @property {string} num NNNN из имени файла
 * @property {string | null} headNum номер из заголовка «# ADR-N»
 * @property {string | null} status
 * @property {AdrVariant[]} variants
 * @property {IdAt[]} limits ограничения ОГР-n из «Контекста»
 */

// ── План нарезки _work/plan.md ───────────────────────────────────────────────

/**
 * Slice в плане: «## 002-slug — Название» и строки «Ключ: значение» под ним.
 * @typedef {object} PlanSlice
 * @property {string} num
 * @property {string} slugRaw
 * @property {string} title
 * @property {number} n
 * @property {Record<string, string>} head ключ → значение, первое по разделу
 * @property {Record<string, number>} headN ключ → строка
 * @property {string} slug
 * @property {string | null} basisRaw
 * @property {Set<string>} basis
 * @property {string[]} deps
 * @property {string | null} halves
 * @property {string | null} result
 * @property {string | null} why
 * @property {'подготовка' | 'поведение'} type
 */

/** bad — заголовки ## не по форме. @typedef {{ file: string, md: string, sc: Scan, slices: PlanSlice[], bad: { n: number, text: string }[] }} Plan */

// ── Ревью _work/review/*.md ──────────────────────────────────────────────────

/**
 * Находка ревью: строка таблицы с колонкой «Решение».
 * @typedef {object} ReviewRow
 * @property {string} id R1, R2…
 * @property {string} level «Важность»
 * @property {boolean} blocker
 * @property {string} decision
 * @property {string} where
 * @property {string} what
 * @property {string} point
 * @property {string} proposal
 * @property {string[]} cells
 * @property {number} n
 */

/**
 * Файл ревью. Без таблицы находок — table: false и строк нет.
 * @typedef {{ file: string, md: string, table: false, rows: ReviewRow[] }
 *   | { file: string, md: string, table: true, decisionCol: number, rows: ReviewRow[] }} Review
 */

// ── Фича ─────────────────────────────────────────────────────────────────────

/**
 * Одобрение: raw — статус без отметки approve; state: manual — без отметки, ok — совпала, changed — файл менялся после approve.
 * @typedef {{ kind: 'spec' | 'slices' | 'adr', file: string, raw: string, state: 'manual' | 'ok' | 'changed' }} Approval
 */

/** Реестр «Сервисы:» и откуда он взят. @typedef {{ list: string[], from: string }} Registry */

/**
 * Фича docs/<feature>/ целиком — результат loadFeature.
 * @typedef {object} Feature
 * @property {string} dir абсолютный путь к папке фичи
 * @property {string} name slug — имя папки
 * @property {string} workDir _work/
 * @property {string} reviewDir _work/review/
 * @property {Map<string, Review>} reviews spec, slices, adr-NNNN → ревью
 * @property {string} protocolFile
 * @property {Protocol | null} protocol
 * @property {string} specFile
 * @property {Spec | null} spec
 * @property {string} slicesDir
 * @property {Map<string, Slice>} slices NNN → slice, по номеру
 * @property {string} readmeFile
 * @property {string | null} readme текст slices/README.md
 * @property {Scan | null} readmeSc
 * @property {string | null} slicesStatus «Статус:» README после verifyApprovals
 * @property {string} planFile
 * @property {Plan | null} plan
 * @property {string} adrDir docs/adr/ — общая для всех фич
 * @property {Adr[]} adrs все ADR
 * @property {Adr[]} featureAdrs ADR, которые ссылаются на фичу
 * @property {import('./flow.mjs').DocumentationFlow} flow
 * @property {Approval[]} approvals заполняет verifyApprovals
 */

export {};
