// Вопрос человеку на этапе: варианты с рекомендацией и задания для них (ask / choose).
// @ts-check
import { pendingAdrs } from './adr.mjs';
import { showCmd, skill } from './config.mjs';
import { neededAdrs, stubCount } from './cut.mjs';
import { errorsOf } from './findings.mjs';
import { rel, approved, plural } from './md.mjs';
import { checkPlan } from './plan-rules.mjs';
import { planPreview } from './plan.mjs';
import { questionsView } from './question.mjs';
import { G } from './screen.mjs';
import { artifactQuestion } from './review-walk.mjs';
import { tempArtifacts, stageOf } from './stage.mjs';

/** @typedef {import('./model.mjs').Feature} Feature */
/** @typedef {import('./question.mjs').Question} Question */
/** @typedef {import('./question.mjs').Option} Option */

// Что спросить в конце этапа и что сделать по ответу — данные скрипта, а не текст для модели.
// Агент задаёт вопросы из ask инструментом выбора и передаёт id варианта в choose.
// Действие: lint — выполняет choose (after — что дальше, retry — при коде 2 переспросить);
// subagent — args sdd_lint для сабагента, say — что сказать человеку (без сабагентов: here — тот же скилл
// здесь, fallback — текст человеку; snapshot — снимок, который choose снимает сам до задачи; next — вызов
// после сабагента, по умолчанию ask; quiet — отчёт сабагента не пересказывать);
// here — скилл в этом окне; show — команда, которую человек запускает сам; wait — вопрос, на который
// человек отвечает словами: агент передаёт ответ в then, choose исполняет answer(ответ); none — ничего.
// Варианты разбора ревью и одобрения — в review-walk.mjs.
// Новый этап — рекомендуем новый контекст: flash-модели и заполненное окно тянут хвост
// прошлого этапа. Продолжение того же этапа (cont) — здесь: контекст ещё нужен.
/** @param {Feature} m @param {string} now @param {string} name @param {string} label @returns {Question} */
function nextSkillQuestion(m, now, name, label, cont = false) {
  /** @type {Option} */
  const here = { id: `here:${name}`, label: 'В этой сессии', description: skill(name, m.name), action: { here: ['prompt', name, m.name] } };
  /** @type {Option} */
  const fresh = {
    id: `window:${name}`,
    label: 'В новой сессии',
    description: `${skill(name, m.name)} — запустите команду сами в новой сессии`,
    action: { show: showCmd(skill(name, m.name)) },
  };
  const options = cont ? [here, fresh] : [fresh, here];
  options[0].recommended = true;
  return { header: 'Следующий этап', question: `${now}. ${label}?`, options };
}
// Согласие с планом нарезки: «Да» создаёт файлы скриптом (gen slices), а не руками агента.
// «Поправить нарезку» — одинаковый вариант при ошибках плана и без них.
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
        id: 'plan:yes',
        label: 'Да, создать файлы частей работы',
        description: `скрипт создаст ${plural(n, 'файл', 'файла', 'файлов')} по плану, затем агент заполнит критерии приёмки (AC)`,
        recommended: true,
        action: {
          lint: ['gen', 'slices', dir],
          after: [`${G.skill} sdd-slices с шага «Заполни заготовки»`, `скилла нет в контексте — ${G.call(['prompt', 'sdd-slices', m.name])}`],
        },
      },
      edit,
    ],
  };
}
// ADR, который slice ждёт, но его ещё нет: «Р1 — ADR: <тема>».
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
const adrQuestions = (m) => [...newAdrQuestions(m), ...pendingAdrs(m).map((a) => artifactQuestion(m, 'adr', a.num))];

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
  if (m.plan) return [planQuestion(/** @type {Feature & { plan: import('./model.mjs').Plan }} */ (m))];
  return [nextSkillQuestion(m, now, 'sdd-slices', 'Разбить работу на части'), ...adrQuestions(m)];
}

/** @param {Feature} m @param {string} now @returns {Question[]} */
function protocolQuestions(m, now) {
  if (m.protocol && /готов/i.test(m.protocol.status || '')) return [nextSkillQuestion(m, now, 'sdd-spec', 'Подготовить требования')];
  if (m.protocol) return [nextSkillQuestion(m, now, 'sdd-grill', 'Продолжить обсуждение задачи', true)];
  return [nextSkillQuestion(m, now, 'sdd-grill', 'Начать обсуждение задачи')];
}

// Пока план не согласован или заготовки не заполнены — один вопрос: решение о нарезке важнее ADR, их черёд после.
/** @param {Feature} m @returns {{ stage: string, questions: Question[] }} */
export function askOf(m) {
  const st = stageOf(m);
  let qs = m.slices.size ? slicesQuestions(m, st.now) : specQuestions(m, st.now);
  // Разбор находок и открытых вопросов идёт по одному пункту: соседние вопросы этапа — после него.
  const walk = qs.find((q) => q.walk);
  if (walk) qs = [walk];
  // Инструменты выбора берут до 4 вопросов за раз; остальные ADR — следующим вопросом.
  return { stage: st.now, questions: qs.slice(0, 4) };
}

// Вопросы этапа. Действия в вывод не идут: их выполняет choose по id.
// Человек видит карточку вопроса, агент — строку ⚙: заголовки для инструмента выбора и id по номерам.
/** @param {Feature} m */
export function askView(m) {
  const { stage, questions } = askOf(m);
  return questionsView(rel(m.dir), stage, questions);
}
