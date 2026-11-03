// Команды plan и done: проверка плана нарезки и конец этапа одной командой — с лимитом прогонов.
// @ts-check
import fs from 'node:fs';

import { askOf } from './ask.mjs';
import { gateClosed } from './cmd-check.mjs';
import { closedScreen } from './guide.mjs';
import { fixFeature, fixedText } from './cmd-fix.mjs';
import { loadFeature, featureFiles, runChecks } from './feature.mjs';
import { line, report } from './findings.mjs';
import { rel } from './md.mjs';
import { needDir } from './pick.mjs';
import { questionsView, viewText } from './question.mjs';
import { G, blocks, list, screen } from './screen.mjs';
import { MAX_RUNS, bump, mark, reset } from './runs.mjs';
import { saveSnapshot } from './snapshot.mjs';

/** @typedef {import('./io.mjs').Ctx} Ctx */

// Ошибки не ушли: прогоны до MAX_RUNS — агент исправляет сам; после лимита — человеку, счётчик сброшен.
// Одна форма для plan и done: агент не крутится в цикле правок.
/**
 * dir — папка фичи, kind — счётчик прогонов (plan или done), runs — номер этого прогона.
 * @param {Ctx} ctx
 * @param {{ dir: string, kind: string, runs: number, what: string, fix: string, then: string[], stuck: string, ask: string }} t
 * @returns {never}
 */
function retryOrStop(ctx, t) {
  if (t.runs < MAX_RUNS) ctx.io.log(`\n${screen(`${t.what}, исправляю — прогон ${t.runs} из ${MAX_RUNS}.`, t.fix, G.then(t.then))}`);
  else {
    reset(t.dir, t.kind);
    ctx.io.log(`\n${screen(`${t.stuck} не ушли за ${MAX_RUNS} прогона — список выше. ${t.ask}`, 'коротко объясни человеку, что не вышло и почему', G.stop)}`);
  }
  return ctx.io.exit(1);
}

// План проверяет скрипт, а не модель: покрытие, причины, зависимости, сервисы.
/** @param {Ctx} ctx */
export function cmdPlan(ctx) {
  const { pos } = ctx.args;
  const m = loadFeature(needDir(ctx, pos[0]));
  const dir = rel(m.dir);
  if (!m.plan) {
    ctx.io.log(
      screen(`Плана нарезки ещё нет: ${rel(m.planFile)}.`, `запиши ${rel(m.planFile)} по шаблону assets/plan.md скилла sdd-slices`, G.then(['plan', dir])),
    );
    ctx.io.exit(2);
  }
  const all = runChecks(m);
  const closed = gateClosed(m, 'slices', all);
  if (closed) {
    ctx.io.log(closedScreen('slices', closed));
    ctx.io.exit(3);
  }
  const c = report(ctx, all.filter((x) => x.rule.startsWith('PL')));
  const { runs } = bump(m.dir, 'plan');
  if (c.err)
    retryOrStop(ctx, {
      dir: m.dir,
      kind: 'plan',
      runs,
      what: `План нарезки не готов: ошибок ${c.err}`,
      fix: `исправь ${rel(m.planFile)}`,
      then: ['plan', dir],
      stuck: 'Ошибки в плане нарезки',
      ask: 'Как быть: поправить план вместе или вы поправите сами?',
    });
  reset(m.dir, 'plan');
  const warn = c.warn ? `предупреждений ${c.warn} — повод склеить slices: поправь план или оставь, человек увидит их рядом с планом` : null;
  ctx.io.log(`\n${screen(`План нарезки без ошибок: ${m.plan.slices.length} slices.`, warn, G.call(['ask', dir]))}`);
  ctx.io.exit(0);
}

// Черновик стал «на ревью»: статус меняет скрипт, а не агент.
/** @param {import('./model.mjs').Feature} m */
function promote(m) {
  /** @type {string[]} */
  const out = [];
  const set = (/** @type {string} */ file) => {
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^Статус:.*$/m, 'Статус: на ревью'));
    out.push(rel(file));
  };
  if (m.slices.size && m.readme != null && /черновик/i.test(m.slicesStatus || '')) set(m.readmeFile);
  if (m.spec && /черновик/i.test(m.spec.status || '')) set(m.specFile);
  return out;
}

// Конец этапа: fix → (ошибки — исправить и снова done) → «на ревью», снимок для guard, вопрос этапа.
// Предупреждения агент правит один раз; что осталось, видит человек.
/** @param {Ctx} ctx */
export function cmdDone(ctx) {
  const { pos } = ctx.args;
  const { m, changed, notes, findings } = fixFeature(ctx, needDir(ctx, pos[0]));
  const dir = rel(m.dir);
  const errs = findings.filter((x) => x.level === 'err');
  const warns = findings.filter((x) => x.level === 'warn');
  const { runs, prev } = bump(m.dir, 'done');
  ctx.io.log(fixedText(changed));
  for (const n of notes) ctx.io.log(`\n${n}`);

  if (errs.length) {
    ctx.io.log('');
    report(ctx, findings);
    retryOrStop(ctx, {
      dir: m.dir,
      kind: 'done',
      runs,
      what: `Этап не готов: ошибок ${errs.length}`,
      fix: 'исправь ошибки',
      then: ['done', dir],
      stuck: 'Ошибки',
      ask: 'Как быть?',
    });
  }
  if (warns.length && !prev?.warnTried) {
    mark(m.dir, 'done', { warnTried: true });
    ctx.io.log('');
    report(ctx, findings);
    const say = `Ошибок нет, предупреждений ${warns.length} — поправлю те, что можно без вашего решения.`;
    ctx.io.log(`\n${screen(say, 'исправь предупреждения, которые не требуют решения человека; остальные не трогай', G.then(['done', dir]))}`);
    ctx.io.exit(1);
  }
  finishDone(ctx, m, warns);
}

// Этап готов: черновики — «на ревью», снимки для guard, счётчик прогонов сброшен; дальше — вопрос этапа.
/** @param {Ctx} ctx @param {import('./model.mjs').Feature} m @param {import('./model.mjs').Finding[]} warns @returns {never} */
function finishDone(ctx, m, warns) {
  const promoted = promote(m);
  const f = loadFeature(m.dir);
  for (const file of featureFiles(f)) saveSnapshot(file);
  reset(m.dir, 'done');
  const ready = `Этап готов: ошибок 0, предупреждений ${warns.length}.${promoted.length ? ` Статус «на ревью»: ${promoted.join(', ')}.` : ''}`;
  const left = warns.length
    ? `Осталось:\n${list([...warns.slice(0, 5).map((x) => line(x).replace(/^\S+\s+/, '')), ...(warns.length > 5 ? [`…и ещё ${warns.length - 5}`] : [])])}`
    : null;
  const { stage, questions } = askOf(f);
  ctx.io.log(`\n${viewText(questionsView(rel(m.dir), stage, questions, { lead: blocks(ready, left) }))}`);
  return ctx.io.exit(0);
}
