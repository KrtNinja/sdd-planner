// Команды check и gate.
// @ts-check
import { draftWork } from './registry-view.mjs';
import { checkDocumentationFlow } from './flow.mjs';
import { checkRegistry } from './registry-rules.mjs';
import { unresolvedRegistry } from './registry-rules.mjs';
import { pendingAdrs } from './adr.mjs';
import { slicesBrief } from './brief.mjs';
import { neededAdrs } from './cut.mjs';
import { skillCode, lintCode } from './config.mjs';
import { loadFeature, featureFiles, runChecks } from './feature.mjs';
import { hasErrors, item, report } from './findings.mjs';
import { rel, approved } from './md.mjs';
import { choiceOf, needDir } from './pick.mjs';
import { adrTopicStep, findingStep, reviewStep, resumeGateStep } from './gate-extra.mjs';
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
    ctx.io.log(`\nОшибок: ${c.err}, предупреждений: ${c.warn}. FR/NFR: ${m.spec ? m.spec.reqs.size : 0}, частей работы: ${m.slices.size}, AC: ${acs}`);
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
  if (stage === 'spec') return specGate(m, found);
  if (stage === 'slices') return slicesGate(m, found);
  if (stage === 'build') return buildGate(m, found);
  if (['adr', 'decide', 'review'].includes(stage) && !m.spec)
    return ['нет spec.md', `Сначала подготовьте требования: ${skillCode('sdd-spec', m.name)}`];
  return null;
}

/** @param {Feature} m @param {Finding[]} found @returns {[string, string] | null} */
function specGate(m, found) {
  if (!m.protocol) return ['нет brainstorming.md', `Сначала обсудите задачу: ${skillCode('sdd-grill', m.name)}`];
  else if (!/готов/i.test(m.protocol.status || ''))
    return [`статус протокола «${m.protocol.status || '—'}»`, `Сначала закончите обсуждение задачи: ${skillCode('sdd-grill', m.name)}`];
  else if (errorsIn(found, [m.protocolFile]).length)
    return ['ошибки в протоколе', `Автоматическая проверка нашла ошибки в протоколе — поправьте его, список: ${lintCode(rel(m.dir))}`];
  return null;
}

/** @param {Feature} m @param {Finding[]} found @returns {[string, string] | null} */
function slicesGate(m, found) {
  const dir = rel(m.dir);
  if (!m.spec) return ['нет spec.md', `Сначала подготовьте требования: ${skillCode('sdd-spec', m.name)}`];
  else if (!approved(m.spec.status)) return [`статус требований «${m.spec.status || '—'}»`, `Сначала одобрите spec.md: ${lintCode('approve', 'spec', dir)}`];
  else if (errorsIn(found, [m.protocolFile, m.specFile]).length)
    return ['ошибки в протоколе или требованиях', `Исправьте ошибки в протоколе или требованиях и одобрите требования заново, список: ${lintCode(dir)}`];
  return null;
}

/** @param {Feature} m @param {Finding[]} found @returns {[string, string] | null} */
function buildGate(m, found) {
  const dir = rel(m.dir);
  if (unresolvedRegistry(m).length) return ['есть нерешённые вопросы', 'Завершите обработку вопросов до передачи в разработку'];
  const pending = pendingAdrs(m);
  const need = neededAdrs(m);
  if (!m.slices.size || !approved(m.slicesStatus)) return ['части работы не одобрены', `Сначала одобрите части работы: ${lintCode('approve', 'slices', dir)}`];
  else if (need.length)
    return [
      `нет ADR: ${need.map((x) => `«${x.topic}» (часть работы ${x.num})`).join(', ')}`,
      `Сначала напишите ADR: ${need.map((x) => skillCode('sdd-adr', m.name, `"${x.topic}"`)).join('; ')}`,
    ];
  else if (pending.length)
    return [
      `ADR не приняты: ${pending.map((a) => a.num).join(', ')}`,
      `Сначала примите ADR: ${pending.map((a) => lintCode('approve', 'adr', dir, a.num)).join('; ')}`,
    ];
  else if (hasErrors(found)) return ['автоматическая проверка нашла ошибки', `Исправьте ошибки, список: ${lintCode(dir)}`];
  return null;
}

// Аргументы после фичи: тема ADR, находка ревью для decide, режим ревью; у остальных ворот их нет.
/** @param {Feature} m @param {string} stage @param {string[]} pos */
function afterFeature(m, stage, pos) {
  if (stage === 'adr') return adrTopicStep(m, pos.slice(2).join(' ').trim());
  if (stage === 'decide' && /^(\w+:)?R\d+$/i.test(pos[2] || '')) return findingStep(m, pos[2]);
  if (stage === 'review') return reviewStep(m, pos[2], pos[3]);
  return null;
}

/** @param {Ctx} ctx */
export function cmdGate(ctx) {
  const { pos } = ctx.args;
  const stage = choiceOf(ctx, 'gate');
  const { target, note } = gateTarget(ctx, stage);
  const m = loadFeature(needDir(ctx, target, 1));
  maybeResumeGate(ctx, m, stage);
  const found = runChecks(m);
  maybeDraftGate(ctx, m, stage);
  const closed = gateClosed(m, stage, found);
  if (closed) {
    blockedGate(ctx, { m, stage, found, closed });
  }
  // Что после фичи, разбирает скрипт: тема ADR, находка ревью, режим ревью.
  const extra = afterFeature(m, stage, pos);
  // Вопрос или стоп вместо этапа — готовый вывод целиком.
  if (extra?.stop) {
    ctx.io.log(blocks(note, extra.text));
    ctx.io.exit(0);
  }
  // Путь фичи — каноническим: агент подставляет его в следующие вызовы как есть, без разбора аргумента.
  // Ворота slices открыты — spec есть.
  const brief = stage === 'slices' ? slicesBrief(/** @type {Feature & { spec: import('./model.mjs').Spec }} */ (m)) : null;
  ctx.io.log(
    screen(blocks(note, helloLine(m, stage), extra?.card, brief?.card), `ворота ${stage} открыты`, `фича ${rel(m.dir)}`, extra?.parts, brief?.parts, G.skill),
  );
  ctx.io.exit(0);
}

/** @param {Ctx} ctx @param {string} stage */
function gateTarget(ctx, stage) {
  const { pos } = ctx.args;
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
  return { target, note };
}

/** @param {Ctx} ctx @param {{m: Feature, stage: string, found: Finding[], closed: [string, string]}} state */
function blockedGate(ctx, { m, stage, found, closed }) {
  const relevant = stage === 'build' ? found : errorsIn(found, [m.protocolFile, m.specFile]);
  const errs = relevant.filter((y) => y.level === 'err');
  if (errs.length) ctx.io.log(`${errs.map(item).join('\n')}\n`);
  // build читает зона реализации (export) — ей вопрос этапа не нужен.
  ctx.io.log(stage === 'build' ? closedScreen(stage, closed) : closedText(m, stage, closed));
  ctx.io.exit(3);
}

/** @param {Ctx} ctx @param {Feature} m @param {string} stage @param {string} scope */
function draftGate(ctx, m, stage, scope) {
  try {
    if (!['spec', 'slices', 'adr'].includes(stage)) throw new Error('Этот этап не является независимым черновиком');
    const structural = [...checkDocumentationFlow(m), ...checkRegistry(m)];
    if (structural.length) throw new Error(structural.map((f) => f.msg).join('; '));
    const text = draftWork(m, scope.split(',').filter(Boolean));
    ctx.io.log(screen(text, `фича ${rel(m.dir)}`, `черновик ${stage}; область ${scope}; не меняй остальные области`, G.skill));
  } catch (error) {
    ctx.io.log(screen(String(error), G.stop));
    ctx.io.exit(3);
  }
  ctx.io.exit(0);
}

/** @param {Ctx} ctx @param {Feature} m @param {string} stage */
function maybeDraftGate(ctx, m, stage) {
  const scope = ctx.args.pos[2];
  if (m.flow.state && scope?.startsWith('draft:')) draftGate(ctx, m, stage, scope.slice(6));
}

/** @param {Ctx} ctx @param {Feature} m @param {string} stage */
function maybeResumeGate(ctx, m, stage) {
  if (stage !== 'decide' || !m.flow.state) return;
  const text = resumeGateStep(m, ctx.args.pos[2] || '');
  if (text === null) return;
  ctx.io.log(text);
  ctx.io.exit(0);
}
