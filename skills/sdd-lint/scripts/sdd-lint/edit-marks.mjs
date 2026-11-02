// Пометки правок в тексте spec и slices («изменено <дата>», «добавлен после ревью»): им место в git.
// @ts-check
import { collect } from './findings.mjs';

/** @typedef {import('./model.mjs').Feature} Feature */

// «Изменено 28.10.2026», «добавлен после ревью R2»: решение живёт в самом FR и AC, история — в git.
// «(удалён: причина)» — не пометка правки, а постоянный ID удалённого требования.
const MARK_VERB = '(?:изменен|изменён|добавлен|обновлен|обновлён|уточнен|уточнён|исправлен|переписан|дополнен)\\p{L}*';
const EDIT_MARK_RES = [
  // «добавлен после ревью», «уточнено по находке R2», «изменён по решению П3»
  new RegExp(`(?<![\\p{L}])${MARK_VERB}\\s+(?:после|по|на|в\\s+ходе)\\s+(?:итогам\\s+)?(?:ревью|review|brainstorming|брейншторм\\p{L}*|находк\\p{L}*|решени\\p{L}*\\s+[ПR]\\d+|[ПR]\\d+)`, 'iu'),
  // «(изменено 28.10.2026)», «Добавлено 28.10.2026: …» — дата правки в скобках или в начале строки;
  // «Анна изменила комментарий 28.10.2026» в примере — не пометка
  new RegExp(`(?:^|[(\\[_*—–])\\s*${MARK_VERB}:?\\s+\\d{1,2}\\.\\d{1,2}\\.\\d{2,4}`, 'iu'),
  // «по ревью R2», «находка R3»
  /(?<![\p{L}])(?:ревью|находк\p{L}*)\s+R\d+/iu,
];
/** @param {string} file @param {import('./model.mjs').Scan} sc @param {string} rule */
function editMarks(file, sc, rule) {
  const { found, add } = collect();
  for (const l of sc.lines) {
    if (/^\s*Статус:/.test(l.text)) continue;
    for (const re of EDIT_MARK_RES) {
      const mm = l.text.match(re);
      if (mm) {
        add(rule, file, l.n, `«${mm[0]}» — пометка правки`);
        break;
      }
    }
  }
  return found;
}
/** @param {Feature} m */
export function checkEditMarks(m) {
  return [
    ...(m.spec ? editMarks(m.spec.file, m.spec.sc, 'SP-22') : []),
    ...[...m.slices.values()].flatMap((sl) => editMarks(sl.file, sl.sc, 'SL-29')),
    ...(m.readmeSc ? editMarks(m.readmeFile, m.readmeSc, 'SL-29') : []),
  ];
}
