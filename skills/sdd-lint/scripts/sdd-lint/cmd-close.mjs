// Команда close: перед merge убирает brainstorming.md и ссылки на него.
import fs from 'node:fs';

import { pos } from './args.mjs';
import { skill, lintCmd } from './config.mjs';
import { loadFeature, runChecks } from './feature.mjs';
import { findings, line, report } from './findings.mjs';
import { genLinks } from './gen-links.mjs';
import { rel, approved } from './md.mjs';
import { needDir } from './pick.mjs';

// Перед merge: протокол — леса, после PR остаются spec, slices и ADR без ссылок на него.
export function cmdClose() {
  const m = loadFeature(needDir(pos[0]));
  const dir = rel(m.dir);
  runChecks(m);
  const why = !m.spec
    ? 'нет spec.md'
    : !approved(m.spec.status)
      ? `spec «${m.spec.status || '—'}» — сначала ${lintCmd('approve', 'spec', dir)}`
      : !m.slices.size || !approved(m.slicesStatus)
        ? `slices не одобрены — сначала ${lintCmd('approve', 'slices', dir)}`
        : findings.some((x) => x.level === 'err')
          ? `есть ошибки lint — список: ${lintCmd(dir)}`
          : null;
  if (why) {
    for (const x of findings.filter((y) => y.level === 'err')) console.log(line(x));
    console.log(`НЕ ЗАКРЫТО: ${why}.`);
    process.exit(1);
  }
  const had = !!m.protocol;
  if (had) fs.rmSync(m.protocolFile);
  findings.length = 0;
  const f = loadFeature(m.dir);
  genLinks(f);
  findings.length = 0;
  runChecks(loadFeature(m.dir));
  const c = report();
  console.log(
    `\n${had ? `${rel(m.protocolFile)} удалён. ` : ''}Фича закрыта: в spec нет ссылок на протокол, ссылки на FR в slices обновлены.` +
      ` Закоммитьте вместе с остальными документами. Решения дальше — ${skill('sdd-decide', m.name)}: правит FR и AC напрямую.`,
  );
  process.exit(c.err ? 1 : 0);
}
