// Закрытие фичи: что удалит close и чем это грозит. Удаляет только close --yes — после второго ответа человека.
// @ts-check
import fs from 'node:fs';
import path from 'node:path';

import { pendingAdrs } from './adr.mjs';
import { lintCode } from './config.mjs';
import { runChecks } from './feature.mjs';
import { git, gitInfo } from './git.mjs';
import { rel, approved } from './md.mjs';
import { openBlockers, undecided } from './review.mjs';
import { hasProtocolTraces } from './sources.mjs';
import { G, blocks, bold, codePaths, list } from './screen.mjs';
import { legacyPaths, workFiles } from './work.mjs';

const MAX_LIST = 15;

/** @typedef {import('./model.mjs').Feature} Feature */
/**
 * Что удалит close и чем это грозит: effects — строки «Удалится», risks — «Последствия».
 * @typedef {{ dir: string, files: string[], effects: string[], risks: string[] }} CloseSummary
 */

// Файлы, которые удалит close: протокол, всё в _work/, старые review/ и slices/plan.md.
/** @param {Feature} m @returns {string[]} */
function doomedFiles(m) {
  const old = legacyPaths(m);
  const legacyReview = fs.existsSync(old.review) ? workFiles({ workDir: old.review }) : [];
  return [m.protocol ? m.protocolFile : null, ...workFiles(m), ...legacyReview, fs.existsSync(old.plan) ? old.plan : null].filter((f) => f !== null);
}
/** @param {Feature} m */
const isDoomed = (m) => {
  const old = legacyPaths(m);
  const dirs = [m.workDir, old.review].map((d) => d + path.sep);
  return (/** @type {string} */ f) => f === m.protocolFile || f === old.plan || dirs.some((d) => f.startsWith(d));
};

// Незакоммиченное из удаляемого: после close его не будет даже в истории git.
/** @param {Feature} m @param {string[]} files @returns {string[] | null} */
function uncommitted(m, files) {
  if (!files.length) return [];
  const g = gitInfo(m.dir);
  if (!g) return null;
  try {
    // -z: пути без кавычек и \-экранирования кириллицы; у переименования следом идёт старый путь — его пропускаем.
    const parts = git(['status', '--porcelain', '-z', '--untracked-files=all', '--', ...files], m.dir).split('\0');
    /** @type {string[]} */
    const out = [];
    for (let i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      out.push(rel(path.join(g.top, parts[i].slice(3))));
      if (/^[RC]/.test(parts[i])) i++;
    }
    return out;
  } catch {
    return null;
  }
}

/** @param {string[]} xs */
const listed = (xs) => (xs.length > MAX_LIST ? `${xs.slice(0, MAX_LIST).join(', ')} и ещё ${xs.length - MAX_LIST}` : xs.join(', '));

/** @param {Feature} m */
function unfinishedPlanning(m) {
  /** @type {string[]} */
  const unfinished = [];
  if (!m.spec) unfinished.push('нет spec.md');
  else if (!approved(m.spec.status)) unfinished.push(`Dev Spec «${m.spec.status || '—'}»`);
  if (!m.slices.size) unfinished.push('slices нет');
  else if (!approved(m.slicesStatus)) unfinished.push('slices не одобрены');
  const pending = pendingAdrs(m);
  if (pending.length) unfinished.push(`ADR не приняты: ${pending.map((a) => a.num).join(', ')}`);
  return unfinished;
}

/** @param {string[] | null} dirty @param {{ file: string }[]} rows */
function lostReview(dirty, rows) {
  if (!dirty) return 'пропадут совсем: не git-репозиторий';
  return rows.some((x) => dirty.includes(x.file)) ? 'пропадут совсем: файл ревью не закоммичен' : null;
}
/** @param {Feature} m @param {(rv: import('./model.mjs').Review) => import('./model.mjs').ReviewRow[]} pick */
function reviewRows(m, pick) {
  return [...m.reviews.values()].flatMap((rv) => pick(rv).map((r) => ({ id: `${r.id} (${rel(rv.file)})`, file: rel(rv.file) })));
}
/** @param {Feature} m @param {string[] | null} dirty */
function reviewRisks(m, dirty) {
  const risks = [];
  // Куда денутся находки: закоммиченный файл ревью останется в истории git, незакоммиченный — нет.
  const blockers = reviewRows(m, openBlockers);
  if (blockers.length) {
    const after = lostReview(dirty, blockers) || 'останутся только в истории git';
    risks.push(`Блокеры ревью без решения: ${listed(blockers.map((x) => x.id))} — в FR и AC их нет, после удаления ${after}.`);
  }
  const notes = reviewRows(m, (rv) => rv.rows.filter((r) => !r.blocker && undecided(r)));
  if (notes.length) risks.push(`Замечания ревью без решения: ${listed(notes.map((x) => x.id))} — ${lostReview(dirty, notes) || 'уйдут в историю git'}.`);
  return risks;
}

/** @param {string[] | null} dirty @param {string[]} files */
function uncommittedRisks(dirty, files) {
  const risks = [];
  if (dirty === null && files.length) risks.push('Не git-репозиторий: удалённое не восстановить.');
  else if (dirty?.length) risks.push(`Не закоммичено: ${listed(dirty)} — удалится без следа, в истории git этого не будет.`);
  return risks;
}

// Сводка для подтверждения. Риски — только то, что будет потеряно или останется сломанным;
// пустой список — подтверждение без последствий.
/** @param {Feature} m @returns {CloseSummary} */
export function closeSummary(m) {
  const findings = runChecks(m);
  const dir = rel(m.dir);
  const files = doomedFiles(m);
  const doomed = isDoomed(m);
  const effects = files.map(rel);
  if (m.spec && hasProtocolTraces(m.spec.md)) effects.push(`${rel(m.specFile)}: уберутся ссылки на протокол («Из протокола: П<n>»)`);

  const unfinished = unfinishedPlanning(m);
  const risks = [];
  if (unfinished.length)
    risks.push(`Планирование не закончено (${unfinished.join('; ')}): протокол и ревью — основа для доработки, после удаления они будут только в истории git.`);
  const dirty = uncommitted(m, files);
  risks.push(...reviewRisks(m, dirty), ...uncommittedRisks(dirty, files));

  const errs = findings.filter((x) => x.level === 'err' && !doomed(path.resolve(x.file)));
  if (errs.length) risks.push(`Ошибок lint в постоянных документах: ${errs.length} — close их не исправит. Список: ${lintCode(dir)}.`);

  return { dir, files, effects, risks };
}

/** @param {CloseSummary} s */
export function closePreview(s) {
  const shown = s.effects.slice(0, MAX_LIST).map(codePaths);
  if (s.effects.length > MAX_LIST) shown.push(`… и ещё ${s.effects.length - MAX_LIST}`);
  return blocks(
    `${bold(`Закрытие ${s.dir}`)} — пока ничего не удалено.`,
    `Удалится:\n${list(shown)}`,
    s.risks.length ? `Последствия:\n${list(s.risks.map(codePaths))}` : null,
  );
}

// Второй вопрос перед удалением. Риски есть — рекомендуем не удалять: решает человек.
/** @param {Feature} m @param {CloseSummary} s @returns {import('./question.mjs').Question} */
export function closeQuestion(m, s) {
  const clean = !s.risks.length;
  return {
    header: 'Закрыть фичу',
    question: clean ? `Удалить временные артефакты ${s.dir}?` : `Удалить временные артефакты ${s.dir}, несмотря на последствия выше?`,
    preview: closePreview(s),
    options: closeOptions(m, clean),
  };
}
// Рекомендованный — первым, как в остальных вопросах этапа.
/** @param {Feature} m @returns {import('./question.mjs').Option[]} */
export function closeOptions(m, clean = true) {
  /** @type {import('./question.mjs').Option} */
  const yes = {
    id: 'close:yes',
    label: 'Удалить',
    description: 'скрипт удалит перечисленное и проверит фичу',
    recommended: clean,
    action: { lint: ['close', rel(m.dir), '--yes'], after: G.stop },
  };
  /** @type {import('./question.mjs').Option} */
  const no = { id: 'close:no', label: 'Не удалять', description: 'ничего не делать', recommended: !clean, action: { none: true } };
  return clean ? [yes, no] : [no, yes];
}
