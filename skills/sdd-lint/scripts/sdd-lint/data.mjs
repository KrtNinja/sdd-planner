// Персонажи и объекты из «Данные для примеров».
import { esc, uniq, inSection, tables, quotes, stem } from './md.mjs';

const NAME_PAIR = /(?<![\p{L}])([А-ЯЁ][а-яё]{2,})\s+([А-ЯЁ][а-яё]{2,})(?![\p{L}])/gu;

export function parseData(sc) {
  const ls = inSection(sc, /^Данные для примеров/);
  const people = [];
  const objects = new Set();
  const objNames = new Set();
  const addPerson = (s) => {
    const m = s.match(/([А-ЯЁ][а-яё]+)(?:\s+([А-ЯЁ][а-яё]+))?/u);
    if (m) people.push({ first: m[1], last: m[2] || null });
  };
  const addObjects = (s) => {
    for (const m of s.matchAll(/\b[A-Z][A-Z0-9]*-\d+\b/g)) objects.add(m[0]);
    for (const q of quotes(s)) objNames.add(q);
  };
  for (const t of tables(ls)) {
    const persons = /персонаж|участник|пользовател|кто/i.test(t.header[0] || '');
    for (const r of t.rows) {
      if (persons) addPerson(r.cells[0] || '');
      for (const c of r.cells) addObjects(c);
    }
  }
  for (const l of ls) {
    if (l.inCode || l.text.trim().startsWith('|')) continue;
    const m = l.text.match(/^\s*[-*]\s+([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?)/u);
    if (m) addPerson(m[1]);
    addObjects(l.text);
  }
  return { people, objects, objNames };
}

export function mentionsData(text, data) {
  const starts = (w) => new RegExp(`(?<![\\p{L}])${esc(stem(w))}`, 'u').test(text);
  return (
    data.people.some((p) => starts(p.first) || (p.last && starts(p.last))) ||
    [...data.objects].some((o) => text.includes(o)) ||
    [...data.objNames].some((o) => text.includes(o))
  );
}

export function unknownNames(text, data) {
  if (!data.people.length) return [];
  const bare = text.replace(/«[^«»]*»/g, ' ');
  const known = (a, b) =>
    data.people.some(
      (p) =>
        p.last &&
        ((a.startsWith(stem(p.first)) && b.startsWith(stem(p.last))) ||
          (a.startsWith(stem(p.last)) && b.startsWith(stem(p.first)))),
    );
  return uniq([...bare.matchAll(NAME_PAIR)].filter((m) => !known(m[1], m[2])).map((m) => `${m[1]} ${m[2]}`));
}
