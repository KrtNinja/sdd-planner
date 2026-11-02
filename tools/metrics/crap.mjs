// CRAP по функциям — та же формула, что у unclebob/crapper: CRAP = CC² × (1 − cov)³ + CC.
// Локальная замена crapper (ему нужен Python + tree-sitter; в CI он идёт сам, см. ub-gate.mjs).
// CC: if, циклы, catch, ?:, case, &&, ||, ??, ?. — по функциям верхнего уровня вместе с вложенными
// колбэками, как crapper для JS. cov: доля непробельных символов функции, исполненных хотя бы в одном
// процессе тестов. Покрытие — сырое V8 из NODE_V8_COVERAGE по процессам тестовых файлов: объединение масок
// от порядка файлов не зависит. Дочерние процессы тестов (CLI, MCP) покрытие не пишут — см. tests/helpers.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as walk from 'acorn-walk';
import { listMjs, source, parse, rel } from './lib.mjs';

const DECISIONS = new Set(['IfStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement',
  'DoWhileStatement', 'CatchClause', 'ConditionalExpression', 'LogicalExpression']);

export function complexity(node) {
  let c = 1;
  walk.full(node, (n) => {
    if (DECISIONS.has(n.type) || (n.type === 'SwitchCase' && n.test) || n.optional) c++;
  });
  return c;
}

// Маска исполненных символов по файлу, объединённая по всем процессам.
export function coverageMasks(v8dir, root) {
  const masks = new Map();
  for (const f of fs.readdirSync(v8dir)) {
    for (const sc of JSON.parse(fs.readFileSync(path.join(v8dir, f), 'utf8')).result) {
      if (!sc.url.startsWith('file://')) continue;
      const file = fileURLToPath(sc.url);
      if (!file.startsWith(root + path.sep)) continue;
      const n = source(file).length;
      const mask = new Uint8Array(n);
      const fns = [...sc.functions].sort((a, b) => a.ranges[0].startOffset - b.ranges[0].startOffset || b.ranges[0].endOffset - a.ranges[0].endOffset);
      for (const fn of fns) for (const r of fn.ranges) mask.fill(r.count > 0 ? 1 : 0, r.startOffset, Math.min(r.endOffset, n));
      const acc = masks.get(file) ?? new Uint8Array(n);
      for (let i = 0; i < n; i++) acc[i] |= mask[i];
      masks.set(file, acc);
    }
  }
  return masks;
}

function topLevelFunctions(ast) {
  const out = [];
  for (let st of ast.body) {
    if (st.type.startsWith('Export')) st = st.declaration ?? st;
    if (st?.type === 'FunctionDeclaration') out.push({ name: st.id?.name ?? 'default', node: st });
    if (st?.type === 'VariableDeclaration') {
      for (const d of st.declarations) if (/Function|Arrow/.test(d.init?.type ?? '')) out.push({ name: d.id.name, node: d.init });
    }
    if (st?.type === 'ClassDeclaration') {
      for (const m of st.body.body) if (m.type === 'MethodDefinition') out.push({ name: `${st.id.name}.${m.key.name}`, node: m.value });
    }
    if (['ExpressionStatement', 'ForStatement', 'IfStatement'].includes(st?.type)) out.push({ name: `<top-level:${st.loc.start.line}>`, node: st });
  }
  return out;
}

function covered(src, mask, start, end) {
  let total = 0;
  let hit = 0;
  for (let i = start; i < end; i++) {
    if (/\s/.test(src[i])) continue;
    total++;
    if (mask?.[i]) hit++;
  }
  return { total, hit };
}

export function crap(codeDir, masks = null) {
  const entries = [];
  const files = [];
  for (const file of listMjs(codeDir)) {
    const src = source(file);
    const mask = masks?.get(file);
    const all = covered(src, mask, 0, src.length);
    files.push({ file: rel(file), coverage: masks ? +((100 * all.hit) / all.total).toFixed(1) : null });
    for (const { name, node } of topLevelFunctions(parse(src))) {
      const c = complexity(node);
      const { total, hit } = covered(src, mask, node.start, node.end);
      const cov = masks ? (total ? hit / total : 0) : null;
      entries.push({
        key: `${rel(file)}#${name}`, line: node.loc.start.line, lines: node.loc.end.line - node.loc.start.line + 1,
        complexity: c, coverage: cov === null ? null : +(100 * cov).toFixed(1), crap: cov === null ? null : +(c * c * (1 - cov) ** 3 + c).toFixed(1),
      });
    }
  }
  entries.sort((a, b) => (b.crap ?? b.complexity) - (a.crap ?? a.complexity));
  return { functions: entries.length, entries, files };
}
