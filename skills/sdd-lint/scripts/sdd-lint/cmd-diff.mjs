// Команда diff: проверки DF-* по git.
// @ts-check
import { relatedIds } from './registry-view.mjs';
import { usage } from './cli.mjs';
import { skillCode } from './config.mjs';
import { loadFeature } from './feature.mjs';
import { collect, report } from './findings.mjs';
import { gitInfo, gitShow, gitList } from './git.mjs';
import { approved } from './md.mjs';
import { needDir } from './pick.mjs';
import { hasProtocolTraces } from './sources.mjs';

/** @typedef {import('./io.mjs').Ctx} Ctx */

/** @param {Ctx} ctx */
export function cmdDiff(ctx) {
  const { flags, pos } = ctx.args;
  const dir = needDir(ctx, pos[0]);
  const g = gitInfo(dir);
  if (!g) usage(ctx, 'diff работает только в git-репозитории');
  const ref = flags.base || 'HEAD';
  const review = changedRequirementScope(dir, g, ref);
  const c = report(ctx, diffChecks(dir, g, ref), { base: ref, ...(review ? { review } : {}) });
  if (!flags.json && review) ctx.io.log(`Связанные материалы для пересмотра: ${JSON.stringify(review)}`);
  if (!flags.json) ctx.io.log(`\nСверка с ${ref}. Ошибок: ${c.err}, предупреждений: ${c.warn}`);
  ctx.io.exit(c.err ? 1 : 0);
}
// Проверки DF-*: рабочая копия против ref. Возвращает находки.
/** @param {string} dir @param {import('./git.mjs').GitInfo} g @param {string} ref */
export function diffChecks(dir, g, ref) {
  const { found, add } = collect();
  const cur = loadFeature(dir);
  const base = loadFeature(
    dir,
    (f) => gitShow(g, ref, f),
    (d) => gitList(g, ref, d),
  );
  protocolChanges(cur, base, add);
  // ID не пропадают
  if (base.spec) for (const id of base.spec.reqs.keys()) if (!cur.spec?.reqs.has(id)) add('DF-02', cur.specFile, null, `${id} пропал`);
  const curAcs = new Set([...cur.slices.values()].flatMap((s) => s.acs.map((a) => a.id)));
  for (const s of base.slices.values()) for (const a of s.acs) if (!curAcs.has(a.id)) add('DF-02', s.file, null, `${a.id} пропал`);
  // одобренное не меняется молча — AP-02: отпечаток approve, без git
  return found;
}

/** @param {import('./model.mjs').Feature} cur @param {import('./model.mjs').Feature} base @param {ReturnType<typeof collect>['add']} add */
function protocolChanges(cur, base, add) {
  // протокол только дописывается
  if (base.protocol && cur.protocol) {
    changedProtocolRows({ protocol: cur.protocol, file: cur.protocolFile }, base.protocol, add);
  } else if (base.protocol && !cur.protocol && !(cur.spec && approved(cur.spec.status) && !hasProtocolTraces(cur.spec.md)))
    add('DF-01', cur.protocolFile, null, `протокол удалён до закрытия фичи: удаляет его ${skillCode('sdd-close', cur.name)}`);

}

/** @param {{protocol: import('./model.mjs').Protocol, file: string}} cur
 * @param {import('./model.mjs').Protocol} base @param {ReturnType<typeof collect>['add']} add */
function changedProtocolRows(cur, base, add) {
  const norm = (/** @type {string} */ s) => s.replace(/\s+/g, ' ').trim();

  const now = new Set([...cur.protocol.rows, ...cur.protocol.post].map((r) => norm(r.raw)));
  for (const r of [...base.rows, ...base.post])
    if (!now.has(norm(r.raw))) add('DF-01', cur.file, null, `строка #${r.id} изменена или удалена: «${r.raw.slice(0, 60)}»`);
  const scope = new Set(cur.protocol.outScope.map((x) => norm(x.text)));
  for (const x of base.outScope)
    if (!scope.has(norm(x.text))) add('DF-01', cur.file, null, `«Вне scope»: пункт изменён или удалён: «${x.text.slice(0, 60)}»`);
}

/** @param {string} dir @param {import('./git.mjs').GitInfo} g @param {string} ref */
function changedRequirementScope(dir, g, ref) {
  const cur = loadFeature(dir);
  if (!cur.flow.state) return null;
  const base = loadFeature(dir, (f) => gitShow(g, ref, f), (d) => gitList(g, ref, d));
  if (!base.flow.state || !base.spec || !approved(base.spec.status)) return null;
  const changed = [...base.spec.reqs.values()].filter((r) => cur.spec?.reqs.get(r.id)?.text !== r.text).map((r) => r.id);
  if (!changed.length) return null;
  const ids = new Set([...relatedIds(base, changed), ...relatedIds(cur, changed)]);
  return { changed, related: [...ids], meaning: 'Требуется пересмотр; связи не доказывают смысловую достаточность. ' +
    'Материалы не исправлены и не согласованы автоматически.' };
}
