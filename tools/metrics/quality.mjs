// Уже достигнутые обязательные цели не ослабляются старой базовой линией.
// 359 — проверенный набор после шага 9; более высокий минимум берётся из baseline в report.mjs.
export function requiredQuality(now, { checkTests = true } = {}) {
  const bad = [];
  if (checkTests && (!Number.isSafeInteger(now.tests.total) || now.tests.total < 359 || now.tests.pass !== now.tests.total)) {
    bad.push('тесты: нужны все прошедшие тесты, не меньше 359');
  }
  if (now.unusedExports !== 0) bad.push('экспортов без потребителей должно быть 0');
  return bad;
}
