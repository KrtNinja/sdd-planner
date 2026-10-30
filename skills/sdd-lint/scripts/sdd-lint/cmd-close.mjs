// Команда close (скилл /sdd-close): перед merge убирает временные артефакты этапа — протокол, ревью, план нарезки.
import fs from 'node:fs';
import path from 'node:path';

import { pendingAdrs } from './adr.mjs';
import { pos } from './args.mjs';
import { skill, lintCmd } from './config.mjs';
import { loadFeature, runChecks } from './feature.mjs';
import { findings, line, report } from './findings.mjs';
import { genLinks } from './gen-links.mjs';
import { rel, approved, isEmptyCell } from './md.mjs';
import { needDir } from './pick.mjs';
import { openBlockers } from './review.mjs';
import { tempArtifacts } from './stage.mjs';

// После PR остаются spec, slices и ADR. Протокол, review/ и plan.md — временные артефакты: решения из них уже
// в FR и AC, история — в git. Ссылки spec на протокол убирает genLinks.
export function cmdClose() {
  const m = loadFeature(needDir(pos[0]));
  const dir = rel(m.dir);
  runChecks(m);
  // План и ревью удаляются — их ошибки (PL-13 у забытого plan.md, формат таблицы ревью) закрытию не мешают.
  // Блокеры ревью — мешают: решение по ним ещё не спущено в FR и AC.
  const doomed = (f) => f === m.planFile || f.startsWith(m.reviewDir + path.sep);
  const errs = findings.filter((x) => x.level === 'err' && !doomed(path.resolve(x.file)));
  const blockers = [...m.reviews.values()].flatMap((rv) => openBlockers(rv).map((r) => `${r.id} (${rel(rv.file)})`));
  const pending = pendingAdrs(m);
  const why = !m.spec
    ? 'нет spec.md'
    : !approved(m.spec.status)
      ? `spec «${m.spec.status || '—'}» — сначала ${lintCmd('approve', 'spec', dir)}`
      : !m.slices.size || !approved(m.slicesStatus)
        ? `slices не одобрены — сначала ${lintCmd('approve', 'slices', dir)}`
        : pending.length
          ? `ADR не приняты: ${pending.map((a) => a.num).join(', ')} — сначала ${lintCmd('approve', 'adr', dir, pending[0].num)}`
          : blockers.length
            ? `блокеры ревью без решения: ${blockers.join(', ')} — решение: ${skill('sdd-decide', m.name, '<R>', '"<решение>"')}`
            : errs.length
              ? `есть ошибки lint — список: ${lintCmd(dir)}`
              : null;
  if (why) {
    for (const x of errs) console.log(line(x));
    console.log(`НЕ ЗАКРЫТО: ${why}. Ничего не удалено.`);
    process.exit(1);
  }
  const gone = tempArtifacts(m);
  // Замечания без решения не мешают закрытию, но человек должен увидеть, что уходит в историю git.
  const notes = [...m.reviews.values()].flatMap((rv) => rv.rows.filter((r) => !r.blocker && isEmptyCell(r.decision)).map((r) => `${r.id} (${rel(rv.file)})`));
  if (m.protocol) fs.rmSync(m.protocolFile);
  if (m.reviews.size) fs.rmSync(m.reviewDir, { recursive: true, force: true });
  if (m.plan) fs.rmSync(m.planFile);
  findings.length = 0;
  genLinks(loadFeature(m.dir));
  findings.length = 0;
  runChecks(loadFeature(m.dir));
  const c = report();
  console.log(
    `\n${gone.length ? `Удалено: ${gone.join(', ')}. ` : 'Временных артефактов не было. '}Фича закрыта: в spec нет ссылок на протокол, ссылки на FR в slices обновлены.` +
      (notes.length ? `\nЗамечания ревью без решения ушли в историю git: ${notes.join(', ')}.` : '') +
      `\nЗакоммитьте вместе с остальными документами. Решения дальше — ${skill('sdd-decide', m.name)}: правит FR и AC напрямую.`,
  );
  process.exit(c.err ? 1 : 0);
}
