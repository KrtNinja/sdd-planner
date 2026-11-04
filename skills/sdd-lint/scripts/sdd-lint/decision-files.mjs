// Узкий пакет документов одного ответа Q: сравнение точных версий и повторная запись без добавлений.
// @ts-check
import fs from 'node:fs';
import { scenarioSection, scenarioFiles } from './scenario-section.mjs';
import path from 'node:path';
import { read } from './md.mjs';
import { publishQuestionDocument } from './registry-store.mjs';
import { linkSpec, linkSlice } from './gen-links.mjs';
import { loadFeature, runChecks } from './feature.mjs';

/** @typedef {{file: string, before: string | null, after: string}} Change */
/** @typedef {import('./model.mjs').Feature} Feature */

/** @param {Feature} m @param {string} relative */
function decisionPath(m, relative) {
  const file = path.resolve(m.dir, relative);
  const existing = [...m.slices.values()].map((s) => s.file).concat(m.featureAdrs.map((a) => a.file), m.readmeFile);
  const local = ['spec.md', 'scenarios.md', 'tech.md'];
  if (m.protocol) local.push('brainstorming.md');
  if (!local.includes(relative) && !existing.includes(file)) throw new Error(`Недопустимый файл пакета: ${relative}`);
  const parent = fs.realpathSync(path.dirname(file));
  if (parent !== path.dirname(file) || fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink())
    throw new Error('Пакет не пишет через символические ссылки');
  return file;
}

/** @param {Feature} m @param {Change[]} changes */
export function decisionFiles(m, changes) {
  if (!Array.isArray(changes) || !changes.length) throw new Error('Нужен непустой пакет изменений');
  const seen = new Set();
  return changes.map((change) => {
    const file = decisionPath(m, change.file);
    if (seen.has(file)) throw new Error('Файл повторяется в пакете');
    seen.add(file);
    validateChange(change);
    if (read(file) !== change.before) throw new Error(`Контекст изменился: ${change.file}`);
    return { ...change, after: change.file === 'brainstorming.md' ? change.after : reviewStatus(change.after) };
  });
}

/** @param {Change} c */
function validateChange(c) {
  if (c.before !== null && typeof c.before !== 'string') throw new Error('before — точный текст или null');
  if (typeof c.after !== 'string' || !c.after.trim()) throw new Error('after — непустой текст документа');
  if (c.before === c.after) throw new Error('Пакет не содержит изменения файла');
  if (/\b(?:N?FR|AC-\d{3})-\?/.test(c.after)) throw new Error('Сначала получите окончательные ID через next');
}

/** @param {string} md */
function reviewStatus(md) {
  if (/^Статус:/m.test(md)) return md.replace(/^Статус:.*$/m, 'Статус: на ревью');
  return md.replace(/^(# [^\n]*\n)/, '$1Статус: на ревью\n');
}

/** @param {Feature} m @param {Change[]} changes */
export function decisionReviews(m, changes) {
  const changed = new Set(changes.map((c) => path.resolve(m.dir, c.file)));
  const dependencies = [...m.featureAdrs.map((a) => a.file), ...[...m.slices.values()].map((s) => s.file), m.readmeFile,
    path.join(m.dir, 'tech.md'), path.join(m.dir, 'scenarios.md')];
  if (!changes.some((c) => c.file !== 'brainstorming.md')) return changes;
  const extra = dependencies.filter((f) => !changed.has(f)).flatMap((file) => {
    const before = read(file);
    if (before === null) return [];
    const after = reviewStatus(before);
    return before === after ? [] : [{ file: path.relative(m.dir, file), before, after }];
  });
  return [...changes, ...extra].map((c) => ({ ...c, after: c.file === 'brainstorming.md' ? c.after : reviewStatus(c.after) }));
}

/** @param {string} dir @param {Change[]} changes */
export function candidateFeature(dir, changes) {
  const overrides = new Map(changes.map((c) => [path.resolve(dir, c.file), c.after]));
  return loadFeature(dir, (file) => file.endsWith('questions.md.pending') ? null : overrides.get(file) ?? read(file));
}

/** @param {Feature} m */
export function checkDecision(m) {
  const errors = runChecks(m).filter((f) => f.level === 'err');
  if (errors.length) throw new Error(`Пакет не прошёл структурные проверки: ${errors.map((f) => `${f.rule}: ${f.msg}`).join('; ')}`);
}

/** @param {Feature} before @param {Feature} after @param {string} obligations */
export function checkDecisionMeaning(before, after, obligations) {
  if (!['changed', 'unchanged'].includes(obligations)) throw new Error('obligations: changed или unchanged');
  if (obligations === 'unchanged') unchangedBehaviour(before, after);
  for (const id of before.flow.graph?.byId.keys() || []) {
    if (!after.flow.graph?.byId.has(id)) throw new Error(`Пакет удаляет существующий ID ${id}`);
  }
  checkProtocolAppend(before, after);
  checkProtocolScope(before, after);
}

/** @param {Feature} before @param {Feature} after */
function checkProtocolAppend(before, after) {
  if (!before.protocol || !after.protocol) return;
  const rows = new Set([...after.protocol.rows, ...after.protocol.post].map((r) => r.raw));
  for (const row of [...before.protocol.rows, ...before.protocol.post]) {
    if (!rows.has(row.raw)) throw new Error('Протокол можно только дополнять');
  }
}

/** @param {Feature} m @param {Change[]} changes */
export function applyDecisionFiles(m, changes) {
  // Сначала проверяются ВСЕ версии: конфликт не должен оставлять новый частичный пакет.
  for (const c of changes) {
    const current = read(decisionPath(m, c.file));
    if (current !== c.before && current !== c.after) throw new Error(`Конфликт проведения: ${c.file}`);
  }
  for (const c of changes) {
    const file = decisionPath(m, c.file);
    if (read(file) === c.after) continue;
    publishQuestionDocument(file, c.after, '.decision-writing');
  }
}

/** @param {Feature} m */
function requirementsText(m) {
  return JSON.stringify([...(m.spec?.reqs.values() || [])].map((r) => [r.id, r.text]));
}

// Те же генераторы ссылок, что fix; подготовка не пишет рабочие документы.
/** @param {string} dir @param {Change[]} changes */
export function decisionLinks(dir, changes) {
  const drafts = new Map(changes.map((c) => [path.resolve(dir, c.file), c]));
  const collect = (/** @type {string} */ file, /** @type {string} */ after) => {
    const old = drafts.get(file);
    if (read(file) === after && !old) return;
    drafts.set(file, { file: path.relative(dir, file), before: old ? old.before : read(file), after });
  };
  let m = candidateFeature(dir, [...drafts.values()]);
  if (m.spec && m.protocol) linkSpec(/** @type {import('./gen-links.mjs').SpecFeature} */ (m), collect);
  m = candidateFeature(dir, [...drafts.values()]);
  if (m.spec) for (const sl of m.slices.values()) linkSlice(sl, m.spec, collect);
  return [...drafts.values()];
}

// Вызывается явно после остановки писателей и восстановления questions.md.pending.
/** @param {Feature} m */
export function recoverDecisionWrites(m) {
  for (const q of m.flow.records.filter((r) => r.kind === 'question' && r.fields.Пакет)) {
    const pack = /** @type {{changes: Change[]}} */ (JSON.parse(q.fields.Пакет));
    for (const c of pack.changes) {
      const temp = `${decisionPath(m, c.file)}.decision-writing`;
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  }
}

/** @param {Feature} before @param {Feature} after */
function checkProtocolScope(before, after) {
  if (!before.protocol || !after.protocol) return;
  const scope = new Set(after.protocol.outScope.map((x) => x.text));
  if (before.protocol.outScope.some((x) => !scope.has(x.text))) throw new Error('Согласованные исключения протокола нельзя удалять');
}

/** @param {Feature} m */
function scenarioText(m) {
  return JSON.stringify([scenarioSection(m.spec?.md || '')?.text || '', ...scenarioFiles(m).map((d) => d.md)]);
}

/** @param {Feature} before @param {Feature} after */
function unchangedBehaviour(before, after) {
  if (requirementsText(before) !== requirementsText(after)) throw new Error('Техническое уточнение не может менять FR/NFR');
  if (scenarioText(before) !== scenarioText(after))
    throw new Error('Техническое уточнение не может менять сценарии: обсудите изменение поведения через sdd-decide');
}
