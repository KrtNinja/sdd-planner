// Команда approve: ставит «одобрено» / «принято», если чисто, включая RV-* и HG-*.
import fs from 'node:fs';
import path from 'node:path';

import { pendingAdrs } from './adr.mjs';
import { fingerprint, approvalMds } from './approval.mjs';
import { pos } from './args.mjs';
import { skill, lintCmd } from './config.mjs';
import { loadFeature, runChecks } from './feature.mjs';
import { findings, add, report } from './findings.mjs';
import { read, rel, approved, header } from './md.mjs';
import { pickChoice, needDir } from './pick.mjs';
import { openBlockers, reviewKey } from './review.mjs';
import { snapPath, protectedParts, diffParts } from './snapshot.mjs';
import { stageOf, stageText } from './stage.mjs';

// Ставит «одобрено <дата>» / «принято <дата>», если артефакт чист: lint без ошибок
// (с учётом нового статуса — например, SP-06 «одобрено с открытыми вопросами»)
// и защищённые части совпадают со снимком, если он есть.
export function cmdApprove() {
  const what = pos[0];
  if (!['spec', 'slices', 'adr'].includes(what)) pickChoice('approve');
  const d = needDir(pos[1], 1);
  const m = loadFeature(d);
  const dir = rel(m.dir);
  const refuse = (msg, code = 3) => {
    console.log(`НЕ ОДОБРЕНО: ${msg}`);
    process.exit(code);
  };
  let target;
  let scope;
  let word = 'одобрено';
  if (what === 'spec') {
    if (!m.spec) refuse(`нет spec.md. Сначала: ${skill('sdd-spec', m.name)}`);
    target = m.specFile;
    scope = [m.protocolFile, m.specFile];
  } else if (what === 'slices') {
    if (!m.slices.size || m.readme == null) refuse(`нет slices или slices/README.md. Сначала: ${skill('sdd-slices', m.name)}`);
    if (!m.spec || !approved(m.spec.status)) refuse(`Dev Spec не одобрен — slices опираются на него. Сначала: ${lintCmd('approve', 'spec', dir)}`);
    target = m.readmeFile;
    scope = [m.protocolFile, m.specFile, m.readmeFile, ...[...m.slices.values()].map((x) => x.file)];
  } else {
    word = 'принято';
    const pending = pendingAdrs(m);
    const adr = pos[2] ? m.featureAdrs.find((a) => a.num === pos[2].padStart(4, '0')) : pending.length === 1 ? pending[0] : null;
    if (!adr) {
      const list = pending.map((a) => lintCmd('approve', 'adr', dir, a.num));
      refuse(
        pos[2]
          ? `ADR ${pos[2]} не найден среди ADR фичи ${m.name}`
          : pending.length
            ? `у фичи ${pending.length} ADR без «принято» — укажите номер: ${list.join('; ')}`
            : `у фичи ${m.name} нет ADR, ждущих «принято»`,
        2,
      );
    }
    target = adr.file;
    scope = [adr.file];
  }
  const md = fs.readFileSync(target, 'utf8');
  const raw = header(md, 'Статус');
  if (raw === null) refuse(`в ${rel(target)} нет строки «Статус:» — добавьте её по шаблону`);
  // Статус после проверки отпечатка: «одобрено» руками или после правки — не одобрено, approve ставит заново.
  const cur = what === 'spec' ? m.spec.status : what === 'slices' ? m.slicesStatus : m.adrs.find((a) => a.file === target).status;
  if (approved(cur)) {
    console.log(`${rel(target)}: уже «${cur}».`);
    process.exit(0);
  }
  const t = new Date();
  const date = [t.getDate(), t.getMonth() + 1].map((x) => String(x).padStart(2, '0')).join('.') + `.${t.getFullYear()}`;
  const fp = fingerprint(approvalMds(m, what, target));
  const next = md.replace(/^Статус:.*$/m, `Статус: ${word} ${date} · ${fp}`);

  // lint по будущему состоянию: ошибки в файлах артефакта блокируют одобрение
  const inScope = new Set(scope.map(rel));
  const after = loadFeature(d, (f) => (path.resolve(f) === path.resolve(target) ? next : read(f)));
  findings.length = 0;
  runChecks(after);
  const errs = findings.filter((x) => x.level === 'err' && inScope.has(x.file));
  findings.length = 0;
  findings.push(...errs);

  // блокеры последнего ревью этого артефакта
  const rv = m.reviews.get(reviewKey(what, what === 'adr' ? path.basename(target).slice(0, 4) : null));
  for (const r of openBlockers(rv)) findings.push({ rule: 'RV-01', level: 'err', file: rel(rv.file), line: r.n, msg: `${r.id}: блокер без решения` });

  // guard: защищённые части против снимка, если он снят
  for (const f of scope.filter((x) => fs.existsSync(x) && fs.existsSync(snapPath(x)))) {
    const before = JSON.parse(fs.readFileSync(snapPath(f), 'utf8')).parts;
    for (const x of diffParts(before, protectedParts(fs.readFileSync(f, 'utf8')))) add('HG-01', f, null, `(против: снимок) ${x}`);
  }
  if (findings.length) {
    report();
    const hg = findings.some((x) => x.rule === 'HG-01');
    console.log(`\nНЕ ОДОБРЕНО: ${rel(target)} остаётся «${cur}».`);
    if (hg) console.log(`Если защищённые части поменяли вы сами — снимите новый снимок (${lintCmd('snapshot', what === 'slices' ? dir : rel(target))}) и повторите одобрение.`);
    process.exit(1);
  }
  fs.writeFileSync(target, next);
  console.log(`${rel(target)}: Статус: ${word} ${date} · ${fp}`);
  console.log(stageText(stageOf(loadFeature(d))));
  process.exit(0);
}
