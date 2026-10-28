// Находки проверок и отчёт: текст или --json.
import { flags } from './args.mjs';
import { cmds } from './config.mjs';
import { rel, uniq } from './md.mjs';
import { RULES } from './rules.mjs';

export const findings = [];
export const add = (rule, file, line, msg) => {
  const [level] = RULES[rule];
  findings.push({ rule, level, file: rel(file), line: line || null, msg });
};

const LEVEL = { err: 'ОШИБКА  ', warn: 'ВНИМАНИЕ', info: 'ИНФО    ' };
export const line = (x) => `${LEVEL[x.level]}  ${x.rule}  ${x.file}${x.line ? `:${x.line}` : ''}  ${x.msg}`;
export function report(extra = {}) {
  const order = { err: 0, warn: 1, info: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level] || a.file.localeCompare(b.file) || (a.line || 0) - (b.line || 0));
  const counts = { err: 0, warn: 0, info: 0 };
  for (const x of findings) counts[x.level] += 1;
  if (flags.json) {
    const hints = Object.fromEntries(uniq(findings.map((x) => x.rule)).map((r) => [r, cmds(RULES[r][1])]));
    console.log(JSON.stringify({ findings, hints, counts, ...extra }, null, 2));
    return counts;
  }
  for (const x of findings) console.log(line(x));
  const fired = uniq(findings.filter((x) => x.level !== 'info').map((x) => x.rule)).sort();
  if (fired.length) {
    console.log('\nКак исправить:');
    for (const r of fired) console.log(`  ${r}  ${cmds(RULES[r][1])}`);
  }
  return counts;
}
