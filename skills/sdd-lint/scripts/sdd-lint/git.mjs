// Чтение файлов и списков из git.
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** Корень репозитория; null — не git. @typedef {{ top: string }} GitInfo */

/** @param {string[]} args @param {string} cwd @returns {string} */
export const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
/** @param {string} dir @returns {GitInfo | null} */
export function gitInfo(dir) {
  try {
    return { top: fs.realpathSync(git(['rev-parse', '--show-toplevel'], dir).trim()) };
  } catch {
    return null;
  }
}
// Реальный путь и для файла, которого нет на диске (удалён после коммита): по ближайшей существующей папке.
/** @param {string} f @returns {string} */
const realish = (f) => (fs.existsSync(f) ? fs.realpathSync(f) : path.join(realish(path.dirname(f)), path.basename(f)));
/** @param {GitInfo} g @param {string} f */
const gitPath = (g, f) => path.relative(g.top, realish(f)).split(path.sep).join('/');
/** @param {GitInfo} g @param {string} ref @param {string} f */
export function gitShow(g, ref, f) {
  try {
    return git(['show', `${ref}:${gitPath(g, f)}`], g.top);
  } catch {
    return null;
  }
}
/** @param {GitInfo} g @param {string} ref @param {string} d */
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
