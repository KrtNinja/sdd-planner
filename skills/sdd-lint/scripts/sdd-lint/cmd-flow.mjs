// Служебный next для явно созданных тестовых v2-фич. Обычный start остаётся прежним.
// @ts-check
import { loadFeature } from './feature.mjs';
import { checkDocumentationFlow } from './flow.mjs';
import { reserveFlowId } from './flow-state.mjs';
import { needDir } from './pick.mjs';
import { G, screen } from './screen.mjs';

/** @param {import('./io.mjs').Ctx} ctx */
export function cmdFlowNext(ctx) {
  const kind = (ctx.args.pos[0] || '').toUpperCase();
  if (!['Q', 'SC', 'STEP'].includes(kind)) return false;
  const m = loadFeature(needDir(ctx, ctx.args.pos[1], 1));
  const parent = ctx.args.pos[2];
  const problems = checkDocumentationFlow(m);
  if (problems.length) return stop(ctx, problems.map((p) => p.msg).join('; '));
  if (kind === 'STEP' && !m.flow.records.some((r) => r.kind === 'scenario' && r.id === parent))
    return stop(ctx, 'Шагу нужен существующий сценарий SC-n');
  let id;
  try { id = reserveFlowId(m.dir, /** @type {import('./flow-state.mjs').IdKind} */ (kind), parent); }
  catch (error) { return stop(ctx, String(error)); }
  ctx.io.log(id);
  return true;
}

/** @param {import('./io.mjs').Ctx} ctx @param {string} message @returns {never} */
function stop(ctx, message) {
  ctx.io.log(screen(message, G.stop));
  return ctx.io.exit(1);
}
