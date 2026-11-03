// Общие помощники: файлы, разбор markdown (разделы, шапка, таблицы), ID, числа, «тексты».
// @ts-check
import fs from 'node:fs';
import path from 'node:path';

/** @typedef {import('./model.mjs').Line} Line */
/** @typedef {import('./model.mjs').CodeBlock} CodeBlock */
/** @typedef {import('./model.mjs').Scan} Scan */
/** @typedef {import('./model.mjs').Table} Table */
/** @typedef {string | null | undefined} Text */

/** @param {string | null | undefined} f @returns {string | null} */
export const read = (f) => (f && fs.existsSync(f) && fs.statSync(f).isFile() ? fs.readFileSync(f, 'utf8') : null);
/** @param {string | null | undefined} f */
export const rel = (f) => (f ? path.relative(process.cwd(), f) || f : '');
// Ссылка из файла from на файл to — как в markdown: путь от папки from через «/».
/** @param {string} from @param {string} to */
export const fileHref = (from, to) => path.relative(path.dirname(from), to).split(path.sep).join('/');
/** @param {string} s */
export const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** @template T @param {Iterable<T>} a @returns {T[]} */
export const uniq = (a) => [...new Set(a)];
// 1 файл, 3 файла, 5 файлов
/** @param {number} n @param {string} one @param {string} few @param {string} many */
export const plural = (n, one, few, many) => `${n} ${[one, few, many][pluralForm(n)]}`;
// Форма слова при числе: 0 — «файл» (1, 21, 101), 1 — «файла» (2–4, 22–24), 2 — «файлов» (0, 5–20, 25…).
// По последней цифре; второй десяток (11–19) — всегда «файлов».
const FORM_BY_DIGIT = [2, 0, 1, 1, 1, 2, 2, 2, 2, 2];
/** @param {number} n */
const pluralForm = (n) => (Math.trunc(n / 10) % 10 === 1 ? 2 : FORM_BY_DIGIT[n % 10]);
/** @param {Text} s */
export const isEmptyCell = (s) => !s || /^[—–\-?]*$/.test(s.trim());
/** @param {Text} status */
export const approved = (status) => !!status && /одобрен|принят/i.test(status);
// Дата в документах: ДД.ММ.ГГГГ.
/** @param {Date} [t] */
export const today = (t = new Date()) => [t.getDate(), t.getMonth() + 1].map((x) => String(x).padStart(2, '0')).join('.') + `.${t.getFullYear()}`;
/** @param {Text} t */
export const noneText = (t) => !t || /^нет(?!\p{L})/iu.test(t.trim());

// Делит markdown на строки: внутри ли блока кода, номер блока, текущий раздел второго уровня.
/** @param {Text} md @returns {Scan} */
export function scan(md) {
  /** @type {Line[]} */
  const lines = [];
  /** @type {CodeBlock[]} */
  const blocks = [];
  let inCode = false;
  let block = -1;
  /** @type {string | null} */
  let h2 = null;
  (md || '').split(/\r?\n/).forEach((text, i) => {
    const n = i + 1;
    if (/^\s*```/.test(text)) {
      inCode = !inCode;
      if (inCode) {
        block += 1;
        // lang — язык после ``` («ts», «mermaid»); у FR и AC его нет.
        blocks.push({ idx: block, start: n, h2, lang: text.trim().slice(3).trim().toLowerCase(), lines: [] });
      }
      return;
    }
    if (!inCode && /^##\s/.test(text)) h2 = text.replace(/^##\s+/, '').trim();
    /** @type {Line} */
    const l = { text, n, inCode, block: inCode ? block : null, h2 };
    lines.push(l);
    if (inCode) blocks[block].lines.push(l);
  });
  return { lines, blocks };
}

// Заголовок ## вне кода: у такой строки раздел h2 — она сама.
/** @param {Line} l @returns {l is Line & { h2: string }} */
export const isH2 = (l) => !l.inCode && /^##\s/.test(l.text);
// Строки раздела без заголовка: у каждой h2 — строка.
/** @param {Scan} sc @param {RegExp} re */
export const inSection = (sc, re) => /** @type {(Line & { h2: string })[]} */ (sc.lines.filter((l) => l.h2 && re.test(l.h2) && !isH2(l)));
/** @param {Scan} sc @param {RegExp} re */
export const hasSection = (sc, re) => sc.lines.some((l) => isH2(l) && re.test(l.h2));
/** @param {Scan} sc @param {RegExp} re */
export const sectionText = (sc, re) => inSection(sc, re).map((l) => l.text).join('\n').trim();

// Значение строки шапки «Ключ: значение»; строки нет — fallback.
/** @template {string | null} [F=null] @param {Text} md @param {string} key @param {F} [fallback] @returns {string | F} */
export const header = (md, key, fallback = /** @type {F} */ (null)) => {
  const m = (md || '').match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  return m ? m[1].trim() : fallback;
};
// Строка шапки «Ключ: значение»: заменить или вставить после первой из after (иначе под заголовком).
/** @param {string} md @param {string} key @param {string} value @param {string[]} [after] */
export function setHeader(md, key, value, after = []) {
  const re = new RegExp(`^${key}:.*$`, 'm');
  if (re.test(md)) return md.replace(re, () => `${key}: ${value}`);
  const ls = md.split('\n');
  // Вставить после строки с первым найденным ключом из after (номер строки с 1; не найден — 0), иначе после заголовка.
  const at = /** @type {number} */ ([...after.map((k) => ls.findIndex((t) => t.startsWith(`${k}:`)) + 1), 1].find(Boolean));
  ls.splice(at, 0, '', `${key}: ${value}`);
  return ls.join('\n');
}
/** @param {string} md @param {string} key */
export const dropHeader = (md, key) => md.replace(new RegExp(`^${key}:.*\\n?`, 'm'), '');
/** @param {Text} md @param {string} key @returns {number | null} */
export const headerLine = (md, key) => {
  const i = (md || '').split(/\r?\n/).findIndex((t) => new RegExp(`^${key}:`).test(t));
  return i < 0 ? null : i + 1;
};

/** @param {string} t */
const splitRow = (t) => t.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
/** @param {Line[]} ls @returns {Table[]} */
export function tables(ls) {
  /** @type {Table[]} */
  const out = [];
  /** @type {Table | null} */
  let cur = null;
  for (const l of ls) {
    const t = l.text.trim();
    if (!l.inCode && t.startsWith('|')) {
      const cells = splitRow(t);
      if (!cur) {
        cur = { header: cells, rows: [], start: l.n, end: l.n };
        out.push(cur);
        continue;
      }
      cur.end = l.n;
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      cur.rows.push({ cells, n: l.n });
    } else cur = null;
  }
  return out;
}
/** @param {Table} t @param {string | RegExp} m */
export const col = (t, m) => t.header.findIndex((h) => (typeof m === 'string' ? h === m : m.test(h)));
// Ячейка строки по номеру колонки; колонки нет (-1) или строка короче шапки — пусто.
/** @param {import('./model.mjs').TableRow} r @param {number} i */
export const cell = (r, i) => (i in r.cells ? r.cells[i] : '');

// Совпадение, которое уже проверено test() или фильтром: тип без null.
/** @param {string} s @param {RegExp} re */
export const matched = (s, re) => /** @type {RegExpMatchArray} */ (s.match(re));

export const REQ_RE = /\bN?FR-\d+\b/g;
/** @param {Text} s */
export const reqIds = (s) => uniq([...(s || '').matchAll(REQ_RE)].map((m) => m[0]));
// Номера slices из «Зависимости:»: «нет», «—» или пусто — зависимостей нет.
/** @param {string} [raw] */
export const depNums = (raw = '') => (/^(нет|—|-)?$/i.test(raw.trim()) ? [] : uniq([...raw.matchAll(/\b\d{3}\b/g)].map((m) => m[0])));
const NUM_RE = /(?<![\p{L}\d\-])\d+(?:[.,]\d+)?(?![\p{L}\d])/gu;
/** @param {Text} s */
export const numbers = (s) => [...(s || '').matchAll(NUM_RE)].map((m) => m[0]);
/** @param {Text} s */
export const quotes = (s) => [...(s || '').matchAll(/«([^«»]+)»/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());

// Расстояние Левенштейна: опечатка в команде («aprove»), в имени сервиса («notify-servise»).
/** @param {string} a @param {string} b */
// Две строки таблицы: prev — расстояния от префикса a до префиксов b, cur — с ещё одной буквой a.
export function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (const ca of a.split('')) {
    const cur = [prev[0] + 1];
    for (const [j, cb] of b.split('').entries()) cur.push(Math.min(prev[j + 1] + 1, cur[j] + 1, prev[j] + (ca === cb ? 0 : 1)));
    prev = cur;
  }
  return prev[b.length];
}

/** @param {string} re */
export const word = (re) => new RegExp(`(?<![\\p{L}\\d_])(?:${re})(?![\\p{L}\\d_])`, 'iu');

// Заготовки шаблонов: «<условие>», «<FR-n>». «<» сразу перед буквой и без переноса строки;
// HTML-теги, адреса <https://…>, HTML-комментарии и «тексты» заготовками не считаются.
const NOT_PLACEHOLDER = /^(\/?(br|b|i|u|s|em|strong|sub|sup|kbd|code|span|div|p|a|details|summary|img|hr|small|mark)\b|https?:|mailto:)/i;
/** @param {Text} text */
export const placeholders = (text) =>
  [...(text || '').replace(/<!--[\s\S]*?-->/g, ' ').replace(/«[^«»]*»/g, ' ').matchAll(/<([\p{L}][^<>\n]{0,60})>/gu)]
    .map((m) => `<${m[1]}>`)
    .filter((x) => !NOT_PLACEHOLDER.test(x.slice(1)));

/** @param {string} w */
export const stem = (w) => (w.length < 4 ? w : w.slice(0, -1));

// Раздел ## по заголовку: строки файла, сам заголовок, следующий ## и последняя строка раздела (end — до next).
/** @param {string} md @param {RegExp} titleRe */
function sectionAt(md, titleRe) {
  const ls = md.split('\n');
  const sc = scan(md);
  const h = sc.lines.find((l) => isH2(l) && titleRe.test(l.h2));
  const next = h && sc.lines.find((l) => isH2(l) && l.n > h.n);
  return { ls, h, next, end: next ? next.n - 1 : ls.length };
}

/** @param {string} md @param {RegExp} titleRe @param {string} title @param {string} body */
export function replaceSection(md, titleRe, title, body) {
  const { ls, h, next, end } = sectionAt(md, titleRe);
  if (!h) return `${md.replace(/\s*$/, '')}\n\n## ${title}\n${body}\n`;
  return [...ls.slice(0, h.n), body, ...(next ? [''] : []), ...ls.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n');
}

// Заменяет раздел целиком (с заголовком) или убирает его, если title пуст.
/** @param {string} md @param {RegExp} titleRe @param {string | null} title @param {string} body */
export function setSection(md, titleRe, title, body) {
  const { ls, h, next, end } = sectionAt(md, titleRe);
  if (!h) return md;
  const mid = title ? [`## ${title}`, body, ...(next ? [''] : [])] : [];
  return `${[...ls.slice(0, h.n - 1), ...mid, ...ls.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '')}\n`;
}
