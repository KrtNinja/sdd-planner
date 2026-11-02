// Сервисы фичи: реестр «Сервисы:» (протокол, потом README), разбор «Половины:» и заголовков половин — для lint и export.
// @ts-check
import { header, uniq } from './md.mjs';

/** @typedef {import('./model.mjs').Registry} Registry */
/** @typedef {import('./model.mjs').Feature} Feature */
/** @typedef {string | null | undefined} Text */

/** @param {string} s */
const norm = (s) => s.trim().toLowerCase();
const NAME = /^[\w.-]+$/;

// «Сервисы: frontend, tasks-core, notify-service» → список; «один» и заготовка шаблона — реестра нет.
/** @param {Text} raw @returns {string[] | null} */
export function parseServices(raw) {
  if (!raw || /^(один|одна|<)/i.test(raw.trim())) return null;
  const list = uniq(raw.split(/\s*(?:[,;+]|\sи\s)\s*/).map(norm).filter(Boolean));
  return list.length && list.every((s) => NAME.test(s)) ? list : null;
}
// Протокол есть только до close, README хранит копию реестра после.
/** @param {Feature} m @returns {Registry | null} */
export function registry(m) {
  const fromProtocol = parseServices(header(m.protocol?.md, 'Сервисы'));
  if (fromProtocol) return { list: fromProtocol, from: '«Сервисы:» протокола' };
  const fromReadme = parseServices(header(m.readme, 'Сервисы'));
  return fromReadme ? { list: fromReadme, from: '«Сервисы:» в slices/README.md' } : null;
}

// «tasks-core + frontend, принимаются вместе», «только tasks-core» → ['tasks-core', 'frontend'].
// ok — строка разобралась целиком: export отдаёт зоне реализации ровно эти сервисы.
/** @param {Text} raw */
export function parseHalves(raw) {
  const head = (raw || '').split(/,\s*(?=[а-яё])|\s[—–-]\s/i)[0];
  const tokens = head
    .split(/\s*[+,]\s*/)
    .map((s) => norm(s.replace(/^только\s+/i, '')))
    .filter(Boolean);
  const bad = tokens.filter((s) => !NAME.test(s));
  return { services: uniq(tokens.filter((s) => NAME.test(s))), bad, ok: tokens.length > 0 && !bad.length };
}
// Что не так со строкой «Половины:» — одной фразой с подсказкой, как надо.
/** @param {Text} raw @param {Registry | null} reg */
export function halvesProblem(raw, reg) {
  const h = parseHalves(raw);
  if (!h.ok) {
    if (!h.bad.length) return `«Половины: ${raw}» — нет ни одного сервиса`;
    const hint = (/** @type {string} */ t) => {
      const parts = t.split(/\s+и\s+|\s+/).filter(Boolean);
      const known = reg ? parts.map((x) => reg.list.find((r) => r === x) || null) : [];
      const near = reg ? unknownService(t.replace(/\s+/g, '-'), reg) : null;
      if (known.filter(Boolean).length > 1) return `разделяй сервисы «+»: «${known.filter(Boolean).join(' + ')}»`;
      if (reg?.list.includes(t.replace(/\s+/g, '-'))) return `верно «${t.replace(/\s+/g, '-')}»`;
      return near && /похоже на/.test(near) ? near.slice(near.indexOf('похоже на')) : 'сервисы — через «+», имена латиницей как в «Сервисы:»';
    };
    return h.bad.map((t) => `«${t}» — не имя сервиса: ${hint(t)}`).join('; ');
  }
  const unknown = h.services.map((s) => unknownService(s, reg)).filter(Boolean);
  return unknown.length ? unknown.join('; ') : null;
}
// Строка «Половины:» в каноническом виде — её пишет gen slices.
/** @param {string[]} services @param {boolean} prep */
export function halvesLine(services, prep) {
  if (services.length === 1) return `только ${services[0]}`;
  return `${services.join(' + ')}, ${prep ? 'ревьюят все стороны вместе' : 'принимаются вместе'}`;
}
// «## Notify-service-половина» → notify-service; «Общая приёмка» → null.
/** @param {Text} h */
export const serviceOfHeading = (h) => (/половин/i.test(h || '') ? norm((h || '').replace(/[-–—\s]*половина.*$/i, '')) || null : null);
/** @param {string} svc */
export const halfHeading = (svc) => `${svc[0].toUpperCase()}${svc.slice(1)}-половина`;

// Сервисы slice для export: из «Половины:» и из разделов, где стоят AC.
/** @param {{ halves: Text }} sl @param {{ service?: string | null }[]} acs */
export const servicesOf = (sl, acs) => uniq([...parseHalves(sl.halves).services, ...acs.map((a) => a.service).filter(Boolean)]);

/** @param {string} a @param {string} b */
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Неизвестный сервис и подсказка «похоже на …».
/** @param {string} name @param {Registry | null} reg */
export function unknownService(name, reg) {
  if (!reg || reg.list.includes(name)) return null;
  const flat = (/** @type {string} */ s) => s.replace(/[\s._-]+/g, '');
  const near = reg.list.find((x) => flat(x) === flat(name)) || reg.list.find((x) => distance(x, name) <= 2);
  return `«${name}» нет в ${reg.from} (${reg.list.join(', ')})${near ? `; похоже на «${near}»` : ''}`;
}
