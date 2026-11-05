// Вопрос и представление используют те же действия, что check и done.
// @ts-check
import { flowQuestions, progressText } from './flow-progress.mjs';
import { stageOf } from './stage.mjs';
import { rel } from './md.mjs';
import { questionsView } from './question.mjs';

/** @param {import('./model.mjs').Feature} m */
export function askOf(m) {
  const st = stageOf(m);
  return { stage: st.now, questions: st.questions || flowQuestions(m, st.now) };
}

/** @param {import('./model.mjs').Feature} m */
export function askView(m) {
  const { stage, questions } = askOf(m);
  return questionsView(rel(m.dir), stage, questions, { lead: progressText(m) });
}
