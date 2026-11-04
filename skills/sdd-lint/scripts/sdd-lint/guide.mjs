// Ведение по этапам: какую фичу взять, если её не назвали; что сказать человеку в начале этапа;
// @ts-check
// вопрос «что дальше» вместо тупика у закрытых ворот. Человек может не знать процесса — подсказывает скрипт.
import path from 'node:path';

import { pendingAdrs } from './adr.mjs';
import { askOf } from './ask.mjs';
import { skillCode } from './config.mjs';
import { neededAdrs } from './cut.mjs';
import { loadFeature } from './feature.mjs';
import { approved, rel } from './md.mjs';
import { DOCS, listFeatures } from './pick.mjs';
import { pickText, questionsView, viewText } from './question.mjs';
import { G, blocks, list, screen } from './screen.mjs';
import { stageOf, tempArtifacts } from './stage.mjs';

/** @typedef {import('./model.mjs').Feature} Feature */
/** Что ждёт ревью: режим ревью, номер ADR и подпись для вопроса. @typedef {{ mode: 'spec' | 'slices' | 'adr', num?: string, label: string }} ReviewTarget */

/** @param {Feature} m */
const ready = (m) => !!m.protocol && /готов/i.test(m.protocol.status || '');
// Что ждёт ревью: неодобренные spec и slices, непринятые ADR фичи — по порядку этапов.
/** @param {Feature} m @returns {ReviewTarget[]} */
export function reviewTargets(m) {
  /** @type {ReviewTarget[]} */
  const out = [];
  if (m.spec && !approved(m.spec.status)) out.push({ mode: 'spec', label: `Требования «${m.spec.status || '—'}»` });
  if (m.slices.size && !approved(m.slicesStatus)) out.push({ mode: 'slices', label: `Части работы «${m.slicesStatus || '—'}»` });
  for (const a of pendingAdrs(m)) out.push({ mode: 'adr', num: a.num, label: `ADR ${a.num} «${a.status || '—'}»` });
  return out;
}
/** @param {Feature} m */
const canWriteSpec = (m) => ready(m) && !(m.spec && approved(m.spec.status));
/** @param {Feature} m */
const canSlice = (m) => !!m.spec && approved(m.spec.status) && !(m.slices.size && approved(m.slicesStatus));
/** @param {Feature} m */
const canWriteAdr = (m) => !!m.spec && (neededAdrs(m).length > 0 || pendingAdrs(m).length > 0 || !approved(m.slicesStatus));

// Фича подходит этапу: он у неё сейчас или ещё возможен.
/** @param {Feature} m @param {string} stage */
function eligible(m, stage) {
  if (stage === 'spec') return canWriteSpec(m);
  if (stage === 'slices') return canSlice(m);
  if (stage === 'adr') return canWriteAdr(m);
  if (stage === 'decide') return !!m.spec;
  if (stage === 'review') return reviewTargets(m).length > 0;
  if (stage === 'close') return tempArtifacts(m).length > 0;
  return false;
}
/** @type {Record<string, string>} */
const WHAT = {
  spec: 'подготовить требования',
  slices: 'разбить работу на части',
  adr: 'подготовить архитектурное решение (ADR)',
  decide: 'обновить документы по решению',
  review: 'проверить документы',
  close: 'завершить планирование перед слиянием ветки',
  build: 'начать реализацию',
};

// Короткое имя текущего этапа — для заданий сабагенту.
/** @param {Feature} m */
export function stageName(m) {
  if (!m.spec) return ready(m) ? 'Dev Spec' : 'brainstorming';
  if (!approved(m.spec.status)) return 'Dev Spec';
  if (!m.slices.size || !approved(m.slicesStatus)) return 'slices';
  if (pendingAdrs(m).length || neededAdrs(m).length) return 'ADR';
  return 'передача в реализацию';
}


// Фичу не назвали: одна подходит — берём её; несколько — вопрос; ни одной — этапы фич и стоп.
// argsFor(slug) — вызов, который повторить с выбранной фичей.
/**
 * @param {string} stage @param {(slug: string) => string[]} argsFor
 * @returns {{ dir: string, note: string, text?: undefined } | { text: string, dir?: undefined, note?: undefined }}
 */
export function chooseFeature(stage, argsFor) {
  const all = listFeatures().map((f) => loadFeature(path.join(DOCS, f)));
  const ok = all.filter((m) => eligible(m, stage));
  if (ok.length === 1) return { dir: ok[0].dir, note: `Задача не указана — беру единственную, где можно ${WHAT[stage]}: ${rel(ok[0].dir)}.` };
  if (!ok.length) {
    return {
      text: screen(
        blocks(
          `Задач, где можно ${WHAT[stage]}, нет.`,
          all.length ? `Задачи и этапы:\n${list(all.map((m) => `${m.name} — ${stageOf(m).now}`))}` : `В ${DOCS}/ пока нет задач.`,
          `Новая задача начинается с ${skillCode('sdd-grill')}.`,
        ),
        G.stop,
      ),
    };
  }
  const more = ok.slice(4).map((m) => m.name);
  const q = {
    header: 'Задача',
    question: `Какую задачу берём — ${WHAT[stage]}?${more.length ? ` Другие: ${more.join(', ')} — напишите имя.` : ''}`,
    options: ok.slice(0, 4).map((m) => ({ id: m.name, label: m.name, description: stageOf(m).now })),
  };
  return { text: pickText('Задача не указана.', q, argsFor('<id>')) };
}

// Строка человеку в начале этапа: что сейчас будет и где он решает.
/** @type {Record<string, (dir: string, m: Feature) => string>} */
const HELLO = {
  spec: (d) => `Готовлю требования по ${d}: только решения из протокола, ничего от себя. В конце — проверка ИИ и ваше одобрение. ` +
    'FR — функциональные требования, NFR — нефункциональные.',
  slices: (d, m) =>
    m.slices.size || m.plan
      ? `Продолжаю разбиение работы по ${d} с того места, где остановились.`
      : `Разбиваю работу по ${d} на законченные части с проверяемым результатом. Сначала покажу план; файлы появятся после вашего «да».`,
  adr: (d) => `Архитектурное решение (ADR) по ${d}: сначала проверю, нужно ли оно; если нужно — дам 2–3 варианта, выбираете вы.`,
  decide: (d) => `Обновляю протокол, требования и критерии приёмки по решению для ${d}; в конце покажу, что изменилось.`,
};
/** @param {Feature} m @param {string} stage */
export const helloLine = (m, stage) => (HELLO[stage] ? HELLO[stage](rel(m.dir), m) : null);

// Ворота закрыты: не тупик, а вопрос этапа — что сделать сейчас (продолжить прошлый этап, одобрить, ревью).
// Ворота закрыты, а вопроса этапа нет (build читает зона реализации): человеку — что сделать, агенту — стоп.
/** @param {string} stage @param {[string, string]} closed что закрыло ворота и что сделать */
export const closedScreen = (stage, closed) => screen(`Пока нельзя ${WHAT[stage]}: ${closed[0]}. ${closed[1]}`, G.stop);
/** @param {Feature} m @param {string} stage @param {[string, string]} closed */
export function closedText(m, stage, closed) {
  const { stage: now, questions } = askOf(m);
  return viewText(questionsView(rel(m.dir), now, questions, { lead: `Пока нельзя ${WHAT[stage]}: ${closed[0]}. ${closed[1]}` }));
}
