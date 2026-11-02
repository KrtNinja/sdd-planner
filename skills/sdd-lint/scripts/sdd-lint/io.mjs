// Вывод команды и код выхода. Команда пишет в ctx.io, а не в console и process: так её можно вызвать функцией.
import { format } from 'node:util';

// Завершение команды с кодом: бросается из io.exit, ловится в run().
export class Exit extends Error {
  constructor(code) {
    super(`exit ${code}`);
    this.name = 'Exit';
    this.code = code;
  }
}

// write(fd, text) — куда идёт вывод (1 — stdout, 2 — stderr). Без него — в буфер chunks: [[fd, text], …]
// в порядке записи, чтобы вызывающий восстановил вывод как в терминале.
export function createIo(write) {
  const chunks = [];
  const put = write ?? ((fd, text) => chunks.push([fd, text]));
  return {
    chunks,
    log: (...a) => put(1, `${format(...a)}\n`),
    error: (...a) => put(2, `${format(...a)}\n`),
    exit: (code = 0) => {
      throw new Exit(code);
    },
  };
}
