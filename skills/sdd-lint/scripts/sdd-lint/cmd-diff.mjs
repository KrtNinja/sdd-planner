// Команда diff: проверки DF-* по git.
import { flags, pos } from './args.mjs';
import { usage } from './cli.mjs';
import { lintCmd } from './config.mjs';
import { loadFeature } from './feature.mjs';
import { add, report } from './findings.mjs';
import { gitInfo, gitShow, gitList } from './git.mjs';
import { rel, approved } from './md.mjs';
import { needDir } from './pick.mjs';
import { hasProtocolTraces } from './sources.mjs';

export function cmdDiff() {
  const dir = needDir(pos[0]);
  const g = gitInfo(dir);
  if (!g) usage('diff работает только в git-репозитории');
  const ref = flags.base || 'HEAD';
  diffChecks(dir, g, ref);
  const c = report({ base: ref });
  if (!flags.json) console.log(`\nСверка с ${ref}. Ошибок: ${c.err}, предупреждений: ${c.warn}`);
  process.exit(c.err ? 1 : 0);
}
// Проверки DF-*: рабочая копия против ref. Находки — в findings.
export function diffChecks(dir, g, ref) {
  const cur = loadFeature(dir);
  const base = loadFeature(
    dir,
    (f) => gitShow(g, ref, f),
    (d) => gitList(g, ref, d),
  );
  const norm = (s) => s.replace(/\s+/g, ' ').trim();

  // протокол только дописывается
  if (base.protocol && cur.protocol) {
    const now = new Set([...cur.protocol.rows, ...cur.protocol.post].map((r) => norm(r.raw)));
    for (const r of [...base.protocol.rows, ...base.protocol.post])
      if (!now.has(norm(r.raw))) add('DF-01', cur.protocolFile, null, `строка #${r.id} изменена или удалена: «${r.raw.slice(0, 60)}»`);
    const scope = new Set(cur.protocol.outScope.map((x) => norm(x.text)));
    for (const x of base.protocol.outScope) if (!scope.has(norm(x.text))) add('DF-01', cur.protocolFile, null, `«Вне scope»: пункт изменён или удалён: «${x.text.slice(0, 60)}»`);
  } else if (base.protocol && !cur.protocol && !(cur.spec && approved(cur.spec.status) && !hasProtocolTraces(cur.spec.md)))
    add('DF-01', cur.protocolFile, null, `протокол удалён до закрытия фичи: удаляет его ${lintCmd('close', rel(cur.dir))}`);

  // ID не пропадают
  if (base.spec) for (const id of base.spec.reqs.keys()) if (!cur.spec?.reqs.has(id)) add('DF-02', cur.specFile, null, `${id} пропал`);
  const curAcs = new Set([...cur.slices.values()].flatMap((s) => s.acs.map((a) => a.id)));
  for (const s of base.slices.values()) for (const a of s.acs) if (!curAcs.has(a.id)) add('DF-02', s.file, null, `${a.id} пропал`);
  // одобренное не меняется молча — AP-02: отпечаток approve, без git
}
