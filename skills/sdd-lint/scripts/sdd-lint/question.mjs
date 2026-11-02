// Вопрос человеку — одна форма для всех команд: ask, choose, gate, start, close. Обход по пунктам: блок → «Как решаем?».
//
// Вопрос — данные: { header, question, preview?, options: [{ id, label, description, recommended, action }] }.
// На экран — карточка: preview, вопрос жирным, варианты нумерованным списком, «(рекомендую)» после
// названия. Агенту — строка ⚙: заголовки для инструмента выбора, куда передать выбор и id по номерам.
// Карточку агент не перепечатывает: она уже на экране. SDD_VIEW=json — тот же вопрос структурой (тесты).
// Действия (action) в вывод не идут: их выполняет choose по id.
import { A, G, blocks, bold, cmdCode, codePaths, field, gearLine, screen } from './screen.mjs';

export const lintArgs = A;
// Место в args, куда агент подставляет ответ человека дословно.
export const ANSWER = '<ответ человека>';
const JSON_VIEW = () => process.env.SDD_VIEW === 'json';

const optionLine = (o) => `${o.n}. ${bold(o.label)}${o.recommended ? ' (рекомендую)' : ''}${o.description ? ` — ${codePaths(cmdCode(o.description))}` : ''}`;

// then — вызов, куда агент передаёт выбор: <id> — id варианта.
// free — человек может ответить своими словами, их передают вместо <id> (тема ADR, фича).
// lead — текст человеку перед вопросом; extra — части строки ⚙ сверх вопроса.
export function questionView({ questions, then, stage = null, free = false, lead = null, extra = [] }) {
  let n = 0;
  // preview (план нарезки, блок находки) человек читает до вопроса: в инструменте выбора ему не место.
  const preview = questions.map((q) => q.preview).filter(Boolean).join('\n\n') || null;
  const qs = questions.map(({ preview: _p, walk: _w, ...q }) => ({ ...q, options: q.options.map(({ action: _a, ...o }) => ({ n: ++n, ...o })) }));
  const card = blocks(lead, preview, ...qs.map((q) => blocks(bold(q.question), q.options.map(optionLine).join('\n'))));
  const gear = gearLine(
    G.ask(
      qs.map((q) => q.header),
      then,
      qs.flatMap((q) => q.options.map((o) => o.id)),
      free,
    ),
    extra,
  );
  return { ...(lead ? { lead } : {}), ...(stage ? { stage } : {}), ...(preview ? { preview } : {}), ...(free ? {} : { choose: then }), then, questions: qs, card, gear };
}
// Вопрос в вывод: карточка и строка ⚙; для тестов — JSON (lead — строкой перед ним, как текст выше вопроса).
export const viewText = (v) => (JSON_VIEW() ? [v.lead, JSON.stringify(v, null, 2)].filter(Boolean).join('\n') : blocks(v.card, v.gear));
// Вопрос этапа: выбор уходит в choose.
export const questionsView = (dir, stage, questions, opts = {}) => questionView({ questions, then: ['choose', dir, '<id>'], stage, ...opts });
// Вопрос с вариантами, ответ на который агент передаёт в then, — gate, выбор фичи; можно своими словами.
export const pickText = (lead, q, then) => viewText(questionView({ questions: [q], then, free: true, lead }));

// Вопрос, на который человек отвечает своими словами: ответ уходит в скрипт дословно, а не в рассуждения агента.
export const waitText = (ask, then, extra = []) => screen(ask, G.wait(then), extra);

// Пункт — блок полей, который человек читает перед вопросом «Как решаем?».
export const itemBlock = (head, fields) =>
  blocks(
    head,
    fields
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => field(k, codePaths(v)))
      .join('\n'),
  );

// Обход по пунктам: нерешённые пункты — по одному, первый — блок и вопрос «Как решаем?».
// Решение пишет скрипт или decide, решённый пункт уходит из очереди, следующий ask берёт следующий:
// очередь живёт в файлах, а не в памяти агента. walk — вопрос задаётся один, без соседей по этапу.
export function walkQuestion({ items, header, block, options, question = 'Как решаем?' }) {
  if (!items.length) return null;
  const item = items[0];
  return { walk: true, header: header(item, items.length), question, preview: block(item, items.length), options: options(item) };
}
