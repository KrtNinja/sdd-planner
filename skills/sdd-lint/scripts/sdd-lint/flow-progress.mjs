// Представление состояния файлов; не хранит этап и не выполняет переходы.
// @ts-check
import { approved } from './md.mjs';
import { registryQuestions, questionPending } from './registry-view.mjs';
import { checkTech } from './tech.mjs';
import { scenarioSection, scenarioFiles } from './scenario-section.mjs';

/** @param {import('./model.mjs').Feature} m */
export function flowProgress(m) {
  if (!m.flow.state) return null;
  const pending = registryQuestions(m).filter(questionPending);
  return { ready: readyResults(m), waiting: pending.filter((q) => q.fields.Статус === 'deferred').map((q) => q.id),
    answers: pending.filter((q) => q.fields.Статус === 'answered').map((q) => q.id),
    open: pending.filter((q) => q.fields.Статус === 'open').map((q) => q.id) };
}

/** @param {string[]} ids */
function shortIds(ids) {
  return ids.length ? `${ids.length} (${ids.slice(0, 3).join(', ')}${ids.length > 3 ? ', …' : ''})` : 'нет';
}

/** @param {import('./model.mjs').Feature} m */
export function progressText(m) {
  const p = flowProgress(m);
  if (!p) return null;
  return [`Готово: ${p.ready.join('; ') || 'пока нет завершённых результатов'}.`,
    `Ожидание коллег: ${shortIds(p.waiting)}.`, `Ответы к обработке: ${shortIds(p.answers)}.`,
    `Открытые вопросы: ${shortIds(p.open)}.`].join('\n');
}

/** @param {import('./model.mjs').Feature} m */
export function flowDraftStep(m) {
  if (!m.flow.state || !m.spec) return null;
  if (!scenarioSection(m.spec.md) && !scenarioFiles(m).length)
    return { skill: 'sdd-scenarios', label: 'Описать путь пользователя и применимые развилки' };
  if (checkTech(m).length) return { skill: 'sdd-tech', label: 'Проверить техническое обеспечение поведения' };
  return null;
}

/** @param {import('./model.mjs').Feature} m */
function readyResults(m) {
  const ready = [];
  if (/готов/i.test(m.protocol?.status || '')) ready.push('первичное обсуждение');
  if (m.spec) ready.push(approved(m.spec.status) ? 'поведение и tech согласованы' : 'черновик требований');
  if (m.slices.size) ready.push(approved(m.slicesStatus) ? 'части работы согласованы' : 'черновик частей работы');
  return ready;
}
