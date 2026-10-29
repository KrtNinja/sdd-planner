// Фича целиком: загрузка артефактов и запуск всех проверок.
import fs from 'node:fs';
import path from 'node:path';

import { parseAdr, checkAdrs } from './adr.mjs';
import { verifyApprovals, checkApprovals } from './approval.mjs';
import { checkCodeRefs } from './code-refs.mjs';
import { checkEditMarks } from './edit-marks.mjs';
import { read, scan, header } from './md.mjs';
import { parseProtocol, checkProtocol } from './protocol.mjs';
import { checkReadSize } from './read-size.mjs';
import { parseReview, checkReviews } from './review.mjs';
import { parseSlice, checkSlices } from './slices.mjs';
import { parseSpec, checkSpec } from './spec.mjs';

export function loadFeature(dir, readFn = read, listFn = null) {
  const featureDir = path.resolve(dir);
  const name = path.basename(featureDir);
  const protocolFile = path.join(featureDir, 'brainstorming.md');
  const specFile = path.join(featureDir, 'spec.md');
  const slicesDir = path.join(featureDir, 'slices');
  const readmeFile = path.join(slicesDir, 'README.md');
  const adrDir = path.join(featureDir, '..', 'adr');
  const list = listFn || ((d) => (fs.existsSync(d) ? fs.readdirSync(d) : []));
  const slices = new Map();
  for (const f of list(slicesDir).filter((x) => /^\d{3}-.+\.md$/.test(x)).sort()) {
    const file = path.join(slicesDir, f);
    const md = readFn(file);
    if (md != null) slices.set(f.slice(0, 3), parseSlice(file, md));
  }
  const adrs = [];
  for (const f of list(adrDir).filter((x) => /^\d{4}-.+\.md$/.test(x)).sort()) {
    const file = path.join(adrDir, f);
    const md = readFn(file);
    if (md != null) adrs.push(parseAdr(file, md));
  }
  const readme = readFn(readmeFile);
  const reviewDir = path.join(featureDir, 'review');
  const reviews = new Map();
  for (const f of list(reviewDir).filter((x) => /\.md$/.test(x)).sort()) {
    const file = path.join(reviewDir, f);
    const md = readFn(file);
    if (md != null) reviews.set(f.replace(/\.md$/, ''), parseReview(file, md));
  }
  const m = {
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
    readmeSc: readme != null ? scan(readme) : null,
    slicesStatus: readme != null ? header(readme, 'Статус') : null,
    adrDir,
    adrs,
    featureAdrs: adrs.filter((a) => a.md.includes(`${name}/`)),
    protocolFile,
    specFile,
  };
  verifyApprovals(m);
  return m;
}

export const featureFiles = (m) =>
  [m.protocolFile, m.specFile, m.readmeFile, ...[...m.slices.values()].map((s) => s.file), ...m.featureAdrs.map((a) => a.file)].filter((f) =>
    fs.existsSync(f),
  );

export function runChecks(m) {
  checkProtocol(m);
  checkSpec(m);
  checkSlices(m);
  checkAdrs(m);
  checkReviews(m);
  checkEditMarks(m);
  checkCodeRefs(m);
  checkReadSize(m);
  checkApprovals(m);
}
