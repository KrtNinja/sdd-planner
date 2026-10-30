// Вопрос человеку на этапе: варианты с рекомендацией и задания для них (ask / choose).
import { pendingAdrs } from './adr.mjs';
import { skill, lintCmd } from './config.mjs';
import { neededAdrs, stubCount } from './cut.mjs';
import { findings } from './findings.mjs';
import { rel, approved, plural } from './md.mjs';
import { checkPlan, planPreview } from './plan.mjs';
import { openBlockers, reviewKey } from './review.mjs';
import { blockersStep, scaffolding, stageOf } from './stage.mjs';

// Что спросить в конце этапа и что сделать по ответу — данные скрипта, а не текст для модели.
// Агент задаёт вопросы из ask инструментом выбора и передаёт id варианта в choose.
// Действие: lint — выполняет choose; subagent — задача сабагенту (fallback — команда человеку,
// если сабагентов нет; snapshot — снимок, который choose снимает сам до задачи);
// here — скилл в этом окне; show — команда, которую человек запускает сам; none — ничего.
export const lintArgs = (args) => JSON.stringify(args);
const fetchTask = (args, tail) => `Вызови инструмент sdd_lint с args ${lintArgs(args)} и выполни то, что он вернёт.${tail ? ` ${tail}` : ''}`;
function artifactQuestion(m, what, num) {
  const key = what === 'adr' ? reviewKey('adr', num) : what;
  const a = what === 'adr' ? m.featureAdrs.find((x) => x.num === num) : null;
  const dir = rel(m.dir);
  const rv = m.reviews.get(key);
  const open = openBlockers(rv);
  const target = what === 'spec' ? rel(m.specFile) : what === 'slices' ? dir : rel(a.file);
  const files = what === 'slices' ? `каждому файлу в ${dir}/slices/` : target;
  const name = what === 'spec' ? 'Dev Spec' : what === 'slices' ? 'Slices' : `ADR ${num}`;
  const status = what === 'spec' ? m.spec.status : what === 'slices' ? m.slicesStatus : a.status;
  const rest = [what, num].filter(Boolean);
  const reviewHere = {
    id: `review-here:${key}`,
    label: rv ? 'Повторить ревью здесь' : 'Ревью здесь, в сабагенте',
    description: `свежий контекст, находки — в ${dir}/review/${key}.md`,
    action: { subagent: fetchTask(['prompt', 'sdd-review', m.name, ...rest]), fallback: skill('sdd-review', m.name, ...rest) },
  };
  const reviewWindow = {
    id: `review-window:${key}`,
    label: 'Ревью в новом контексте/окне',
    description: 'вы запускаете команду сами',
    action: { show: skill('sdd-review', m.name, ...rest) },
  };
  const humanize = {
    id: `humanize:${key}`,
    label: 'Убрать следы ИИ из прозы',
    description: 'humanizer в сабагенте, затем guard',
    action: {
      snapshot: target,
      subagent:
        `Загрузи скилл humanizer и примени его к ${files}: ` +
        'меняй только прозу вне блоков кода; ID, строки шапки, заголовки, таблицы, тексты в «ёлочках», числа и сроки не трогай. ' +
        `Затем вызови sdd_lint с args ${lintArgs(['guard', target])}; при ошибках верни защищённые части как были и повтори guard. ` +
        'Последним сообщением — итог guard.',
      fallback: `${what === 'slices' ? `${skill('humanizer')} по каждому файлу в ${dir}/slices/` : skill('humanizer', target)}, затем ${lintCmd('guard', target)}`,
    },
  };
  const finish = open.length
    ? { id: `blockers:${key}`, label: `Закрыть блокеры ${open.map((r) => r.id).join(', ')}`, description: 'решение даёте вы', action: { show: blockersStep(m, rv, open) } }
    : {
        id: `approve:${key}`,
        label: what === 'adr' ? 'Принять' : 'Одобрить',
        description: lintCmd('approve', ...(what === 'adr' ? ['adr', dir, num] : [what, dir])),
        action: { lint: what === 'adr' ? ['approve', 'adr', dir, num] : ['approve', what, dir] },
      };
  const options = [reviewHere, reviewWindow, humanize, finish];
  const rec = open.length ? finish : rv ? finish : reviewHere;
  rec.recommended = true;
  return { header: name, question: `${name} «${status || '—'}». Что дальше?`, options };
}
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
    if (!qs.length && scaffolding(m).length)
      qs = [
        {
          header: 'Перед merge',
          question: `${st.now}. Убрать леса этапа: ${scaffolding(m).join(', ')}?`,
          options: [
            { id: 'close', label: 'Убрать леса', description: skill('sdd-close', m.name), recommended: true, action: { lint: ['close', rel(m.dir)] } },
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
  // Инструменты выбора берут до 4 вопросов за раз; остальные ADR — следующим вопросом.
  return { stage: st.now, questions: qs.slice(0, 4) };
}

// Вопросы этапа. Действия в вывод не идут: их выполняет choose по id.
// Как задать вопрос, вывод говорит сам (instruction): правило приходит в момент действия,
// а не из контекста агента. text — тот же вопрос списком для агента без инструмента выбора.
export function askView(m) {
  const { stage, questions } = askOf(m);
  let n = 0;
  // preview (план нарезки) человек читает до вопроса: в инструменте выбора ему не место.
  const preview = questions.map((q) => q.preview).filter(Boolean).join('\n\n') || null;
  const qs = questions.map(({ preview: _p, ...q }) => ({
    ...q,
    options: q.options.map(({ action, ...o }) => ({ n: ++n, ...o, label: o.recommended ? `${o.label} (рекомендую)` : o.label })),
  }));
  const text = qs.map((q) => [q.question, ...q.options.map((o) => `${o.n}. ${o.label}${o.description ? ` — ${o.description}` : ''}`)].join('\n')).join('\n\n');
  const dir = rel(m.dir);
  const instruction =
    (preview ? 'Сначала выведи preview дословно, отдельным сообщением: это план для человека. ' : '') +
    'Задай questions инструментом выбора как есть: текст, порядок, варианты и «(рекомендую)» не меняй, своих вариантов не добавляй. ' +
    'Инструмента выбора нет — выведи text дословно и жди ответа. ' +
    `Выбран вариант — sdd_lint с args ${lintArgs(['choose', dir, '<id>'])}; ответ номером — id варианта с этим n; выбрано несколько — по одному, по порядку. ` +
    'Человек ответил словами: однозначно назвал один вариант — его id, иначе отвечай как в обычном диалоге. Вариант за человека не выбирай.';
  return { instruction, stage, ...(preview ? { preview } : {}), choose: ['choose', dir, '<id>'], questions: qs, text };
}
