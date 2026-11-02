// Повторы по токенам (идея jscpd): имена и литералы нормализуются, импорты пропускаются, окно из min токенов,
// совпавшие соседние окна склеиваются в один фрагмент. Структурное сходство функций — у dryer в CI.
import { listMjs, source, parse, tokens, rel } from './lib.mjs';

const kind = (t) => {
  const label = t.type.label;
  if (label === 'name') return 'ID';
  if (['string', 'num', 'template', 'regexp'].includes(label)) return 'LIT';
  return t.type.keyword ?? label;
};

// Импорты не считаются: список «import { … } from '…'» похож у любых модулей и правкой кода не убирается.
function importRanges(src) {
  return parse(src).body.filter((n) => n.type === 'ImportDeclaration').map((n) => [n.start, n.end]);
}

function tokenStream(files) {
  const out = [];
  for (const file of files) {
    const src = source(file);
    const skip = importRanges(src);
    for (const t of tokens(src)) if (!skip.some(([a, b]) => t.start >= a && t.end <= b)) out.push({ file, line: t.loc.start.line, kind: kind(t) });
    out.push({ file, line: 0, kind: `EOF:${file}` });
  }
  return out;
}

function windowPairs(toks, min) {
  const seen = new Map();
  const pairs = [];
  for (let i = 0; i + min <= toks.length; i++) {
    if (toks[i].file !== toks[i + min - 1].file) continue;
    const key = toks.slice(i, i + min).map((t) => t.kind).join(' ');
    if (seen.has(key)) pairs.push([seen.get(key), i]);
    else seen.set(key, i);
  }
  return pairs;
}

function merge(pairs, min) {
  const out = [];
  for (const [a, b] of pairs.sort((x, y) => x[1] - y[1])) {
    const last = out.at(-1);
    const extends_ = last && b - last.b === 1 && a - last.a === 1;
    if (extends_) { Object.assign(last, { a, b, aEnd: a + min - 1, bEnd: b + min - 1 }); continue; }
    if (last && b <= last.bEnd && a >= last.aStart && a <= last.aEnd) continue;
    out.push({ aStart: a, a, aEnd: a + min - 1, bStart: b, b, bEnd: b + min - 1 });
  }
  return out;
}

export function clones(dir, min = 50) {
  const toks = tokenStream(listMjs(dir));
  const merged = merge(windowPairs(toks, min), min);
  const dup = new Set();
  for (const m of merged) for (let i = m.bStart; i <= m.bEnd; i++) dup.add(i);
  const at = (s, e) => `${rel(toks[s].file)}:${toks[s].line}-${toks[e].line}`;
  const list = merged
    .map((m) => ({ tokens: m.bEnd - m.bStart + 1, left: at(m.aStart, m.aEnd), right: at(m.bStart, m.bEnd) }))
    .sort((x, y) => y.tokens - x.tokens);
  return { minTokens: min, totalTokens: toks.length, duplicatedTokens: dup.size, percent: +((100 * dup.size) / toks.length).toFixed(2), clones: list };
}
