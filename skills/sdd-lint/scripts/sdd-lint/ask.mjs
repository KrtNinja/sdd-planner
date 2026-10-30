// Вопрос человеку на этапе: варианты с рекомендацией и задания для них (ask / choose).
import { pendingAdrs } from './adr.mjs';
import { skill } from './config.mjs';
import { neededAdrs, stubCount } from './cut.mjs';
import { findings } from './findings.mjs';
import { rel, approved, plural } from './md.mjs';
import { checkPlan, planPreview } from './plan.mjs';
import { lintArgs, questionsView } from './question.mjs';
import { artifactQuestion } from './review-walk.mjs';
import { tempArtifacts, stageOf } from './stage.mjs';

// Что спросить в конце этапа и что сделать по ответу — данные скрипта, а не текст для модели.
// Агент задаёт вопросы из ask инструментом выбора и передаёт id варианта в choose.
// Действие: lint — выполняет choose (after — что дальше, retry — при коде 2 переспросить);
// subagent — задача сабагенту (без сабагентов: here — тот же скилл здесь, fallback — команда человеку;
// snapshot — снимок, который choose снимает сам до задачи; next — вызов после сабагента, по умолчанию ask);
// here — скилл в этом окне; show — команда, которую человек запускает сам; wait — вопрос, на который
// человек отвечает словами: агент передаёт ответ в then, choose исполняет answer(ответ); none — ничего.
// Варианты разбора ревью и одобрения — в review-walk.mjs.
export const CLOSE_AFTER = 'Это ещё не удаление: выполни instruction из вывода — выведи preview и задай вопрос подтверждения.';
// Новый этап — рекомендуем новый контекст: flash-модели и заполненное окно тянут хвост
// прошлого этапа. Продолжение того же этапа (cont) — здесь: контекст ещё нужен.
function nextSkillQuestion(m, now, name, label, cont = false) {
  const here = { id: `here:${name}`, label: 'Здесь, в этом окне', description: skill(name, m.name), action: { here: ['prompt', name, m.name] } };
  const fresh = { id: `window:${name}`, label: 'В новом контексте/окне', description: `${skill(name, m.name)} — запускаете сами, чистый контекст`, action: { show: skill(name, m.name) } };
  const options = cont ? [here, fresh] : [fresh, here];
  options[0].recommended = true;
  return { header: 'Следующий этап', question: `${now}. ${label}?`, options };
}
// Согласие с планом нарезки: «Да» создаёт файлы скриптом (gen slices), а не руками агента.
function planQuestion(m) {
  const dir = rel(m.dir);
  const saved = findings.splice(0);
  checkPlan(m);
  const errs = findings.filter((x) => x.level === 'err').length;
  findings.splice(0, findings.length, ...saved);
  const n = m.plan.slices.length;
  const edit = {
    id: 'plan:edit',
    label: 'Поправить нарезку',
    description: 'напишите, что склеить или разрезать',
    action: { show: 'Что поправить в нарезке? Напишите, какие slices склеить или разрезать, — поправлю план и покажу снова.' },
  };
  if (errs) {
    return {
      header: 'План нарезки',
      question: `В плане нарезки ошибки lint: ${errs}. Исправить?`,
      options: [{ id: 'plan:continue', label: 'Исправить план здесь', description: skill('sdd-slices', m.name), recommended: true, action: { here: ['prompt', 'sdd-slices', m.name] } }, edit],
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
          after:
            'Скажи человеку одной строкой, какие файлы созданы, и продолжай нарезку с шага «Заполни заготовки». ' +
            `Скилла sdd-slices нет в контексте — вызови sdd_lint с args ${lintArgs(['prompt', 'sdd-slices', m.name])} и выполняй его с этого шага.`,
        },
      },
      edit,
    ],
  };
}
// ADR, который slice ждёт, но его ещё нет: «Р1 — ADR: <тема>».
function newAdrQuestions(m) {
  return neededAdrs(m).map((x) => ({
    header: 'Нужен ADR',
    question: `Slice ${x.num} ждёт решения «${x.topic}», ADR ещё нет. Написать?`,
    options: [
      { id: `adr-here:${x.num}`, label: 'Написать ADR здесь', description: skill('sdd-adr', m.name, `"${x.topic}"`), recommended: true, action: { here: ['prompt', 'sdd-adr', m.name, x.topic] } },
      { id: `adr-window:${x.num}`, label: 'В новом контексте/окне', description: 'вы запускаете команду сами', action: { show: skill('sdd-adr', m.name, `"${x.topic}"`) } },
      { id: `adr-later:${x.num}`, label: 'Позже', description: 'ничего не делать', action: { none: true } },
    ],
  }));
}
// Пока план не согласован или заготовки не заполнены — один вопрос: решение о нарезке важнее ADR, их черёд после.
export function askOf(m) {
  const st = stageOf(m);
  const adrQs = () => [...newAdrQuestions(m), ...pendingAdrs(m).map((a) => artifactQuestion(m, 'adr', a.num))];
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
              action: { lint: ['close', rel(m.dir), '--json'], after: CLOSE_AFTER },
            },
            { id: 'later', label: 'Позже', description: 'ничего не делать', action: { none: true } },
          ],
        },
      ];
  } else if (m.slices.size && stubCount(m)) qs = [nextSkillQuestion(m, st.now, 'sdd-slices', 'Продолжить заполнение', true)];
  else if (m.slices.size) qs = [artifactQuestion(m, 'slices'), ...adrQs()];
  else if (m.plan && m.spec && approved(m.spec.status)) qs = [planQuestion(m)];
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
// Как задать вопрос, вывод говорит сам (instruction): правило приходит в момент действия,
// а не из контекста агента. text — тот же вопрос списком для агента без инструмента выбора.
export function askView(m) {
  const { stage, questions } = askOf(m);
  return questionsView(rel(m.dir), stage, questions);
}
