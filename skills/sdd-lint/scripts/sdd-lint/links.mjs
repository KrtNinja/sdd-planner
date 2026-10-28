// Ссылки на FR/NFR в «Основание:», «Проверяет:» и README: разбор, построение, устаревшие (SL-*).
import path from 'node:path';

import { add } from './findings.mjs';

const REQ_REF_RE = /\[(N?FR-\d+)\]\(([^)\s]*)\)|(?<![\p{L}\d[-])(N?FR-\d+)(?![\d\]])/gu;
export const CHECKS_RE = /^\s*Проверяет:/u;
export const reqRefs = (text) => [...(text || '').matchAll(REQ_REF_RE)].map((m) => ({ id: m[1] || m[3], href: m[1] ? m[2] : null }));
const specHref = (from, spec, req) => `${path.relative(path.dirname(from), spec).split(path.sep).join('/')}#L${req.n}`;
export const linkReqs = (text, from, spec) =>
  text.replace(REQ_REF_RE, (all, a, _h, b) => {
    const r = spec.reqs.get(a || b);
    return r ? `[${r.id}](${specHref(from, spec.file, r)})` : all;
  });

// «Основание:» — FR простым текстом и одна ссылка на spec.md в конце: десять ссылок подряд не читаются.
export const BASIS_LINK_RE = /\s*\(\[Dev Spec\]\(([^)\s]*)\)\)\s*$/u;
export const specFileHref = (from, spec) => path.relative(path.dirname(from), spec).split(path.sep).join('/');
export const basisPlain = (text) => (text || '').replace(BASIS_LINK_RE, '').replace(REQ_REF_RE, (all, a, _h, b) => a || b).trim();
export const linkBasis = (line, from, specFile) =>
  line.replace(/^(Основание:\s*)(.*)$/u, (_, kw, rest) => `${kw}${basisPlain(rest)} ([Dev Spec](${specFileHref(from, specFile)}))`);

// FR без ссылки или со ссылкой не на ту строку spec.md → SL-28.
export function staleReqLinks(file, n, text, spec) {
  const plain = [];
  const stale = [];
  for (const r of reqRefs(text)) {
    const req = spec.reqs.get(r.id);
    if (!req) continue; // несуществующий FR ловят SL-12 / SL-17
    if (!r.href) plain.push(r.id);
    else if (r.href !== specHref(file, spec.file, req)) stale.push(r.id);
  }
  if (plain.length) add('SL-28', file, n, `не ссылки: ${plain.join(', ')}`);
  if (stale.length) add('SL-28', file, n, `ссылки ведут не на ту строку spec.md: ${stale.join(', ')}`);
}
