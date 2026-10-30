// Вопрос этапа по артефакту (spec, slices, ADR): ревью → находки по одной → открытые вопросы → одобрение.
//
// После ревью: блокеры по одному («Как решаем?»), затем «Пройдёмся по замечаниям?», затем замечания
// из очереди по одному. Всё разобрано — «Одобрить» и «Убрать AI стиль»; decide что-то поменял — ещё
// «Повторить ревью». «Одобрить» с открытыми вопросами сначала спрашивает их по одному.
// Решения пишет скрипт (triage) или /sdd-decide в сабагенте; очередь — колонка «Решение» файла ревью.
import { skill, lintCmd } from './config.mjs';
import { isEmptyCell, plural, rel } from './md.mjs';
import { openQuestions, openTarget } from './open-questions.mjs';
import { ANSWER, itemBlock, lintArgs, taskFor, walkQuestion } from './question.mjs';
import { changedByReview, openBlockers, queuedRemarks, reviewKey, untriagedRemarks } from './review.mjs';

const short = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Решение проводит /sdd-decide в сабагенте: в окно приходит список изменений, скилл не копится в окне
// на каждую находку. Сабагентов нет — тот же скилл здесь. next — вызов после него (нет — вопрос этапа).
const SUB_DECIDE =
  'Ты сабагент: человеку вопросов не задавай. Когда done вернёт вопрос этапа, не задавай его — последним сообщением выведи ' +
  'список изменений (файл → ID → что изменилось). Без ответа человека дальше нельзя — выведи вопрос последним сообщением и остановись.';
export function decideAction(m, ref, decision, next, note = '') {
  const args = ['prompt', 'sdd-decide', m.name, ref, decision];
  return { subagent: taskFor(args, `${note}${SUB_DECIDE}`), here: args, next };
}

function artifact(m, what, num) {
  const a = what === 'adr' ? m.featureAdrs.find((x) => x.num === num) : null;
  const dir = rel(m.dir);
  return {
    what,
    key: reviewKey(what, num),
    dir,
    target: what === 'spec' ? rel(m.specFile) : what === 'slices' ? dir : rel(a.file),
    files: what === 'spec' ? rel(m.specFile) : what === 'slices' ? `каждому файлу в ${dir}/slices/` : rel(a.file),
    name: what === 'spec' ? 'Dev Spec' : what === 'slices' ? 'Slices' : `ADR ${num}`,
    of: what === 'spec' ? 'спеки' : what === 'slices' ? 'slices' : `ADR ${num}`,
    status: what === 'spec' ? m.spec.status : what === 'slices' ? m.slicesStatus : a.status,
    rest: [what, num].filter(Boolean),
    approve: what === 'adr' ? ['approve', 'adr', dir, num] : ['approve', what, dir],
  };
}

const reviewOption = (m, x, again) => ({
  id: `review-here:${x.key}`,
  label: again ? 'Повторить ревью в сабагенте' : 'Ревью в сабагенте',
  description: `свежий контекст, находки — в ${x.dir}/_work/review/${x.key}.md`,
  action: { subagent: taskFor(['prompt', 'sdd-review', m.name, ...x.rest]), fallback: skill('sdd-review', m.name, ...x.rest) },
});
const windowOption = (m, x) => ({ id: `review-window:${x.key}`, label: 'Ревью в новом контексте/окне', description: 'вы запускаете команду сами', action: { show: skill('sdd-review', m.name, ...x.rest) } });
const humanizeOption = (x) => ({
  id: `humanize:${x.key}`,
  label: `Убрать AI стиль из ${x.of}`,
  description: 'humanizer в сабагенте, затем guard',
  action: {
    snapshot: x.target,
    subagent:
      `Загрузи скилл humanizer и примени его к ${x.files}: ` +
      'меняй только прозу вне блоков кода; ID, строки шапки, заголовки, таблицы, тексты в «ёлочках», числа и сроки не трогай. ' +
      `Затем вызови sdd_lint с args ${lintArgs(['guard', x.target])}; при ошибках верни защищённые части как были и повтори guard. ` +
      'Последним сообщением — итог guard.',
    fallback: `${x.what === 'slices' ? `${skill('humanizer')} по каждому файлу в ${x.dir}/slices/` : skill('humanizer', x.target)}, затем ${lintCmd('guard', x.target)}`,
  },
});
// Одобрение держат открытые вопросы (SP-06, SL-10): сначала они — по одному, ответ человека проводит decide,
// затем снова этот же вариант: следующий вопрос или approve.
function approveOption(m, x) {
  const id = `approve:${x.key}`;
  const label = x.what === 'adr' ? 'Принять' : 'Одобрить';
  const open = openQuestions(m, x.what);
  if (!open.length) return { id, label, description: lintCmd(...x.approve), action: { lint: x.approve } };
  const q = open[0];
  const block = itemBlock(`Открытый вопрос 1 из ${open.length} — ${rel(q.file)}:${q.n}`, [['Вопрос', q.text]]);
  return {
    id,
    label,
    description: `сначала ${plural(open.length, 'открытый вопрос', 'открытых вопроса', 'открытых вопросов')} — по одному, затем ${lintCmd(...x.approve)}`,
    action: {
      wait: `${block}\n\nКак решаем? Напишите решение одним сообщением.`,
      then: ['choose', x.dir, id, ANSWER],
      answer: (text) => decideAction(m, q.text, text, ['choose', x.dir, id], `Вопрос — из «Открытые вопросы» ${rel(q.file)}:${q.n}: решение его закрывает, убери его оттуда. `),
    },
  };
}

const findingBlock = (r) => itemBlock(`#: ${r.id}`, [['Важность', r.level], ['Где', r.where], ['Что не так', r.what], ['Пункт', r.point], ['Предложение', r.proposal]]);
function findingOptions(m, x, r) {
  const ref = `${x.key}:${r.id}`;
  const id = (k) => `rv:${ref}:${k}`;
  const target = openTarget(m, x.key, r);
  return [
    {
      id: id('write'),
      label: 'Напишу решение',
      description: 'следующим сообщением; проведу через /sdd-decide',
      recommended: true,
      action: { wait: `Напишите решение по ${r.id} одним сообщением.`, then: ['choose', x.dir, id('write'), ANSWER], answer: (text) => decideAction(m, ref, text) },
    },
    isEmptyCell(r.proposal) ? null : { id: id('accept'), label: 'Принимаю рекомендации', description: `«${short(r.proposal, 70)}» — через /sdd-decide`, action: decideAction(m, ref, 'да') },
    target
      ? {
          id: id('open'),
          label: 'Затрудняюсь, добавить в открытые вопросы',
          description: `в «${target.title}» ${rel(target.file)}${target.adr ? '' : '; спрошу перед одобрением'}`,
          action: { lint: ['triage', x.dir, ref, 'open'] },
        }
      : null,
    {
      id: id('ignore'),
      label: 'Игнорировать',
      description: m.protocol ? 'снять: в протоколе — «Снято на ревью», повторное ревью не поднимет' : 'снять: «отклонено» в файле ревью',
      action: { lint: ['triage', x.dir, ref, 'ignore'] },
    },
  ].filter(Boolean);
}
function remarksQuestion(m, x, rows) {
  const some = `remarks:${x.key}:some`;
  const ids = rows.map((r) => r.id);
  return {
    walk: true,
    header: 'Замечания',
    question: 'Пройдёмся по замечаниям?',
    preview: [`Замечания ревью — ${rows.length}:`, ...rows.map((r) => `  ${r.id} · ${short(r.where || '—', 40)} · ${short(r.what, 90)}`)].join('\n'),
    options: [
      { id: `remarks:${x.key}:all`, label: 'Давай по очереди', description: 'по одному: блок замечания и «Как решаем?»', recommended: true, action: { lint: ['triage', x.dir, x.key, 'remarks', 'all'] } },
      {
        id: some,
        label: 'Давай только …',
        description: 'напишу номера пунктов, остальные снять',
        action: {
          wait: `Напишите номера замечаний, которые разберём, — например: ${ids.slice(0, 2).join(', ')}. Остальные сниму.`,
          then: ['choose', x.dir, some, ANSWER],
          answer: (text) => ({ lint: ['triage', x.dir, x.key, 'remarks', text], retry: true }),
        },
      },
      {
        id: `remarks:${x.key}:none`,
        label: 'Игнорировать',
        description: m.protocol ? 'снять все: в протоколе — «Снято на ревью», повторное ревью не поднимет' : 'снять все: «отклонено» в файле ревью',
        action: { lint: ['triage', x.dir, x.key, 'remarks', 'none'] },
      },
    ],
  };
}
function reviewWalk(m, x, rv) {
  const finding = (kind) => ({ header: (r) => `${kind} ${r.id}`, block: findingBlock, options: (r) => findingOptions(m, x, r) });
  const blocker = walkQuestion({ items: openBlockers(rv), ...finding('Блокер') });
  if (blocker) return blocker;
  const fresh = untriagedRemarks(rv);
  if (fresh.length) return remarksQuestion(m, x, fresh);
  return walkQuestion({ items: queuedRemarks(rv), ...finding('Замечание') });
}

export function artifactQuestion(m, what, num) {
  const x = artifact(m, what, num);
  const rv = m.reviews.get(x.key);
  const walk = rv ? reviewWalk(m, x, rv) : null;
  if (walk) return walk;
  const approve = approveOption(m, x);
  const options = rv
    ? [approve, humanizeOption(x), ...(changedByReview(rv) ? [reviewOption(m, x, true)] : [])]
    : [reviewOption(m, x, false), windowOption(m, x), humanizeOption(x), approve];
  options[0].recommended = true;
  return { header: x.name, question: `${x.name} «${x.status || '—'}»${rv ? ': ревью разобрано' : ''}. Что дальше?`, options };
}
