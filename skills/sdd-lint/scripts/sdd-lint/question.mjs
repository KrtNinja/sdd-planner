// Вопрос человеку — одна форма для всех команд: ask, choose, gate, start, close. Обход по пунктам: блок → «Как решаем?».
//
// Вопрос — данные: { header, question, preview?, options: [{ id, label, description, recommended, action }] }.
// Здесь он становится выводом для агента: варианты с номерами, «(рекомендую)» в label, text — тот же вопрос
// списком для агента без инструмента выбора, instruction — как задать и куда передать ответ.
// Действия (action) в вывод не идут: их выполняет choose по id.

export const lintArgs = (args) => JSON.stringify(args);
export const lintCall = (args) => `sdd_lint с args ${lintArgs(args)}`;
// Задача сабагенту целиком: вызвать sdd_lint и выполнить, что он вернёт; tail — что сверх этого.
export const taskFor = (args, tail) => `Вызови инструмент sdd_lint с args ${lintArgs(args)} и выполни то, что он вернёт.${tail ? ` ${tail}` : ''}`;
// Место в args, куда агент подставляет ответ человека дословно.
export const ANSWER = '<ответ человека>';

// then — вызов, куда агент передаёт выбор: <id> — id варианта.
// free — человек может ответить своими словами, их передают вместо <id> (тема ADR, фича).
export function questionView({ questions, then, stage = null, free = false }) {
  let n = 0;
  // preview (план нарезки, блок находки) человек читает до вопроса: в инструменте выбора ему не место.
  const preview = questions.map((q) => q.preview).filter(Boolean).join('\n\n') || null;
  const qs = questions.map(({ preview: _p, walk: _w, ...q }) => ({
    ...q,
    options: q.options.map(({ action: _a, ...o }) => ({ n: ++n, ...o, label: o.recommended ? `${o.label} (рекомендую)` : o.label })),
  }));
  const text = qs.map((q) => [q.question, ...q.options.map((o) => `${o.n}. ${o.label}${o.description ? ` — ${o.description}` : ''}`)].join('\n')).join('\n\n');
  const reply = free
    ? '; дальше — по скиллу. Человек ответил своими словами — передай их вместо <id>.'
    : '; выбрано несколько — по одному, по порядку. Человек ответил словами: однозначно назвал один вариант — его id, иначе отвечай как в обычном диалоге.';
  const instruction =
    (preview ? 'Сначала выведи preview дословно, отдельным сообщением: это для человека. ' : '') +
    'Задай questions инструментом выбора как есть: текст, порядок, варианты и «(рекомендую)» не меняй, своих вариантов не добавляй. ' +
    'Инструмента выбора нет — выведи text дословно и жди ответа. ' +
    `Выбран вариант — ${lintCall(then)}: вместо <id> — id варианта (ответ номером — id варианта с этим n)${reply} ` +
    'Вариант за человека не выбирай.';
  return { instruction, ...(stage ? { stage } : {}), ...(preview ? { preview } : {}), ...(free ? {} : { choose: then }), questions: qs, text };
}
// Вопрос этапа: выбор уходит в choose.
export const questionsView = (dir, stage, questions) => questionView({ questions, then: ['choose', dir, '<id>'], stage });
// Вопрос с вариантами, ответ на который агент передаёт в then — gate, выбор фичи.
export const pickView = (q, then) => questionView({ questions: [q], then, free: true });
export const pickText = (lead, q, then) => [lead, JSON.stringify(pickView(q, then), null, 2)].join('\n');

// Вопрос, на который человек отвечает своими словами: ответ уходит в скрипт дословно, а не в рассуждения агента.
export const waitText = (ask, then) => `Передай человеку дословно и жди ответа:\n\n${ask}\n\nОтвет человека передай дословно: ${lintCall(then)}.`;

// Пункт — блок полей, который человек читает перед вопросом «Как решаем?».
export const itemBlock = (head, fields) => [head, ...fields.filter(([, v]) => v !== undefined).map(([k, v]) => `  ${k}: ${v || '—'}`)].join('\n');

// Обход по пунктам: нерешённые пункты — по одному, первый — блок и вопрос «Как решаем?».
// Решение пишет скрипт или decide, решённый пункт уходит из очереди, следующий ask берёт следующий:
// очередь живёт в файлах, а не в памяти агента. walk — вопрос задаётся один, без соседей по этапу.
export function walkQuestion({ items, header, block, options, question = 'Как решаем?' }) {
  if (!items.length) return null;
  const item = items[0];
  return { walk: true, header: header(item, items.length), question, preview: block(item), options: options(item) };
}
