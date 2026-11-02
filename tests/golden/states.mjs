// Состояния репозитория с доками для golden-теста. Общие для теста и генератора сценариев
// (tools/golden/scenarios.mjs): сценарий перебирается и проверяется в одном и том же состоянии.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GOOD = path.join(root, 'tests/fixtures/good');
const DATA = path.join(root, 'tests/golden/data');

// Фиксированные автор и время коммита: хэши и вывод git одинаковы при каждом прогоне.
export const GIT_ENV = {
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
  GIT_AUTHOR_DATE: '2026-10-27T12:00:00Z', GIT_COMMITTER_DATE: '2026-10-27T12:00:00Z',
};

const copyGood = (cwd) => fs.cpSync(GOOD, cwd, { recursive: true });

export const STATES = {
  // эталонная фича без git: spec одобрен, slices на ревью
  good: copyGood,
  // та же фича, закоммиченная: ветки кода, которые читают git (diff, незакоммиченное в close)
  git: (cwd) => {
    copyGood(cwd);
    const g = (...a) => execFileSync('git', ['-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', ...a], { cwd, env: { ...process.env, ...GIT_ENV }, stdio: 'ignore' });
    g('init', '-q');
    g('add', '.');
    g('commit', '-qm', 'docs');
  },
  // ревью slices с двумя блокерами и двумя замечаниями без решения: разбор находок
  review: (cwd) => {
    copyGood(cwd);
    const dir = path.join(cwd, 'docs/comments/_work/review');
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(DATA, 'review-slices.md'), path.join(dir, 'slices.md'));
  },
  // до нарезки: spec одобрен, slices нет, ADR предложен, план нарезки ждёт согласия
  plan: (cwd) => {
    copyGood(cwd);
    const feature = path.join(cwd, 'docs/comments');
    fs.rmSync(path.join(feature, 'slices'), { recursive: true });
    const adr = path.join(cwd, 'docs/adr/0001-mention-notifications.md');
    fs.writeFileSync(adr, fs.readFileSync(adr, 'utf8').replace(/^Статус:.*$/m, 'Статус: предложено'));
    fs.mkdirSync(path.join(feature, '_work'), { recursive: true });
    fs.copyFileSync(path.join(DATA, 'plan.md'), path.join(feature, '_work/plan.md'));
  },
  // пустая папка: фич нет — что скрипт говорит человеку без контекста
  empty: () => {},
};
