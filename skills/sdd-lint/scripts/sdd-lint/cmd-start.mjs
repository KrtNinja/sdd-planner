// Команды start (скилл /sdd-grill: задача, папка, источники по шагам) и research (задания сабагенту, проверка контекста).
import { flags, pos } from './args.mjs';
import { usage } from './cli.mjs';
import { contextFindings, factTask, loadContext, markContext, researchTask, syncContext } from './context.mjs';
import { loadFeature } from './feature.mjs';
import { findings, report } from './findings.mjs';
import { rel } from './md.mjs';
import { needDir, pickChoice } from './pick.mjs';
import { acceptContext, addSources, renameFeature, researchList, sourcesOf, startFrom, taskOf } from './start.mjs';

// Вывод — один следующий шаг для агента; код 0, даже когда шаг — вопрос человеку.
export function cmdStart() {
  let out;
  if (flags.sources != null || flags.accept || flags.rename) {
    const dir = needDir(pos[0]);
    out = flags.rename ? renameFeature(dir, flags.rename) : flags.sources != null ? addSources(dir, flags.sources) : acceptContext(dir);
  } else out = startFrom(pos.join(' '), flags.slug);
  console.log(out);
  process.exit(0);
}

export function cmdResearch() {
  const what = pos[0];
  if (!['context', 'fact', 'check'].includes(what)) pickChoice('research');
  const m = loadFeature(needDir(pos[1], 1));
  if (!m.protocol) usage(`Нет ${rel(m.protocolFile)}: исследование идёт внутри /sdd-grill`);
  const task = taskOf(m.protocol);
  const list = researchList(task, sourcesOf(m.protocol) || []);
  if (what === 'context') {
    console.log(list.length ? researchTask(m, list, task.line) : 'Источников нет — изучать нечего. Последним сообщением напиши: «Источников нет».');
    process.exit(0);
  }
  if (what === 'fact') {
    const q = pos.slice(2).join(' ').trim();
    if (!q) usage('Укажи вопрос: research fact docs/<feature> "<вопрос>"');
    console.log(factTask(m, list, task.line, q));
    process.exit(0);
  }
  const { ctx } = syncContext(m, list.join('; '), task.line);
  findings.push(...contextFindings(ctx));
  const c = report();
  if (c.err) {
    console.log(`\nОшибок: ${c.err}. Исправь ${rel(ctx.file)} и снова sdd_lint ["research","check","${rel(m.dir)}"].`);
    process.exit(1);
  }
  markContext(loadContext(m), 'Проверено');
  console.log(`\n${rel(ctx.file)}: проверено, фактов о проекте — ${ctx.facts}.${c.warn ? ` Предупреждений ${c.warn}: поправь, если это просто.` : ''}`);
  process.exit(0);
}
