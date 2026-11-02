// Вопрос этапа по артефакту (spec, slices, ADR): ревью → находки по одной → открытые вопросы → одобрение.
// @ts-check
//
// После ревью: блокеры по одному («Как решаем?»), затем «Пройдёмся по замечаниям?», затем замечания
// из очереди по одному. Всё разобрано — «Одобрить» и «Убрать AI стиль»; decide что-то поменял — ещё
// «Повторить ревью». «Одобрить» с открытыми вопросами сначала спрашивает их по одному.
// Решения пишет скрипт (triage) или /sdd-decide в сабагенте; очередь — колонка «Решение» файла ревью.
import { code, showCmd, skill, skillCode, lintCmd } from './config.mjs';
import { isEmptyCell, plural, rel } from './md.mjs';
import { openQuestions, openTarget } from './open-questions.mjs';
import { ANSWER, itemBlock, walkQuestion } from './question.mjs';
import { blocks, bold, codePaths, list } from './screen.mjs';
import { changedByReview, openBlockers, queuedRemarks, reviewKey, untriagedRemarks } from './review.mjs';

/** @typedef {import('./model.mjs').Feature} Feature */
/** @typedef {import('./model.mjs').Review} Review */
/** @typedef {import('./model.mjs').ReviewRow} ReviewRow */
/** @typedef {import('./question.mjs').Action} Action */
/** @typedef {import('./question.mjs').Option} Option */
/** @typedef {import('./question.mjs').Question} Question */
/**
 * Артефакт под вопросом этапа: что это, ключ ревью, пути и названия для карточки, вызов approve.
 * @typedef {object} Artifact
 * @property {'spec' | 'slices' | 'adr'} what
 * @property {string} key spec, slices, adr-NNNN — имя файла ревью
 * @property {string} dir папка фичи от корня
 * @property {string} target что отдать humanizer и guard
 * @property {string} files
 * @property {string} name «Dev Spec», «Slices», «ADR NNNN»
 * @property {string} of то же в родительном падеже
 * @property {string | null} status
 * @property {string[]} rest аргументы скилла после фичи
 * @property {string[]} approve
 */

/** @param {string} s @param {number} n */
const short = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Решение проводит /sdd-decide в сабагенте: в окно приходит список изменений, скилл не копится в окне
// на каждую находку. Сабагентов нет — тот же скилл здесь. next — вызов после него (нет — вопрос этапа).
// Что сабагенту делать иначе, чем человеку в окне, — флаг --sub у prompt; note — уточнение задачи (--note).
/** @param {Feature} m @param {string} ref @param {string} decision @param {string[]} [next] @returns {Action} */
export function decideAction(m, ref, decision, next, note = '') {
  const args = ['prompt', 'sdd-decide', m.name, ref, decision];
  const say = `Провожу решение по ${/:R\d+$/.test(ref) ? ref.split(':')[1] : 'вопросу'} через ${skillCode('sdd-decide')} в сабагенте: протокол → FR → AC. В конце покажу, что изменилось.`;
  return { subagent: [...args, '--sub', ...(note.trim() ? ['--note', note.trim()] : [])], here: args, next, say };
}

/** @param {Feature} m @param {Artifact['what']} what @param {string} [num] @returns {Artifact} */
function artifact(m, what, num) {
  const a = what === 'adr' ? m.featureAdrs.find((x) => x.num === num) : null;
  const dir = rel(m.dir);
  return {
    what,
    key: reviewKey(what, num),
    dir,
    target: what === 'spec' ? rel(m.specFile) : what === 'slices' ? dir : rel(/** @type {import('./model.mjs').Adr} */ (a).file),
    files: what === 'spec' ? rel(m.specFile) : what === 'slices' ? `каждому файлу в ${dir}/slices/` : rel(/** @type {import('./model.mjs').Adr} */ (a).file),
    name: what === 'spec' ? 'Dev Spec' : what === 'slices' ? 'Slices' : `ADR ${num}`,
    of: what === 'spec' ? 'спеки' : what === 'slices' ? 'slices' : `ADR ${num}`,
    status:
      what === 'spec' ? /** @type {import('./model.mjs').Spec} */ (m.spec).status : what === 'slices' ? m.slicesStatus : /** @type {import('./model.mjs').Adr} */ (a).status,
    rest: /** @type {string[]} */ ([what, num].filter(Boolean)),
    approve: what === 'adr' ? ['approve', 'adr', dir, /** @type {string} */ (num)] : ['approve', what, dir],
  };
}

/** @param {Feature} m @param {Artifact} x @param {boolean} again @returns {Option} */
const reviewOption = (m, x, again) => ({
  id: `review-here:${x.key}`,
  label: again ? 'Повторить ревью в сабагенте' : 'Ревью в сабагенте',
  description: `свежий контекст, находки — в ${x.dir}/_work/review/${x.key}.md`,
  action: {
    subagent: ['prompt', 'sdd-review', m.name, ...x.rest],
    say: `Запускаю ревью ${x.of} в сабагенте, в чистом контексте. Находки придут таблицей, затем разберём их по одной.`,
    fallback: blocks(`Сабагентов нет — запустите ревью в новом окне: ${code(skill('sdd-review', m.name, ...x.rest))}`, showCmd(skill('sdd-review', m.name, ...x.rest)).split('\n\n').slice(1)),
  },
});
/** @param {Feature} m @param {Artifact} x @returns {Option} */
const windowOption = (m, x) => ({ id: `review-window:${x.key}`, label: 'Ревью в новом контексте/окне', description: 'вы запускаете команду сами', action: { show: showCmd(skill('sdd-review', m.name, ...x.rest)) } });
/** @param {Artifact} x @returns {Option} */
const humanizeOption = (x) => ({
  id: `humanize:${x.key}`,
  label: `Убрать AI стиль из ${x.of}`,
  description: 'humanizer в сабагенте, затем guard',
  action: {
    snapshot: x.target,
    subagent: ['prompt', 'humanize', x.target],
    say: `Убираю AI стиль из ${x.of} в сабагенте, затем проверю скриптом, что ID, таблицы и тексты на месте.`,
    fallback: `Сабагентов нет — сделайте сами: ${x.what === 'slices' ? `${code(skill('humanizer'))} по каждому файлу в ${code(`${x.dir}/slices/`)}` : code(skill('humanizer', x.target))}, затем ${code(lintCmd('guard', x.target))}`,
  },
});
// Одобрение держат открытые вопросы (SP-06, SL-10): сначала они — по одному, ответ человека проводит decide,
// затем снова этот же вариант: следующий вопрос или approve.
/** @param {Feature} m @param {Artifact} x @returns {Option} */
function approveOption(m, x) {
  const id = `approve:${x.key}`;
  const label = x.what === 'adr' ? 'Принять' : 'Одобрить';
  const open = openQuestions(m, x.what);
  if (!open.length) return { id, label, description: lintCmd(...x.approve), action: { lint: x.approve } };
  const q = open[0];
  const block = itemBlock(`${bold(`Открытый вопрос 1 из ${open.length}`)} · ${code(`${rel(q.file)}:${q.n}`)}`, [['Вопрос', q.text]]);
  return {
    id,
    label,
    description: `сначала ${plural(open.length, 'открытый вопрос', 'открытых вопроса', 'открытых вопросов')} — по одному, затем ${lintCmd(...x.approve)}`,
    action: {
      wait: blocks(block, `${bold('Как решаем?')} Напишите решение одним сообщением.`),
      then: ['choose', x.dir, id, ANSWER],
      answer: (text) => decideAction(m, q.text, text, ['choose', x.dir, id], `Вопрос — из «Открытые вопросы» ${rel(q.file)}:${q.n}: решение его закрывает, убери его оттуда. `),
    },
  };
}

// Блок находки: заголовок — что это и откуда, поля — списком (так их не склеит ни один markdown).
/** @type {Record<string, string>} */
const KIND = { блокер: 'Блокер', замечание: 'Замечание' };
/** @param {Artifact} x */
const findingBlock = (x) => (/** @type {ReviewRow} */ r, /** @type {number} */ left) =>
  itemBlock(`${bold(`${KIND[r.level] || r.level} ${r.id}`)} · ревью ${x.of}${left > 1 ? ` · ${r.blocker ? 'блокеров' : 'замечаний'} к разбору: ${left}` : ''}`, [
    ['Где', r.where],
    ['Что не так', r.what],
    ['Предложение', isEmptyCell(r.proposal) ? undefined : r.proposal],
    ['Пункт чек-листа', r.point],
  ]);
/** @param {Feature} m @param {Artifact} x @param {ReviewRow} r @returns {Option[]} */
function findingOptions(m, x, r) {
  const ref = `${x.key}:${r.id}`;
  const id = (/** @type {string} */ k) => `rv:${ref}:${k}`;
  const target = openTarget(m, x.key, r);
  return [
    {
      id: id('write'),
      label: 'Напишу решение',
      description: 'следующим сообщением; проведу через /sdd-decide',
      recommended: true,
      action: {
        wait: `Напишите решение по ${r.id} одним сообщением — проведу его через ${skillCode('sdd-decide')}.`,
        then: ['choose', x.dir, id('write'), ANSWER],
        answer: (/** @type {string} */ text) => decideAction(m, ref, text),
      },
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
  ].filter((o) => o !== null);
}
/** @param {Feature} m @param {Artifact} x @param {ReviewRow[]} rows @returns {Question} */
function remarksQuestion(m, x, rows) {
  const some = `remarks:${x.key}:some`;
  const ids = rows.map((r) => r.id);
  return {
    walk: true,
    header: 'Замечания',
    question: 'Пройдёмся по замечаниям?',
    preview: blocks(`${bold(`Замечания ревью ${x.of}`)} · ${rows.length}`, list(rows.map((r) => `${bold(r.id)} · ${codePaths(short(r.where || '—', 40))} · ${short(r.what, 90)}`))),
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
/** @param {Feature} m @param {Artifact} x @param {Review} rv @returns {Question | null} */
function reviewWalk(m, x, rv) {
  const finding = (/** @type {string} */ kind) => ({
    header: (/** @type {ReviewRow} */ r) => `${kind} ${r.id}`,
    block: findingBlock(x),
    options: (/** @type {ReviewRow} */ r) => findingOptions(m, x, r),
  });
  const blocker = walkQuestion({ items: openBlockers(rv), ...finding('Блокер') });
  if (blocker) return blocker;
  const fresh = untriagedRemarks(rv);
  if (fresh.length) return remarksQuestion(m, x, fresh);
  return walkQuestion({ items: queuedRemarks(rv), ...finding('Замечание') });
}

/** @param {Feature} m @param {Artifact['what']} what @param {string} [num] @returns {Question} */
export function artifactQuestion(m, what, num) {
  const x = artifact(m, what, num);
  const rv = m.reviews.get(x.key);
  const walk = rv ? reviewWalk(m, x, rv) : null;
  if (walk) return walk;
  const approve = approveOption(m, x);
  /** @type {Option[]} */
  const options = rv
    ? [approve, humanizeOption(x), ...(changedByReview(rv) ? [reviewOption(m, x, true)] : [])]
    : [reviewOption(m, x, false), windowOption(m, x), humanizeOption(x), approve];
  options[0].recommended = true;
  return { header: x.name, question: `${x.name} «${x.status || '—'}»${rv ? ': ревью разобрано' : ''}. Что дальше?`, options };
}
