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
  const here = { id: `here:${name}`, label: 'Здесь, в этом окне', description: skill(name, m.name), action: { here: ['prompt', name, m.name] } };
  /** @type {Option} */
  const fresh = {
    id: `window:${name}`,
    label: 'В новом контексте/окне',
    description: `${skill(name, m.name)} — запускаете сами, чистый контекст`,
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
  label: 'Поправить нарезку',
  description: 'напишите, что склеить или разрезать',
  action: { show: 'Что поправить в нарезке? Напишите, какие slices склеить или разрезать, — поправлю план и покажу снова.' },
};
/** @param {Feature & { plan: import('./model.mjs').Plan }} m @returns {Question} */
function planQuestion(m) {
  const dir = rel(m.dir);
  const errs = errorsOf(checkPlan(m)).length;
  const n = m.plan.slices.length;
  const edit = PLAN_EDIT;
  if (errs) {
    return {
      header: 'План нарезки',
      question: `В плане нарезки ошибки lint: ${errs}. Исправить?`,
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
    header: 'План нарезки',
    question: `Нарезка на ${n} slices (план выше). Подходит?`,
    preview: planPreview(m),
    options: [
      {
        id: 'plan:yes',
        label: 'Да, создать файлы slices',
        description: `скрипт создаст ${plural(n, 'файл', 'файла', 'файлов')} по плану, затем агент заполнит AC`,
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
    question: `Slice ${x.num} ждёт решения «${x.topic}», ADR ещё нет. Написать?`,
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
        label: 'В новом контексте/окне',
        description: 'вы запускаете команду сами',
        action: { show: showCmd(skill('sdd-adr', m.name, `"${x.topic}"`)) },
      },
      { id: `adr-later:${x.num}`, label: 'Позже', description: 'ничего не делать', action: { none: true } },
    ],
  }));
}
// Пока план не согласован или заготовки не заполнены — один вопрос: решение о нарезке важнее ADR, их черёд после.
/** @param {Feature} m @returns {{ stage: string, questions: Question[] }} */
export function askOf(m) {
  const st = stageOf(m);
  const adrQs = () => [...newAdrQuestions(m), ...pendingAdrs(m).map((a) => artifactQuestion(m, 'adr', a.num))];
  /** @type {Question[]} */
  let qs = [];
  if (m.slices.size && m.spec && !approved(m.spec.status)) qs = [artifactQuestion(m, 'spec'), ...adrQs()];
  else if (m.slices.size && approved(m.slicesStatus)) {
    qs = adrQs();
    if (!qs.length && tempArtifacts(m).length)
      qs = [
        {
          header: 'Перед merge',
          question: `${st.now}. Убрать временные артефакты этапа: ${tempArtifacts(m).join(', ')}?`,
          options: [
            {
              id: 'close',
              label: 'Убрать временные артефакты',
              description: skill('sdd-close', m.name),
              recommended: true,
              // close без --yes ничего не удаляет: показывает, что уйдёт и чем это грозит, и задаёт второй вопрос.
              action: { lint: ['close', rel(m.dir), '--json'] },
            },
            { id: 'later', label: 'Позже', description: 'ничего не делать', action: { none: true } },
          ],
        },
      ];
  } else if (m.slices.size && stubCount(m)) qs = [nextSkillQuestion(m, st.now, 'sdd-slices', 'Продолжить заполнение', true)];
  else if (m.slices.size) qs = [artifactQuestion(m, 'slices'), ...adrQs()];
  else if (m.plan && m.spec && approved(m.spec.status)) qs = [planQuestion(/** @type {Feature & { plan: import('./model.mjs').Plan }} */ (m))];
  else if (m.spec && approved(m.spec.status)) qs = [nextSkillQuestion(m, st.now, 'sdd-slices', 'Резать slices'), ...adrQs()];
  else if (m.spec) qs = [artifactQuestion(m, 'spec'), ...adrQs()];
  else if (m.protocol && /готов/i.test(m.protocol.status || '')) qs = [nextSkillQuestion(m, st.now, 'sdd-spec', 'Писать Dev Spec')];
  else if (m.protocol) qs = [nextSkillQuestion(m, st.now, 'sdd-grill', 'Продолжить brainstorming', true)];
  else qs = [nextSkillQuestion(m, st.now, 'sdd-grill', 'Начать brainstorming')];
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
