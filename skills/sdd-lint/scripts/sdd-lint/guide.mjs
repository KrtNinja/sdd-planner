// Ведение по этапам: какую фичу взять, если её не назвали; что сказать человеку в начале этапа;
// вопрос «что дальше» вместо тупика у закрытых ворот. Человек может не знать процесса — подсказывает скрипт.
import path from 'node:path';

import { pendingAdrs } from './adr.mjs';
import { askView, lintArgs } from './ask.mjs';
import { skill } from './config.mjs';
import { neededAdrs } from './cut.mjs';
import { loadFeature } from './feature.mjs';
import { approved, rel } from './md.mjs';
import { DOCS, listFeatures } from './pick.mjs';
import { stageOf, tempArtifacts } from './stage.mjs';

const ready = (m) => !!m.protocol && /готов/i.test(m.protocol.status || '');
// Что ждёт ревью: неодобренные spec и slices, непринятые ADR фичи — по порядку этапов.
export function reviewTargets(m) {
  const out = [];
  if (m.spec && !approved(m.spec.status)) out.push({ mode: 'spec', label: `Dev Spec «${m.spec.status || '—'}»` });
  if (m.slices.size && !approved(m.slicesStatus)) out.push({ mode: 'slices', label: `slices «${m.slicesStatus || '—'}»` });
  for (const a of pendingAdrs(m)) out.push({ mode: 'adr', num: a.num, label: `ADR ${a.num} «${a.status || '—'}»` });
  return out;
}
// Фича подходит этапу: он у неё сейчас или ещё возможен.
function eligible(m, stage) {
  if (stage === 'spec') return ready(m) && !(m.spec && approved(m.spec.status));
  if (stage === 'slices') return !!m.spec && approved(m.spec.status) && !(m.slices.size && approved(m.slicesStatus));
  if (stage === 'adr') return !!m.spec && (neededAdrs(m).length > 0 || pendingAdrs(m).length > 0 || !approved(m.slicesStatus));
  if (stage === 'decide') return !!m.spec;
  if (stage === 'review') return reviewTargets(m).length > 0;
  if (stage === 'close') return tempArtifacts(m).length > 0;
  return false;
}
const WHAT = { spec: 'писать Dev Spec', slices: 'резать slices', adr: 'писать ADR', decide: 'проводить решение', review: 'делать ревью', close: 'закрывать перед merge' };

// Короткое имя текущего этапа — для заданий сабагенту.
export function stageName(m) {
  if (!m.spec) return ready(m) ? 'Dev Spec' : 'brainstorming';
  if (!approved(m.spec.status)) return 'Dev Spec';
  if (!m.slices.size || !approved(m.slicesStatus)) return 'slices';
  if (pendingAdrs(m).length || neededAdrs(m).length) return 'ADR';
  return 'передача в реализацию';
}

// Вопрос с вариантами, ответ на который агент передаёт в sdd_lint с args then (<id> — id варианта).
export function pickView(q, then) {
  let n = 0;
  const options = q.options.map(({ action: _a, ...o }) => ({ n: ++n, ...o, label: o.recommended ? `${o.label} (рекомендую)` : o.label }));
  const text = [q.question, ...options.map((o) => `${o.n}. ${o.label}${o.description ? ` — ${o.description}` : ''}`)].join('\n');
  const instruction =
    'Задай questions инструментом выбора как есть: текст, порядок, варианты и «(рекомендую)» не меняй, своих не добавляй. ' +
    'Инструмента выбора нет — выведи text дословно и жди ответа. ' +
    `Выбран вариант — sdd_lint с args ${lintArgs(then)}: вместо <id> — id варианта (ответ номером — id варианта с этим n); дальше — по скиллу. ` +
    'Человек ответил своими словами — передай их вместо <id>. Вариант за человека не выбирай.';
  return { instruction, questions: [{ ...q, options }], text };
}
export const pickText = (lead, q, then) => [lead, JSON.stringify(pickView(q, then), null, 2)].join('\n');

// Фичу не назвали: одна подходит — берём её; несколько — вопрос; ни одной — этапы фич и стоп.
// argsFor(slug) — вызов, который повторить с выбранной фичей.
export function chooseFeature(stage, argsFor) {
  const all = listFeatures().map((f) => loadFeature(path.join(DOCS, f)));
  const ok = all.filter((m) => eligible(m, stage));
  if (ok.length === 1) return { dir: ok[0].dir, note: `Фича не указана — беру единственную, где можно ${WHAT[stage]}: ${rel(ok[0].dir)}.` };
  if (!ok.length) {
    const lines = all.map((m) => `- ${m.name} — ${stageOf(m).now}`);
    return {
      text: [
        `Фич, где можно ${WHAT[stage]}, нет.`,
        ...(all.length ? ['Фичи и этапы:', ...lines] : [`В ${DOCS}/ пока нет фич.`]),
        `Скажи это человеку одним сообщением, добавь: «Новая фича начинается с ${skill('sdd-grill')}». Остановись.`,
      ].join('\n'),
    };
  }
  const more = ok.slice(4).map((m) => m.name);
  const q = {
    header: 'Фича',
    question: `Какую фичу берём — ${WHAT[stage]}?${more.length ? ` Другие: ${more.join(', ')} — напишите имя.` : ''}`,
    options: ok.slice(0, 4).map((m) => ({ id: m.name, label: m.name, description: stageOf(m).now })),
  };
  return { text: pickText('Фича не указана. Задай вопрос — как сказано в instruction:', q, argsFor('<id>')) };
}

// Строка человеку в начале этапа: что сейчас будет и где он решает.
const HELLO = {
  spec: (d) => `Пишу Dev Spec по ${d}: только решения из протокола, ничего от себя. В конце — ревью и одобрение, решаете вы.`,
  slices: (d, m) =>
    m.slices.size || m.plan
      ? `Продолжаю slices по ${d} с того места, где остановились.`
      : `Режу ${d} на slices: сначала покажу план нарезки, файлы появятся после вашего «да».`,
  adr: (d) => `ADR по ${d}: сначала проверю, нужен ли он; нужен — дам 2–3 варианта, выбираете вы.`,
  decide: (d) => `Провожу решение по ${d} сверху вниз: протокол → FR → AC; в конце покажу, что изменилось.`,
};
export const helloLine = (m, stage) => (HELLO[stage] ? `Скажи человеку одной строкой: «${HELLO[stage](rel(m.dir), m)}»` : null);

// Ворота закрыты: не тупик, а вопрос этапа — что сделать сейчас (продолжить прошлый этап, одобрить, ревью).
export const closedText = (m, stage, closed) =>
  [
    `ВОРОТА ${stage}: закрыты — ${closed[0]}.`,
    `Скажи человеку одной строкой: «${closed[1]}». Затем задай вопрос этапа — как сказано в instruction: он предложит, что сделать сейчас.`,
    JSON.stringify(askView(m), null, 2),
  ].join('\n');
