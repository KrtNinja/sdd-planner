// Ошибка запуска tsc — сбой замера, а не отсутствие ошибок типов.
import { spawnSync } from 'node:child_process';

export function runTsc(bin, args, cwd) {
  const r = spawnSync(bin, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 26 });
  const diagnostics = /error TS\d+/.test(r.stdout ?? '');
  if (r.error || r.signal || (r.status !== 0 && !([1, 2].includes(r.status) && diagnostics))) {
    throw new Error(`tsc: замер не выполнен (${r.error?.code ?? r.signal ?? r.status}): ${(r.stderr ?? '').trim()}`);
  }
  return r.stdout;
}
