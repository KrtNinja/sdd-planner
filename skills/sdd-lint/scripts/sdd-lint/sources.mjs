// «Из протокола:» — откуда пришло требование: разбор ссылок на протокол и их снятие.
// @ts-check
import path from 'node:path';

import { setSection } from './md.mjs';

/** @typedef {import('./model.mjs').Scan} Scan */
/** @typedef {import('./model.mjs').Req} Req */
/** @typedef {import('./model.mjs').SourceLine} SourceLine */
/** @typedef {import('./model.mjs').ChecksLine} ChecksLine */

// Под блоком FR/NFR: «Из протокола: [4](brainstorming.md#L18), [П1](brainstorming.md#L34)».
// В «Вне scope», «Открытые вопросы», «Не про поведение» — в любой строке раздела.
// Ссылки на строку ставит gen links: модель пишет номера, скрипт держит #L актуальными.
export const SRC_RE = /из протокола:/iu;
export const SRC_REF_RE = /\[(П?\d+)\]\(([^)\s]*)\)|(?<![\p{L}\d#[])(П?\d+)(?![\p{L}\d\]])/gu;
/** @type {[RegExp, string][]} */
const SRC_SECTIONS = [
  [/^Вне scope/, 'вне scope'],
  [/^Открытые вопросы/, 'открытый вопрос'],
  [/^Не про поведение/, 'не про поведение'],
];
/** @param {string} text */
const srcTail = (text) => text.slice(text.search(SRC_RE)).replace(SRC_RE, '');
/** @param {string} text @returns {import('./model.mjs').SourceRef[]} */
export const srcRefs = (text) => [...srcTail(text).matchAll(SRC_REF_RE)].map((m) => ({ id: m[1] || m[3], href: m[1] ? m[2] : null }));
// Всё, что в spec ведёт в протокол: после close протокола нет, а документ остаётся чистым.
const PROTO_TAIL_RE = /\s*\(из протокола:(?:[^()]|\([^()]*\))*\)/giu;
/** @param {string | null | undefined} md */
export const hasProtocolTraces = (md) => /^Протокол:|из протокола:|^##\s+Не про поведение/imu.test(md || '');
/** @param {string | null | undefined} md */
export function stripProtocol(md) {
  let out = (md || '')
    .split('\n')
    .filter((t) => !/^Протокол:/.test(t) && !/^\s*Из протокола:/iu.test(t))
    .map((t) => t.replace(PROTO_TAIL_RE, ''))
    .join('\n')
    .replace(/<!--[\s\S]*?-->\n?/g, (c) => (/протокол/i.test(c) ? '' : c));
  if (/^##\s+Не про поведение/m.test(out)) out = setSection(out, /^Не про поведение/, null, '');
  return out.replace(/\n{3,}/g, '\n\n');
}
/** @param {string} spec @param {string} proto @param {{ n: number }} row */
export const protoHref = (spec, proto, row) => `${path.relative(path.dirname(spec), proto).split(path.sep).join('/')}#L${row.n}`;

// Строка прозы сразу под блоком кода (пустые строки между ними допустимы): блок → строка.
/** @param {Scan} sc @param {RegExp} re */
export function underBlocks(sc, re) {
  /** @type {Map<number, ChecksLine>} */
  const out = new Map();
  /** @type {number | null} */
  let after = null;
  for (const l of sc.lines) {
    if (l.inCode) {
      after = l.block;
      continue;
    }
    if (!l.text.trim()) continue;
    if (after !== null && re.test(l.text)) out.set(after, { n: l.n, text: l.text });
    after = null;
  }
  return out;
}

/** @param {Scan} sc @param {Map<string, Req>} reqs @returns {SourceLine[]} */
export function parseSources(sc, reqs) {
  /** @type {Map<number, string[]>} */
  const byBlock = new Map();
  for (const r of reqs.values()) byBlock.set(r.block, [...(byBlock.get(r.block) || []), r.id]);
  /** @type {SourceLine[]} */
  const out = [];
  /** @type {number | null} */
  let after = null; // блок кода, под которым ещё не было прозы
  for (const l of sc.lines) {
    if (l.inCode) {
      after = l.block;
      continue;
    }
    if (!l.text.trim()) continue;
    if (SRC_RE.test(l.text)) {
      const sec = SRC_SECTIONS.find(([re]) => l.h2 && re.test(l.h2));
      /** @type {SourceLine['target']} */
      let target = null;
      const ids = after !== null ? byBlock.get(after) : undefined;
      if (ids) target = { kind: 'req', ids };
      else if (sec) target = { kind: sec[1] };
      out.push({ n: l.n, text: l.text, refs: srcRefs(l.text), target });
    }
    after = null;
  }
  return out;
}
