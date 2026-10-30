// Команды check и gate.
import { pendingAdrs } from './adr.mjs';
import { flags, pos } from './args.mjs';
import { slicesBrief } from './brief.mjs';
import { neededAdrs } from './cut.mjs';
import { skill, lintCmd } from './config.mjs';
import { loadFeature, featureFiles, runChecks } from './feature.mjs';
import { findings, line, report } from './findings.mjs';
import { rel, approved } from './md.mjs';
import { pickChoice, needDir } from './pick.mjs';
import { adrTopicStep, findingStep, reviewStep } from './gate-extra.mjs';
import { chooseFeature, closedText, helloLine } from './guide.mjs';
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
  } else if (stage === 'adr' || stage === 'decide' || stage === 'review') {
    if (!m.spec) closed = ['нет spec.md', `Сначала соберите Dev Spec: ${skill('sdd-spec', m.name)}`];
  } else if (stage === 'build') {
    const pending = pendingAdrs(m);
    const need = neededAdrs(m);
    if (!m.slices.size || !approved(m.slicesStatus)) closed = ['slices не одобрены', `Сначала одобрите slices: ${lintCmd('approve', 'slices', dir)}`];
    else if (need.length) closed = [`нет ADR: ${need.map((x) => `«${x.topic}» (slice ${x.num})`).join(', ')}`, `Сначала напишите ADR: ${need.map((x) => skill('sdd-adr', m.name, `"${x.topic}"`)).join('; ')}`];
    else if (pending.length) closed = [`ADR не приняты: ${pending.map((a) => a.num).join(', ')}`, `Сначала примите ADR: ${pending.map((a) => lintCmd('approve', 'adr', dir, a.num)).join('; ')}`];
    else if (findings.some((x) => x.level === 'err')) closed = ['есть ошибки lint', `Исправьте ошибки lint, список: ${check}`];
  }
  return closed;
}

export function cmdGate() {
  const stage = pos[0];
  const gates = ['spec', 'slices', 'adr', 'decide', 'review', 'build'];
  if (!gates.includes(stage)) pickChoice('gate');
  let target = pos[1];
  let note = null;
  // Фичу не назвали — выбирает скрипт: одна подходит — она, несколько — вопрос человеку.
  if (!target && stage !== 'build') {
    const c = chooseFeature(stage, (f) => ['gate', stage, f, ...pos.slice(2)]);
    if (!c.dir) {
      console.log(c.text);
      process.exit(2);
    }
    [target, note] = [c.dir, c.note];
  }
  const m = loadFeature(needDir(target, 1));
  runChecks(m);
  const closed = gateClosed(m, stage);
  if (closed) {
    const relevant = stage === 'build' ? findings : errorsIn([m.protocolFile, m.specFile]);
    for (const x of relevant.filter((y) => y.level === 'err')) console.log(line(x));
    // build читает зона реализации (export) — ей вопрос этапа не нужен.
    console.log(stage === 'build' ? `ВОРОТА ${stage}: закрыты — ${closed[0]}.\nСкажи человеку: «${closed[1]}» — и остановись.` : closedText(m, stage, closed));
    process.exit(3);
  }
  // Что после фичи, разбирает скрипт: тема ADR, находка ревью, режим ревью.
  const extra =
    stage === 'adr'
      ? adrTopicStep(m, pos.slice(2).join(' ').trim())
      : stage === 'decide' && /^(\w+:)?R\d+$/i.test(pos[2] || '')
        ? findingStep(m, pos[2])
        : stage === 'review'
          ? reviewStep(m, pos[2], pos[3])
          : null;
  // Путь фичи — каноническим: агент подставляет его в следующие вызовы как есть, без разбора аргумента.
  const out = [note, `ВОРОТА ${stage}: открыты.`, `Фича: ${rel(m.dir)}`, extra?.text, extra?.stop ? null : helloLine(m, stage)];
  if (stage === 'slices') out.push(slicesBrief(m));
  console.log(out.filter(Boolean).join('\n'));
  process.exit(0);
}
