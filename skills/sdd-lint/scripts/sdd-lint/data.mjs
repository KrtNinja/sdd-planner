// Персонажи и объекты из «Данные для примеров».
// @ts-check
import { esc, uniq, inSection, tables, quotes, stem, cell } from './md.mjs';

/** @typedef {import('./model.mjs').ExampleData} ExampleData */

const NAME_PAIR = /(?<![\p{L}])([А-ЯЁ][а-яё]{2,})\s+([А-ЯЁ][а-яё]{2,})(?![\p{L}])/gu;

/** @param {ExampleData} data @param {string} s */
function addPerson(data, s) {
  const m = s.match(/([А-ЯЁ][а-яё]+)(?:\s+([А-ЯЁ][а-яё]+))?/u);
  if (m) data.people.push({ first: m[1], last: m[2] || null });
}
/** @param {ExampleData} data @param {string} s */
function addObjects(data, s) {
  for (const m of s.matchAll(/\b[A-Z][A-Z0-9]*-\d+\b/g)) data.objects.add(m[0]);
  for (const q of quotes(s)) data.objNames.add(q);
}

/** @param {import('./model.mjs').Scan['lines']} ls @param {ExampleData} data */
function tableData(ls, data) {
  for (const t of tables(ls)) {
    const persons = /персонаж|участник|пользовател|кто/i.test(t.header[0] || '');
    for (const r of t.rows) {
      if (persons) addPerson(data, cell(r, 0));
      for (const c of r.cells) addObjects(data, c);
    }
  }
}

/** @param {import('./model.mjs').Scan['lines']} ls @param {ExampleData} data */
function proseData(ls, data) {
  for (const l of ls) {
    if (l.inCode || l.text.trim().startsWith('|')) continue;
    // Пункт списка с имени: «- Анна Петрова — покупатель». Имя и фамилию берёт addPerson.
    if (/^\s*[-*]\s+[А-ЯЁ][а-яё]/u.test(l.text)) addPerson(data, l.text);
    addObjects(data, l.text);
  }
}

/** @param {import('./model.mjs').Scan} sc @returns {ExampleData} */
export function parseData(sc) {
  const ls = inSection(sc, /^Данные для примеров/);
  /** @type {ExampleData['people']} */
  const people = [];
  /** @type {Set<string>} */
  const objects = new Set();
  /** @type {Set<string>} */
  const objNames = new Set();
  const data = { people, objects, objNames };
  tableData(ls, data);
  proseData(ls, data);
  return { people, objects, objNames };
}

/** @param {string} text @param {ExampleData} data */
export function mentionsData(text, data) {
  const starts = (/** @type {string} */ w) => new RegExp(`(?<![\\p{L}])${esc(stem(w))}`, 'u').test(text);
  return (
    data.people.some((p) => starts(p.first) || (p.last && starts(p.last))) ||
    [...data.objects].some((o) => text.includes(o)) ||
    [...data.objNames].some((o) => text.includes(o))
  );
}

/** @param {string} text @param {ExampleData} data */
export function unknownNames(text, data) {
  if (!data.people.length) return [];
  const bare = text.replace(/«[^«»]*»/g, ' ');
  const known = (/** @type {string} */ a, /** @type {string} */ b) =>
    data.people.some(
      (p) =>
        p.last &&
        ((a.startsWith(stem(p.first)) && b.startsWith(stem(p.last))) ||
          (a.startsWith(stem(p.last)) && b.startsWith(stem(p.first)))),
    );
  return uniq([...bare.matchAll(NAME_PAIR)].filter(([, a, b]) => !known(a, b)).map(([, a, b]) => `${a} ${b}`));
}
