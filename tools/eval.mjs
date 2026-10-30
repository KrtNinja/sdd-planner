#!/usr/bin/env node
// Прогон evals скиллов в GigaCode CLI без интерактива: кейс → свежая папка → безынтерактивный запуск
// на каждой модели → проверки. Файловые критерии проверяет скрипт (type: script), смысловые — модель-судья
// (type: llm, только с --judge). На выходе — короткий отчёт; подробности и ход работы — в .eval-results/.
//
//   node tools/eval.mjs doctor                 — проверить, что сборка GigaCode умеет безынтерактивный режим
//   node tools/eval.mjs [run] [--cases grill,start-*] [--models a,b] [--judge <модель> | --no-judge] [--turns N]
//   node tools/eval.mjs list                   — кейсы и критерии
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { digest, parseTranscript } from './eval-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = path.join(ROOT, 'tools/eval-check.mjs');
const LINT = path.join(ROOT, 'skills/sdd-lint/scripts/sdd-lint.mjs');
// Ответы человека в многоходовом кейсе: prompt.md делится этой строкой, каждый ход — через --continue.
const TURN = /^=== ответ человека ===$/m;

const argv = process.argv.slice(2);
const opt = (k) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : null;
};
const cmd = ['doctor', 'run', 'list'].includes(argv[0]) ? argv[0] : 'run';

// Настройки: tools/eval.config.json, поверх — tools/eval.local.json (не в git: свои имена моделей, путь к CLI).
function config() {
  const read = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {});
  const c = { ...read(path.join(ROOT, 'tools/eval.config.json')), ...read(process.env.SDD_EVAL_CONFIG || path.join(ROOT, 'tools/eval.local.json')) };
  if (process.env.SDD_EVAL_CLI) c.cli = process.env.SDD_EVAL_CLI;
  if (opt('models')) c.models = opt('models').split(',');
  if (opt('skills')) c.skills = opt('skills');
  // Судья смысловых критериев: --judge, иначе judge из конфига, иначе первая модель; --no-judge — без него.
  c.judge = argv.includes('--no-judge') ? null : opt('judge') || c.judge || c.models?.[0] || null;
  return c;
}
const fill = (args, vars) => args.map((a) => a.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ''));
// cli — команда или массив [команда, …первые аргументы] (например, ["node", "/путь/gigacode.js"]).
function cli(c, args, cwd, timeoutS) {
  const [bin, ...pre] = [].concat(c.cli);
  const r = spawnSync(bin, [...pre, ...args], { cwd, encoding: 'utf8', timeout: (timeoutS + 60) * 1000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, QWEN_CODE_SUPPRESS_YOLO_WARNING: '1', NO_COLOR: '1' } });
  return { code: r.error ? (r.error.code === 'ETIMEDOUT' ? 'таймаут' : r.error.message) : r.status, out: r.stdout || '', err: r.stderr || '' };
}

// ---------- кейсы ----------
function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = {};
  if (m) for (const l of m[1].split('\n')) { const [k, ...v] = l.split(':'); if (v.length) meta[k.trim()] = v.join(':').trim(); }
  return { meta, body: m ? md.slice(m[0].length) : md };
}
function loadCase(dir) {
  const { meta, body } = frontmatter(fs.readFileSync(path.join(dir, 'prompt.md'), 'utf8'));
  const turns = body.replace(/\n\s*Input files:.*$/s, '').split(TURN).map((t) => t.trim()).filter(Boolean);
  const gdir = path.join(dir, 'graders');
  const graders = (fs.existsSync(gdir) ? fs.readdirSync(gdir).sort() : []).filter((f) => f.endsWith('.md')).map((f) => {
    const g = frontmatter(fs.readFileSync(path.join(gdir, f), 'utf8'));
    const script = (g.body.match(/```(?:sh|bash)\n([\s\S]*?)```/) || [])[1] || null;
    const text = g.body.replace(/```[\s\S]*?```/g, '').trim();
    return { id: f.replace(/-check\.md$|\.md$/, ''), type: g.meta.type === 'script' && script ? 'script' : 'llm', text, script };
  });
  const skill = path.basename(path.dirname(path.dirname(dir)));
  return { dir, name: `${skill.replace(/^sdd-/, '')}/${path.basename(dir)}`, turns, graders, maxTurns: Number(meta.max_turns) || 30, timeout: Number(meta.timeout_seconds) || 900 };
}
function cases() {
  if (opt('case-dir')) return [loadCase(path.resolve(opt('case-dir')))];
  const all = fs
    .readdirSync(path.join(ROOT, 'skills'))
    .flatMap((s) => {
      const d = path.join(ROOT, 'skills', s, 'evals');
      return fs.existsSync(d) ? fs.readdirSync(d).map((c) => path.join(d, c)) : [];
    })
    .filter((d) => fs.existsSync(path.join(d, 'prompt.md')))
    .map(loadCase);
  const want = opt('cases');
  if (!want) return all;
  const res = want.split(',').map((w) => new RegExp(`^${w.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`));
  return all.filter((c) => res.some((re) => re.test(c.name) || re.test(c.name.split('/')[0]) || re.test(c.name.split('/')[1])));
}

// /sdd-grill … — слэш-командой, если сборка их понимает в -p; иначе текстом скилла (skills: inline).
function promptOf(c, turn) {
  const m = turn.match(/^\/(sdd-[a-z]+)\b\s*([\s\S]*)$/);
  if (c.skills !== 'inline' || !m) return turn;
  const r = spawnSync(process.execPath, [LINT, 'prompt', m[1], '--raw', ...(m[2].trim() ? [m[2].trim()] : [])], { encoding: 'utf8' });
  return `${r.stdout.trim()}\n\nЧеловек написал: ${turn}`;
}

// ---------- прогон ----------
function runOne(c, kase, model, out) {
  const work = path.join(out, 'work');
  fs.mkdirSync(work, { recursive: true });
  spawnSync('bash', [path.join(kase.dir, 'place-files.sh')], { cwd: work, stdio: 'ignore' });
  spawnSync('git', ['init', '-q'], { cwd: work });
  const transcript = path.join(out, 'transcript.jsonl');
  const vars = { model, timeout: String(kase.timeout), turns: String(Number(opt('turns')) || kase.maxTurns) };
  let crash = null;
  kase.turns.forEach((t, i) => {
    if (crash) return;
    const args = [...fill(c.args, { ...vars, prompt: promptOf(c, t) }), ...(i ? c.continueArgs || [] : [])];
    const r = cli(c, args, work, kase.timeout);
    fs.appendFileSync(transcript, r.out);
    if (r.err.trim()) fs.appendFileSync(path.join(out, 'stderr.txt'), r.err);
    // 53/55 — исчерпан лимит ходов или времени: агент не остановился сам — это провал кейса, а не сбой.
    if (typeof r.code !== 'number' || ![0, 53, 55].includes(r.code)) crash = `CLI: код ${r.code}${r.err.trim() ? ` — ${r.err.trim().split('\n')[0].slice(0, 120)}` : ''}`;
    else if (r.code) crash = `агент не остановился: ${r.code === 53 ? 'лимит ходов' : 'лимит времени'}`;
  });
  const raw = fs.existsSync(transcript) ? fs.readFileSync(transcript, 'utf8') : '';
  fs.writeFileSync(path.join(out, 'trace.md'), `# ${kase.name} · ${model}\n\n${digest(raw)}\n`);
  const results = kase.graders.map((g) => {
    if (g.type === 'script') {
      // q <проверка> … — функция-обёртка над eval-check.mjs; первая непрошедшая строка останавливает грейдер.
      const script = `q() { node ${JSON.stringify(CHECK)} "$@"; }\n${g.script}`;
      const r = spawnSync('bash', ['-e', '-c', script], { cwd: work, encoding: 'utf8', env: { ...process.env, EVAL_TRANSCRIPT: transcript } });
      return { ...g, ok: r.status === 0, why: (r.stderr || r.stdout).trim().split('\n').pop() || '' };
    }
    if (!c.judge) return { ...g, ok: null };
    return { ...g, ...judge(c, g, out) };
  });
  return { kase, model, crash, results, out };
}
function judge(c, g, out) {
  const dir = path.join(out, `judge-${g.id}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(out, 'trace.md'), path.join(dir, 'trace.md'));
  const files = spawnSync('bash', ['-c', 'find . -path ./.git -prune -o -type f -print | sort'], { cwd: path.join(out, 'work'), encoding: 'utf8' }).stdout;
  fs.writeFileSync(path.join(dir, 'files.txt'), files);
  const prompt =
    'Ты проверяешь работу другого агента. В trace.md — его ход работы (что сказал, что вызвал, что получил), в files.txt — файлы после работы. ' +
    `Критерий: «${g.text}». Прочитай оба файла и ответь двумя строками: первая — PASS или FAIL, вторая — почему, одной фразой. Ничего не меняй.`;
  const r = cli(c, fill(c.judgeArgs || c.args, { prompt, model: c.judge, timeout: '300', turns: '10' }), dir, 300);
  const text = parseTranscript(r.out).texts.join('\n');
  const m = text.match(/\b(PASS|FAIL)\b\s*\n?\s*(.*)/);
  return m ? { ok: m[1] === 'PASS', why: m[2].trim() } : { ok: false, why: `судья не ответил PASS/FAIL (код ${r.code})` };
}

function report(runs, stamp, out, judgeModel) {
  const models = [...new Set(runs.map((r) => r.model))];
  const names = [...new Set(runs.map((r) => r.kase.name))];
  const cell = (r) => {
    const s = r.results.filter((x) => x.type === 'script');
    const l = r.results.filter((x) => x.type === 'llm' && x.ok !== null);
    const bad = r.crash || s.some((x) => !x.ok) || l.some((x) => !x.ok);
    return `${bad ? '✗' : '✓'} ${s.filter((x) => x.ok).length}/${s.length}${l.length ? ` · llm ${l.filter((x) => x.ok).length}/${l.length}` : ''}`;
  };
  const w = Math.max(...names.map((n) => n.length), 4);
  const lines = [
    `evals ${stamp}: кейсов ${names.length}, моделей ${models.length}, судья смысловых критериев — ${judgeModel || 'нет'}. Подробности: ${out.startsWith(ROOT) ? path.relative(ROOT, out) : out}/`,
    '',
    `${'кейс'.padEnd(w)}  ${models.map((m) => m.padEnd(14)).join('  ')}`,
    ...names.map((n) => `${n.padEnd(w)}  ${models.map((m) => cell(runs.find((r) => r.kase.name === n && r.model === m)).padEnd(14)).join('  ')}`),
  ];
  const fails = runs.flatMap((r) => [
    ...(r.crash ? [`${r.kase.name} · ${r.model} — ${r.crash}`] : []),
    ...r.results.filter((x) => x.ok === false).map((x) => `${r.kase.name} · ${r.model} · ${x.id}${x.type === 'llm' ? ' (llm)' : ''}: ${x.why || x.text.split('\n')[0].slice(0, 100)}`),
  ]);
  // Отчёт пересылают в чат — длинный список провалов уходит в report.md, в выводе первые 25.
  if (fails.length) lines.push('', 'Не прошло:', ...fails.slice(0, 25).map((x) => `- ${x}`), ...(fails.length > 25 ? [`…и ещё ${fails.length - 25} — в report.md`] : []));
  const skipped = runs.reduce((n, r) => n + r.results.filter((x) => x.ok === null).length, 0);
  if (skipped) lines.push('', `Смысловых критериев не проверено: ${skipped} (запуск с --no-judge).`);
  lines.push('', 'Ход работы по каждому прогону — trace.md рядом с отчётом.');
  return lines.join('\n');
}

function run() {
  const c = config();
  if (!c.cli || !c.args || !(c.models || []).length) {
    console.error('Нет cli, args или models в tools/eval.config.json. Сначала: node tools/eval.mjs doctor');
    process.exit(2);
  }
  const list = cases();
  if (!list.length) {
    console.error(`Кейсов не найдено${opt('cases') ? ` по «${opt('cases')}»` : ''}. Список: node tools/eval.mjs list`);
    process.exit(2);
  }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const out = path.join(process.env.SDD_EVAL_OUT || path.join(ROOT, '.eval-results'), stamp);
  const runs = [];
  for (const kase of list)
    for (const model of c.models) {
      process.stderr.write(`… ${kase.name} · ${model}\n`);
      runs.push(runOne(c, kase, model, path.join(out, kase.name.replace('/', '__'), model.replace(/[^\w.-]/g, '_'))));
    }
  const text = report(runs, stamp, out, c.judge);
  fs.writeFileSync(path.join(out, 'report.md'), `${text}\n`);
  console.log(text);
  process.exit(runs.some((r) => r.crash || r.results.some((x) => x.ok === false)) ? 1 : 0);
}

// ---------- doctor: умеет ли сборка то, что нужно прогону ----------
function doctor() {
  const c = config();
  const ok = (b, yes, no) => console.log(`${b ? '✓' : '✗'} ${b ? yes : no}`);
  const [major] = process.versions.node.split('.').map(Number);
  ok(major >= 18, `Node ${process.versions.node}`, `Node ${process.versions.node} — нужен 18+`);
  const v = cli(c, ['--version'], ROOT, 30);
  if (typeof v.code !== 'number') {
    ok(false, '', `«${c.cli}» не запускается (${v.code}). Укажи путь к CLI в tools/eval.local.json: {"cli": "/путь/gigacode"}`);
    process.exit(1);
  }
  ok(true, `${[].concat(c.cli).join(' ')} ${v.out.trim() || v.err.trim()}`);
  const help = (() => { const h = cli(c, ['--help'], ROOT, 30); return h.out + h.err; })();
  const flags = [...new Set([...c.args, ...(c.continueArgs || [])].filter((a) => /^-/.test(a)))];
  const missing = flags.filter((f) => !new RegExp(`(^|[\\s,])${f.replace(/[-]/g, '\\-')}([\\s,=]|$)`, 'm').test(help));
  ok(!missing.length, `флаги безынтерактивного режима есть: ${flags.join(' ')}`, `в --help нет: ${missing.join(' ')} — поправь args в tools/eval.local.json по своей сборке`);
  const ext = cli(c, ['extensions', 'list'], ROOT, 60);
  ok(/sdd-planner/.test(ext.out + ext.err), 'расширение sdd-planner подключено', 'расширение sdd-planner не видно в «extensions list» — подключи этот репозиторий: gigacode extensions link .');
  if (argv.includes('--no-smoke')) return;
  // Пробный прогон: слэш-команда скилла и MCP-инструмент sdd_lint в безынтерактивном режиме.
  const model = c.models?.[0];
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-eval-doctor-'));
  fs.mkdirSync(path.join(work, 'docs'));
  spawnSync('git', ['init', '-q'], { cwd: work });
  const smoke = (prompt) => parseTranscript(cli(c, fill(c.args, { prompt, model, timeout: '180', turns: '6' }), work, 180).out);
  const a = smoke('/sdd-lint');
  if (a.tools.some((t) => t.name.includes('sdd_lint'))) return ok(true, `на ${model}: слэш-команда скилла и MCP sdd_lint работают — можно запускать: node tools/eval.mjs`);
  const b = smoke('Вызови инструмент sdd_lint с args [] и покажи вывод.');
  if (b.tools.some((t) => t.name.includes('sdd_lint')))
    return ok(false, '', `на ${model}: MCP sdd_lint работает, а слэш-команда скилла в -p — нет. Добавь в tools/eval.local.json "skills": "inline" — скилл пойдёт текстом`);
  ok(false, '', `на ${model}: агент не вызвал sdd_lint${a.tools.length + b.tools.length ? '' : ' и вообще ни одного инструмента — проверь -o stream-json и имя модели'}. Вывод — ${work}`);
}

if (cmd === 'doctor') doctor();
else if (cmd === 'list') for (const k of cases()) console.log(`${k.name}  (${k.turns.length} ход.)\n${k.graders.map((g) => `  ${g.id} ${g.type.padEnd(6)} ${g.text.split('\n')[0].slice(0, 90)}`).join('\n')}`);
else run();
