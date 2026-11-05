// Возврат в одну ветку; текст ответа не является разрешением на изменение документов.
// @ts-check
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { read } from './md.mjs';
import { registryQuestions, questionCard, relatedIds } from './registry-view.mjs';
import { contextChanges, originalAnswer } from './registry-context.mjs';
import { decisionQuestion } from './decision-view.mjs';
import { questionActions } from './registry-format.mjs';
import { git, gitInfo, gitShow } from './git.mjs';

const SKILLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
/** @typedef {import('./model.mjs').Feature} Feature */
/** @param {string} relative */
function requiredRules(relative) {
  const text = read(path.join(SKILLS, relative));
  if (text === null) throw new Error(`Не найдены правила ${relative}; переустановите расширение sdd-planner`);
  return text;
}

/** @param {Feature} m @param {{id?: string, candidates?: string[]}} input */
export function resumeQuestion(m, input) {
  if (!m.flow.state) throw new Error('Не найден .sdd-flow.json для продолжения Q');
  if (!input.id) return matchQuestions(m, input.candidates);
  const q = registryQuestions(m, { id: input.id })[0];
  if (!q) throw new Error(`Вопрос ${input.id} не найден; похожий вопрос не подставляется`);
  const context = contextChanges(m, q);
  return [`Исходный этап: ${q.fields.Этап}. Текущий этап фичи не ограничивает возврат к Q.`,
    questionCard(q), answerDetails(q),
    `Контекст: ${q.fields.Контекст}\nПродолжить: ${q.fields.Продолжить}`,
    `Предполагаемые уточнения: ${q.fields.Уточнения || 'не сохранены; выяви новые развилки'}`,
    context.baseline ? 'Снимок контекста сохранён.' : 'Снимка до откладывания нет; явно проверь актуальность ответа.',
    `Изменения контекста (требуется смысловая оценка): ${JSON.stringify(context.changes.map((c) => ({ id: c.id, file: c.file, hash: c.hash })))}`,
    `Связанные ID для пересмотра: ${[...relatedIds(m, q.refs.map((r) => r.id))].join(', ')}. ` +
      'Структурные связи не доказывают смысловую полноту; дополнительные фрагменты читай по необходимости через trace.',
    `Актуальные связанные элементы: ${JSON.stringify(context.current)}`,
    q.fields.Влияние === 'unknown' ? 'Область неизвестна: явно расширь контекст до выяснения влияния.' : '',
    continuation(m, q, context.current),
    `Исходный скилл: ${sourceSkill(q.fields.Этап)}. Полный текст не загружен: ` +
      'если не хватает смысловых правил, запроси его через sdd_lint prompt или прямо в GigaCode CLI.',
    requiredRules('sdd-grill/references/resume.md')].join('\n\n');
}

/** @param {Feature} m @param {string[] | undefined} candidates */
function matchQuestions(m, candidates) {
  const qs = registryQuestions(m).filter((q) => !['resolved', 'excluded'].includes(q.fields.Статус));
  const selected = candidates ? qs.filter((q) => candidates.includes(q.id)) : qs;
  if (candidates?.some((id) => !selected.some((q) => q.id === id))) throw new Error('Неизвестный кандидат Q');
  if (!selected.length) return 'Нерешённых Q нет. Для новых сведений создайте новый Q через questions add; ' +
    'старые ID и протокол не восстанавливайте. Уточните только недостающий контекст.';
  const instruction = selected.length === 1
    ? 'Предложение сопоставления покажи в составе обработки. Только после смысловой проверки передай один точный Q-ID в answer.'
    : 'Неоднозначность: уточни у человека один Q-ID до записи ответа и изменения документов. Несколько Q предположением не закрывай.';
  return `${instruction}\n${selected.map((q) => `${questionCard(q)}\nКонтекст: ${q.fields.Контекст}`).join('\n\n')}`;
}

/** @param {string} stage */
function sourceSkill(stage) {
  /** @type {Record<string, string>} */
  const skills = { grill: 'sdd-grill', spec: 'sdd-spec', scenarios: 'sdd-scenarios',
    tech: 'sdd-tech', slices: 'sdd-slices', adr: 'sdd-adr',
    review: 'sdd-review', decide: 'sdd-decide' };
  const skill = skills[stage];
  if (!skill) throw new Error(`Неизвестный исходный этап ${stage}`);
  return skill;
}

/** @param {Feature} m */
export function questionHistory(m) {
  const g = gitInfo(m.dir);
  if (!g) throw new Error('История обсуждения недоступна: это не Git-репозиторий');
  const result = [];
  for (const name of ['questions.md', 'brainstorming.md']) {
    const file = path.join(m.dir, name);
    const revisions = git(['log', '--format=%H', '--', file], g.top).trim().split('\n').filter(Boolean);
    const revision = revisions.find((ref) => gitShow(g, ref, file) !== null);
    if (revision) result.push(`${revision}:${path.relative(g.top, file).split(path.sep).join('/')}`);
  }
  if (!result.length) throw new Error('В Git нет сохранённого обсуждения; ревизия не выдумывается');
  return result.join('\n');
}

/** @param {import('./flow-format.mjs').FlowRecord} q */
function exclusionText(q) {
  return q.fields.Исключение ? `Исключение: ${q.fields.Исключение}\nПоследствия: ${q.fields.Последствия}` : '';
}

/** @param {import('./flow-format.mjs').FlowRecord} q */
function answerDetails(q) {
  return [`Ответ человека (JSON, дословно): ${JSON.stringify(originalAnswer(q))}`,
    `Происхождение: ${q.fields.Происхождение || 'unconfirmed'}.`,
    `История ответов (JSON): ${q.fields.ОтветыJSON || '[]'}`, exclusionText(q)].join('\n');
}

/** @param {Feature} m @param {import('./flow-format.mjs').FlowRecord} q
 * @param {ReturnType<typeof contextChanges>['current']} current */
function continuation(m, q, current) {
  if (q.fields.Пакет) return `Сохранённый пакет: ${q.fields.Пакет}\n` +
    `Продолжение сохранённого пакета: ${JSON.stringify(decisionQuestion(m.dir, q))}`;
  if (q.fields.Влияние !== 'known' || !q.refs.length)
    return 'До подготовки пакета уточни область через questions scope: {key,id,impact:"known",refs:[существующие ID]}.';
  if (q.fields.Статус !== 'answered') return 'Сначала сохрани дословный ответ через questions answer: {key,id,answer,origin}.';
  return prepareInput(q, current);
}

/** @param {import('./flow-format.mjs').FlowRecord} q
 * @param {ReturnType<typeof contextChanges>['current']} current */
function prepareInput(q, current) {
  const input = { key: `prepare-${q.id}-${Object.keys(questionActions(q)).length}`, id: q.id,
    summary: '', assessment: '', tradeoffs: '', remaining: '', ready: false, conflicts: [], obligations: 'changed',
    context: current.map(({ id, file, hash }) => ({ id, file, hash })), changes: [] };
  return 'Вход questions prepare (заполни содержательные поля): ' + JSON.stringify(input) + '\n' +
    'summary — что и почему; assessment — полнота ответа; tradeoffs — компромиссы; remaining — оставшиеся вопросы. ' +
    'ready:true только при достаточном ответе без conflicts; obligations:changed при изменении поведения, иначе unchanged. ' +
    'changes:[{file,before,after}]: полные точные тексты файлов, before:null только для нового файла. ' +
    'Для уже согласованного именно этого пакета добавь origin:"analyst", agreement:дословное согласие. ' +
    'После сбоя повтори тот же вход с тем же key; новый пакет готовь только после revise.';
}
