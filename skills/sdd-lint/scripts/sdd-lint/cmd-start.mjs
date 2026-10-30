// Команды start (скилл /sdd-grill: задача, папка, источники по шагам) и research (задания сабагенту на любом этапе, проверка контекста).
import { flags, pos } from './args.mjs';
import { usage } from './cli.mjs';
import { contextFindings, factTask, loadContext, markContext, researchTask, syncContext } from './context.mjs';
import { loadFeature } from './feature.mjs';
import { findings, report } from './findings.mjs';
import { stageName } from './guide.mjs';
import { REPO, inventory } from './input.mjs';
import { header, rel } from './md.mjs';
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

// Источники и задача фичи для заданий сабагенту: из протокола, после /sdd-close — из контекста;
// ничего нет — то, что в папке. Исследование нужно на любом этапе, не только в brainstorming.
function researchInput(m) {
  const ctx = loadContext(m);
  const fromCtx = ctx?.sources ? ctx.sources.split(/\s*;\s*/).filter(Boolean) : null;
  if (m.protocol) {
    const task = taskOf(m.protocol);
    const fallback = inventory(m.name).empty ? [] : [REPO];
    return { task, list: researchList(task, sourcesOf(m.protocol) || fromCtx || fallback) };
  }
  const title = m.spec ? (m.spec.md.match(/^#\s+(.+?)(?:\s+—\s+Dev Spec)?\s*$/m) || [])[1] : null;
  const line = header(ctx?.md, 'Задача') || (title ? `«${title}»` : m.name);
  return { task: { line }, list: fromCtx || (inventory(m.name).empty ? [] : [REPO]) };
}

export function cmdResearch() {
  const what = pos[0];
  if (!['context', 'fact', 'check'].includes(what)) pickChoice('research');
  const m = loadFeature(needDir(pos[1], 1));
  const { task, list } = researchInput(m);
  const stage = stageName(m);
  if (what === 'context') {
    console.log(list.length ? researchTask(m, list, task.line, stage) : 'Источников нет — изучать нечего. Последним сообщением напиши: «Источников нет».');
    process.exit(0);
  }
  if (what === 'fact') {
    const q = pos.slice(2).join(' ').trim();
    if (!q) usage('Укажи вопрос: research fact docs/<feature> "<вопрос>"');
    console.log(factTask(m, list, task.line, q, stage));
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
