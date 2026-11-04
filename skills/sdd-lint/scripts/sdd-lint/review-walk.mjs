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
function decideAction(m, ref, decision, next, note = '') {
  const args = ['prompt', 'sdd-decide', m.name, ref, decision];
  const say = `Обновляю документы по решению для ${/:R\d+$/.test(ref) ? ref.split(':')[1] : 'вопроса'} через ${skillCode('sdd-decide')} отдельным агентом: ` +
    'протокол, требования и критерии приёмки. ' +
    `В конце покажу, что изменилось.`;
  return { subagent: [...args, '--sub', ...(note.trim() ? ['--note', note.trim()] : [])], here: args, next, say };
}

// Что у артефакта своё: что отдать humanizer и guard, что ревьюить, названия и статус. ADR и spec есть —
// вопрос этапа задаётся только по ним.
/** @typedef {Pick<Artifact, 'target' | 'files' | 'name' | 'of' | 'status'>} OwnParts */
/** @type {Record<Artifact['what'], (m: Feature, dir: string, num?: string) => OwnParts>} */
const OWN_OF = {
  spec: (m) => ({
    target: rel(m.specFile),
    files: rel(m.specFile),
    name: 'Требования',
    of: 'требований',
    status: /** @type {import('./model.mjs').Spec} */ (m.spec).status,
  }),
  slices: (m, dir) => ({ target: dir, files: `каждому файлу в ${dir}/slices/`, name: 'Части работы', of: 'частей работы', status: m.slicesStatus }),
  adr: (m, _dir, num) => {
    const a = /** @type {import('./model.mjs').Adr} */ (m.featureAdrs.find((x) => x.num === num));
    return { target: rel(a.file), files: rel(a.file), name: `ADR ${num}`, of: `ADR ${num}`, status: a.status };
  },
};
/** @param {Feature} m @param {Artifact['what']} what @param {string} [num] @returns {Artifact} */
function artifact(m, what, num) {
  const dir = rel(m.dir);
  return {
    what,
    key: reviewKey(what, num),
    dir,
    ...OWN_OF[what](m, dir, num),
    rest: /** @type {string[]} */ ([what, num].filter(Boolean)),
    approve: what === 'adr' ? ['approve', 'adr', dir, /** @type {string} */ (num)] : ['approve', what, dir],
  };
}

/** @param {Feature} m @param {Artifact} x @param {boolean} again @returns {Option} */
const reviewOption = (m, x, again) => ({
  id: `review-here:${x.key}`,
  label: again ? 'Повторить проверку отдельным агентом' : 'Проверить отдельным агентом',
  description: `новая сессия, результаты — в ${x.dir}/_work/review/${x.key}.md`,
  action: {
    subagent: ['prompt', 'sdd-review', m.name, ...x.rest],
    say: `Запускаю проверку ${x.of} отдельным агентом. Выявленные проблемы будут в таблице, затем разберём их по одной.`,
    fallback: blocks(
      `Отдельный агент недоступен — запустите проверку в новой сессии: ${code(skill('sdd-review', m.name, ...x.rest))}`,
      showCmd(skill('sdd-review', m.name, ...x.rest))
        .split('\n\n')
        .slice(1),
    ),
  },
});
/** @param {Feature} m @param {Artifact} x @returns {Option} */
const windowOption = (m, x) => ({
  id: `review-window:${x.key}`,
  label: 'Проверить в новой сессии',
  description: 'вы запускаете команду сами',
  action: { show: showCmd(skill('sdd-review', m.name, ...x.rest)) },
});
// Как убрать AI стиль руками: spec и ADR — humanizer по файлу, slices — по каждому файлу папки.
/** @param {Artifact} x */
function humanizeHow(x) {
  if (x.what !== 'slices') return code(skill('humanizer', x.target));
  return `${code(skill('humanizer'))} по каждому файлу в ${code(`${x.dir}/slices/`)}`;
}
/** @param {Artifact} x @returns {Option} */
const humanizeOption = (x) => ({
  id: `humanize:${x.key}`,
  label: `Упростить формулировки ${x.of}`,
  description: 'упростить текст и проверить сохранность структуры',
  action: {
    snapshot: x.target,
    subagent: ['prompt', 'humanize', x.target],
    say: `Упрощаю формулировки ${x.of} отдельным агентом, затем проверю скриптом, что ID, таблицы и тексты на месте.`,
    fallback: `Отдельный агент недоступен — запустите сами: ${humanizeHow(x)}, затем ${code(lintCmd('guard', x.target))}`,
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
      answer: (text) =>
        decideAction(m, q.text, text, ['choose', x.dir, id], `Вопрос — из «Открытые вопросы» ${rel(q.file)}:${q.n}: решение его закрывает, убери его оттуда. `),
    },
  };
}

// Блок находки: заголовок — что это и откуда, поля — списком (так их не склеит ни один markdown).
/** @type {Record<string, string>} */
const KIND = { блокер: 'Блокер', замечание: 'Замечание' };
/** @param {Artifact} x */
const findingBlock = (x) => (/** @type {ReviewRow} */ r, /** @type {number} */ left) =>
  itemBlock(
    `${bold(`${KIND[r.level] || r.level} ${r.id}`)} · проверка ${x.of}${left > 1 ? ` · ${r.blocker ? 'блокеров' : 'замечаний'} к разбору: ${left}` : ''}`,
    [
      ['Где', r.where],
      ['Что не так', r.what],
      ['Предложение', isEmptyCell(r.proposal) ? undefined : r.proposal],
      ['Пункт чек-листа', r.point],
    ],
  );
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
    isEmptyCell(r.proposal)
      ? null
      : { id: id('accept'), label: 'Принимаю рекомендации', description: `«${short(r.proposal, 70)}» — через /sdd-decide`, action: decideAction(m, ref, 'да') },
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
      label: `Отклонить ${r.level}`,
      description: m.protocol
        ? 'сохранить как отклонённое в проверке и протоколе; повторно не предлагать'
        : 'сохранить как отклонённое в файле проверки; убрать из очереди разбора',
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
    preview: blocks(
      `${bold(`Замечания проверки ${x.of}`)} · ${rows.length}`,
      list(rows.map((r) => `${bold(r.id)} · ${codePaths(short(r.where || '—', 40))} · ${short(r.what, 90)}`)),
    ),
    options: [
      {
        id: `remarks:${x.key}:all`,
        label: 'Давай по очереди',
        description: 'по одному: блок замечания и «Как решаем?»',
        recommended: true,
        action: { lint: ['triage', x.dir, x.key, 'remarks', 'all'] },
      },
      {
        id: some,
        label: 'Давай только …',
        description: 'разобрать указанные номера; остальные сохранить как отклонённые',
        action: {
          wait: `Напишите номера замечаний, которые разберём, — например: ${ids.slice(0, 2).join(', ')}. Остальные сохраню как отклонённые.`,
          then: ['choose', x.dir, some, ANSWER],
          answer: (text) => ({ lint: ['triage', x.dir, x.key, 'remarks', text], retry: true }),
        },
      },
      {
        id: `remarks:${x.key}:none`,
        label: 'Отклонить все эти замечания',
        description: m.protocol
        ? 'сохранить все как отклонённые в проверке и протоколе; повторно не предлагать'
        : 'сохранить все как отклонённые в файле проверки; убрать из очереди разбора',
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
  return { header: x.name, question: `${x.name} «${x.status || '—'}»${rv ? ': результаты проверки разобраны' : ''}. Что дальше?`, options };
}
