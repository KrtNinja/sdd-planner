// Вопрос человеку на этапе: варианты с рекомендацией и задания для них (ask / choose).
import { pendingAdrs } from './adr.mjs';
import { skill, lintCmd } from './config.mjs';
import { rel, approved } from './md.mjs';
import { openBlockers, reviewKey } from './review.mjs';
import { blockersStep, stageOf } from './stage.mjs';

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
    label: 'Ревью в новом окне',
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
function nextSkillQuestion(m, now, name, label) {
  return {
    header: 'Следующий этап',
    question: `${now}. ${label}?`,
    options: [
      { id: `here:${name}`, label: 'Здесь, в этом окне', description: skill(name, m.name), recommended: true, action: { here: ['prompt', name, m.name] } },
      { id: `window:${name}`, label: 'В новом окне', description: 'вы запускаете команду сами', action: { show: skill(name, m.name) } },
    ],
  };
}
export function askOf(m) {
  const st = stageOf(m);
  const adrQs = () => pendingAdrs(m).map((a) => artifactQuestion(m, 'adr', a.num));
  let qs = [];
  if (m.slices.size && m.spec && !approved(m.spec.status)) qs = [artifactQuestion(m, 'spec'), ...adrQs()];
  else if (m.slices.size && approved(m.slicesStatus)) {
    qs = adrQs();
    if (!qs.length && m.protocol)
      qs = [
        {
          header: 'Перед merge',
          question: `${st.now}. Убрать протокол brainstorming?`,
          options: [
            { id: 'close', label: 'Убрать протокол', description: lintCmd('close', rel(m.dir)), recommended: true, action: { lint: ['close', rel(m.dir)] } },
            { id: 'later', label: 'Позже', description: 'ничего не делать', action: { none: true } },
          ],
        },
      ];
  } else if (m.slices.size) qs = [artifactQuestion(m, 'slices'), ...adrQs()];
  else if (m.spec && approved(m.spec.status)) qs = [nextSkillQuestion(m, st.now, 'sdd-slices', 'Резать slices'), ...adrQs()];
  else if (m.spec) qs = [artifactQuestion(m, 'spec'), ...adrQs()];
  else if (m.protocol && /готов/i.test(m.protocol.status || '')) qs = [nextSkillQuestion(m, st.now, 'sdd-spec', 'Писать Dev Spec')];
  else if (m.protocol) qs = [nextSkillQuestion(m, st.now, 'sdd-grill', 'Продолжить brainstorming')];
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
  const qs = questions.map((q) => ({
    ...q,
    options: q.options.map(({ action, ...o }) => ({ n: ++n, ...o, label: o.recommended ? `${o.label} (рекомендую)` : o.label })),
  }));
  const text = qs.map((q) => [q.question, ...q.options.map((o) => `${o.n}. ${o.label}${o.description ? ` — ${o.description}` : ''}`)].join('\n')).join('\n\n');
  const dir = rel(m.dir);
  const instruction =
    'Задай questions инструментом выбора как есть: текст, порядок, варианты и «(рекомендую)» не меняй, своих вариантов не добавляй. ' +
    'Инструмента выбора нет — выведи text дословно и жди ответа. ' +
    `Выбран вариант — sdd_lint с args ${lintArgs(['choose', dir, '<id>'])}; ответ номером — id варианта с этим n; выбрано несколько — по одному, по порядку. ` +
    'Человек ответил словами: однозначно назвал один вариант — его id, иначе отвечай как в обычном диалоге. Вариант за человека не выбирай.';
  return { instruction, stage, choose: ['choose', dir, '<id>'], questions: qs, text };
}
