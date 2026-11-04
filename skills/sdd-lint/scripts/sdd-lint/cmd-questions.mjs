// Служебная команда для GigaCode; человеку — карточка, модели — следующий шаг.
// @ts-check
import { resumeQuestion, questionHistory } from './registry-resume.mjs';
import { loadFeature } from './feature.mjs';
import { needDir } from './pick.mjs';
import { applyQuestion } from './registry-actions.mjs';
import { registrySummary, questionCard, draftWork, registryQuestions } from './registry-view.mjs';
import { recoverRegistry } from './registry-store.mjs';
import { G, screen } from './screen.mjs';

/** @param {import('./io.mjs').Ctx} ctx */
export function cmdQuestions(ctx) {
  const [verb, target, raw = '{}'] = ctx.args.pos;
  const dir = needDir(ctx, target, 1);
  try {
    const m = loadFeature(dir);
    if (!m.flow.state) throw new Error('Реестр доступен только в новом процессе; старый процесс не меняется');
    const input = JSON.parse(raw);
    const text = questionOperation(m, verb, input);
    ctx.io.log(ctx.args.flags.json ? JSON.stringify({ text }) : screen(text, verb === 'resume' ? 'продолжи только выбранную ветку по правилам выше' : G.stop));
  } catch (error) {
    ctx.io.log(ctx.args.flags.json ? JSON.stringify({ error: String(error) }) : screen(String(error), G.stop));
    ctx.io.exit(2);
  }
}

/** @param {import('./model.mjs').Feature} m @param {string} verb @param {any} input */
function questionOperation(m, verb, input) {
  if (verb === 'resume') return resumeQuestion(m, input);
  if (verb === 'history') return questionHistory(m);
  if (verb === 'list') return registrySummary(m, input);
  if (verb === 'work') return draftWork(m, input.refs || []);
  if (verb === 'recover') {
    recoverRegistry(m.dir);
    return 'Запись реестра восстановлена. Проверьте сводку вопросов.';
  }
  const q = applyQuestion(m.dir, verb, input);
  return questionCard(registryQuestions(loadFeature(m.dir), { id: q.id })[0]);
}
