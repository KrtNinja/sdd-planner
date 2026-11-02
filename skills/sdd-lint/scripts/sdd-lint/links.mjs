// Ссылки на FR/NFR в «Основание:», «Проверяет:» и README: разбор, построение, устаревшие (SL-*).
// @ts-check
import path from 'node:path';

import { collect } from './findings.mjs';

/** @typedef {import('./model.mjs').Spec} Spec */
/** @typedef {import('./model.mjs').Req} Req */
/** @typedef {string | null | undefined} Text */

const REQ_REF_RE = /\[(N?FR-\d+)\]\(([^)\s]*)\)|(?<![\p{L}\d[-])(N?FR-\d+)(?![\d\]])/gu;
export const CHECKS_RE = /^\s*Проверяет:/u;
/** @param {Text} text @returns {{ id: string, href: string | null }[]} */
export const reqRefs = (text) => [...(text || '').matchAll(REQ_REF_RE)].map((m) => ({ id: m[1] || m[3], href: m[1] ? m[2] : null }));
/** @param {string} from @param {string} spec @param {Req} req */
const specHref = (from, spec, req) => `${path.relative(path.dirname(from), spec).split(path.sep).join('/')}#L${req.n}`;
/** @param {string} text @param {string} from @param {Spec} spec */
export const linkReqs = (text, from, spec) =>
  text.replace(REQ_REF_RE, (all, a, _h, b) => {
    const r = spec.reqs.get(a || b);
    return r ? `[${r.id}](${specHref(from, spec.file, r)})` : all;
  });

// «Основание:» — FR простым текстом и одна ссылка на spec.md в конце: десять ссылок подряд не читаются.
export const BASIS_LINK_RE = /\s*\(\[Dev Spec\]\(([^)\s]*)\)\)\s*$/u;
/** @param {string} from @param {string} spec */
export const specFileHref = (from, spec) => path.relative(path.dirname(from), spec).split(path.sep).join('/');
/** @param {Text} text */
export const basisPlain = (text) => (text || '').replace(BASIS_LINK_RE, '').replace(REQ_REF_RE, (all, a, _h, b) => a || b).trim();
/** @param {string} line @param {string} from @param {string} specFile */
export const linkBasis = (line, from, specFile) =>
  line.replace(/^(Основание:\s*)(.*)$/u, (_, kw, rest) => `${kw}${basisPlain(rest)} ([Dev Spec](${specFileHref(from, specFile)}))`);

// FR без ссылки или со ссылкой не на ту строку spec.md → SL-28.
/** @param {string} file @param {number | null} n @param {Text} text @param {Spec} spec */
export function staleReqLinks(file, n, text, spec) {
  const { found, add } = collect();
  /** @type {string[]} */
  const plain = [];
  /** @type {string[]} */
  const stale = [];
  for (const r of reqRefs(text)) {
    const req = spec.reqs.get(r.id);
    if (!req) continue; // несуществующий FR ловят SL-12 / SL-17
    if (!r.href) plain.push(r.id);
    else if (r.href !== specHref(file, spec.file, req)) stale.push(r.id);
  }
  if (plain.length) add('SL-28', file, n, `не ссылки: ${plain.join(', ')}`);
  if (stale.length) add('SL-28', file, n, `ссылки ведут не на ту строку spec.md: ${stale.join(', ')}`);
  return found;
}
