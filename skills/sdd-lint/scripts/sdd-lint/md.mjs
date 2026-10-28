// Общие помощники: файлы, разбор markdown (разделы, шапка, таблицы), ID, числа, «тексты».
import fs from 'node:fs';
import path from 'node:path';

export const read = (f) => (f && fs.existsSync(f) && fs.statSync(f).isFile() ? fs.readFileSync(f, 'utf8') : null);
export const rel = (f) => (f ? path.relative(process.cwd(), f) || f : '');
export const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const uniq = (a) => [...new Set(a)];
export const isEmptyCell = (s) => !s || /^[—–\-?]*$/.test(s.trim());
export const approved = (status) => !!status && /одобрен|принят/i.test(status);
export const noneText = (t) => !t || /^нет(?!\p{L})/iu.test(t.trim());

// Делит markdown на строки: внутри ли блока кода, номер блока, текущий раздел второго уровня.
export function scan(md) {
  const lines = [];
  const blocks = [];
  let inCode = false;
  let block = -1;
  let h2 = null;
  (md || '').split(/\r?\n/).forEach((text, i) => {
    const n = i + 1;
    if (/^\s*```/.test(text)) {
      inCode = !inCode;
      if (inCode) {
        block += 1;
        blocks.push({ idx: block, start: n, h2, lines: [] });
      }
      return;
    }
    if (!inCode && /^##\s/.test(text)) h2 = text.replace(/^##\s+/, '').trim();
    const l = { text, n, inCode, block: inCode ? block : null, h2 };
    lines.push(l);
    if (inCode) blocks[block].lines.push(l);
  });
  return { lines, blocks };
}

export const isH2 = (l) => !l.inCode && /^##\s/.test(l.text);
export const inSection = (sc, re) => sc.lines.filter((l) => l.h2 && re.test(l.h2) && !isH2(l));
export const hasSection = (sc, re) => sc.lines.some((l) => isH2(l) && re.test(l.h2));
export const sectionText = (sc, re) => inSection(sc, re).map((l) => l.text).join('\n').trim();

export const header = (md, key) => {
  const m = (md || '').match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  return m ? m[1].trim() : null;
};
export const headerLine = (md, key) => {
  const i = (md || '').split(/\r?\n/).findIndex((t) => new RegExp(`^${key}:`).test(t));
  return i < 0 ? null : i + 1;
};

const splitRow = (t) => t.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
export function tables(ls) {
  const out = [];
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
export const col = (t, m) => t.header.findIndex((h) => (typeof m === 'string' ? h === m : m.test(h)));

export const REQ_RE = /\bN?FR-\d+\b/g;
export const reqIds = (s) => uniq([...(s || '').matchAll(REQ_RE)].map((m) => m[0]));
const NUM_RE = /(?<![\p{L}\d\-])\d+(?:[.,]\d+)?(?![\p{L}\d])/gu;
export const numbers = (s) => [...(s || '').matchAll(NUM_RE)].map((m) => m[0]);
export const quotes = (s) => [...(s || '').matchAll(/«([^«»]+)»/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());

export const word = (re) => new RegExp(`(?<![\\p{L}\\d_])(?:${re})(?![\\p{L}\\d_])`, 'iu');

export const stem = (w) => (w.length <= 4 ? w.slice(0, 3) : w.slice(0, -1));

export function replaceSection(md, titleRe, title, body) {
  const ls = md.split('\n');
  const sc = scan(md);
  const h = sc.lines.find((l) => isH2(l) && titleRe.test(l.h2));
  if (!h) return `${md.replace(/\s*$/, '')}\n\n## ${title}\n${body}\n`;
  const next = sc.lines.find((l) => isH2(l) && l.n > h.n);
  const end = next ? next.n - 1 : ls.length;
  return [...ls.slice(0, h.n), body, ...(next ? [''] : []), ...ls.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n');
}

// Заменяет раздел целиком (с заголовком) или убирает его, если title пуст.
export function setSection(md, titleRe, title, body) {
  const ls = md.split('\n');
  const sc = scan(md);
  const h = sc.lines.find((l) => isH2(l) && titleRe.test(l.h2));
  if (!h) return md;
  const next = sc.lines.find((l) => isH2(l) && l.n > h.n);
  const end = next ? next.n - 1 : ls.length;
  const mid = title ? [`## ${title}`, body, ...(next ? [''] : [])] : [];
  return `${[...ls.slice(0, h.n - 1), ...mid, ...ls.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '')}\n`;
}
