// Один вызов sdd-lint функцией: run(argv) → { code, chunks }. Точка входа CLI и тесты зовут его одинаково.
// @ts-check
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
import { SectionConflict } from './md.mjs';
import { createIo, Exit } from './io.mjs';

/** @typedef {import('./io.mjs').Ctx} Ctx */

/** @type {Record<string, (ctx: Ctx) => void>} */
const COMMANDS = {
  start: cmdStart, research: cmdResearch, completion: cmdCompletion, check: cmdCheck, fix: cmdFix, done: cmdDone, plan: cmdPlan,
  gate: cmdGate, approve: cmdApprove, diff: cmdDiff, snapshot: cmdSnapshot, guard: cmdGuard, gen: cmdGen, trace: cmdTrace,
  close: cmdClose, export: cmdExport, next: cmdNext, ask: cmdAsk, choose: cmdChoose, triage: cmdTriage, prompt: cmdPrompt,
};

// О какой команде справка: help <команда> или --help у команды; check — вызов без команды, ему общая.
/** @param {string} cmd @param {string[]} pos */
function helpName(cmd, pos) {
  if (cmd === 'help') return pos[0];
  return cmd === 'check' ? null : cmd;
}
// help и --help/-h у любой команды: справка по одной команде или общая.
/** @param {Ctx} ctx */
function help(ctx) {
  const { pos, cmd } = ctx.args;
  const name = helpName(cmd, pos);
  const one = name ? helpFor(name) : null;
  ctx.io.log(one ? `${one}\n\nВсе команды: ${lintCmd('help')}` : HELP);
}
/** @param {import('./args.mjs').Args} args */
const wantsHelp = ({ argv, cmd }) => cmd === 'help' || (cmd !== '__complete' && (argv.includes('--help') || argv.includes('-h')));

/** @param {Ctx} ctx */
function dispatch(ctx) {
  const { argv, cmd } = ctx.args;
  if (wantsHelp(ctx.args)) return help(ctx);
  // Tab-дополнение: варианты для текущего слова, по строке.
  if (cmd === '__complete') return ctx.io.log(complete(argv.slice(1)).join('\n'));
  if (cmd === 'check' && !argv.length) cmdMenu(ctx);
  if (cmd === 'check') checkTypo(ctx);
  return COMMANDS[cmd](ctx);
}

// argv — аргументы после имени скрипта; write(fd, text) — куда печатать сразу (без него вывод копится в chunks).
/**
 * @param {string[]} argv
 * @param {{ write?: (fd: 1 | 2, text: string) => void }} [opts]
 */
export function run(argv, { write } = {}) {
  // lint — вложенный вызов для choose: та же функция, без нового процесса и без импорта run.mjs в команды.
  const ctx = { args: parseArgs(argv), io: createIo(write), lint: (/** @type {string[]} */ a) => run(a) };
  try {
    dispatch(ctx);
    return { code: 0, chunks: ctx.io.chunks };
  } catch (e) {
    if (e instanceof Exit) return { code: e.code, chunks: ctx.io.chunks };
    if (e instanceof SectionConflict) {
      ctx.io.error(e.message);
      return { code: 1, chunks: ctx.io.chunks };
    }
    throw e;
  }
}
