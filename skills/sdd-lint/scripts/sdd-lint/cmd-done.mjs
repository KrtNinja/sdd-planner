// Команды plan и done: проверка плана нарезки и конец этапа одной командой — с лимитом прогонов.
import fs from 'node:fs';

import { pos } from './args.mjs';
import { askView } from './ask.mjs';
import { gateClosed } from './cmd-check.mjs';
import { fixFeature, fixedText } from './cmd-fix.mjs';
import { loadFeature, featureFiles, runChecks } from './feature.mjs';
import { findings, line, report } from './findings.mjs';
import { rel } from './md.mjs';
import { needDir } from './pick.mjs';
import { MAX_RUNS, bump, mark, reset } from './runs.mjs';
import { saveSnapshot } from './snapshot.mjs';

const call = (...args) => `sdd_lint ${JSON.stringify(args)}`;
const exitWith = (code) => process.exit(code);

// План проверяет скрипт, а не модель: покрытие, причины, зависимости, сервисы.
export function cmdPlan() {
  const m = loadFeature(needDir(pos[0]));
  const dir = rel(m.dir);
  if (!m.plan) {
    console.log(`Плана нет: запиши ${rel(m.planFile)} по шаблону assets/plan.md скилла sdd-slices, затем ${call('plan', dir)}.`);
    exitWith(2);
  }
  runChecks(m);
  const closed = gateClosed(m, 'slices');
  if (closed) {
    console.log(`ВОРОТА slices: закрыты — ${closed[0]}.\nСкажи человеку: «${closed[1]}» — и остановись.`);
    exitWith(3);
  }
  const own = findings.filter((x) => x.rule.startsWith('PL'));
  findings.length = 0;
  findings.push(...own);
  const c = report();
  const { runs } = bump(m.dir, 'plan');
  if (c.err) {
    if (runs < MAX_RUNS) console.log(`\nНе готово: ошибок ${c.err}. Исправь ${rel(m.planFile)} и снова ${call('plan', dir)} — прогон ${runs} из ${MAX_RUNS}.`);
    else {
      reset(m.dir, 'plan');
      console.log(`\nОшибки в плане не ушли за ${MAX_RUNS} прогона. Покажи человеку список выше одним сообщением, спроси, как быть, и остановись.`);
    }
    exitWith(1);
  }
  reset(m.dir, 'plan');
  const warn = c.warn ? ` Предупреждений ${c.warn}: это повод склеить slices — поправь план или оставь, человек увидит их рядом с планом.` : '';
  console.log(`\nПлан без ошибок: ${m.plan.slices.length} slices.${warn}\nДальше — ${call('ask', dir)}: он покажет план человеку и спросит, подходит ли нарезка.`);
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
  for (const n of notes) console.log(n);

  if (errs.length) {
    console.log('');
    report();
    if (runs < MAX_RUNS) console.log(`\nНе готово: ошибок ${errs.length}. Исправь их и снова ${call('done', dir)} — прогон ${runs} из ${MAX_RUNS}.`);
    else {
      reset(m.dir, 'done');
      console.log(`\nОшибки не ушли за ${MAX_RUNS} прогона. Покажи человеку список выше одним сообщением: что не вышло и почему. Спроси, как быть, и остановись.`);
    }
    exitWith(1);
  }
  if (warns.length && !prev?.warnTried) {
    mark(m.dir, 'done', { warnTried: true });
    console.log('');
    report();
    console.log(
      `\nНе готово: ошибок нет, предупреждений ${warns.length}. Исправь те, что можно без решения человека, и снова ${call('done', dir)}.` +
        ' Остальные не трогай — done покажет их человеку.',
    );
    exitWith(1);
  }

  const promoted = promote(m);
  const f = loadFeature(m.dir);
  for (const file of featureFiles(f)) saveSnapshot(file);
  reset(m.dir, 'done');
  const out = ['', `Этап готов: ошибок 0, предупреждений ${warns.length}.${promoted.length ? ` Статус «на ревью»: ${promoted.join(', ')}.` : ''}`];
  if (warns.length) {
    const shown = warns.slice(0, 5).map((x) => line(x).replace(/^\S+\s+/, ''));
    out.push(`Скажи человеку, что осталось:\n${shown.map((x) => `  ${x}`).join('\n')}${warns.length > 5 ? `\n  …и ещё ${warns.length - 5}` : ''}`);
  }
  out.push('Затем задай вопрос этапа — как, сказано в instruction:', JSON.stringify(askView(f), null, 2));
  console.log(out.join('\n'));
  exitWith(0);
}
