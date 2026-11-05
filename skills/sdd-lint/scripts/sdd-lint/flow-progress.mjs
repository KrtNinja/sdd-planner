// Доступные действия и рекомендации из документов; не хранит этап и не выполняет переходы.
// @ts-check
import { approved, rel, plural } from './md.mjs';
import { runChecks } from './feature.mjs';
import { lintCmd, skillCode, lintCode, skill, showCmd } from './config.mjs';
import { registryQuestions, questionPending, fileQuestionBlockers, independentDrafts } from './registry-view.mjs';
import { checkTech, currentFindings, techFiles } from './tech.mjs';
import { scenarioFiles, hasScenarios } from './scenario-section.mjs';

import { scenarioMoveQuestion } from './scenario-view.mjs';
import { decisionQuestion } from './decision-view.mjs';
import { pendingAdrs } from './adr.mjs';
import { neededAdrs, stubCount } from './cut.mjs';
import { errorsOf } from './findings.mjs';
import { checkPlan } from './plan-rules.mjs';
import { planPreview, planChoiceId } from './plan.mjs';
import { nextSkillQuestion } from './question.mjs';
import { G } from './screen.mjs';
import { artifactQuestion } from './review-walk.mjs';
import { tempArtifacts } from './work.mjs';
/** @typedef {import('./model.mjs').Feature} Feature */
/** @typedef {import('./question.mjs').Question} Question */
/** @typedef {import('./question.mjs').Option} Option */

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
  if (!hasScenarios(m))
    return { skill: 'sdd-scenarios', label: 'Описать путь пользователя и применимые развилки' };
  if (checkTech(m).length) return { skill: 'sdd-tech', label: 'Подготовить архитектурное решение' };
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

/** @type {Option} */
const PLAN_EDIT = {
  id: 'plan:edit',
  label: 'Изменить план разбиения',
  description: 'напишите, какие части работы объединить или разделить',
  action: { show: 'Что изменить в плане? Напишите, какие части работы объединить или разделить, — поправлю план и покажу снова.' },
};
/** @param {Feature & { plan: import('./model.mjs').Plan }} m @returns {Question} */
function planQuestion(m) {
  const dir = rel(m.dir);
  const errs = errorsOf(checkPlan(m)).length;
  const n = m.plan.slices.length;
  const edit = PLAN_EDIT;
  if (errs) {
    return {
      header: 'План разбиения работы',
      question: `Автоматическая проверка нашла ошибки в плане: ${errs}. Исправить?`,
      options: [
        {
          id: 'plan:continue',
          label: 'Исправить план здесь',
          description: skill('sdd-slices', m.name),
          recommended: true,
          action: { here: ['prompt', 'sdd-slices', m.name] },
        },
        edit,
      ],
    };
  }
  return {
    header: 'План разбиения работы',
    question: `Частей работы: ${n} (план выше). Подходит?`,
    preview: planPreview(m),
    options: [
      {
        id: planChoiceId(m),
        label: 'Да, создать файлы частей работы',
        description: `скрипт создаст ${plural(n, 'файл', 'файла', 'файлов')} по плану, затем агент заполнит критерии приёмки (AC)`,
        recommended: true,
        action: {
          lint: ['gen', 'slices', dir, planChoiceId(m)],
          after: [`${G.skill} sdd-slices с шага «Заполни заготовки»`, `скилла нет в контексте — ${G.call(['prompt', 'sdd-slices', m.name])}`],
        },
      },
      edit,
    ],
  };
}
/** @param {Feature} m @returns {Question[]} */
function newAdrQuestions(m) {
  return neededAdrs(m).map((x) => ({
    header: 'Нужен ADR',
    question: `Для части работы ${x.num} нужно архитектурное решение (ADR) «${x.topic}». Подготовить его?`,
    options: [
      {
        id: `adr-here:${x.num}`,
        label: 'Написать ADR здесь',
        description: skill('sdd-adr', m.name, `"${x.topic}"`),
        recommended: true,
        action: { here: ['prompt', 'sdd-adr', m.name, x.topic] },
      },
      {
        id: `adr-window:${x.num}`,
        label: 'В новой сессии',
        description: 'вы запускаете команду сами',
        action: { show: showCmd(skill('sdd-adr', m.name, `"${x.topic}"`)) },
      },
      { id: `adr-later:${x.num}`, label: 'Позже', description: 'ничего не делать', action: { none: true } },
    ],
  }));
}
/** @param {Feature} m @returns {Question[]} */
const adrQuestions = (m) => m.flow.state ? [] : [...newAdrQuestions(m), ...pendingAdrs(m).map((a) => artifactQuestion(m, 'adr', a.num))];

/** @param {Feature} m @param {string} now @returns {Question[]} */
function completedQuestions(m, now) {
  const qs = adrQuestions(m);
  if (qs.length || !tempArtifacts(m).length) return qs;
  return [
    {
      header: 'Перед слиянием ветки',
      question: `${now}. Убрать временные файлы этапа: ${tempArtifacts(m).join(', ')}?`,
      options: [
        {
          id: 'close',
          label: 'Убрать временные файлы',
          description: skill('sdd-close', m.name),
          recommended: true,
          // close без --yes ничего не удаляет: показывает, что уйдёт и чем это грозит, и задаёт второй вопрос.
          action: { lint: ['close', rel(m.dir), '--json'] },
        },
        { id: 'later', label: 'Позже', description: 'ничего не делать', action: { none: true } },
      ],
    },
  ];
}

/** @param {Feature} m @param {string} now @returns {Question[]} */
function slicesQuestions(m, now) {
  if (m.spec && !approved(m.spec.status)) return [artifactQuestion(m, 'spec'), ...adrQuestions(m)];
  if (approved(m.slicesStatus)) return completedQuestions(m, now);
  if (stubCount(m)) return [nextSkillQuestion(m, now, 'sdd-slices', 'Продолжить заполнение', true)];
  return [artifactQuestion(m, 'slices'), ...adrQuestions(m)];
}

/** @param {Feature} m @param {string} now @returns {Question[]} */
function specQuestions(m, now) {
  if (!m.spec) return protocolQuestions(m, now);

  if (!approved(m.spec.status)) return [artifactQuestion(m, 'spec'), ...adrQuestions(m)];
  if (m.flow.state && planningGateClosed(m, 'slices', runChecks(m)))
    return [repairQuestion(m, 'Сначала исправьте ошибки в согласованном комплекте.')];
  if (m.plan) return [planQuestion(/** @type {Feature & { plan: import('./model.mjs').Plan }} */ (m))];
  return [nextSkillQuestion(m, now, 'sdd-slices', 'Разбить работу на части'), ...adrQuestions(m)];
}

/** @param {Feature} m @param {string} now @returns {Question[]} */
function protocolQuestions(m, now) {
  if (m.protocol && /готов/i.test(m.protocol.status || '')) {
    const blocked = planningGateClosed(m, 'spec', runChecks(m));
    if (m.flow.state && blocked) return [repairQuestion(m, blocked[1])];
    return [nextSkillQuestion(m, now, 'sdd-spec', 'Подготовить требования')];
  }
  if (m.protocol) return [nextSkillQuestion(m, now, 'sdd-grill', 'Продолжить обсуждение задачи', true)];
  return [nextSkillQuestion(m, now, 'sdd-grill', 'Начать обсуждение задачи')];
}

/** @param {Feature} m @param {string} now @returns {Question[]} */
export function flowQuestions(m, now) {
  const pending = registryQuestions(m).filter(questionPending);
  const prepared = pending.find((q) => q.fields.Пакет);
  if (prepared) return [decisionQuestion(m.dir, prepared)];
  const moving = scenarioMoveQuestion(m);
  if (moving) return [moving];
  if (pending.length) return pendingQuestions(m, pending);

  if (m.flow.state && errorsOf(currentFindings(m, runChecks(m))).length)
    return [repairQuestion(m, 'В подготовленных документах есть ошибки.')];
  const draft = flowDraftStep(m);
  let qs = draft ? [nextSkillQuestion(m, now, draft.skill, draft.label)] : questionsForStage(m, now);
  // Разбор находок и открытых вопросов идёт по одному пункту: соседние вопросы этапа — после него.
  const walk = qs.find((q) => q.walk);
  if (walk) qs = [walk];
  return qs.slice(0, 4);
}

/** @param {Feature} m @param {import('./flow-format.mjs').FlowRecord} q */
function answerOption(m, q) {
  return { id: `questions:resume:${q.id}`, label: `Обработать ответ: ${q.title}`, recommended: true,
    description: 'Ответ получен; нужно проверить его последствия до изменения документов.',
    action: { lint: ['questions', 'resume', rel(m.dir), JSON.stringify({ id: q.id })] } };
}

/** @param {Feature} m @param {string} now */
function questionsForStage(m, now) {
  return m.slices.size ? slicesQuestions(m, now) : specQuestions(m, now);
}

/** @param {Feature} m @param {import('./flow-format.mjs').FlowRecord[]} pending */
function pendingQuestions(m, pending) {
  const answers = pending.filter((q) => q.fields.Статус === 'answered').slice(0, 1).map((q) => answerOption(m, q));
  const drafts = independentDrafts(m).slice(0, 2).map((r) => draftOption(m, r));
  const options = [...answers, ...drafts,
    { id: 'questions:list', label: 'Посмотреть сводку', description: 'Уточните состояние и область влияния вопросов.',
      action: { lint: ['questions', 'list', rel(m.dir)] } },
    { id: 'questions:later', label: 'Вернуться позже', action: { none: /** @type {const} */ (true) } }];
  options[0].recommended = true;
  return [{
    header: 'Работа продолжается', question: `Нерешённых вопросов: ${pending.length}. Что делаем дальше?`,
    options,
  }];
}
/** @typedef {import('./model.mjs').Finding} Finding */
/** @param {Finding[]} found @param {string[]} files */
const errorsIn = (found, files) => found.filter((x) => x.level === 'err' && files.map(rel).includes(x.file));
/** @param {Feature} m @param {Finding[]} found @returns {[string, string] | null} */
function specGate(m, found) {
  if (!m.protocol) return ['нет brainstorming.md', `Сначала обсудите задачу: ${skillCode('sdd-grill', m.name)}`];
  else if (!/готов/i.test(m.protocol.status || ''))
    return [`статус протокола «${m.protocol.status || '—'}»`, `Сначала закончите обсуждение задачи: ${skillCode('sdd-grill', m.name)}`];
  else if (errorsIn(found, [m.protocolFile]).length)
    return ['ошибки в протоколе', `Автоматическая проверка нашла ошибки в протоколе — поправьте его, список: ${lintCode(rel(m.dir))}`];
  return null;
}

/** @param {Feature} m @param {Finding[]} found @returns {[string, string] | null} */
function slicesGate(m, found) {
  const dir = rel(m.dir);
  if (!m.spec) return ['нет spec.md', `Сначала подготовьте требования: ${skillCode('sdd-spec', m.name)}`];
  else if (!approved(m.spec.status)) return [`статус требований «${m.spec.status || '—'}»`, `Сначала одобрите spec.md: ${lintCode('approve', 'spec', dir)}`];
  else if (errorsIn(found, [m.protocolFile, m.specFile]).length)
    return ['ошибки в протоколе или требованиях', `Исправьте ошибки в протоколе или требованиях и одобрите требования заново, список: ${lintCode(dir)}`];
  return bundleGate(m, found);
}

// Повторяется и при прямом gen: одобрение не отменяет новые ошибки или зависимые вопросы.
/** @param {Feature} m @param {Finding[]} found @returns {[string, string] | null} */
function bundleGate(m, found) {
  if (!m.flow.state) return null;
  const files = [m.specFile, ...scenarioFiles(m).map((d) => d.file), ...techFiles(m).map((d) => d.file)];
  if (fileQuestionBlockers(m, files).length) return ['есть зависимые вопросы', 'Завершите обработку ответов до создания частей работы'];
  if (flowDraftStep(m) || errorsIn(found, files).length || found.some((f) => /^(FL|QU)-/.test(f.rule)))
    return ['комплект не готов', 'Завершите черновики и исправьте ошибки комплекта'];
  return null;
}

/** @param {Feature} m @param {string} stage @param {Finding[]} found @returns {[string, string] | null} */
export function planningGateClosed(m, stage, found) {
  return stage === 'spec' ? specGate(m, found) : slicesGate(m, found);
}

/** @param {Feature} m @param {string} reason @returns {Question} */
function repairQuestion(m, reason) {
  return { header: 'Исправление документов', question: reason,
    options: [{ id: 'flow:check', label: 'Посмотреть ошибки', recommended: true,
      description: 'Ошибки препятствуют переходу; сначала нужно исправить документы.',
      action: { lint: ['check', rel(m.dir)] } }] };
}

/** @param {Feature} m */
export function flowStage(m) {
  const now = 'Подготовка документов';
  const questions = flowQuestions(m, now);
  const options = questions.flatMap((q) => q.options);
  const next = questions.map((q) => q.question);
  return { now, next, tip: options.length ? lintCmd('ask', rel(m.dir)) : null, questions };
}

/** @param {Feature} m @param {{id: string, title: string}} r @returns {Option} */
function draftOption(m, r) {
  return { id: `questions:work:${r.id}`, label: `Продолжить черновик: ${r.title}`,
    description: 'Эта область не зависит от нерешённых вопросов.',
    action: { here: ['prompt', r.id.startsWith('SC-') ? 'sdd-scenarios' : 'sdd-spec', m.name, `draft:${r.id}`] } };
}
