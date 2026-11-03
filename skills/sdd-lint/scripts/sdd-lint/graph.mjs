// Граф зависимостей slices и плана нарезки: циклы.
// @ts-check

// Циклы обходом в глубину: узел, к которому вернулись, пока он ещё «в обходе», — цикл; path — путь до него.
// items — Map<номер, { deps: string[] }>; зависимость на себя и на несуществующий узел циклом не считается.
/** @param {Map<string, { deps: string[] }>} items @returns {{ num: string, path: string[] }[]} */
export function dependencyCycles(items) {
  const state = new Map();
  /** @type {{ num: string, path: string[] }[]} */
  const cycles = [];
  /** @param {string} num @param {string[]} stack */
  const visit = (num, stack) => {
    if (state.get(num) === 'done') return;
    if (state.get(num) === 'visiting') {
      cycles.push({ num, path: [...stack, num] });
      return;
    }
    state.set(num, 'visiting');
    // visit зовётся только для узлов из items: по ключам и по зависимостям, которые в items есть
    for (const d of /** @type {{ deps: string[] }} */ (items.get(num)).deps) if (items.has(d) && d !== num) visit(d, [...stack, num]);
    state.set(num, 'done');
  };
  for (const num of items.keys()) visit(num, []);
  return cycles;
}
