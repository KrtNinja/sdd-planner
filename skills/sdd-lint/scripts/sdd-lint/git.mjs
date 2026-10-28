// Чтение файлов и списков из git.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
export function gitInfo(dir) {
  try {
    return { top: fs.realpathSync(git(['rev-parse', '--show-toplevel'], dir).trim()) };
  } catch {
    return null;
  }
}
const realish = (f) => (fs.existsSync(f) ? fs.realpathSync(f) : path.join(realish(path.dirname(f)), path.basename(f)));
const gitPath = (g, f) => path.relative(g.top, realish(f)).split(path.sep).join('/');
export function gitShow(g, ref, f) {
  try {
    return git(['show', `${ref}:${gitPath(g, f)}`], g.top);
  } catch {
    return null;
  }
}
export function gitList(g, ref, d) {
  try {
    return git(['ls-tree', '--name-only', ref, `${gitPath(g, d)}/`], g.top)
      .split('\n')
      .filter(Boolean)
      .map((x) => path.basename(x));
  } catch {
    return [];
  }
}
