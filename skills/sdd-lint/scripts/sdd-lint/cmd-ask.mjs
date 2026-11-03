// Команды ask и choose.
// @ts-check
import { askOf, askView } from './ask.mjs';
import { closeOptions } from './close.mjs';
import { targetFiles } from './cmd-guard.mjs';
import { skillPrompt } from './cmd-prompt.mjs';
import { loadFeature } from './feature.mjs';
import { rel } from './md.mjs';
import { needDir } from './pick.mjs';
import { ANSWER, viewText, waitText } from './question.mjs';
import { G, blocks, gearLine, screen, splitGear } from './screen.mjs';
import { saveSnapshot } from './snapshot.mjs';
import { tempArtifacts } from './stage.mjs';
import { startQuestion } from './start-sources.mjs';

/** @typedef {import('./io.mjs').Ctx} Ctx */
/** @typedef {import('./model.mjs').Feature} Feature */
/** @typedef {import('./question.mjs').Action} Action */

/** @param {Ctx} ctx */
export function cmdAsk(ctx) {
  const m = loadFeature(needDir(ctx, ctx.args.pos[0]));
  ctx.io.log(viewText(askView(m)));
  ctx.io.exit(0);
}

// Команда lint для выбранного варианта — тем же run(), что и CLI, без нового процесса. Вывод как у
// процесса: при успехе только stdout, при ошибке stdout и stderr; падение — код 1 и стек.
/** @param {Ctx} ctx @param {string[]} args */
function runLint(ctx, args) {
  try {
    const { code, chunks } = ctx.lint(args);
    const text = (/** @type {1 | 2} */ fd) => chunks.filter(([f]) => f === fd).map(([, t]) => t).join('');
    return { out: code ? text(1) + text(2) : text(1), code };
  } catch (e) {
    return { out: String(e instanceof Error ? e.stack : e), code: 1 };
  }
}
// Строка ⚙ после команды lint: упала — её строка или стоп; прошла — after, её строка или следующий вызов.
/** @param {number} code @param {string | null} gear @param {Action} a @param {string[]} next */
function gearAfter(code, gear, a, next) {
  if (code) return gear || gearLine(G.stop);
  if (a.after) return gearLine(a.after);
  return gear || gearLine(G.call(next));
}
// Одно исполнение для всех действий: выбранного варианта и ответа человека на wait.
// Человеку — карточка (что происходит), агенту — строка ⚙. id — вариант, asked — вопрос, на который
// пришёл ответ: ответ не понят (код 2) — спросить ещё раз.
/** @param {Ctx} ctx @param {Feature} m @param {Action} a @param {{ id: string, asked?: Action | null }} opts */
function act(ctx, m, a, { id, asked = null }) {
  const d = rel(m.dir);
  const next = a.next || ['ask', d];
  if (a.lint) {
    const { out, code } = runLint(ctx, a.lint);
    const { card, gear } = splitGear(out);
    if (code === 2 && a.retry && asked) {
      ctx.io.log(waitText(blocks(card, asked.wait), /** @type {string[]} */ (asked.then)));
      ctx.io.exit(0);
    }
    // Вывод команды уже карточка; её строка ⚙ главнее (close --json задаёт свой вопрос, start ведёт дальше).
    // after — что дальше, когда команда прошла (gen slices: продолжить скилл, а не новый вопрос).
    const g = gearAfter(code, gear, a, next);
    ctx.io.log(blocks(card || 'Готово.', g));
    ctx.io.exit(code);
  }
  if (a.subagent) {
    if (ctx.args.flags.fallback) {
      ctx.io.log(screen(a.fallback || 'Сабагентов нет — этот шаг здесь не выполнить.', G.stop));
      ctx.io.exit(0);
    }
    if (a.snapshot) for (const f of targetFiles(ctx, a.snapshot)) saveSnapshot(f);
    // Без сабагентов: here — тот же скилл здесь, fallback — что сказать человеку (choose --fallback).
    const none = a.here ? `без сабагентов — ${G.call(a.here)}` : `без сабагентов — ${G.call(['choose', d, id, '--fallback'])}`;
    ctx.io.log(screen(a.say, G.sub(a.subagent), a.quiet ? G.quiet : G.report, G.then(next), none));
  } else if (a.here) ctx.io.log(screen(skillPrompt(ctx, a.here[1], a.here.slice(2)), G.skill));
  else if (a.show) ctx.io.log(screen(a.show, G.stop));
  else if (a.wait) ctx.io.log(waitText(a.wait, /** @type {string[]} */ (a.then)));
  else ctx.io.log(screen('Хорошо, ничего не делаю.', G.stop));
  ctx.io.exit(0);
}

/** @param {Ctx} ctx */
export function cmdChoose(ctx) {
  const { pos } = ctx.args;
  const m = loadFeature(needDir(ctx, pos[0]));
  const d = rel(m.dir);
  const [id, answer] = [pos[1], pos[2]];
  // Подтверждение close задаёт сам close, поэтому его варианта в askOf нет: добавляем, пока есть что удалять.
  // Вопросы старта /sdd-grill (источники) задаёт сам start — их варианты тоже здесь, пока вопрос актуален.
  const all = [...askOf(m).questions.flatMap((q) => q.options), ...(tempArtifacts(m).length ? closeOptions(m) : []), ...(startQuestion(m)?.options || [])];
  const opt = all.find((o) => o.id === id);
  if (!opt) {
    ctx.io.error(screen(id ? `Варианта «${id}» сейчас нет — этап изменился. Задам вопрос заново.` : 'Вариант не указан.', G.call(['ask', d])));
    ctx.io.exit(2);
  }
  // Варианты вопросов этапа, close и старта — все с действием.
  const a = /** @type {Action} */ (opt.action);
  // Ответ человека на wait: answer превращает его в действие (decide в сабагенте, triage).
  if (answer !== undefined && a.answer) {
    if (!answer.trim() || answer === ANSWER) {
      ctx.io.log(waitText(blocks('Ответа нет.', a.wait), /** @type {string[]} */ (a.then)));
      ctx.io.exit(0);
    }
    act(ctx, m, a.answer(answer), { id, asked: a });
  }
  act(ctx, m, a, { id });
}
