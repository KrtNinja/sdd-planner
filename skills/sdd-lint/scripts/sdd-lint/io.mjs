// Вывод команды и код выхода. Команда пишет в ctx.io, а не в console и process: так её можно вызвать функцией.
// @ts-check
import { format } from 'node:util';

// Завершение команды с кодом: бросается из io.exit, ловится в run().
export class Exit extends Error {
  /** @param {number} code */
  constructor(code) {
    super(`exit ${code}`);
    this.name = 'Exit';
    this.code = code;
  }
}

/** @typedef {ReturnType<typeof createIo>} Io */
/**
 * Аргументы вызова, вывод и вложенный вызов lint; первым параметром у команд и помощников вывода.
 * @typedef {{ args: import('./args.mjs').Args, io: Io, lint: (argv: string[]) => { code: number, chunks: [1 | 2, string][] } }} Ctx
 */

// write(fd, text) — куда идёт вывод (1 — stdout, 2 — stderr). Без него — в буфер chunks: [[fd, text], …]
// в порядке записи, чтобы вызывающий восстановил вывод как в терминале.
/** @param {(fd: 1 | 2, text: string) => void} [write] */
export function createIo(write) {
  /** @type {[1 | 2, string][]} */
  const chunks = [];
  const put = write ?? ((fd, text) => chunks.push([fd, text]));
  return {
    chunks,
    log: (/** @type {unknown[]} */ ...a) => put(1, `${format(...a)}\n`),
    error: (/** @type {unknown[]} */ ...a) => put(2, `${format(...a)}\n`),
    /** @returns {never} */
    exit: (code = 0) => {
      throw new Exit(code);
    },
  };
}
