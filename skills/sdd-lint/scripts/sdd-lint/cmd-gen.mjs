// Команды gen, next и trace.
import { pos } from './args.mjs';
import { usage } from './cli.mjs';
import { lintCmd } from './config.mjs';
import { impact } from './gate-extra.mjs';
import { loadFeature } from './feature.mjs';
import { genLinks } from './gen-links.mjs';
import { rel, uniq } from './md.mjs';
import { pickChoice, needDir } from './pick.mjs';
import { genReadme } from './readme.mjs';
import { genSlices } from './scaffold.mjs';

// Протокол → куда ушла каждая строка: для ревью смысла трассировки.
export function cmdTrace() {
  const m = loadFeature(needDir(pos[0]));
  // trace <фича> FR-3 AC-002-B1: что держится на требовании — без поиска моделью по файлам.
  const ids = pos.slice(1).filter((x) => /^(N?FR-\d+|AC-\d{3}-[BF]?\d+)$/.test(x));
  if (ids.length) {
    console.log(impact(m, ids));
    process.exit(0);
  }
  const s = m.spec;
  const p = m.protocol;
  if (!s || !p) usage('Нужны brainstorming.md и spec.md');
  if (s.oldTraceLine) {
    console.log(`В ${rel(s.file)} старый раздел «Трассировка»: ${lintCmd('fix', pos[0])}`);
    process.exit(1);
  }
  const where = new Map();
  for (const src of s.sources) {
    const label = !src.target
      ? `? ${rel(s.file)}:${src.n}`
      : src.target.kind === 'req'
        ? src.target.ids.map((id) => `${id} ${rel(s.file)}:${s.reqs.get(id).n}`).join(', ')
        : `${src.target.kind} ${rel(s.file)}:${src.n}`;
    for (const r of src.refs) where.set(r.id, [...(where.get(r.id) || []), label]);
  }
  const short = (x) => (x.length > 60 ? `${x.slice(0, 57)}…` : x);
  let lost = 0;
  for (const r of [...p.rows, ...p.post]) {
    const to = where.get(r.id);
    if (!to) lost += 1;
    console.log(`${`#${r.id}`.padEnd(5)} ${rel(p.file)}:${r.n}  ${short(r.dec || '—')}`);
    console.log(`      → ${to ? uniq(to).join('; ') : 'НИКУДА'}`);
  }
  process.exit(lost ? 1 : 0);
}

export function cmdGen() {
  const what = pos[0];
  if (!['readme', 'links', 'slices'].includes(what)) pickChoice('gen');
  const m = loadFeature(needDir(pos[1], 1));
  if (what === 'slices') genSlices(m);
  else if (what === 'readme') genReadme(m);
  else genLinks(m);
}

export function cmdNext() {
  const kind = (pos[0] || '').toLowerCase();
  if (!['fr', 'nfr', 'ac', 'slice', 'adr'].includes(kind)) pickChoice('next');
  const m = loadFeature(needDir(pos[1], 1));
  const max = (arr) => arr.reduce((a, b) => Math.max(a, b), 0);
  if (kind === 'fr' || kind === 'nfr') {
    const pre = kind.toUpperCase();
    const n = max([...(m.spec?.reqs.keys() || [])].filter((id) => id.startsWith(`${pre}-`)).map((id) => Number(id.split('-')[1])));
    console.log(`${pre}-${n + 1}`);
  } else if (kind === 'ac') {
    const num = pos[2];
    if (!/^\d{3}$/.test(num || '')) usage('next AC docs/<feature> <NNN> [B|F]');
    const side = (pos[3] || '').toUpperCase().replace(/[^BF]/g, '');
    const all = [...m.slices.values()].flatMap((s) => s.acs).filter((a) => a.acNum === num && a.side === side);
    console.log(`AC-${num}-${side}${max(all.map((a) => a.k)) + 1}`);
  } else if (kind === 'slice') {
    console.log(String(max([...m.slices.keys()].map(Number)) + 1).padStart(3, '0'));
  } else if (kind === 'adr') {
    console.log(String(max(m.adrs.map((a) => Number(a.num))) + 1).padStart(4, '0'));
  } else usage('next FR | NFR | AC | slice | adr');
}
