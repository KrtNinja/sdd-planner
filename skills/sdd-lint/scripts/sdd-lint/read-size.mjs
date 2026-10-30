// Объём spec, slice и README для чтения: видимые символы против READ_LIMIT.
import { add } from './findings.mjs';
import { stripProtocol } from './sources.mjs';

// Dev Spec, slice и README человек читает целиком; комфортно — до READ_LIMIT символов.
// Считается то, что видно в отрисованном markdown и останется после close: без пробелов,
// адресов ссылок, HTML-комментариев и тегов, разметки (```, #, **, `, |, строки-разделители
// таблиц) и следов протокола в spec. Текст внутри блоков кода (FR, AC) считается.
// Протокол и ревью — временные артефакты этапа, их не меряем.
const READ_LIMIT = 10000;
export function visibleLength(md) {
  let inCode = false;
  const out = [];
  for (const t of (md || '').replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
    if (/^\s*```/.test(t)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(t);
      continue;
    }
    if (/^\s*\[[^\]]+\]:\s*\S/.test(t)) continue; // [id]: url
    if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(t)) continue; // |---|---|
    out.push(
      t
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/<\/?[a-z][^>]*>/gi, '')
        .replace(/^\s{0,3}#{1,6}\s+/, '')
        .replace(/^\s*>\s?/, '')
        .replace(/\*\*|__|`|\|/g, ''),
    );
  }
  return out.join('').replace(/\s+/g, '').length;
}
const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
function readSize(rule, file, md) {
  const n = visibleLength(md);
  if (n > READ_LIMIT) add(rule, file, null, `${thousands(n)} символов при ориентире ${thousands(READ_LIMIT)} (без пробелов, ссылок и разметки)`);
}
export function checkReadSize(m) {
  if (m.spec) readSize('SP-23', m.spec.file, stripProtocol(m.spec.md));
  for (const sl of m.slices.values()) readSize('SL-30', sl.file, sl.md);
  if (m.readme != null) readSize('RM-05', m.readmeFile, m.readme);
}
