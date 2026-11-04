// Постоянный opt-in нового процесса и резервирование ID до их выдачи. Не является индексом документов.
// @ts-check
import fs from 'node:fs';
import path from 'node:path';

/** @typedef {{ version: 2, next: { Q: number, SC: number, STEP: number } }} FlowState */
/** @typedef {'Q' | 'SC' | 'STEP'} IdKind */
const STATE = '.sdd-flow.json';

/** @param {string | null} text @returns {FlowState | null} */
export function parseFlowState(text) {
  if (text === null) return null;
  const value = JSON.parse(text);
  if (value?.version !== 2) throw new Error('Неподдерживаемая версия .sdd-flow.json');
  for (const key of ['Q', 'SC', 'STEP']) {
    const n = value.next?.[key];
    if (!Number.isSafeInteger(n) || n < 1) throw new Error(`Некорректный счётчик ${key} в .sdd-flow.json`);
  }
  return value;
}

/** @param {string} file */
function readState(file) {
  return parseFlowState(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
}

// Один файл: exclusive pending удерживает писателя; rename публикует целый JSON.
// При аварии pending остаётся: никаких последующих ID до явного восстановления.
/** @param {string} dir @param {(state: FlowState | null) => FlowState} change */
function updateState(dir, change) {
  const file = path.join(dir, STATE);
  const pending = `${file}.pending`;
  const fd = fs.openSync(pending, 'wx', 0o600);
  let published = false;
  try {
    const state = change(readState(file));
    fs.writeFileSync(fd, `${JSON.stringify(state)}\n`);
    fs.fsyncSync(fd);
    fs.renameSync(pending, file);
    published = true;
    return state;
  } finally {
    fs.closeSync(fd);
    if (!published) fs.unlinkSync(pending);
  }
}

// Только новая пустая тестовая папка. start эту функцию до блока 07 не вызывает.
/** @param {string} dir */
export function initTestFlow(dir) {
  if (fs.readdirSync(dir).length) throw new Error('Новый формат разрешён только в пустой тестовой папке');
  return updateState(dir, (current) => {
    if (current) throw new Error('Фича уже инициализирована; счётчики не сбрасываются');
    return { version: 2, next: { Q: 1, SC: 1, STEP: 1 } };
  });
}

/** @param {FlowState | null} state @returns {FlowState} */
function requiredState(state) {
  if (!state) throw new Error('Нет признака нового процесса; старые фичи не мигрируют');
  return state;
}

/** @param {string} dir @param {IdKind} kind @param {string} [scenario] */
export function reserveFlowId(dir, kind, scenario = '') {
  if (!['Q', 'SC', 'STEP'].includes(kind)) throw new Error('ID: ожидается Q, SC или STEP');
  if (kind === 'STEP' && !/^SC-[1-9]\d*$/.test(scenario)) throw new Error('Шагу нужен ID сценария SC-n');
  const state = updateState(dir, (current) => {
    const value = requiredState(current);
    if (value.next[kind] === Number.MAX_SAFE_INTEGER) throw new Error('Исчерпан диапазон ID');
    return { ...value, next: { ...value.next, [kind]: value.next[kind] + 1 } };
  });
  const n = state.next[kind] - 1;
  if (kind === 'Q') return `Q${n}`;
  return kind === 'SC' ? `SC-${n}` : `${scenario}-S${n}`;
}

// Только после остановки писателя. Неполный pending удаляется: ID ещё не был возвращён.
// Полный pending публикуется, даже если вызывающая сторона не получила ответ: пропуск безопасен.
/** @param {string} dir */
export function recoverFlowState(dir) {
  const file = path.join(dir, STATE);
  const pending = `${file}.pending`;
  const current = readState(file); // повреждённое постоянное состояние не затираем
  if (!fs.existsSync(pending)) return current;
  let candidate;
  try { candidate = requiredState(readState(pending)); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    fs.unlinkSync(pending);
    return current;
  }
  if (current && /** @type {IdKind[]} */ (['Q', 'SC', 'STEP']).some((k) => candidate.next[k] < current.next[k]))
    throw new Error('Счётчики pending меньше постоянных; восстановите файл из Git');
  fs.renameSync(pending, file);
  return candidate;
}
