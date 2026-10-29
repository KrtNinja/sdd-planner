// Команды check и gate.
import { pendingAdrs } from './adr.mjs';
import { flags, pos } from './args.mjs';
import { skill, lintCmd } from './config.mjs';
import { loadFeature, featureFiles, runChecks } from './feature.mjs';
import { findings, line, report } from './findings.mjs';
import { rel, approved } from './md.mjs';
import { pickChoice, needDir } from './pick.mjs';
import { saveSnapshot } from './snapshot.mjs';
import { stageOf, stageText } from './stage.mjs';

export function cmdCheck() {
  const m = loadFeature(needDir(pos[0]));
  runChecks(m);
  if (flags.snapshot) for (const f of featureFiles(m)) saveSnapshot(f);
  const st = stageOf(m);
  const c = report({ stage: st.now, next: st.next });
  if (!flags.json) {
    const acs = [...m.slices.values()].reduce((x, s) => x + s.acs.length, 0);
    console.log(`\n${stageText(st)}`);
    console.log(`Ошибок: ${c.err}, предупреждений: ${c.warn}. FR/NFR: ${m.spec ? m.spec.reqs.size : 0}, slices: ${m.slices.size}, AC: ${acs}`);
  }
  process.exit(c.err ? 1 : 0);
}

const errorsIn = (files) => findings.filter((x) => x.level === 'err' && files.map(rel).includes(x.file));

// Ворота этапа после runChecks: null — открыты, иначе [почему закрыты, что сказать человеку].
// Ими же пользуется export: зона реализации видит тот же статус build, что и gate.
export function gateClosed(m, stage) {
  const dir = rel(m.dir);
  const check = lintCmd(dir);
  let closed = null;
  if (stage === 'spec') {
    if (!m.protocol) closed = ['нет brainstorming.md', `Сначала проведите brainstorming: ${skill('sdd-grill', m.name)}`];
    else if (!/готов/i.test(m.protocol.status || '')) closed = [`статус протокола «${m.protocol.status || '—'}»`, `Сначала закончите brainstorming: ${skill('sdd-grill', m.name)}`];
    else if (errorsIn([m.protocolFile]).length) closed = ['ошибки в протоколе', `В протоколе ошибки lint — поправьте его, список: ${check}`];
  } else if (stage === 'slices') {
    if (!m.spec) closed = ['нет spec.md', `Сначала соберите Dev Spec: ${skill('sdd-spec', m.name)}`];
    else if (!approved(m.spec.status)) closed = [`статус spec «${m.spec.status || '—'}»`, `Сначала одобрите spec.md: ${lintCmd('approve', 'spec', dir)}`];
    else if (errorsIn([m.protocolFile, m.specFile]).length) closed = ['ошибки в протоколе или spec', `В spec ошибки lint — исправьте и одобрите заново, список: ${check}`];
  } else if (stage === 'adr' || stage === 'decide') {
    if (!m.spec) closed = ['нет spec.md', `Сначала соберите Dev Spec: ${skill('sdd-spec', m.name)}`];
  } else if (stage === 'build') {
    const pending = pendingAdrs(m);
    if (!m.slices.size || !approved(m.slicesStatus)) closed = ['slices не одобрены', `Сначала одобрите slices: ${lintCmd('approve', 'slices', dir)}`];
    else if (pending.length) closed = [`ADR не приняты: ${pending.map((a) => a.num).join(', ')}`, `Сначала примите ADR: ${pending.map((a) => lintCmd('approve', 'adr', dir, a.num)).join('; ')}`];
    else if (findings.some((x) => x.level === 'err')) closed = ['есть ошибки lint', `Исправьте ошибки lint, список: ${check}`];
  }
  return closed;
}

export function cmdGate() {
  const stage = pos[0];
  const gates = ['spec', 'slices', 'adr', 'decide', 'build'];
  if (!gates.includes(stage)) pickChoice('gate');
  const m = loadFeature(needDir(pos[1], 1));
  runChecks(m);
  const closed = gateClosed(m, stage);
  if (closed) {
    const relevant = stage === 'build' ? findings : errorsIn([m.protocolFile, m.specFile]);
    for (const x of relevant.filter((y) => y.level === 'err')) console.log(line(x));
    console.log(`ВОРОТА ${stage}: закрыты — ${closed[0]}.\nСкажи человеку: «${closed[1]}» — и остановись.`);
    process.exit(3);
  }
  console.log(`ВОРОТА ${stage}: открыты.`);
  process.exit(0);
}
