// Один вызов sdd-lint функцией: run(argv) → { code, chunks }. Точка входа CLI и тесты зовут его одинаково.
import { parseArgs } from './args.mjs';
import { HELP, helpFor } from './cli.mjs';
import { cmdApprove } from './cmd-approve.mjs';
import { cmdAsk, cmdChoose } from './cmd-ask.mjs';
import { cmdCheck, cmdGate } from './cmd-check.mjs';
import { cmdClose } from './cmd-close.mjs';
import { cmdDiff } from './cmd-diff.mjs';
import { cmdDone, cmdPlan } from './cmd-done.mjs';
import { cmdExport } from './cmd-export.mjs';
import { cmdFix } from './cmd-fix.mjs';
import { cmdTrace, cmdGen, cmdNext } from './cmd-gen.mjs';
import { cmdSnapshot, cmdGuard } from './cmd-guard.mjs';
import { cmdMenu, checkTypo, complete, cmdCompletion } from './cmd-menu.mjs';
import { cmdPrompt } from './cmd-prompt.mjs';
import { cmdStart, cmdResearch } from './cmd-start.mjs';
import { cmdTriage } from './cmd-triage.mjs';
import { lintCmd } from './config.mjs';
import { findings } from './findings.mjs';
import { createIo, Exit } from './io.mjs';

const COMMANDS = {
  start: cmdStart, research: cmdResearch, completion: cmdCompletion, check: cmdCheck, fix: cmdFix, done: cmdDone, plan: cmdPlan,
  gate: cmdGate, approve: cmdApprove, diff: cmdDiff, snapshot: cmdSnapshot, guard: cmdGuard, gen: cmdGen, trace: cmdTrace,
  close: cmdClose, export: cmdExport, next: cmdNext, ask: cmdAsk, choose: cmdChoose, triage: cmdTriage, prompt: cmdPrompt,
};

function dispatch(ctx) {
  const { argv, pos, cmd } = ctx.args;
  if (cmd === 'help' || (cmd !== '__complete' && (argv.includes('--help') || argv.includes('-h')))) {
    const one = cmd === 'help' && pos[0] ? helpFor(pos[0]) : cmd !== 'help' && cmd !== 'check' ? helpFor(cmd) : null;
    ctx.io.log(one ? `${one}\n\nВсе команды: ${lintCmd('help')}` : HELP);
    return;
  }
  if (cmd === '__complete') {
    ctx.io.log(complete(argv.slice(1)).join('\n'));
    return;
  }
  if (cmd === 'check' && !argv.length) cmdMenu();
  if (cmd === 'check') checkTypo();
  COMMANDS[cmd](ctx);
}

// argv — аргументы после имени скрипта; write(fd, text) — куда печатать сразу (без него вывод копится в chunks);
// script — путь к точке входа (для completion).
export function run(argv, { write, script } = {}) {
  const ctx = { args: parseArgs(argv), io: createIo(write), script };
  // Находки пока копятся в общем массиве модуля (уйдёт в шаге 5): каждый вызов начинает с чистого.
  findings.length = 0;
  try {
    dispatch(ctx);
    return { code: 0, chunks: ctx.io.chunks };
  } catch (e) {
    if (e instanceof Exit) return { code: e.code, chunks: ctx.io.chunks };
    throw e;
  }
}
