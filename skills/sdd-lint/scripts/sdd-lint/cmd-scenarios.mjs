// GigaCode: состояние, поиск и механический перенос одного набора сценариев.
// @ts-check
import { checkDecision } from './decision-files.mjs';
import { scenarioStatus } from './scenario-view.mjs';
import { loadFeature } from './feature.mjs';
import { requireDocumentationFlow } from './flow.mjs';
import { read, rel } from './md.mjs';
import { needDir } from './pick.mjs';
import { READ_LIMIT, visibleLength } from './read-size.mjs';
import { stripProtocol } from './sources.mjs';
import { planScenarioMove } from './scenario-plan.mjs';
import { scenarioFiles, SCENARIO_LINK } from './scenario-section.mjs';
import { scenarioJournal, publishScenarioMove, recoverScenarioMove } from './scenario-store.mjs';
import { G, screen } from './screen.mjs';

/** @typedef {import('./model.mjs').Feature} Feature */
/** @param {string} dir */
function verifyMove(dir) {
  const m = loadFeature(dir, (f) => f === scenarioJournal(dir) ? null : read(f));
  requireDocumentationFlow(m);
  checkDecision(m);
}

/** @param {Feature} m */
function move(m) {
  requireDocumentationFlow(m);
  if (scenarioFiles(m).length && m.spec?.md.includes(SCENARIO_LINK)) return 'Сценарии уже вынесены.\n' + scenarioStatus(m);
  if (visibleLength(stripProtocol(m.spec?.md || '')) <= READ_LIMIT) return 'Лимит spec не превышен; перенос не нужен.\n' + scenarioStatus(m);
  const plan = planScenarioMove(m);
  publishScenarioMove(m.dir, plan, () => verifyMove(m.dir));
  return 'Раздел сценариев перенесён. Содержание и ID сохранены.\n' + scenarioStatus(loadFeature(m.dir));
}

/** @param {Feature} m @param {string} query */
function findScenarios(m, query) {
  requireDocumentationFlow(m);
  const records = m.flow.records.filter((r) => ['scenario', 'step'].includes(r.kind));
  const found = records.filter((r) => `${r.id} ${r.title}`.toLowerCase().includes(query.toLowerCase()));
  return found.map((r) => `${r.id} — ${r.title}: ${rel(r.file)}:${r.n}`).join('\n') || 'Сценарии не найдены.';
}

/** @param {import('./io.mjs').Ctx} ctx */
export function cmdScenarios(ctx) {
  const dir = needDir(ctx, ctx.args.pos[1], 1);
  /** @type {{text?: string, error?: string}} */
  let result;
  try {
    result = { text: operate(loadFeature(dir), ctx.args.pos[0], ctx.args.pos[2] || '') };
  } catch (error) { result = { error: String(error) }; }
  display(ctx, result, result.error ? G.stop : G.call(['ask', rel(dir)]));
  if (result.error) ctx.io.exit(2);
}

/** @param {Feature} m @param {string} verb @param {string} query */
function operate(m, verb, query) {
  if (!m.flow.state) throw new Error('Не найден .sdd-flow.json для работы со сценариями');
  if (verb === 'move') return move(m);
  if (verb === 'find') return findScenarios(m, query);
  if (verb === 'status') { requireDocumentationFlow(m); return scenarioStatus(m); }
  if (verb !== 'recover') throw new Error('scenarios: status | find | move | recover');
  recoverScenarioMove(m.dir, () => verifyMove(m.dir));
  return 'Восстановление переноса завершено.\n' + scenarioStatus(loadFeature(m.dir));
}

/** @param {import('./io.mjs').Ctx} ctx @param {{text?: string, error?: string}} result @param {string} guide */
function display(ctx, result, guide) {
  const text = result.error ?? result.text ?? '';
  ctx.io.log(ctx.args.flags.json ? JSON.stringify(result) : screen(text, guide));
}
