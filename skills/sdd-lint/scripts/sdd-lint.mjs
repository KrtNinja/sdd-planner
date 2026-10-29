#!/usr/bin/env node
// sdd-lint — детерминированные проверки артефактов планирования SDD.
// Всё, что можно проверить или вывести скриптом, делает скрипт; модели остаётся смысл.
// Без зависимостей, Node 18+. Справка: node sdd-lint.mjs help
//
// Здесь только выбор команды. Код — в sdd-lint/, по модулю на тему; читай только нужный.
// Первая строка модуля — его назначение; карта: grep -m1 . sdd-lint/*.mjs
// Где проверяется правило: grep -rn "'XX-NN'" sdd-lint/; подсказка к нему — в rules.mjs.

import { argv, pos, cmd } from './sdd-lint/args.mjs';
import { HELP, helpFor } from './sdd-lint/cli.mjs';
import { cmdApprove } from './sdd-lint/cmd-approve.mjs';
import { cmdAsk, cmdChoose } from './sdd-lint/cmd-ask.mjs';
import { cmdCheck, cmdGate } from './sdd-lint/cmd-check.mjs';
import { cmdClose } from './sdd-lint/cmd-close.mjs';
import { cmdDiff } from './sdd-lint/cmd-diff.mjs';
import { cmdExport } from './sdd-lint/cmd-export.mjs';
import { cmdFix } from './sdd-lint/cmd-fix.mjs';
import { cmdTrace, cmdGen, cmdNext } from './sdd-lint/cmd-gen.mjs';
import { cmdSnapshot, cmdGuard } from './sdd-lint/cmd-guard.mjs';
import { cmdMenu, checkTypo, complete, cmdCompletion } from './sdd-lint/cmd-menu.mjs';
import { cmdPrompt } from './sdd-lint/cmd-prompt.mjs';
import { lintCmd } from './sdd-lint/config.mjs';

if (cmd === 'help' || (cmd !== '__complete' && (argv.includes('--help') || argv.includes('-h')))) {
  const one = cmd === 'help' && pos[0] ? helpFor(pos[0]) : cmd !== 'help' && cmd !== 'check' ? helpFor(cmd) : null;
  console.log(one ? `${one}\n\nВсе команды: ${lintCmd('help')}` : HELP);
  process.exit(0);
}

if (cmd === '__complete') {
  console.log(complete(argv.slice(1)).join('\n'));
  process.exit(0);
}
if (cmd === 'check' && !argv.length) cmdMenu();
if (cmd === 'check') checkTypo();

({ completion: cmdCompletion, check: cmdCheck, fix: cmdFix, gate: cmdGate, approve: cmdApprove, diff: cmdDiff, snapshot: cmdSnapshot, guard: cmdGuard, gen: cmdGen, trace: cmdTrace, close: cmdClose, export: cmdExport, next: cmdNext, ask: cmdAsk, choose: cmdChoose, prompt: cmdPrompt })[cmd]();
