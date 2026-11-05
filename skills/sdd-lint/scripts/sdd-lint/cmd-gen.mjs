// Команды gen, next и trace.
// @ts-check
import { scenarioTrace } from './scenario-view.mjs';
import { requireIdleMove } from './scenario-store.mjs';
import { cmdFlowNext } from './cmd-flow.mjs';
import { usage } from './cli.mjs';
import { lintCode } from './config.mjs';
import { impact } from './gate-extra.mjs';
import { loadFeature } from './feature.mjs';
import { genLinks } from './gen-links.mjs';
import { rel, uniq } from './md.mjs';
import { choiceOf, pickChoice, needDir } from './pick.mjs';
import { genReadme } from './readme.mjs';
import { genSlices } from './scaffold.mjs';
import { codePaths } from './screen.mjs';

/** @typedef {import('./io.mjs').Ctx} Ctx */

// Протокол → куда ушла каждая строка: для ревью смысла трассировки.
/** @param {Ctx} ctx */
export function cmdTrace(ctx) {
  const { pos } = ctx.args;
  const m = loadFeature(needDir(ctx, pos[0]));
  if (m.flow.state && pos.length > 1) {
    const text = scenarioTrace(m, pos.slice(1));
    ctx.io.log(ctx.args.flags.json ? JSON.stringify({ text }) : text);
    ctx.io.exit(0);
  }
  // trace <фича> FR-3 AC-002-B1: что держится на требовании — без поиска моделью по файлам.
  const ids = pos.slice(1).filter((x) => /^(N?FR-\d+|AC-\d{3}-[BF]?\d+|SC-\d+(?:-S\d+)?)$/.test(x));
  if (ids.length) {
    ctx.io.log(impact(m, ids.filter((id) => !id.startsWith('SC-'))));
    ctx.io.exit(0);
  }
  const s = m.spec;
  const p = m.protocol;
  if (!s || !p) usage(ctx, 'Нужны brainstorming.md и spec.md');
  if (s.oldTraceLine) {
    ctx.io.log(`В ${rel(s.file)} старый раздел «Трассировка»: ${lintCode('fix', pos[0])}`);
    ctx.io.exit(1);
  }
  const where = sourceIndex(s);
  traceRows(ctx, p, where);
}

// Куда ушла строка протокола: требования блока со своими строками, раздел или «?» — непонятно куда.
/** @param {import('./model.mjs').Spec} s @param {import('./model.mjs').SourceLine} src */
function sourceLabel(s, src) {
  if (!src.target) return `? ${rel(s.file)}:${src.n}`;
  if (src.target.kind !== 'req') return `${src.target.kind} ${rel(s.file)}:${src.n}`;
  return src.target.ids.map((id) => `${id} ${rel(s.file)}:${/** @type {import('./model.mjs').Req} */ (s.reqs.get(id)).n}`).join(', ');
}

/** @param {Ctx} ctx */
export function cmdGen(ctx) {
  const what = choiceOf(ctx, 'gen');
  const m = loadFeature(needDir(ctx, ctx.args.pos[1], 1));
  requireIdleMove(m.dir);
  if (what === 'slices') genSlices(ctx, m);
  else if (what === 'readme') genReadme(ctx, m);
  else genLinks(ctx, m);
}

/** @param {Ctx} ctx */
export function cmdNext(ctx) {
  if (!cmdFlowNext(ctx)) legacyNext(ctx);
}

/** @param {Ctx} ctx */
function legacyNext(ctx) {
  const { pos } = ctx.args;
  const kind = (pos[0] || '').toLowerCase();
  if (!['fr', 'nfr', 'ac', 'slice', 'adr'].includes(kind)) pickChoice(ctx, 'next');
  const m = loadFeature(needDir(ctx, pos[1], 1));
  if (kind === 'fr' || kind === 'nfr') {
    nextRequirement(ctx, m, kind);
  } else if (kind === 'ac') {
    nextAc(ctx, m);
  } else if (kind === 'slice') {
    ctx.io.log(String(max([...m.slices.keys()].map(Number)) + 1).padStart(3, '0'));
  } else if (kind === 'adr') {
    ctx.io.log(String(max(m.adrs.map((a) => Number(a.num))) + 1).padStart(4, '0'));
  } else usage(ctx, 'next FR | NFR | AC | slice | adr');
}

// Индекс назначения строк протокола в порядке источников spec.
/** @param {import('./model.mjs').Spec} s */
function sourceIndex(s) {
  /** @type {Map<string, string[]>} */
  const where = new Map();
  for (const src of s.sources) {
    const label = sourceLabel(s, src);
    for (const r of src.refs) where.set(r.id, [...(where.get(r.id) || []), label]);
  }
  return where;
}

/** @param {Ctx} ctx @param {import('./model.mjs').Protocol} p @param {Map<string, string[]>} where */
function traceRows(ctx, p, where) {
  const short = (/** @type {string} */ x) => (x.length > 60 ? `${x.slice(0, 57)}…` : x);
  let lost = 0;
  for (const r of [...p.rows, ...p.post]) {
    const to = where.get(r.id);
    if (!to) lost += 1;
    ctx.io.log(`- **#${r.id}** \`${rel(p.file)}:${r.n}\` ${short(r.dec || '—')} → ${to ? codePaths(uniq(to).join('; ')) : '**НИКУДА**'}`);
  }
  ctx.io.exit(lost ? 1 : 0);
}

/** @param {number[]} arr */
const max = (arr) => arr.reduce((a, b) => Math.max(a, b), 0);

/** @param {Ctx} ctx @param {import('./model.mjs').Feature} m @param {string} kind */
function nextRequirement(ctx, m, kind) {
  const pre = kind.toUpperCase();
  const n = max([...(m.spec?.reqs.keys() || [])].filter((id) => id.startsWith(`${pre}-`)).map((id) => Number(id.split('-')[1])));
  ctx.io.log(`${pre}-${n + 1}`);
}

/** @param {Ctx} ctx @param {import('./model.mjs').Feature} m */
function nextAc(ctx, m) {
  const { pos } = ctx.args;
  const num = pos[2];
  if (!/^\d{3}$/.test(num || '')) usage(ctx, 'next AC docs/<feature> <NNN> [B|F]');
  const side = (pos[3] || '').toUpperCase().replace(/[^BF]/g, '');
  const all = [...m.slices.values()].flatMap((s) => s.acs).filter((a) => a.acNum === num && a.side === side);
  ctx.io.log(`AC-${num}-${side}${max(all.map((a) => a.k)) + 1}`);
}
