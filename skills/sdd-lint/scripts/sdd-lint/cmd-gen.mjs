// Команды gen, next и trace.
import { usage } from './cli.mjs';
import { lintCode } from './config.mjs';
import { impact } from './gate-extra.mjs';
import { loadFeature } from './feature.mjs';
import { genLinks } from './gen-links.mjs';
import { rel, uniq } from './md.mjs';
import { pickChoice, needDir } from './pick.mjs';
import { genReadme } from './readme.mjs';
import { genSlices } from './scaffold.mjs';
import { codePaths } from './screen.mjs';

// Протокол → куда ушла каждая строка: для ревью смысла трассировки.
export function cmdTrace(ctx) {
  const { pos } = ctx.args;
  const m = loadFeature(needDir(ctx, pos[0]));
  // trace <фича> FR-3 AC-002-B1: что держится на требовании — без поиска моделью по файлам.
  const ids = pos.slice(1).filter((x) => /^(N?FR-\d+|AC-\d{3}-[BF]?\d+)$/.test(x));
  if (ids.length) {
    ctx.io.log(impact(m, ids));
    ctx.io.exit(0);
  }
  const s = m.spec;
  const p = m.protocol;
  if (!s || !p) usage(ctx, 'Нужны brainstorming.md и spec.md');
  if (s.oldTraceLine) {
    ctx.io.log(`В ${rel(s.file)} старый раздел «Трассировка»: ${lintCode('fix', pos[0])}`);
    ctx.io.exit(1);
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
    ctx.io.log(`- **#${r.id}** \`${rel(p.file)}:${r.n}\` ${short(r.dec || '—')} → ${to ? codePaths(uniq(to).join('; ')) : '**НИКУДА**'}`);
  }
  ctx.io.exit(lost ? 1 : 0);
}

export function cmdGen(ctx) {
  const { pos } = ctx.args;
  const what = pos[0];
  if (!['readme', 'links', 'slices'].includes(what)) pickChoice(ctx, 'gen');
  const m = loadFeature(needDir(ctx, pos[1], 1));
  if (what === 'slices') genSlices(ctx, m);
  else if (what === 'readme') genReadme(ctx, m);
  else genLinks(ctx, m);
}

export function cmdNext(ctx) {
  const { pos } = ctx.args;
  const kind = (pos[0] || '').toLowerCase();
  if (!['fr', 'nfr', 'ac', 'slice', 'adr'].includes(kind)) pickChoice(ctx, 'next');
  const m = loadFeature(needDir(ctx, pos[1], 1));
  const max = (arr) => arr.reduce((a, b) => Math.max(a, b), 0);
  if (kind === 'fr' || kind === 'nfr') {
    const pre = kind.toUpperCase();
    const n = max([...(m.spec?.reqs.keys() || [])].filter((id) => id.startsWith(`${pre}-`)).map((id) => Number(id.split('-')[1])));
    ctx.io.log(`${pre}-${n + 1}`);
  } else if (kind === 'ac') {
    const num = pos[2];
    if (!/^\d{3}$/.test(num || '')) usage(ctx, 'next AC docs/<feature> <NNN> [B|F]');
    const side = (pos[3] || '').toUpperCase().replace(/[^BF]/g, '');
    const all = [...m.slices.values()].flatMap((s) => s.acs).filter((a) => a.acNum === num && a.side === side);
    ctx.io.log(`AC-${num}-${side}${max(all.map((a) => a.k)) + 1}`);
  } else if (kind === 'slice') {
    ctx.io.log(String(max([...m.slices.keys()].map(Number)) + 1).padStart(3, '0'));
  } else if (kind === 'adr') {
    ctx.io.log(String(max(m.adrs.map((a) => Number(a.num))) + 1).padStart(4, '0'));
  } else usage(ctx, 'next FR | NFR | AC | slice | adr');
}
