// ПЕРЕХОДНЫЙ модуль шага 3 рефакторинга: аргументы процесса и вывод в консоль для модулей, которые ещё
// не получают ctx. Каждый коммит шага переводит модули на ctx; последний коммит удаляет этот файл.
import { parseArgs } from './args.mjs';
import { createIo } from './io.mjs';

export const LEGACY = {
  args: parseArgs(process.argv.slice(2)),
  io: createIo((fd, text) => (fd === 2 ? process.stderr : process.stdout).write(text)),
};
export const { argv, flags, pos, cmd } = LEGACY.args;
