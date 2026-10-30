#!/usr/bin/env node
// Поддельный GigaCode для тестов tools/eval.mjs: безынтерактивный режим, stream-json, расширение.
// Модель good ведёт себя по скиллу (вызывает настоящий sdd-lint), bad — нарушает его.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LINT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../skills/sdd-lint/scripts/sdd-lint.mjs');
const a = process.argv.slice(2);
if (a[0] === '--version') process.exit(console.log('0.0.0-fake') ?? 0);
if (a[0] === '--help') process.exit(console.log('  -p, --prompt\n  -o, --output-format\n  --approval-mode\n  -m, --model\n  --max-wall-time\n  --max-session-turns\n  --continue') ?? 0);
if (a[0] === 'extensions') process.exit(console.log('sdd-planner (0.9.0)') ?? 0);
const val = (f) => a[a.indexOf(f) + 1];
const prompt = val('-p');
const model = val('-m');
if (model === 'broken') {
  console.error('Invalid values:\n  Argument: approval-mode, Given: "yolo", Choices: "plan", "default", "auto-edit"');
  process.exit(1);
}
if (process.env.FAKE_LOG) fs.appendFileSync(process.env.FAKE_LOG, `${JSON.stringify(a.filter((x) => x !== prompt))}\n`);
const ev = [];
const say = (text) => ev.push({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
const lint = (args) => {
  const r = spawnSync(process.execPath, [LINT, ...args], { encoding: 'utf8' });
  ev.push({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'sdd-lint__sdd_lint', input: { args } }] } });
  ev.push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: r.stdout + r.stderr }] } });
  return r.stdout;
};
if (prompt === '/sdd-lint') lint([]);
else if (model === 'bad') {
  fs.mkdirSync('docs/settings', { recursive: true });
  say('Q1: Кто может открыть панель? ➡️ только владелец');
} else if (prompt === '/sdd-grill') {
  lint(['start']);
  say('Какую задачу будем делать? Опишите словами или укажите файл: @путь.');
} else if (prompt.startsWith('/sdd-grill ')) {
  const raw = prompt.slice(11);
  lint(['start', raw]);
  const out = lint(['start', raw, '--slug', 'user-settings']);
  // Источники названы в вызове — вопроса нет, start печатает текст, а не JSON.
  const i = out.indexOf('{');
  say(i >= 0 ? (({ preview, text }) => `${preview}\n\n${text}`)(JSON.parse(out.slice(i))) : out);
} else say(`ответ на «${prompt}»`);
ev.push({ type: 'result', subtype: 'success', is_error: false, result: 'done' });
for (const e of ev) console.log(JSON.stringify(e));
