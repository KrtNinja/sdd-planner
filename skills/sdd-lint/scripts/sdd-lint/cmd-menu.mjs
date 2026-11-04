// Меню без аргументов, опечатки в команде, Tab-дополнение (completion, __complete).
// @ts-check
import fs from 'node:fs';
import path from 'node:path';

import { CMD_INFO, CHOICES, SLOTS, FLAGS, COMMANDS } from './args.mjs';
import { askOf } from './ask.mjs';
import { SELF, promptSkills } from './cmd-prompt.mjs';
import { code, lintCmd, skillCode, lintCode } from './config.mjs';
import { loadFeature } from './feature.mjs';
import { git } from './git.mjs';
import { distance } from './md.mjs';
import { DOCS, isDir, listFeatures, resolveFeature, choiceOf } from './pick.mjs';
import { stageOf, tipLine } from './stage.mjs';

/** @typedef {import('./io.mjs').Ctx} Ctx */

// Без аргументов: фичи с этапом и командами, которые можно скопировать.
/** @param {Ctx} ctx */
export function cmdMenu(ctx) {
  const known = listFeatures();
  const out = ['**sdd-lint** — проверки планирования SDD', ''];
  let tip = null;
  if (!isDir(DOCS)) out.push(`Нет папки ${DOCS}/ — запускайте из корня репозитория с документацией.`);
  else if (!known.length) out.push(`В ${DOCS}/ пока нет задач. Новая начинается с ${skillCode('sdd-grill')} — он спросит задачу.`);
  else {
    out.push(`Задачи в ${code(`${DOCS}/`)}:`, '');
    out.push(...known.map(featureMenuLine));
    // Фича одна — её шаг уходит в подсказку строки ввода; при нескольких выбор за человеком.
    if (known.length === 1) tip = tipLine(stageOf(loadFeature(path.join(DOCS, known[0]))).tip);
  }
  const ex = known[0] || '<feature>';
  const rows = [
    [lintCmd(ex), CMD_INFO.check],
    [lintCmd('fix', ex), CMD_INFO.fix],
    [lintCmd('done', ex), CMD_INFO.done],
    [lintCmd('plan', ex), CMD_INFO.plan],
    [lintCmd('approve', 'spec|slices|adr', ex), CMD_INFO.approve],
    [lintCmd('gate', 'spec|slices|adr|decide|build', ex), CMD_INFO.gate],
    [lintCmd('gen', 'readme|links|slices', ex), CMD_INFO.gen],
    [lintCmd('guard', `${DOCS}/${ex}/spec.md`), CMD_INFO.guard],
    [lintCmd('trace', ex), CMD_INFO.trace],
    [lintCmd('diff', ex), CMD_INFO.diff],
    [lintCmd('next', 'FR|NFR|AC|slice|adr', ex), CMD_INFO.next],
    [lintCmd('export', ex), CMD_INFO.export],
  ];
  out.push('', 'Команды:', '', ...rows.map(([c, d]) => `- ${code(c)} — ${d}`));
  out.push('',
    `Завершить задачу перед слиянием ветки — ${skillCode('sdd-close', ex)}: убирает протокол и ${code('_work/')} ` +
    '(результаты проверки, план разбиения работы) — после подтверждения.');
  out.push(
    '',
    `Справка по команде: ${lintCode('help', '<команда>')}. Путь к задаче дописывает Tab после @: ${code(`@${DOCS}/${ex === '<feature>' ? '' : `${ex}/`}`)}`,
  );
  if (tip) out.push('', tip);
  ctx.io.log(out.join('\n'));
  ctx.io.exit(0);
}

// «aprove docs/x» — не фича, а опечатка в команде.
/** @param {Ctx} ctx */
export function checkTypo(ctx) {
  const { pos } = ctx.args;
  const w = pos[0];
  if (!w || /[\\/.]/.test(w) || resolveFeature(w)) return;
  const near = COMMANDS.map((c) => /** @type {[string, number]} */ ([c, distance(w.toLowerCase(), c)]))
    .filter(([c, n]) => n <= (c.length > 4 ? 2 : 1))
    .sort((a, b) => a[1] - b[1]);
  if (!near.length) return;
  const fixed = lintCmd(near[0][0], ...pos.slice(1));
  ctx.io.error(`Нет команды «${w}». Может, ${near[0][0]}? ${code(fixed)}`);
  ctx.io.exit(2);
}

// Ветки и теги для --base.
const gitRefs = () => git(['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes', 'refs/tags'], process.cwd()).split('\n').filter(Boolean);
// Варианты для Tab: «значение\tописание» по строке. words — слова после имени команды, последнее — дописываемое.
/** @param {string[]} words @returns {string[]} */
export function complete(words) {
  const cur = words.length ? words[words.length - 1] : '';
  const prev = words.slice(0, -1);
  const { out, emit } = completions(cur);
  if (prev[prev.length - 1] === '--base') {
    completeRefs(emit);
    return out;
  }
  const { args, c } = completionArgs(prev);
  if (cur.startsWith('-')) {
    (FLAGS[c] || []).forEach((f) => emit(f));
    return out;
  }
  if (c === 'check' && !args.length) {
    completeFeatures(cur, true, emit);
    for (const k of COMMANDS.filter((k) => k !== 'check')) emit(k, CMD_INFO[k]);
    return out;
  }
  completeSlot(c, args, { cur, emit });
  return out;
}

// Скрипт для bash / zsh с путём к этому файлу: работает и через alias, и через ссылку в PATH.
/** @param {Ctx} ctx */
export function cmdCompletion(ctx) {
  const shell = choiceOf(ctx, 'completion');
  const self = SELF.replace(/'/g, `'\\''`);
  const run = `node '${self}' __complete`;
  if (shell === 'bash') {
    ctx.io.log(`# sdd-lint: Tab-дополнение для bash. В ~/.bashrc: source <(sdd-lint completion bash)
_sdd_lint() {
  local IFS=$'\\n' out
  out=$(${run} "\${COMP_WORDS[@]:1:COMP_CWORD}" 2>/dev/null) || return 0
  COMPREPLY=($(printf '%s\\n' "$out" | cut -f1))
  if [[ \${#COMPREPLY[@]} -eq 1 && \${COMPREPLY[0]} == */ ]]; then compopt -o nospace; fi
}
complete -F _sdd_lint sdd-lint sdd-lint.mjs`);
  } else {
    ctx.io.log(`# sdd-lint: Tab-дополнение для zsh. В ~/.zshrc после compinit: source <(sdd-lint completion zsh)
_sdd_lint() {
  local -a lines vals disp dirs
  local line v
  lines=("\${(@f)$(${run} "\${(@)words[2,CURRENT]}" 2>/dev/null)}")
  for line in "\${lines[@]}"; do
    [[ -z $line ]] && continue
    v=\${line%%$'\\t'*}
    if [[ $v == */ ]]; then dirs+=("$v"); continue; fi
    vals+=("$v")
    if [[ $line == *$'\\t'* ]]; then disp+=("\${(r:14:)v} -- \${line#*$'\\t'}"); else disp+=("$v"); fi
  done
  (( \${#dirs} )) && compadd -S '' -- "\${dirs[@]}"
  (( \${#vals} )) && compadd -l -d disp -- "\${vals[@]}"
}
compdef _sdd_lint sdd-lint sdd-lint.mjs`);
  }
  ctx.io.exit(0);
}

/** @param {string} f */
function featureMenuLine(f) {
  const st = stageOf(loadFeature(path.join(DOCS, f)));
  // Тот же шаг, что в строке Tip: рекомендованный, а не первый по списку.
  const step = st.next.find((x) => st.tip && x.includes(st.tip)) || st.next.find((x) => !x.startsWith('по желанию')) || st.next[0];
  return `- **${f}** — ${st.now}${step ? ` → ${step}` : ''}`;
}

/** @typedef {(value: string, description?: string) => void} Emit */
/** @param {string} cur @param {boolean} dirsOnly @param {Emit} emit */
function completePaths(cur, dirsOnly, emit) {
  const dirPart = cur.includes('/') ? cur.slice(0, cur.lastIndexOf('/') + 1) : '';
  const base = cur.slice(dirPart.length);
  const dir = dirPart || '.';
  if (!isDir(dir)) return;
  const entries = fs.readdirSync(dir).sort().filter((e) => base.startsWith('.') || !e.startsWith('.'));
  for (const e of entries) {
    if (isDir(path.join(dir, e))) emit(`${dirPart}${e}/`);
    else if (!dirsOnly && e.endsWith('.md')) emit(`${dirPart}${e}`);
  }
}

/** @param {string} cur @param {boolean} dirsOnly @param {Emit} emit */
function completeFeatures(cur, dirsOnly, emit) {
  if (cur.includes('/') || cur.startsWith('.')) return completePaths(cur, dirsOnly, emit);
  for (const f of listFeatures()) {
    let st = '';
    try {
      st = stageOf(loadFeature(path.join(DOCS, f))).now;
    } catch {}
    emit(f, st);
  }
  if (isDir(DOCS)) emit(`${DOCS}/`);
}

/** @param {string} c @param {string[]} args @param {{cur: string, emit: Emit}} state */
function completeSlot(c, args, { cur, emit }) {
  const slot = (SLOTS[c] || [])[args.length];
  if (slot === 'choice') Object.entries(CHOICES[c]).forEach(([k, d]) => emit(k, d));
  else if (slot === 'command') COMMANDS.forEach((k) => emit(k, CMD_INFO[k]));
  else if (slot === 'feature') completeFeatures(cur, true, emit);
  else if (slot === 'target') completeFeatures(cur, false, emit);
  else if (slot === 'skill') promptSkills().forEach((k) => emit(k));
  else contextualOptions(slot, args, emit);
}

/** @param {string | undefined} slot @param {string[]} args @param {Emit} emit */
function contextualOptions(slot, args, emit) {
  if (slot === 'adr' || slot === 'slice') artifactOptions(slot, args, emit);
  else if (slot === 'option' && resolveFeature(args[0]))
    askOf(loadFeature(/** @type {string} */ (resolveFeature(args[0])))).questions.forEach((q) => q.options.forEach((o) => emit(o.id, o.label)));
  else if (slot === 'side' && /^ac$/i.test(args[0])) {
    emit('B', 'AC серверной части');
    emit('F', 'AC пользовательского интерфейса');
  }
}

/** @param {string} slot @param {string[]} args @param {Emit} emit */
function artifactOptions(slot, args, emit) {
  const allowed = slot === 'adr' ? args[0] === 'adr' : /^ac$/i.test(args[0]);
  if (!allowed) return;
  const dir = resolveFeature(args[1]);
  if (!dir) return;
  const m = loadFeature(dir);
  if (slot === 'adr') m.featureAdrs.forEach((a) => emit(a.num, a.status || ''));
  else [...m.slices].forEach(([num, sl]) => emit(num, sl.title || ''));
}

/** @param {Emit} emit */
function completeRefs(emit) {
  let refs = ['HEAD'];
  try {
    refs = [...refs, ...gitRefs()];
  } catch {}
  refs.forEach((r) => emit(r));
}

/** @param {string} cur */
function completions(cur) {
  /** @type {string[]} */
  const out = [];
  const emit = (/** @type {string} */ v, d = '') => {
    if (v.startsWith(cur) && !out.some((x) => x.split('\t')[0] === v)) out.push(d ? `${v}\t${d}` : v);
  };
  return { out, emit };
}

/** @param {string[]} prev */
function completionArgs(prev) {
  const args = prev.filter((a, i) => !a.startsWith('-') && prev[i - 1] !== '--base').map((a) => a.replace(/^@/, ''));
  const c = COMMANDS.includes(args[0]) ? /** @type {string} */ (args.shift()) : 'check';
  return { args, c };
}
