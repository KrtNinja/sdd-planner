// Команды plan и done: проверка плана нарезки и конец этапа одной командой — с лимитом прогонов.
import fs from 'node:fs';

import { pos } from './legacy.mjs';
import { askOf } from './ask.mjs';
import { gateClosed } from './cmd-check.mjs';
import { closedScreen } from './guide.mjs';
import { fixFeature, fixedText } from './cmd-fix.mjs';
import { loadFeature, featureFiles, runChecks } from './feature.mjs';
import { findings, line, report } from './findings.mjs';
import { rel } from './md.mjs';
import { needDir } from './pick.mjs';
import { questionsView, viewText } from './question.mjs';
import { G, blocks, list, screen } from './screen.mjs';
import { MAX_RUNS, bump, mark, reset } from './runs.mjs';
import { saveSnapshot } from './snapshot.mjs';

const exitWith = (code) => process.exit(code);


// План проверяет скрипт, а не модель: покрытие, причины, зависимости, сервисы.
export function cmdPlan() {
  const m = loadFeature(needDir(pos[0]));
  const dir = rel(m.dir);
  if (!m.plan) {
    console.log(screen(`Плана нарезки ещё нет: ${rel(m.planFile)}.`, `запиши ${rel(m.planFile)} по шаблону assets/plan.md скилла sdd-slices`, G.then(['plan', dir])));
    exitWith(2);
  }
  runChecks(m);
  const closed = gateClosed(m, 'slices');
  if (closed) {
    console.log(closedScreen('slices', closed));
    exitWith(3);
  }
  const own = findings.filter((x) => x.rule.startsWith('PL'));
  findings.length = 0;
  findings.push(...own);
  const c = report();
  const { runs } = bump(m.dir, 'plan');
  if (c.err) {
    if (runs < MAX_RUNS) console.log(`\n${screen(`План нарезки не готов: ошибок ${c.err}, исправляю — прогон ${runs} из ${MAX_RUNS}.`, `исправь ${rel(m.planFile)}`, G.then(['plan', dir]))}`);
    else {
      reset(m.dir, 'plan');
      console.log(`\n${screen(`Ошибки в плане нарезки не ушли за ${MAX_RUNS} прогона — список выше. Как быть: поправить план вместе или вы поправите сами?`, 'коротко объясни человеку, что не вышло и почему', G.stop)}`);
    }
    exitWith(1);
  }
  reset(m.dir, 'plan');
  const warn = c.warn ? `предупреждений ${c.warn} — повод склеить slices: поправь план или оставь, человек увидит их рядом с планом` : null;
  console.log(`\n${screen(`План нарезки без ошибок: ${m.plan.slices.length} slices.`, warn, G.call(['ask', dir]))}`);
  exitWith(0);
}

// Черновик стал «на ревью»: статус меняет скрипт, а не агент.
function promote(m) {
  const out = [];
  const set = (file) => {
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^Статус:.*$/m, 'Статус: на ревью'));
    out.push(rel(file));
  };
  if (m.slices.size && m.readme != null && /черновик/i.test(m.slicesStatus || '')) set(m.readmeFile);
  if (m.spec && /черновик/i.test(m.spec.status || '')) set(m.specFile);
  return out;
}

// Конец этапа: fix → (ошибки — исправить и снова done) → «на ревью», снимок для guard, вопрос этапа.
// Предупреждения агент правит один раз; что осталось, видит человек.
export function cmdDone() {
  const { m, changed, notes } = fixFeature(needDir(pos[0]));
  const dir = rel(m.dir);
  const errs = findings.filter((x) => x.level === 'err');
  const warns = findings.filter((x) => x.level === 'warn');
  const { runs, prev } = bump(m.dir, 'done');
  console.log(fixedText(changed));
  for (const n of notes) console.log(`\n${n}`);

  if (errs.length) {
    console.log('');
    report();
    if (runs < MAX_RUNS) console.log(`\n${screen(`Этап не готов: ошибок ${errs.length}, исправляю — прогон ${runs} из ${MAX_RUNS}.`, 'исправь ошибки', G.then(['done', dir]))}`);
    else {
      reset(m.dir, 'done');
      console.log(`\n${screen(`Ошибки не ушли за ${MAX_RUNS} прогона — список выше. Как быть?`, 'коротко объясни человеку, что не вышло и почему', G.stop)}`);
    }
    exitWith(1);
  }
  if (warns.length && !prev?.warnTried) {
    mark(m.dir, 'done', { warnTried: true });
    console.log('');
    report();
    console.log(
      `\n${screen(`Ошибок нет, предупреждений ${warns.length} — поправлю те, что можно без вашего решения.`, 'исправь предупреждения, которые не требуют решения человека; остальные не трогай', G.then(['done', dir]))}`,
    );
    exitWith(1);
  }

  const promoted = promote(m);
  const f = loadFeature(m.dir);
  for (const file of featureFiles(f)) saveSnapshot(file);
  reset(m.dir, 'done');
  const ready = `Этап готов: ошибок 0, предупреждений ${warns.length}.${promoted.length ? ` Статус «на ревью»: ${promoted.join(', ')}.` : ''}`;
  const left = warns.length
    ? `Осталось:\n${list([...warns.slice(0, 5).map((x) => line(x).replace(/^\S+\s+/, '')), ...(warns.length > 5 ? [`…и ещё ${warns.length - 5}`] : [])])}`
    : null;
  const { stage, questions } = askOf(f);
  console.log(`\n${viewText(questionsView(dir, stage, questions, { lead: blocks(ready, left) }))}`);
  exitWith(0);
}
