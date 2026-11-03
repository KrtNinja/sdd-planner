// Команды start (скилл /sdd-grill: задача, папка, источники по шагам) и research (задания сабагенту на любом этапе, проверка контекста).
// @ts-check
import { usage } from './cli.mjs';
import { contextFindings, factTask, loadContext, markContext, researchTask, syncContext } from './context.mjs';
import { loadFeature } from './feature.mjs';
import { report } from './findings.mjs';
import { stageName } from './guide.mjs';
import { REPO, inventory } from './input.mjs';
import { header, rel } from './md.mjs';
import { choiceOf, needDir } from './pick.mjs';
import { G, screen } from './screen.mjs';
import { researchList, sourcesOf, taskOf } from './start-sources.mjs';
import { acceptContext, addSources, renameFeature, startFrom } from './start.mjs';

/** @typedef {import('./io.mjs').Ctx} Ctx */

// Вывод — один следующий шаг для агента; код 0, даже когда шаг — вопрос человеку.
/** @param {Ctx} ctx */
export function cmdStart(ctx) {
  const { flags, pos } = ctx.args;
  let out;
  if (flags.sources != null || flags.accept || flags.rename) {
    const dir = needDir(ctx, pos[0]);
    if (flags.rename) out = renameFeature(dir, flags.rename);
    else if (flags.sources != null) out = addSources(dir, flags.sources);
    else out = acceptContext(dir);
  } else out = startFrom(pos.join(' '), flags.slug, flags.name);
  ctx.io.log(out);
  ctx.io.exit(0);
}

// Источники и задача фичи для заданий сабагенту: из протокола, после /sdd-close — из контекста;
// ничего нет — то, что в папке. Исследование нужно на любом этапе, не только в brainstorming.
/** @param {import('./model.mjs').Feature} m */
function researchInput(m) {
  const context = loadContext(m);
  const fromCtx = context?.sources ? context.sources.split(/\s*;\s*/).filter(Boolean) : null;
  if (m.protocol) {
    const task = taskOf(m.protocol);
    const fallback = inventory(m.name).empty ? [] : [REPO];
    return { task, list: researchList(task, sourcesOf(m.protocol) || fromCtx || fallback) };
  }
  const title = m.spec ? (m.spec.md.match(/^#\s+(.+?)(?:\s+—\s+Dev Spec)?\s*$/m) || [])[1] : null;
  const line = header(context?.md, 'Задача') || (title ? `«${title}»` : m.name);
  return { task: { line }, list: fromCtx || (inventory(m.name).empty ? [] : [REPO]) };
}

/** @param {Ctx} ctx */
export function cmdResearch(ctx) {
  const { pos } = ctx.args;
  const what = choiceOf(ctx, 'research');
  const m = loadFeature(needDir(ctx, pos[1], 1));
  const { task, list } = researchInput(m);
  const stage = stageName(m);
  if (what === 'context') {
    ctx.io.log(
      list.length ? researchTask(m, list, task.line, stage) : screen('Источников нет — изучать нечего.', 'последним сообщением напиши «Источников нет»'),
    );
    ctx.io.exit(0);
  }
  if (what === 'fact') {
    const q = pos.slice(2).join(' ').trim();
    if (!q) usage(ctx, 'Укажи вопрос: research fact docs/<feature> "<вопрос>"');
    ctx.io.log(factTask(m, list, task.line, q, stage));
    ctx.io.exit(0);
  }
  const { ctx: context } = syncContext(m, list.join('; '), task.line);
  const c = report(ctx, contextFindings(context));
  if (c.err) {
    ctx.io.log(`\n${screen(`Ошибок в \`${rel(context.file)}\`: ${c.err}.`, `исправь ${rel(context.file)}`, G.then(['research', 'check', rel(m.dir)]))}`);
    ctx.io.exit(1);
  }
  markContext(/** @type {import('./context.mjs').Context} */ (loadContext(m)), 'Проверено');
  const checked = `\`${rel(context.file)}\`: проверено, фактов о проекте — ${context.facts}.`;
  ctx.io.log(`\n${screen(checked, c.warn ? `предупреждений ${c.warn} — поправь, если это просто` : null)}`);
  ctx.io.exit(0);
}
