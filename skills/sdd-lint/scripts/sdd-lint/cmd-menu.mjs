// Меню без аргументов, опечатки в команде, Tab-дополнение (completion, __complete).
import fs from 'node:fs';
import path from 'node:path';

import { pos, CMD_INFO, CHOICES, SLOTS, FLAGS, COMMANDS } from './args.mjs';
import { askOf } from './ask.mjs';
import { promptSkills } from './cmd-prompt.mjs';
import { skill, lintCmd } from './config.mjs';
import { loadFeature } from './feature.mjs';
import { git } from './git.mjs';
import { DOCS, isDir, listFeatures, resolveFeature, pickChoice } from './pick.mjs';
import { stageOf } from './stage.mjs';

// Без аргументов: фичи с этапом и командами, которые можно скопировать.
export function cmdMenu() {
  const known = listFeatures();
  const out = ['sdd-lint — проверки планирования SDD', ''];
  if (!isDir(DOCS)) out.push(`Нет папки ${DOCS}/ — запускайте из корня репозитория с доками.`);
  else if (!known.length) out.push(`В ${DOCS}/ пока нет фич. Новая начинается с ${skill('sdd-grill', '<feature>')}.`);
  else {
    out.push(`Фичи в ${DOCS}/:`);
    const w = Math.max(...known.map((f) => f.length));
    for (const f of known) {
      const st = stageOf(loadFeature(path.join(DOCS, f)));
      out.push(`  ${f.padEnd(w)}  ${st.now}`);
      const step = st.next.find((x) => !x.startsWith('по желанию')) || st.next[0];
      if (step) out.push(`  ${' '.repeat(w)}  → ${step}`);
    }
  }
  const ex = known[0] || '<feature>';
  const rows = [
    [lintCmd(ex), CMD_INFO.check],
    [lintCmd('fix', ex), CMD_INFO.fix],
    [lintCmd('done', ex), CMD_INFO.done],
    [lintCmd('plan', ex), CMD_INFO.plan],
    [lintCmd('approve', 'spec|slices|adr', ex), CMD_INFO.approve],
    [lintCmd('gate', 'spec|slices|adr|decide|build', ex), CMD_INFO.gate],
    [lintCmd('gen', 'readme|guessed|links|slices', ex), CMD_INFO.gen],
    [lintCmd('guard', `${DOCS}/${ex}/spec.md`), CMD_INFO.guard],
    [lintCmd('trace', ex), CMD_INFO.trace],
    [lintCmd('diff', ex), CMD_INFO.diff],
    [lintCmd('next', 'FR|NFR|AC|slice|adr', ex), CMD_INFO.next],
    [lintCmd('export', ex), CMD_INFO.export],
  ];
  const w = Math.max(...rows.map(([c]) => c.length));
  out.push('', 'Команды:', ...rows.map(([c, d]) => `  ${c.padEnd(w)}  ${d}`));
  out.push('', `Закрыть фичу перед merge — ${skill('sdd-close', ex)}: убирает протокол и _work/ (ревью, план нарезки) — после подтверждения.`);
  out.push('', `Справка по команде: ${lintCmd('help', '<команда>')}. Путь к фиче дописывает Tab после @: @${DOCS}/${ex === '<feature>' ? '' : `${ex}/`}`);
  console.log(out.join('\n'));
  process.exit(0);
}

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// «aprove docs/x» — не фича, а опечатка в команде.
export function checkTypo() {
  const w = pos[0];
  if (!w || /[\\/.]/.test(w) || resolveFeature(w)) return;
  const near = COMMANDS.map((c) => [c, distance(w.toLowerCase(), c)]).filter(([c, n]) => n <= (c.length > 4 ? 2 : 1)).sort((a, b) => a[1] - b[1]);
  if (!near.length) return;
  const fixed = lintCmd(near[0][0], ...pos.slice(1));
  console.error(`Нет команды «${w}». Может, ${near[0][0]}? ${fixed}`);
  process.exit(2);
}

// Варианты для Tab: «значение\tописание» по строке. words — слова после имени команды, последнее — дописываемое.
export function complete(words) {
  const cur = words.length ? words[words.length - 1] : '';
  const prev = words.slice(0, -1);
  const out = [];
  const emit = (v, d = '') => {
    if (v.startsWith(cur) && !out.some((x) => x.split('\t')[0] === v)) out.push(d ? `${v}\t${d}` : v);
  };
  const paths = (dirsOnly, anyFile = false) => {
    const dirPart = cur.includes('/') ? cur.slice(0, cur.lastIndexOf('/') + 1) : '';
    const base = cur.slice(dirPart.length);
    if (!isDir(dirPart || '.')) return;
    for (const e of fs.readdirSync(dirPart || '.').sort()) {
      if (e.startsWith('.') && !base.startsWith('.')) continue;
      if (isDir(path.join(dirPart || '.', e))) emit(`${dirPart}${e}/`);
      else if (!dirsOnly && (anyFile || e.endsWith('.md'))) emit(`${dirPart}${e}`);
    }
  };
  const features = (dirsOnly) => {
    if (cur.includes('/') || cur.startsWith('.')) return paths(dirsOnly);
    for (const f of listFeatures()) {
      let st = '';
      try {
        st = stageOf(loadFeature(path.join(DOCS, f))).now;
      } catch {}
      emit(f, st);
    }
    if (isDir(DOCS)) emit(`${DOCS}/`);
  };
  if (prev[prev.length - 1] === '--base') {
    let refs = ['HEAD'];
    try {
      refs = [...refs, ...git(['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes', 'refs/tags'], process.cwd()).split('\n').filter(Boolean)];
    } catch {}
    refs.forEach((r) => emit(r));
    return out;
  }
  const args = prev.filter((a, i) => !a.startsWith('-') && prev[i - 1] !== '--base').map((a) => a.replace(/^@/, ''));
  const c = COMMANDS.includes(args[0]) ? args.shift() : 'check';
  if (cur.startsWith('-')) {
    (FLAGS[c] || []).forEach((f) => emit(f));
    return out;
  }
  if (c === 'check' && !args.length) {
    features(true);
    for (const k of COMMANDS.filter((k) => k !== 'check')) emit(k, CMD_INFO[k]);
    return out;
  }
  const slots = SLOTS[c] || [];
  // «source...» — слот повторяется: источников после фичи может быть сколько угодно.
  const slot = slots[args.length] ?? (slots.at(-1)?.endsWith('...') && args.length ? slots.at(-1) : undefined);
  const feature = () => resolveFeature(args[1]);
  if (slot === 'choice') Object.entries(CHOICES[c]).forEach(([k, d]) => emit(k, d));
  else if (slot === 'command') COMMANDS.forEach((k) => emit(k, CMD_INFO[k]));
  else if (slot === 'feature') features(true);
  else if (slot === 'target') features(false);
  else if (slot === 'source...') paths(false, true);
  else if (slot === 'adr' && args[0] === 'adr' && feature())
    loadFeature(feature()).featureAdrs.forEach((a) => emit(a.num, a.status || ''));
  else if (slot === 'slice' && /^ac$/i.test(args[0]) && feature())
    [...loadFeature(feature()).slices].forEach(([num, s]) => emit(num, s.title || ''));
  else if (slot === 'option' && resolveFeature(args[0])) askOf(loadFeature(resolveFeature(args[0]))).questions.forEach((q) => q.options.forEach((o) => emit(o.id, o.label)));
  else if (slot === 'skill') promptSkills().forEach((k) => emit(k));
  else if (slot === 'side' && /^ac$/i.test(args[0])) {
    emit('B', 'AC сервисной половины');
    emit('F', 'AC frontend-половины');
  }
  return out;
}

// Скрипт для bash / zsh с путём к этому файлу: работает и через alias, и через ссылку в PATH.
export function cmdCompletion() {
  const shell = pos[0];
  if (!['bash', 'zsh'].includes(shell)) pickChoice('completion');
  const self = fs.realpathSync(process.argv[1]).replace(/'/g, `'\\''`);
  const run = `node '${self}' __complete`;
  if (shell === 'bash') {
    console.log(`# sdd-lint: Tab-дополнение для bash. В ~/.bashrc: source <(sdd-lint completion bash)
_sdd_lint() {
  local IFS=$'\\n' out
  out=$(${run} "\${COMP_WORDS[@]:1:COMP_CWORD}" 2>/dev/null) || return 0
  COMPREPLY=($(printf '%s\\n' "$out" | cut -f1))
  if [[ \${#COMPREPLY[@]} -eq 1 && \${COMPREPLY[0]} == */ ]]; then compopt -o nospace; fi
}
complete -F _sdd_lint sdd-lint sdd-lint.mjs`);
  } else {
    console.log(`# sdd-lint: Tab-дополнение для zsh. В ~/.zshrc после compinit: source <(sdd-lint completion zsh)
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
  process.exit(0);
}
