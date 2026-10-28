// Команды snapshot и guard: проверки HG-*.
import fs from 'node:fs';
import path from 'node:path';

import { flags, pos } from './args.mjs';
import { usage } from './cli.mjs';
import { lintCmd } from './config.mjs';
import { loadFeature, featureFiles } from './feature.mjs';
import { add, report } from './findings.mjs';
import { gitInfo, gitShow } from './git.mjs';
import { rel } from './md.mjs';
import { resolveFeature, pickFeature } from './pick.mjs';
import { snapPath, protectedParts, saveSnapshot, diffParts } from './snapshot.mjs';

export const targetFiles = (t) => {
  if (!t) pickFeature('Укажи файл или фичу', 0);
  if (!fs.existsSync(t)) {
    const f = resolveFeature(t);
    if (!f) usage(`Нет файла или папки ${t}`);
    t = f;
  }
  return fs.statSync(t).isDirectory() ? featureFiles(loadFeature(resolveFeature(t) || t)) : [path.resolve(t)];
};

export function cmdSnapshot() {
  const files = targetFiles(pos[0]);
  for (const f of files) saveSnapshot(f);
  console.log(`Снимок защищённых частей: ${files.map(rel).join(', ')}. После humanizer: ${lintCmd('guard', pos[0])}`);
}

export function cmdGuard() {
  const files = targetFiles(pos[0]);
  let bad = 0;
  const noBase = [];
  for (const f of files) {
    let before = null;
    let from = null;
    if (!flags.base && fs.existsSync(snapPath(f))) {
      before = JSON.parse(fs.readFileSync(snapPath(f), 'utf8')).parts;
      from = 'снимок';
    } else {
      const g = gitInfo(path.dirname(f));
      const md = g ? gitShow(g, flags.base || 'HEAD', f) : null;
      if (md != null) {
        before = protectedParts(md);
        from = flags.base || 'HEAD';
      }
    }
    if (!before) {
      noBase.push(f);
      continue;
    }
    const diffs = diffParts(before, protectedParts(fs.readFileSync(f, 'utf8')));
    if (!diffs.length) {
      saveSnapshot(f);
      continue;
    }
    bad += 1;
    for (const d of diffs) add('HG-01', f, null, `(против: ${from}) ${d}`);
  }
  report({ noBase: noBase.map(rel) });
  if (!flags.json) {
    const ok = files.length - bad - noBase.length;
    const out = [];
    if (bad) out.push(`Защищённые части изменены в ${bad} файл(ах) — верните их как были.`);
    if (noBase.length)
      out.push(
        `Не с чем сверить ${noBase.length} файл(ов): нет снимка и версии в git — ${noBase.map(rel).join(', ')}.`,
        `  Снимок снимают до humanizer: ${lintCmd('snapshot', '<файл>')}. Если humanizer уже прошёл, сверьте защищённые части глазами.`,
      );
    if (ok) out.push(`Защищённые части не тронуты в ${ok} файл(ах).`);
    console.log(`\n${out.join('\n')}`);
  }
  process.exit(bad || noBase.length ? 1 : 0);
}
