// Команда diff: проверки DF-* по git.
// @ts-check
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
  const c = report(ctx, diffChecks(dir, g, ref), { base: ref });
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
  const norm = (/** @type {string} */ s) => s.replace(/\s+/g, ' ').trim();

  // протокол только дописывается
  if (base.protocol && cur.protocol) {
    const now = new Set([...cur.protocol.rows, ...cur.protocol.post].map((r) => norm(r.raw)));
    for (const r of [...base.protocol.rows, ...base.protocol.post])
      if (!now.has(norm(r.raw))) add('DF-01', cur.protocolFile, null, `строка #${r.id} изменена или удалена: «${r.raw.slice(0, 60)}»`);
    const scope = new Set(cur.protocol.outScope.map((x) => norm(x.text)));
    for (const x of base.protocol.outScope) if (!scope.has(norm(x.text))) add('DF-01', cur.protocolFile, null, `«Вне scope»: пункт изменён или удалён: «${x.text.slice(0, 60)}»`);
  } else if (base.protocol && !cur.protocol && !(cur.spec && approved(cur.spec.status) && !hasProtocolTraces(cur.spec.md)))
    add('DF-01', cur.protocolFile, null, `протокол удалён до закрытия фичи: удаляет его ${skillCode('sdd-close', cur.name)}`);

  // ID не пропадают
  if (base.spec) for (const id of base.spec.reqs.keys()) if (!cur.spec?.reqs.has(id)) add('DF-02', cur.specFile, null, `${id} пропал`);
  const curAcs = new Set([...cur.slices.values()].flatMap((s) => s.acs.map((a) => a.id)));
  for (const s of base.slices.values()) for (const a of s.acs) if (!curAcs.has(a.id)) add('DF-02', s.file, null, `${a.id} пропал`);
  // одобренное не меняется молча — AP-02: отпечаток approve, без git
  return found;
}
