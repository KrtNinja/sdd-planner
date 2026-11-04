// Возврат в одну ветку; текст ответа не является разрешением на изменение документов.
// @ts-check
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { read } from './md.mjs';
import { registryQuestions, questionCard } from './registry-view.mjs';
import { contextChanges, originalAnswer } from './registry-context.mjs';
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
  if (!m.flow.state) throw new Error('Продолжение Q доступно только в новом процессе');
  if (!input.id) return matchQuestions(m, input.candidates);
  const q = registryQuestions(m, { id: input.id })[0];
  if (!q) throw new Error(`Вопрос ${input.id} не найден; похожий вопрос не подставляется`);
  const context = contextChanges(m, q);
  return [questionCard(q), answerDetails(q),
    `Контекст: ${q.fields.Контекст}\nПродолжить: ${q.fields.Продолжить}`,
    `Предполагаемые уточнения: ${q.fields.Уточнения || 'не сохранены; выяви новые развилки'}`,
    context.baseline ? 'Снимок контекста сохранён.' : 'Снимка до откладывания нет; явно проверь актуальность ответа.',
    `Изменения контекста (требуется смысловая оценка): ${JSON.stringify(context.changes.map((c) => ({ id: c.id, file: c.file, hash: c.hash })))}`,
    `Актуальные связанные элементы: ${JSON.stringify(context.current)}`,
    q.fields.Влияние === 'unknown' ? 'Область неизвестна: явно расширь контекст до выяснения влияния.' : '',
    q.fields.Пакет ? `Сохранённый пакет: ${q.fields.Пакет}\nНе создавай заново FR, строки протокола или Q; продолжи apply.` : '',
    stageRules(q.fields.Этап), requiredRules('sdd-grill/references/resume.md')].join('\n\n');
}

/** @param {Feature} m @param {string[] | undefined} candidates */
function matchQuestions(m, candidates) {
  const qs = registryQuestions(m).filter((q) => !['resolved', 'excluded'].includes(q.fields.Статус));
  const selected = candidates ? qs.filter((q) => candidates.includes(q.id)) : qs;
  if (candidates?.some((id) => !selected.some((q) => q.id === id))) throw new Error('Неизвестный кандидат Q');
  const instruction = selected.length === 1
    ? 'Предложение сопоставления покажи в составе обработки. Только после смысловой проверки передай один точный Q-ID в answer.'
    : 'Неоднозначность: уточни у человека один Q-ID до записи ответа и изменения документов. Несколько Q предположением не закрывай.';
  return `${instruction}\n${selected.map((q) => `${questionCard(q)}\nКонтекст: ${q.fields.Контекст}`).join('\n\n')}`;
}

/** @param {string} stage */
function stageRules(stage) {
  if (stage === 'grill') return [requiredRules('grilling/SKILL.md'), requiredRules('sdd-grill/references/questions.md')].join('\n\n');
  const skill = { spec: 'sdd-spec', scenarios: 'sdd-spec', tech: 'sdd-decide', slices: 'sdd-slices',
    adr: 'sdd-adr', review: 'sdd-review', decide: 'sdd-decide' }[stage];
  if (!skill) throw new Error(`Неизвестный исходный этап ${stage}`);
  return `Исходный этап: ${stage}. Продолжи только сохранённую ветку.\n${requiredRules(`${skill}/SKILL.md`)}`;
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
