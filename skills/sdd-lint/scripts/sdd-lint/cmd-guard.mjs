// Команды snapshot и guard: проверки HG-*.
import fs from 'node:fs';
import path from 'node:path';

import { usage } from './cli.mjs';
import { code, lintCode } from './config.mjs';
import { loadFeature, featureFiles } from './feature.mjs';
import { add, report } from './findings.mjs';
import { gitInfo, gitShow } from './git.mjs';
import { rel } from './md.mjs';
import { resolveFeature, pickFeature } from './pick.mjs';
import { snapPath, protectedParts, saveSnapshot, diffParts } from './snapshot.mjs';

export const targetFiles = (ctx, t) => {
  if (!t) pickFeature(ctx, 'Укажи файл или фичу', 0);
  if (!fs.existsSync(t)) {
    const f = resolveFeature(t);
    if (!f) usage(ctx, `Нет файла или папки ${t}`);
    t = f;
  }
  return fs.statSync(t).isDirectory() ? featureFiles(loadFeature(resolveFeature(t) || t)) : [path.resolve(t)];
};

export function cmdSnapshot(ctx) {
  const { pos } = ctx.args;
  const files = targetFiles(ctx, pos[0]);
  for (const f of files) saveSnapshot(f);
  ctx.io.log(`Снимок защищённых частей: ${files.map(rel).join(', ')}. После humanizer: ${lintCode('guard', pos[0])}`);
}

export function cmdGuard(ctx) {
  const { flags, pos } = ctx.args;
  const files = targetFiles(ctx, pos[0]);
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
  report(ctx, { noBase: noBase.map(rel) });
  if (!flags.json) {
    const ok = files.length - bad - noBase.length;
    const out = [];
    if (bad) out.push(`Защищённые части изменены в ${bad} файл(ах) — верните их как были.`);
    if (noBase.length)
      out.push(
        `Не с чем сверить ${noBase.length} файл(ов): нет снимка и версии в git — ${noBase.map((f) => code(rel(f))).join(', ')}. Снимок снимают до humanizer: ${lintCode('snapshot', '<файл>')}. Если humanizer уже прошёл, сверьте защищённые части глазами.`,
      );
    if (ok) out.push(`Защищённые части не тронуты в ${ok} файл(ах).`);
    ctx.io.log(`\n${out.join('\n\n')}`);
  }
  ctx.io.exit(bad || noBase.length ? 1 : 0);
}
