// Отпечаток одобрения: «одобрено <дата> · xxxxxx», сверка с содержимым, проверки AP-*.
// @ts-check
import path from 'node:path';
import { scenarioFiles } from './scenario-section.mjs';
import crypto from 'node:crypto';

import { lintCmd } from './config.mjs';
import { collect } from './findings.mjs';
import { read, rel, approved, headerLine } from './md.mjs';
import { stripProtocol } from './sources.mjs';

/** @typedef {import('./model.mjs').Feature} Feature */

// approve дописывает к статусу «· xxxxxx» — хэш содержимого. Одобрение действительно, только если
// отметка есть и совпадает: «одобрено» руками или правка после одобрения одобрением не считаются,
// и ворота, вопрос этапа и close видят такой файл как «на ревью». Ожидаемый хэш нигде не печатается.
// В хэш не входят строка статуса, номера строк в ссылках и следы протокола: их меняют fix и close.
const FP_RE = /\s*·\s*([0-9a-f]{6})\s*$/;
/** @typedef {import('./model.mjs').Approval} Approval */
/** @param {string | null | undefined} md */
function approvalBody(md) {
  return stripProtocol((md || '').replace(/\r\n/g, '\n'))
    .replace(/^Статус:.*$/m, '')
    .replace(/(\]\([^)\s]*)#L\d+\)/g, '$1)')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
/** @param {(string | null | undefined)[]} mds */
export const fingerprint = (mds) => crypto.createHash('sha256').update(mds.map(approvalBody).join('\n\0\n')).digest('hex').slice(0, 6);
/** @param {Feature} m */
const sliceMds = (m) => [...m.slices.values()].sort((a, b) => a.num.localeCompare(b.num)).map((s) => s.md);
// Тексты, от которых считается отметка: spec, README со всеми slices или один ADR (он есть — его одобряют).
/** @param {Feature} m @param {Approval['kind']} kind @param {string} file @returns {(string | null)[]} */
export const approvalMds = (m, kind, file) => MDS_OF[kind](m, file);
/** @type {Record<Approval['kind'], (m: Feature, file: string) => (string | null)[]>} */
const MDS_OF = {
  spec: (m) => [/** @type {import('./model.mjs').Spec} */ (m.spec).md, ...scenarioFiles(m).map((d) => d.md)],
  slices: (m) => [m.readme, ...sliceMds(m)],
  adr: (m, file) => [/** @type {import('./model.mjs').Adr} */ (m.adrs.find((a) => a.file === file)).md],
};
const NO_MARK = 'на ревью (статус ставил не approve)';
const CHANGED = 'на ревью (файл менялся после approve)';
// manual — «одобрено» без отметки, ok — отметка совпала с содержимым, changed — файл менялся после approve.
/** @param {Feature} m @param {Approval['kind']} kind @param {string} file @param {string | undefined} fp @returns {Approval['state']} */
function approvalState(m, kind, file, fp) {
  if (!fp) return 'manual';
  return fp === fingerprint(approvalMds(m, kind, file)) ? 'ok' : 'changed';
}
/** @type {Record<string, string>} */
const SHOWN = { manual: NO_MARK, changed: CHANGED };
// Статусы в модели — как их видят ворота и вопрос этапа; m.approvals — что одобрено и в каком состоянии.
/** @param {Feature} m */
export function verifyApprovals(m) {
  m.approvals = [];
  /** @param {Approval['kind']} kind @param {string} file @param {string | null} status */
  const one = (kind, file, status) => {
    if (!approved(status)) return status;
    const text = /** @type {string} */ (status);
    const state = approvalState(m, kind, file, (text.match(FP_RE) || [])[1]);
    const raw = text.replace(FP_RE, '');
    m.approvals.push({ kind, file, raw, state });
    return SHOWN[state] || raw;
  };
  if (m.spec) m.spec.status = one('spec', m.spec.file, m.spec.status);
  if (m.readme != null) m.slicesStatus = one('slices', m.readmeFile, m.slicesStatus);
  for (const a of m.adrs) a.status = one('adr', a.file, a.status);
}
/** @param {Feature} m */
export const ownApprovals = (m) => m.approvals.filter((x) => x.kind !== 'adr' || m.featureAdrs.some((a) => a.file === x.file));
/** @param {Feature} m */
export function checkApprovals(m) {
  const { found, add } = collect();
  for (const x of ownApprovals(m)) {
    const md = read(x.file);
    if (x.state === 'manual') add('AP-01', x.file, headerLine(md, 'Статус'), `«${x.raw}» без отметки approve — одобрением не считается`);
    if (x.state === 'changed') add('AP-02', x.file, headerLine(md, 'Статус'), `«${x.raw}»: файл менялся после approve`);
  }
  return found;
}
/** @param {Feature} m @param {Approval} x */
export const approveCmd = (m, x) =>
  x.kind === 'adr' ? lintCmd('approve', 'adr', rel(m.dir), path.basename(x.file).slice(0, 4)) : lintCmd('approve', x.kind, rel(m.dir));
