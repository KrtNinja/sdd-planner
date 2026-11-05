// Бриф этапа slices для агента: требования, сервисы, ADR и с какого шага продолжать — печатает gate slices.
// @ts-check
import { stubCount } from './cut.mjs';
import { rel } from './md.mjs';
import { G, blocks, bold, list } from './screen.mjs';
import { registry } from './services.mjs';

/** @typedef {import('./model.mjs').Feature} Feature */

// Правило FR одной строкой: текст до «Пример:», первое предложение.
/** @param {import('./model.mjs').Req} r */
function gist(r) {
  const body = r.text.replace(/^\s*N?FR-\d+\s*/, '').split(/Пример:/)[0].replace(/\s+/g, ' ').trim();
  const first = body.match(/^.*?[.!?](?=\s|$)/)?.[0] || body;
  return first.length > 110 ? `${first.slice(0, 107)}…` : first;
}

// ADR в брифе: файл, статус и название из заголовка «# ADR-N: …».
/** @param {import('./model.mjs').Adr} a */
const adrLine = (a) => `\`${rel(a.file)}\` «${a.status || '—'}» — ${(a.md.match(/^#\s+ADR-\d+:\s*(.*)$/m) || [])[1] || 'без названия'}`;

// Человеку и агенту — одна карточка (требования, сервисы, ADR); с какого шага продолжать — в строку ⚙.
/** @param {Feature & { spec: import('./model.mjs').Spec }} m */
export function slicesBrief(m) {
  const reqs = [...m.spec.reqs.values()].filter((r) => !r.deleted);
  const reg = registry(m);
  const card = blocks(
    `Требования spec.md (${reqs.length}) — каждое попадёт в «Основание» хотя бы одной части работы:\n${list(reqs.map((r) => `${bold(r.id)} ${gist(r)}`))}`,
    reg ? `Сервисы: ${reg.list.join(', ')} — так они и называются в «Половины».` : 'Сервисы: в протоколе нет строки «Сервисы:» — назову их по spec и ADR.',
    m.featureAdrs.length
      ? `Архитектурные решения (ADR) задачи:\n${list(m.featureAdrs.map(adrLine))}`
      : 'Записей ADR нет; они необязательны. Неизвестные решения оформляйте как вопросы, а не как ожидание ADR.',
  );
  const parts = continuation(m);
  return { card, parts };
}

/** @param {Feature} m */
function continuation(m) {
  const dir = rel(m.dir);
  const parts = [m.featureAdrs.length ? 'прочитай ADR фичи' : null];
  if (m.slices.size) {
    const stubs = stubCount(m);
    parts.push(
      stubs
        ? `файлы slices есть, заготовок «<…>» ${stubs} — продолжай с шага «Заполни заготовки»`
        : `файлы slices есть и заполнены — нарезку заново не начинай; поправить поведение — через sdd-decide; закончить этап — ${G.call(['done', dir])}`,
    );
  } else if (m.plan) parts.push(`план ${rel(m.planFile)} есть — продолжай с проверки: ${G.call(['plan', dir])}`);
  else parts.push(`плана нет — начни с него: ${rel(m.planFile)}`);
  return parts;
}
