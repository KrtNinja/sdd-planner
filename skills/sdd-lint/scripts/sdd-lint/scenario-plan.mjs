// План механического переноса: точные версии, ссылки и действительные одобрения.
// @ts-check
import path from 'node:path';
import fs from 'node:fs';
import { checkDecision } from './decision-files.mjs';
import { approvalMds, fingerprint } from './approval.mjs';
import { loadFeature } from './feature.mjs';
import { requireDocumentationFlow } from './flow.mjs';
import { read } from './md.mjs';
import { scenarioSection, SCENARIO_LINK } from './scenario-section.mjs';
import { relocateScenarioLinks, scenarioAnchors, inlineScenarioReferences } from './scenario-links.mjs';
import { snapPath, protectedParts, diffParts } from './snapshot.mjs';

/** @typedef {import('./model.mjs').Feature} Feature */
/** @typedef {{file: string, before: string | null, after: string}} MoveChange */

/** @param {Feature} m */
function checkPackages(m) {
  const q = m.flow.records.find((r) => r.kind === 'question' && r.fields.Пакет && !['resolved', 'excluded'].includes(r.fields.Статус));
  if (q) throw new Error(`${q.id}: сначала завершите apply пакета; непроведённый пакет можно отменить через revise. ` +
    'После переноса выполните resume и prepare заново; частично проведённый пакет нельзя сбрасывать.');
}

/** @param {Feature} m @param {MoveChange[]} changes */
function moveCandidate(m, changes) {
  const overrides = new Map(changes.map((c) => [c.file, c.after]));
  return loadFeature(m.dir, (f) => f.endsWith('.sdd-scenarios.pending') ? null : overrides.get(f) ?? read(f));
}

/** @param {Feature} m */
export function planScenarioMove(m) {
  requireDocumentationFlow(m);
  checkPackages(m);
  if (!m.spec) throw new Error('Нет spec.md');
  const part = scenarioSection(m.spec.md);
  if (!part) throw new Error('Нет раздела «## Пользовательские сценарии»: переносить нечего');
  const target = path.join(m.dir, 'scenarios.md');
  if (read(target) !== null) throw new Error('scenarios.md уже существует: не перезаписываю и не объединяю копии');
  checkPlacement(m, part);
  return buildMove(m, part, target);
}

/** @param {Feature} m @param {NonNullable<ReturnType<typeof scenarioSection>>} part */
function checkPlacement(m, part) {
  const outside = m.flow.records.some((r) => r.file === m.specFile && ['scenario', 'step'].includes(r.kind) &&
    (r.n <= part.start || r.n > part.stop));
  if (outside) throw new Error('Все SC/STEP должны находиться внутри раздела сценариев');
  const reqs = [...(m.spec?.reqs.values() || [])];
  if (reqs.some((r) => r.n > part.start && r.n <= part.stop))
    throw new Error('Раздел сценариев содержит блок FR/NFR: оставьте обязательства в разделе требований');
}

/** @param {Feature} m @param {NonNullable<ReturnType<typeof scenarioSection>>} part @param {string} target */
function buildMove(m, part, target) {
  const replacement = `## Пользовательские сценарии\n\n${SCENARIO_LINK}\n\n`;
  const move = { spec: m.specFile, target, start: part.start, stop: part.stop,
    replacement: replacement.split('\n').length - 1, anchors: scenarioAnchors(part.text) };
  const remaining = (part.before ? part.before + '\n' : '') + replacement + part.after;
  const spec = inlineScenarioReferences(remaining, /** @type {string} */ (m.spec?.md));
  const docs = [...markdownFiles(m.dir), ...m.featureAdrs.map((a) => a.file)];
  /** @type {MoveChange[]} */
  const changes = docs.flatMap((file) => {
    const before = /** @type {string} */ (read(file));
    const after = relocateScenarioLinks(file === m.specFile ? spec : before, file, file, move);
    return before === after ? [] : [{ file, before, after }];
  });
  changes.unshift({ file: target, before: /** @type {string | null} */ (null),
    after: relocateScenarioLinks(inlineScenarioReferences(part.text, /** @type {string} */ (m.spec?.md)), m.specFile, target, move) });
  preserveApprovals(m, changes);
  checkDecision(moveCandidate(m, changes));
  return { changes, snapshots: moveSnapshots(changes) };
}

/** @param {Feature} m @param {MoveChange[]} changes */
function preserveApprovals(m, changes) {
  const candidate = moveCandidate(m, changes);
  for (const approval of m.approvals.filter((a) => a.state === 'ok')) {
    let change = changes.find((c) => c.file === approval.file);
    if (!change) {
      const before = /** @type {string} */ (read(approval.file));
      change = { file: approval.file, before, after: before };
      changes.push(change);
    }
    const fp = fingerprint(approvalMds(candidate, approval.kind, approval.file));
    change.after = change.after.replace(/^(Статус:.*) · [0-9a-f]{6}$/m, `$1 · ${fp}`);
  }
}

/** @param {MoveChange[]} changes */
function moveSnapshots(changes) {
  return changes.filter((c) => c.before !== null).flatMap((c) => {
    const file = snapPath(c.file);
    const before = read(file);
    if (before === null) return [];
    const snapshot = JSON.parse(before);
    if (diffParts(snapshot.parts, protectedParts(/** @type {string} */ (c.before))).length)
      throw new Error(`Снимок ${c.file} уже расходится с документом: сначала guard и разбор изменений`);
    return [{ file, before, after: JSON.stringify({ ...snapshot, parts: protectedParts(c.after) }) }];
  });
}

/** @param {string} dir @returns {string[]} */
function markdownFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Символическая ссылка в документах: ${file}`);
    if (entry.isDirectory()) return markdownFiles(file);
    return entry.name.endsWith('.md') ? [file] : [];
  });
}
