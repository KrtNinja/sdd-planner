// Граф импортов: fan-in, fan-out, нестабильность, глубина, циклы (Тарьян), экспорты без внешних потребителей.
import path from 'node:path';
import { listMjs, source, parse, rel } from './lib.mjs';

function readModule(file) {
  const ast = parse(source(file));
  const imports = new Set();
  const named = [];
  const exports = new Set();
  for (const n of ast.body) {
    if (n.type === 'ImportDeclaration' && n.source.value.startsWith('.')) {
      const target = path.resolve(path.dirname(file), n.source.value);
      imports.add(target);
      for (const sp of n.specifiers) named.push(`${target}#${sp.imported?.name ?? 'default'}`);
    }
    if (n.type === 'ExportNamedDeclaration') {
      if (n.declaration?.id) exports.add(n.declaration.id.name);
      for (const d of n.declaration?.declarations ?? []) exports.add(d.id.name);
      for (const sp of n.specifiers ?? []) exports.add(sp.exported.name);
    }
  }
  return { imports: [...imports], named, exports };
}

function cycles(files, mods) {
  let next = 0;
  const index = {}; const low = {}; const stack = []; const onStack = new Set(); const found = [];
  const visit = (v) => {
    index[v] = low[v] = next++;
    stack.push(v); onStack.add(v);
    for (const w of mods[v].imports.filter((t) => mods[t])) {
      if (index[w] === undefined) { visit(w); low[v] = Math.min(low[v], low[w]); }
      else if (onStack.has(w)) low[v] = Math.min(low[v], index[w]);
    }
    if (low[v] !== index[v]) return;
    const scc = [];
    let w;
    do { w = stack.pop(); onStack.delete(w); scc.push(rel(w)); } while (w !== v);
    if (scc.length > 1) found.push(scc);
  };
  for (const f of files) if (index[f] === undefined) visit(f);
  return found;
}

export function deps(codeDir, testDir) {
  const files = listMjs(codeDir);
  const mods = Object.fromEntries(files.map((f) => [f, readModule(f)]));
  const used = new Set(Object.values(mods).flatMap((m) => m.named));
  for (const t of listMjs(testDir)) for (const n of readModule(t).named) used.add(n);
  const fanIn = Object.fromEntries(files.map((f) => [f, 0]));
  for (const f of files) for (const t of mods[f].imports) if (t in fanIn) fanIn[t]++;
  const memo = {};
  const depth = (f) => (memo[f] ??= 1 + Math.max(0, ...mods[f].imports.filter((t) => mods[t]).map(depth)));
  const table = files.map((f) => {
    const fanOut = mods[f].imports.filter((t) => mods[t]).length;
    const total = fanOut + fanIn[f];
    return { module: rel(f), fanIn: fanIn[f], fanOut, instability: total ? +(fanOut / total).toFixed(2) : 0, depth: depth(f) };
  });
  const unusedExports = files.flatMap((f) => [...mods[f].exports].filter((e) => !used.has(`${f}#${e}`)).map((e) => `${rel(f)}#${e}`));
  return { modules: files.length, edges: table.reduce((s, r) => s + r.fanOut, 0), cycles: cycles(files, mods), unusedExports, table };
}
