// Протокол brainstorming: разбор, проверки PR-*.
import { add } from './findings.mjs';
import { isEmptyCell, scan, inSection, header, tables, col } from './md.mjs';

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
  return { file, md, sc, status: header(md, 'Статус'), rows, post, outScope };
}

export function checkProtocol(m) {
  const p = m.protocol;
  if (!p) return;
  if (!p.status) add('PR-01', p.file, 1, 'нет строки «Статус:»');
  p.rows.forEach((r, k) => {
    if (r.id !== String(k + 1)) add('PR-02', p.file, r.n, `строка ${k + 1} таблицы «Решения» имеет номер «${r.id}», ожидался ${k + 1}`);
  });
  if (!/готов/i.test(p.status || '')) return;
  for (const r of p.rows) if (isEmptyCell(r.dec)) add('PR-03', p.file, r.n, `статус «готов», а у строки #${r.id} нет решения`);
}
