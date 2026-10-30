// Протокол brainstorming: разбор, проверки PR-*, gen guessed.
import fs from 'node:fs';

import { usage } from './cli.mjs';
import { add } from './findings.mjs';
import { protocolReady, protocolSources, sourceProblem, sourcesLine } from './inputs.mjs';
import { plural, rel, isEmptyCell, scan, isH2, inSection, hasSection, header, tables, col, replaceSection } from './md.mjs';

export function parseProtocol(file, md) {
  if (md == null) return null;
  const sc = scan(md);
  const rows = [];
  const main = tables(inSection(sc, /^Решения\s*$/))[0];
  if (main) {
    const ci = col(main, '#');
    const cr = col(main, /рекоменд/i);
    const cd = col(main, /^решени/i);
    const cq = col(main, /вопрос/i);
    for (const r of main.rows) {
      rows.push({
        id: (r.cells[ci] ?? '').trim(),
        q: r.cells[cq] ?? '',
        rec: cr >= 0 ? r.cells[cr] ?? '' : '',
        dec: cd >= 0 ? r.cells[cd] ?? '' : '',
        n: r.n,
        raw: r.cells.join(' | '),
      });
    }
  }
  const post = [];
  const postT = tables(inSection(sc, /^Решения после/))[0];
  if (postT) {
    const ci = col(postT, '#');
    const cd = col(postT, /^решени/i);
    postT.rows.forEach((r, k) => {
      let id = ci >= 0 ? (r.cells[ci] || '').trim() : '';
      if (/^\d+$/.test(id)) id = `П${id}`;
      if (!id) id = `П${k + 1}`;
      post.push({ id, dec: cd >= 0 ? r.cells[cd] ?? '' : '', n: r.n, raw: r.cells.join(' | ') });
    });
  }
  const outScope = inSection(sc, /^Вне scope/)
    .filter((l) => !l.inCode && /^\s*[-*]\s+\S/.test(l.text))
    .map((l) => ({ text: l.text.trim(), n: l.n }));
  const guessedT = tables(inSection(sc, /^Где агент/))[0] || null;
  return { file, md, sc, status: header(md, 'Статус'), rows, post, outScope, guessedT, hasGuessed: hasSection(sc, /^Где агент/) };
}

const agreed = (rec, dec) => {
  const norm = (s) => s.toLowerCase().replace(/[«»"'.,!;:—–\-()]/g, ' ').replace(/\s+/g, ' ').trim();
  return norm(rec) === norm(dec) || /^(=|да|ок|ok|согласен|согласна|согласны|принято|как рекомендовано)$/i.test(norm(dec) || dec.trim());
};
const guessedRows = (p) => p.rows.filter((r) => !isEmptyCell(r.rec) && !isEmptyCell(r.dec) && !agreed(r.rec, r.dec));

export function checkProtocol(m) {
  const p = m.protocol;
  if (!p) return;
  if (!p.status) add('PR-01', p.file, 1, 'нет строки «Статус:»');
  p.rows.forEach((r, k) => {
    if (r.id !== String(k + 1)) add('PR-02', p.file, r.n, `строка ${k + 1} таблицы «Решения» имеет номер «${r.id}», ожидался ${k + 1}`);
  });
  // Источники: вопрос о них — до первого раунда (sdd-grill). После «готов» спрашивать поздно, проверка молчит.
  const src = protocolSources(p);
  const at = sourcesLine(p);
  if (src == null && p.rows.length && !protocolReady(p))
    add('PR-06', p.file, at || 1, `в «Решения» ${plural(p.rows.length, 'строка', 'строки', 'строк')}, а ${at ? '«Источники:» не заполнены' : 'строки «Источники:» нет'} — человека не спросили, что он может передать`);
  if (Array.isArray(src)) for (const s of src) if (sourceProblem(s)) add('PR-07', p.file, at, `«${s}» — ${sourceProblem(s)}`);
  if (!protocolReady(p)) return;
  for (const r of p.rows) if (isEmptyCell(r.dec)) add('PR-03', p.file, r.n, `статус «готов», а у строки #${r.id} нет решения`);
  const expected = guessedRows(p).map((r) => r.id);
  const ct = p.guessedT;
  const have = ct ? ct.rows.map((r) => (r.cells[col(ct, '#')] ?? '').trim()) : [];
  if (expected.length !== have.length || expected.some((id) => !have.includes(id))) {
    add('PR-05', p.file, ct ? ct.start : null, `«Где агент угадал бы не так»: по протоколу строки ${expected.join(', ') || '—'}, в таблице ${have.join(', ') || '—'}`);
  }
  if (ct) {
    const cw = col(ct, /чем плох/i);
    for (const r of ct.rows) if (cw >= 0 && isEmptyCell(r.cells[cw])) add('PR-04', p.file, r.n, `строка #${r.cells[col(ct, '#')]} без «Чем плоха догадка»`);
  }
}

export function genGuessed(m, quiet = false) {
  const p = m.protocol;
  if (!p) usage('Нет brainstorming.md');
  const old = new Map();
  if (p.guessedT) {
    const ci = col(p.guessedT, '#');
    const cw = col(p.guessedT, /чем плох/i);
    for (const r of p.guessedT.rows) old.set((r.cells[ci] || '').trim(), cw >= 0 ? r.cells[cw] : '');
  }
  const cell = (s) => s.replace(/\|/g, '/');
  const rows = guessedRows(p).map((r) => `| ${r.id} | ${cell(r.rec)} | ${cell(r.dec)} | ${old.get(r.id) || ''} |`);
  const body = ['', '| # | Рекомендация агента | Решение человека | Чем плоха догадка |', '|---|---|---|---|', ...rows, ''].join('\n');
  let md;
  if (p.hasGuessed) md = replaceSection(p.md, /^Где агент/, 'Где агент угадал бы не так', body);
  else {
    const sc = scan(p.md);
    const post = sc.lines.find((l) => isH2(l) && /^Решения после/.test(l.h2));
    const ls = p.md.split('\n');
    const at = post ? post.n - 1 : ls.length;
    md = [...ls.slice(0, at), '## Где агент угадал бы не так', body, ...ls.slice(at)].join('\n');
  }
  fs.writeFileSync(p.file, md);
  const empty = guessedRows(p).filter((r) => isEmptyCell(old.get(r.id))).map((r) => r.id);
  const msg =
    `${rel(p.file)}: в «Где агент угадал бы не так» ${rows.length} строк (решение человека ≠ рекомендации).` +
    (empty.length ? ` Заполни «Чем плоха догадка» в строках: ${empty.join(', ')}.` : '');
  if (!quiet) console.log(msg);
  return msg;
}
