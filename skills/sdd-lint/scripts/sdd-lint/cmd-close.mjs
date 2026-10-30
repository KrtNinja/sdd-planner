// Команда close (скилл /sdd-close): перед merge убирает временные артефакты — протокол и _work/.
// Без --yes ничего не удаляет: показывает, что уйдёт и чем это грозит, и задаёт второй вопрос.
import fs from 'node:fs';

import { flags, pos } from './args.mjs';
import { questionsView } from './ask.mjs';
import { chooseFeature } from './guide.mjs';
import { closeSummary, closeQuestion, closePreview } from './close.mjs';
import { skill, lintCmd } from './config.mjs';
import { loadFeature, runChecks } from './feature.mjs';
import { findings, report } from './findings.mjs';
import { genLinks } from './gen-links.mjs';
import { rel } from './md.mjs';
import { needDir } from './pick.mjs';
import { tempArtifacts } from './stage.mjs';
import { legacyPaths } from './work.mjs';

// После PR остаются spec, slices и ADR. Протокол и _work/ — временные артефакты: решения из них уже
// в FR и AC, история — в git. Ссылки spec на протокол убирает genLinks.
export function cmdClose() {
  let target = pos[0];
  if (!target) {
    const c = chooseFeature('close', (f) => ['close', f, ...(flags.json ? ['--json'] : [])]);
    if (!c.dir) {
      console.log(c.text);
      process.exit(2);
    }
    target = c.dir;
  }
  const m = loadFeature(needDir(target));
  const dir = rel(m.dir);
  if (!tempArtifacts(m).length) {
    console.log(`Временных артефактов нет: ${dir} уже закрыта.`);
    process.exit(0);
  }
  const s = closeSummary(m);
  if (!flags.yes) {
    if (flags.json) console.log(JSON.stringify(questionsView(dir, `Закрытие ${dir}`, [closeQuestion(m, s)]), null, 2));
    else console.log(`${closePreview(s)}\n\nПодтвердить: ${lintCmd('close', dir, '--yes')}`);
    process.exit(0);
  }

  const gone = tempArtifacts(m);
  const old = legacyPaths(m);
  if (m.protocol) fs.rmSync(m.protocolFile);
  for (const d of [m.workDir, old.review]) fs.rmSync(d, { recursive: true, force: true });
  fs.rmSync(old.plan, { force: true });
  findings.length = 0;
  // Без spec ссылок на протокол нет — чинить нечего (genLinks без spec останавливается).
  if (m.spec) genLinks(loadFeature(m.dir));
  findings.length = 0;
  runChecks(loadFeature(m.dir));
  const c = report();
  console.log(
    `\nУдалено: ${gone.join(', ')}. В spec нет ссылок на протокол, ссылки на FR в slices обновлены.` +
      (s.risks.length ? `\nЗакрыто с последствиями:\n${s.risks.map((x) => `  - ${x}`).join('\n')}` : '') +
      `\nЗакоммитьте удаление вместе с остальными документами. Решения дальше — ${skill('sdd-decide', m.name)}: правит FR и AC напрямую.`,
  );
  process.exit(c.err ? 1 : 0);
}
