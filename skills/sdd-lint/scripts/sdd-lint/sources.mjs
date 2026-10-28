// «Из протокола:» — откуда пришло требование: разбор ссылок на протокол и их снятие.
import path from 'node:path';

import { setSection } from './md.mjs';

// Под блоком FR/NFR: «Из протокола: [4](brainstorming.md#L18), [П1](brainstorming.md#L47)».
// В «Вне scope», «Открытые вопросы», «Не про поведение» — в любой строке раздела.
// Ссылки на строку ставит gen links: модель пишет номера, скрипт держит #L актуальными.
export const SRC_RE = /из протокола:/iu;
export const SRC_REF_RE = /\[(П?\d+)\]\(([^)\s]*)\)|(?<![\p{L}\d#[])(П?\d+)(?![\p{L}\d\]])/gu;
const SRC_SECTIONS = [
  [/^Вне scope/, 'вне scope'],
  [/^Открытые вопросы/, 'открытый вопрос'],
  [/^Не про поведение/, 'не про поведение'],
];
const srcTail = (text) => text.slice(text.search(SRC_RE)).replace(SRC_RE, '');
export const srcRefs = (text) => [...srcTail(text).matchAll(SRC_REF_RE)].map((m) => ({ id: m[1] || m[3], href: m[1] ? m[2] : null }));
// Всё, что в spec ведёт в протокол: после close протокола нет, а документ остаётся чистым.
const PROTO_TAIL_RE = /\s*\(из протокола:(?:[^()]|\([^()]*\))*\)/giu;
export const hasProtocolTraces = (md) => /^Протокол:|из протокола:|^##\s+Не про поведение/imu.test(md || '');
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
export const protoHref = (spec, proto, row) => `${path.relative(path.dirname(spec), proto).split(path.sep).join('/')}#L${row.n}`;

// Строка прозы сразу под блоком кода (пустые строки между ними допустимы): блок → строка.
export function underBlocks(sc, re) {
  const out = new Map();
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

export function parseSources(sc, reqs) {
  const byBlock = new Map();
  for (const r of reqs.values()) byBlock.set(r.block, [...(byBlock.get(r.block) || []), r.id]);
  const out = [];
  let after = null; // блок кода, под которым ещё не было прозы
  for (const l of sc.lines) {
    if (l.inCode) {
      after = l.block;
      continue;
    }
    if (!l.text.trim()) continue;
    if (SRC_RE.test(l.text)) {
      const sec = SRC_SECTIONS.find(([re]) => l.h2 && re.test(l.h2));
      let target = null;
      if (after !== null && byBlock.has(after)) target = { kind: 'req', ids: byBlock.get(after) };
      else if (sec) target = { kind: sec[1] };
      out.push({ n: l.n, text: l.text, refs: srcRefs(l.text), target });
    }
    after = null;
  }
  return out;
}
