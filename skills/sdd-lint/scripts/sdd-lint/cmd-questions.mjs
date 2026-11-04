// Служебная команда для GigaCode; человеку — карточка, модели — следующий шаг.
// @ts-check
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
    let text;
    if (verb === 'list') text = registrySummary(m, input);
    else if (verb === 'work') text = draftWork(m, input.refs || []);
    else if (verb === 'recover') {
      recoverRegistry(dir);
      text = 'Запись реестра восстановлена. Проверьте сводку вопросов.';
    } else {
      const q = applyQuestion(dir, verb, input);
      text = questionCard(registryQuestions(loadFeature(dir), { id: q.id })[0]);
    }
    ctx.io.log(ctx.args.flags.json ? JSON.stringify({ text }) : screen(text, G.stop));
  } catch (error) {
    ctx.io.log(ctx.args.flags.json ? JSON.stringify({ error: String(error) }) : screen(String(error), G.stop));
    ctx.io.exit(2);
  }
}
