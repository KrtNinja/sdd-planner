// Фича целиком: загрузка артефактов и запуск всех проверок.
// @ts-check
import { checkTech, techFiles } from './tech.mjs';
import { scenarioFiles } from './scenario-section.mjs';
import { checkRegistry } from './registry-rules.mjs';
import fs from 'node:fs';
import path from 'node:path';

import { checkAdrs } from './adr-rules.mjs';
import { parseAdr } from './adr.mjs';
import { verifyApprovals, checkApprovals } from './approval.mjs';
import { checkCodeRefs } from './code-refs.mjs';
import { WORK_DIR } from './config.mjs';
import { checkCut } from './cut.mjs';
import { loadDocumentationFlow, indexDocumentationFlow, checkDocumentationFlow } from './flow.mjs';
import { checkEditMarks } from './edit-marks.mjs';
import { read, scan, header } from './md.mjs';
import { checkPlan } from './plan-rules.mjs';
import { parsePlan } from './plan.mjs';
import { parseProtocol, checkProtocol } from './protocol.mjs';
import { checkReadSize } from './read-size.mjs';
import { parseReview, checkReviews } from './review.mjs';
import { checkSlices } from './slice-rules.mjs';
import { parseSlice } from './slices.mjs';
import { checkSpec } from './spec-rules.mjs';
import { parseSpec } from './spec.mjs';
import { checkWork } from './work.mjs';

/** @typedef {import('./model.mjs').Feature} Feature */
/** @typedef {import('./model.mjs').Slice} Slice */
/** @typedef {import('./model.mjs').Adr} Adr */
/** @typedef {import('./model.mjs').Review} Review */

// Папка артефактов: файлы по имени (re), по алфавиту, каждый разобран; файл, который не прочитался, пропускается.
/** @param {(dir: string) => string[]} list @param {(file: string) => string | null} readFn */
const folderLoader = (list, readFn) =>
  /** @template T @param {string} dir @param {RegExp} re @param {(file: string, md: string) => T} parse @returns {[string, T][]} */
  (dir, re, parse) =>
    list(dir)
      .filter((x) => re.test(x))
      .sort()
      .flatMap((f) => {
        const file = path.join(dir, f);
        const md = readFn(file);
        return md != null ? [/** @type {[string, T]} */ ([f, parse(file, md)])] : [];
      });

// readFn и listFn подменяют чтение: diff читает файлы из git, approve — будущий текст файла.
/**
 * @param {string} dir
 * @param {(file: string) => string | null} [readFn]
 * @param {((dir: string) => string[]) | null} [listFn]
 * @returns {Feature}
 */
export function loadFeature(dir, readFn = read, listFn = null) {
  const featureDir = path.resolve(dir);
  const name = path.basename(featureDir);
  const protocolFile = path.join(featureDir, 'brainstorming.md');
  const specFile = path.join(featureDir, 'spec.md');
  const slicesDir = path.join(featureDir, 'slices');
  const readmeFile = path.join(slicesDir, 'README.md');
  const workDir = path.join(featureDir, WORK_DIR);
  const planFile = path.join(workDir, 'plan.md');
  const adrDir = path.join(featureDir, '..', 'adr');
  const list = listFn || ((/** @type {string} */ d) => (fs.existsSync(d) ? fs.readdirSync(d) : []));
  const load = folderLoader(list, readFn);
  /** @type {Map<string, Slice>} */
  const slices = new Map(load(slicesDir, /^\d{3}-.+\.md$/, parseSlice).map(([f, x]) => [f.slice(0, 3), x]));
  /** @type {Adr[]} */
  const adrs = load(adrDir, /^\d{4}-.+\.md$/, parseAdr).map(([, x]) => x);
  const readme = readFn(readmeFile);
  const reviewDir = path.join(workDir, 'review');
  /** @type {Map<string, Review>} */
  const reviews = new Map(load(reviewDir, /\.md$/, parseReview).map(([f, x]) => [f.replace(/\.md$/, ''), x]));
  /** @type {Feature} */
  const m = {
    flow: loadDocumentationFlow(featureDir, readFn),
    workDir,
    reviewDir,
    reviews,
    dir: featureDir,
    name,
    protocol: parseProtocol(protocolFile, readFn(protocolFile)),
    spec: parseSpec(specFile, readFn(specFile)),
    slicesDir,
    slices,
    readmeFile,
    readme,
    planFile,
    plan: parsePlan(planFile, readFn(planFile)),
    readmeSc: readme != null ? scan(readme) : null,
    slicesStatus: readme != null ? header(readme, 'Статус') : null,
    adrDir,
    adrs,
    featureAdrs: adrs.filter((a) => a.md.includes(`${name}/`)),
    protocolFile,
    specFile,
    approvals: [],
  };
  indexDocumentationFlow(m, readFn);
  verifyApprovals(m);
  return m;
}

/** @param {Feature} m */
export const featureFiles = (m) =>
  [...new Set([...techFiles(m).map((d) => d.file), ...scenarioFiles(m).map((d) => d.file), m.protocolFile, m.specFile, m.readmeFile,
    ...[...m.slices.values()].map((s) => s.file), ...m.featureAdrs.map((a) => a.file)])].filter((f) =>
    fs.existsSync(f),
  );

// Все проверки фичи: находки — массивом, в том порядке, в каком их добавляли проверки.
/** @param {Feature} m @returns {import('./model.mjs').Finding[]} */
export function runChecks(m) {
  return [
    ...checkDocumentationFlow(m),
    ...checkRegistry(m),
    ...checkTech(m),
    ...checkProtocol(m),
    ...checkSpec(m),
    ...checkSlices(m),
    ...(m.slices.size ? checkCut(m) : []),
    ...checkPlan(m),
    ...checkAdrs(m),
    ...checkReviews(m),
    ...checkWork(m),
    ...checkEditMarks(m),
    ...checkCodeRefs(m),
    ...checkReadSize(m),
    ...checkApprovals(m),
  ];
}
