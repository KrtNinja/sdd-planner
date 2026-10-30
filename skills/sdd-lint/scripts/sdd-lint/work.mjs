// Папка временных артефактов фичи _work/ (WK-*): ревью, план нарезки, черновики агента.
// Всё в ней живёт до close и коммитится: ревью читает /sdd-decide в новом контексте, после close — история git.
import fs from 'node:fs';
import path from 'node:path';

import { WORK_DIR } from './config.mjs';
import { add } from './findings.mjs';
import { git, gitInfo } from './git.mjs';
import { scan, rel } from './md.mjs';

// «_work/review/spec.md», «../_work/plan.md» — путь внутрь папки, которой после close не будет.
const WORK_REF = new RegExp(`(?<![\\w.\\-])${WORK_DIR}/`);

// Старые места до _work/: review/ в папке фичи и slices/plan.md.
export const legacyPaths = (m) => ({ review: path.join(m.dir, 'review'), plan: path.join(m.slicesDir, 'plan.md') });

// Файлы в _work/ списком относительных путей — что именно удалит close.
export function workFiles(m) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else out.push(f);
    }
  };
  if (fs.existsSync(m.workDir)) walk(m.workDir);
  return out;
}

// Игнор git проверяем на файле внутри: «tmp/», «_*» в глобальном .gitignore молча прячут ревью от коммита,
// а GigaCode по умолчанию не показывает агенту игнорируемые файлы.
export function workIgnored(m) {
  const g = gitInfo(m.dir);
  if (!g) return false;
  try {
    git(['check-ignore', '-q', path.join(m.workDir, 'review', 'spec.md')], m.dir);
    return true;
  } catch {
    return false;
  }
}

function refsInto(file, sc) {
  for (const l of sc.lines) if (!l.inCode && WORK_REF.test(l.text)) add('WK-02', file, l.n, l.text.trim().slice(0, 80));
}

export function checkWork(m) {
  if (workIgnored(m)) add('WK-01', m.workDir, null, `${rel(m.workDir)}/ попадает под .gitignore`);
  if (m.spec) refsInto(m.spec.file, m.spec.sc);
  for (const sl of m.slices.values()) refsInto(sl.file, sl.sc);
  if (m.readmeSc) refsInto(m.readmeFile, m.readmeSc);
  for (const a of m.featureAdrs) refsInto(a.file, scan(a.md));
  const old = legacyPaths(m);
  if (fs.existsSync(old.review)) add('WK-03', old.review, null, `ревью теперь в ${rel(m.reviewDir)}/`);
  if (fs.existsSync(old.plan)) add('WK-03', old.plan, null, `план теперь ${rel(m.planFile)}`);
}

// fix: перенести старые review/ и slices/plan.md в _work/. Отслеживаемое — git mv, чтобы история шла за файлом.
export function moveLegacy(m) {
  const old = legacyPaths(m);
  const moves = [];
  const g = gitInfo(m.dir);
  const mv = (from, to) => {
    if (!fs.existsSync(from)) return;
    if (fs.existsSync(to)) {
      moves.push(`${rel(from)} не перенесён: ${rel(to)} уже есть — сведите вручную`);
      return;
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    let tracked = false;
    if (g) {
      try {
        tracked = git(['ls-files', '--', from], m.dir).trim() !== '';
      } catch {
        tracked = false;
      }
    }
    if (tracked) git(['mv', from, to], m.dir);
    else fs.renameSync(from, to);
    moves.push(`${rel(from)} → ${rel(to)}`);
  };
  mv(old.review, m.reviewDir);
  mv(old.plan, m.planFile);
  return moves;
}
