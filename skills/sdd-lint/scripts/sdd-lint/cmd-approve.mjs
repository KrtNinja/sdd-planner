// Команда approve: ставит «одобрено» / «принято», если чисто, включая RV-* и HG-*.
// @ts-check
import fs from 'node:fs';
import path from 'node:path';

import { pendingAdrs } from './adr.mjs';
import { fingerprint, approvalMds } from './approval.mjs';
import { skillCode, lintCode } from './config.mjs';
import { loadFeature, runChecks } from './feature.mjs';
import { adder, finding, report } from './findings.mjs';
import { read, rel, approved, header, today } from './md.mjs';
import { choiceOf, needDir } from './pick.mjs';
import { openBlockers, reviewKey } from './review.mjs';
import { snapPath, protectedParts, diffParts } from './snapshot.mjs';
import { printTip, stageOf, stageText } from './stage.mjs';

/** @typedef {import('./io.mjs').Ctx} Ctx */
/** @typedef {import('./model.mjs').Approval['kind']} Kind */
/** @typedef {import('./model.mjs').Review} Review */
/** @typedef {import('./model.mjs').Feature} Feature */
/** @typedef {import('./model.mjs').Adr} Adr */

// ADR для «принято»: номер назван — он; не назван — единственный ждущий; иначе нет.
/** @param {Feature} m @param {string | undefined} num @param {Adr[]} pending */
function adrToApprove(m, num, pending) {
  if (num) return m.featureAdrs.find((a) => a.num === num.padStart(4, '0'));
  return pending.length === 1 ? pending[0] : null;
}
// Почему ADR не выбран — и как указать его.
/** @param {Feature} m @param {string | undefined} num @param {Adr[]} pending */
function noAdrText(m, num, pending) {
  if (num) return `ADR ${num} не найден среди ADR фичи ${m.name}`;
  if (!pending.length) return `у фичи ${m.name} нет ADR, ждущих «принято»`;
  const list = pending.map((a) => lintCode('approve', 'adr', rel(m.dir), a.num));
  return `у фичи ${pending.length} ADR без «принято» — укажите номер: ${list.join('; ')}`;
}
// Статус артефакта после проверки отпечатка; артефакт есть — его наличие проверено раньше.
/** @type {Record<Kind, (m: Feature, file: string) => string | null>} */
const STATUS_OF = {
  spec: (m) => /** @type {import('./model.mjs').Spec} */ (m.spec).status,
  slices: (m) => m.slicesStatus,
  adr: (m, file) => /** @type {Adr} */ (m.adrs.find((a) => a.file === file)).status,
};

// Ставит «одобрено <дата>» / «принято <дата>», если артефакт чист: lint без ошибок
// (с учётом нового статуса — например, SP-06 «одобрено с открытыми вопросами»)
// и защищённые части совпадают со снимком, если он есть.
/** @param {Ctx} ctx */
export function cmdApprove(ctx) {
  const { pos } = ctx.args;
  // Не spec, slices или adr — choiceOf завершает вызов подсказкой.
  const what = /** @type {Kind} */ (choiceOf(ctx, 'approve'));
  const d = needDir(ctx, pos[1], 1);
  const m = loadFeature(d);
  const dir = rel(m.dir);
  /** @type {(msg: string, code?: number) => never} */
  const refuse = (msg, code = 3) => {
    ctx.io.log(`НЕ ОДОБРЕНО: ${msg}`);
    return ctx.io.exit(code);
  };
  const { target, scope, word } = approvalTarget(m, what, { num: pos[2], refuse });
  const md = fs.readFileSync(target, 'utf8');
  const raw = header(md, 'Статус');
  if (raw === null) refuse(`в ${rel(target)} нет строки «Статус:» — добавьте её по шаблону`);
  // Статус после проверки отпечатка: «одобрено» руками или после правки — не одобрено, approve ставит заново.
  // Артефакт есть — его наличие проверено выше.
  const cur = STATUS_OF[what](m, target);
  if (approved(cur)) {
    ctx.io.log(`${rel(target)}: уже «${cur}».`);
    ctx.io.exit(0);
  }
  const date = today();
  const fp = fingerprint(approvalMds(m, what, target));
  const next = md.replace(/^Статус:.*$/m, `Статус: ${word} ${date} · ${fp}`);

  // lint по будущему состоянию: ошибки в файлах артефакта блокируют одобрение
  const inScope = new Set(scope.map(rel));
  const after = loadFeature(d, (f) => (path.resolve(f) === path.resolve(target) ? next : read(f)));
  const findings = runChecks(after).filter((x) => x.level === 'err' && inScope.has(x.file));

  findings.push(...approvalBlockers(m, what, target));

  guardFindings(scope, findings);
  if (findings.length) {
    report(ctx, findings);
    const hg = findings.some((x) => x.rule === 'HG-01');
    ctx.io.log(`\nНЕ ОДОБРЕНО: ${rel(target)} остаётся «${cur}».`);
    if (hg)
      ctx.io.log(
        `\nЕсли защищённые части поменяли вы сами — ` +
          `снимите новый снимок (${lintCode('snapshot', what === 'slices' ? dir : rel(target))}) и повторите одобрение.`,
      );
    ctx.io.exit(1);
  }
  fs.writeFileSync(target, next);
  ctx.io.log(`${rel(target)}: Статус: ${word} ${date} · ${fp}`);
  const st = stageOf(loadFeature(d));
  ctx.io.log(`\n${stageText(st)}`);
  printTip(ctx, st);
  ctx.io.exit(0);
}

/** @param {Feature} m @param {Kind} what
 * @param {{num: string | undefined, refuse: (msg: string, code?: number) => never}} input */
function approvalTarget(m, what, { num, refuse }) {
  const dir = rel(m.dir);
  /** @type {string} */
  let target;
  /** @type {string[]} */
  let scope;
  let word = 'одобрено';
  if (what === 'spec') {
    if (!m.spec) refuse(`нет spec.md. Сначала: ${skillCode('sdd-spec', m.name)}`);
    target = m.specFile;
    scope = [m.protocolFile, m.specFile];
  } else if (what === 'slices') {
    if (!m.slices.size || m.readme == null) refuse(`нет slices или slices/README.md. Сначала: ${skillCode('sdd-slices', m.name)}`);
    if (!m.spec || !approved(m.spec.status)) refuse(`Dev Spec не одобрен — slices опираются на него. Сначала: ${lintCode('approve', 'spec', dir)}`);
    target = m.readmeFile;
    scope = [m.protocolFile, m.specFile, m.readmeFile, ...[...m.slices.values()].map((x) => x.file)];
  } else {
    word = 'принято';
    const pending = pendingAdrs(m);
    const adr = adrToApprove(m, num, pending);
    if (!adr) return refuse(noAdrText(m, num, pending), 2);
    target = adr.file;
    scope = [adr.file];
  }
  return { target, scope, word };
}

/** @param {string[]} scope @param {import('./model.mjs').Finding[]} findings */
function guardFindings(scope, findings) {
  const add = adder(findings);
  // guard: защищённые части против снимка, если он снят
  for (const f of scope.filter((x) => fs.existsSync(x) && fs.existsSync(snapPath(x)))) {
    const before = JSON.parse(fs.readFileSync(snapPath(f), 'utf8')).parts;
    for (const x of diffParts(before, protectedParts(fs.readFileSync(f, 'utf8')))) add('HG-01', f, null, `(против: снимок) ${x}`);
  }
}

/** @param {Feature} m @param {Kind} what @param {string} target */
function approvalBlockers(m, what, target) {
  /** @type {import('./model.mjs').Finding[]} */
  const findings = [];
  // блокеры последнего ревью этого артефакта
  const rv = m.reviews.get(reviewKey(what, what === 'adr' ? path.basename(target).slice(0, 4) : null));
  // В общем lint RV-01 — предупреждение; одобрение он блокирует — здесь это ошибка.
  // Блокеры есть только у найденного ревью.
  for (const r of openBlockers(rv)) findings.push({ ...finding('RV-01', /** @type {Review} */ (rv).file, r.n, `${r.id}: блокер без решения`), level: 'err' });

  return findings;
}
