// Команды check и gate.
// @ts-check
import { pendingAdrs } from './adr.mjs';
import { slicesBrief } from './brief.mjs';
import { neededAdrs } from './cut.mjs';
import { skillCode, lintCode } from './config.mjs';
import { loadFeature, featureFiles, runChecks } from './feature.mjs';
import { hasErrors, item, report } from './findings.mjs';
import { rel, approved } from './md.mjs';
import { choiceOf, needDir } from './pick.mjs';
import { adrTopicStep, findingStep, reviewStep } from './gate-extra.mjs';
import { chooseFeature, closedScreen, closedText, helloLine } from './guide.mjs';
import { G, blocks, screen } from './screen.mjs';
import { saveSnapshot } from './snapshot.mjs';
import { printTip, stageOf, stageText, tipLine } from './stage.mjs';

/** @typedef {import('./io.mjs').Ctx} Ctx */
/** @typedef {import('./model.mjs').Finding} Finding */
/** @typedef {import('./model.mjs').Feature} Feature */

/** @param {Ctx} ctx */
export function cmdCheck(ctx) {
  const { flags, pos } = ctx.args;
  const m = loadFeature(needDir(ctx, pos[0]));
  const found = runChecks(m);
  if (flags.snapshot) for (const f of featureFiles(m)) saveSnapshot(f);
  reportFeature(ctx, m, found);
}

// Отчёт check и fix: находки, этап, итог одной строкой и Tip (если ошибок нет); код выхода 1 при ошибках.
/** @param {Ctx} ctx @param {Feature} m @param {Finding[]} found @param {Record<string, unknown>} [extra] */
export function reportFeature(ctx, m, found, extra = {}) {
  const st = stageOf(m);
  const c = report(ctx, found, { stage: st.now, next: st.next, tip: hasErrors(found) ? null : tipLine(st.tip), ...extra });
  if (!ctx.args.flags.json) {
    const acs = [...m.slices.values()].reduce((x, s) => x + s.acs.length, 0);
    ctx.io.log(`\n${stageText(st)}`);
    ctx.io.log(`\nОшибок: ${c.err}, предупреждений: ${c.warn}. FR/NFR: ${m.spec ? m.spec.reqs.size : 0}, slices: ${m.slices.size}, AC: ${acs}`);
    if (!c.err) printTip(ctx, st);
  }
  ctx.io.exit(c.err ? 1 : 0);
}

/** @param {Finding[]} found @param {string[]} files */
const errorsIn = (found, files) => found.filter((x) => x.level === 'err' && files.map(rel).includes(x.file));

// Ворота этапа по находкам runChecks: null — открыты, иначе [почему закрыты, что сказать человеку].
// Ими же пользуется export: зона реализации видит тот же статус build, что и gate.
/** @param {Feature} m @param {string} stage @param {Finding[]} found @returns {[string, string] | null} */
export function gateClosed(m, stage, found) {
  const dir = rel(m.dir);
  const check = lintCode(dir);
  /** @type {[string, string] | null} */
  let closed = null;
  if (stage === 'spec') {
    if (!m.protocol) closed = ['нет brainstorming.md', `Сначала проведите brainstorming: ${skillCode('sdd-grill', m.name)}`];
    else if (!/готов/i.test(m.protocol.status || '')) closed = [`статус протокола «${m.protocol.status || '—'}»`, `Сначала закончите brainstorming: ${skillCode('sdd-grill', m.name)}`];
    else if (errorsIn(found, [m.protocolFile]).length) closed = ['ошибки в протоколе', `В протоколе ошибки lint — поправьте его, список: ${check}`];
  } else if (stage === 'slices') {
    if (!m.spec) closed = ['нет spec.md', `Сначала соберите Dev Spec: ${skillCode('sdd-spec', m.name)}`];
    else if (!approved(m.spec.status)) closed = [`статус spec «${m.spec.status || '—'}»`, `Сначала одобрите spec.md: ${lintCode('approve', 'spec', dir)}`];
    else if (errorsIn(found, [m.protocolFile, m.specFile]).length) closed = ['ошибки в протоколе или spec', `В spec ошибки lint — исправьте и одобрите заново, список: ${check}`];
  } else if (stage === 'adr' || stage === 'decide' || stage === 'review') {
    if (!m.spec) closed = ['нет spec.md', `Сначала соберите Dev Spec: ${skillCode('sdd-spec', m.name)}`];
  } else if (stage === 'build') {
    const pending = pendingAdrs(m);
    const need = neededAdrs(m);
    if (!m.slices.size || !approved(m.slicesStatus)) closed = ['slices не одобрены', `Сначала одобрите slices: ${lintCode('approve', 'slices', dir)}`];
    else if (need.length) closed = [`нет ADR: ${need.map((x) => `«${x.topic}» (slice ${x.num})`).join(', ')}`, `Сначала напишите ADR: ${need.map((x) => skillCode('sdd-adr', m.name, `"${x.topic}"`)).join('; ')}`];
    else if (pending.length) closed = [`ADR не приняты: ${pending.map((a) => a.num).join(', ')}`, `Сначала примите ADR: ${pending.map((a) => lintCode('approve', 'adr', dir, a.num)).join('; ')}`];
    else if (hasErrors(found)) closed = ['есть ошибки lint', `Исправьте ошибки lint, список: ${check}`];
  }
  return closed;
}

/** @param {Ctx} ctx */
export function cmdGate(ctx) {
  const { pos } = ctx.args;
  const stage = choiceOf(ctx, 'gate');
  let target = pos[1];
  let note = null;
  // Фичу не назвали — выбирает скрипт: одна подходит — она, несколько — вопрос человеку.
  if (!target && stage !== 'build') {
    const c = chooseFeature(stage, (f) => ['gate', stage, f, ...pos.slice(2)]);
    if (!c.dir) {
      ctx.io.log(c.text);
      ctx.io.exit(2);
    }
    [target, note] = [c.dir, c.note];
  }
  const m = loadFeature(needDir(ctx, target, 1));
  const found = runChecks(m);
  const closed = gateClosed(m, stage, found);
  if (closed) {
    const relevant = stage === 'build' ? found : errorsIn(found, [m.protocolFile, m.specFile]);
    const errs = relevant.filter((y) => y.level === 'err');
    if (errs.length) ctx.io.log(`${errs.map(item).join('\n')}\n`);
    // build читает зона реализации (export) — ей вопрос этапа не нужен.
    ctx.io.log(stage === 'build' ? closedScreen(stage, closed) : closedText(m, stage, closed));
    ctx.io.exit(3);
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
  // Вопрос или стоп вместо этапа — готовый вывод целиком.
  if (extra?.stop) {
    ctx.io.log(blocks(note, extra.text));
    ctx.io.exit(0);
  }
  // Путь фичи — каноническим: агент подставляет его в следующие вызовы как есть, без разбора аргумента.
  // Ворота slices открыты — spec есть.
  const brief = stage === 'slices' ? slicesBrief(/** @type {Feature & { spec: import('./model.mjs').Spec }} */ (m)) : null;
  ctx.io.log(screen(blocks(note, helloLine(m, stage), extra?.card, brief?.card), `ворота ${stage} открыты`, `фича ${rel(m.dir)}`, extra?.parts, brief?.parts, G.skill));
  ctx.io.exit(0);
}
