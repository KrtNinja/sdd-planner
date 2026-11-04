// Ранние основания ADR нового процесса: только реальные ID из контекста.
// @ts-check
import { sectionText } from './md.mjs';

/** @param {import('./model.mjs').Adr} adr */
export function adrBasis(adr) {
  return sectionText(adr.sc, /^Контекст/).match(/\b(?:N?FR-[1-9]\d*|SC-[1-9]\d*(?:-S[1-9]\d*)?)\b/g) || [];
}
