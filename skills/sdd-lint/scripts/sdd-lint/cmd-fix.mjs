// Команда fix: номера вместо FR-? и AC-NNN-?, ссылки, README, затем проверки и diff.
// @ts-check
import fs from 'node:fs';
import path from 'node:path';

import { ownApprovals, approveCmd } from './approval.mjs';
import { reportFeature } from './cmd-check.mjs';
import { diffChecks } from './cmd-diff.mjs';
import { skillCode } from './config.mjs';
import { loadFeature, featureFiles, runChecks } from './feature.mjs';
import { linkSpec, linkSlice } from './gen-links.mjs';
import { gitInfo } from './git.mjs';
import { fixIdTypos } from './ids.mjs';
import { read, rel, uniq } from './md.mjs';
import { needDir } from './pick.mjs';
import { genReadme } from './readme.mjs';
import { saveSnapshot } from './snapshot.mjs';
import { moveLegacy } from './work.mjs';
import { hasProtocolTraces } from './sources.mjs';

/** @typedef {import('./io.mjs').Ctx} Ctx */
/** @typedef {import('./model.mjs').Feature} Feature */
/** @typedef {import('./model.mjs').Finding} Finding */

// Модель пишет «FR-?» и «AC-003-B?», номера строк не считает, README и ссылки не трогает:
// всё это скрипт делает здесь, затем проверяет фичу и сверяет её с git.
const PH_REQ = /^(\s*)(N?FR)-\?(?=\s|$)/;
const PH_AC = /^(\s*)AC-(?:\d{3}-)?([BF]?)\?(?=\s|$)/;
/** @param {import('./model.mjs').CodeBlock} b */
const firstLine = (b) => b.lines.find((l) => l.text.trim());
/** @param {number[]} arr */
const maxNum = (arr) => arr.reduce((a, b) => Math.max(a, b), 0);
/** @param {Feature} m */
function numberPlaceholders(m) {
  /** @type {string[]} */
  const done = [];
  if (m.spec) {
    const ids = [...m.spec.reqs.keys()];
    /** @type {Record<string, number>} */
    const last = {
      FR: maxNum(ids.filter((x) => x.startsWith('FR-')).map((x) => Number(x.slice(3)))),
      NFR: maxNum(ids.filter((x) => x.startsWith('NFR-')).map((x) => Number(x.slice(4)))),
    };
    const ls = m.spec.md.split('\n');
    for (const b of m.spec.sc.blocks) {
      const l = firstLine(b);
      const mm = l && l.text.match(PH_REQ);
      if (!mm) continue;
      const id = `${mm[2]}-${(last[mm[2]] += 1)}`;
      ls[l.n - 1] = l.text.replace(PH_REQ, `$1${id}`);
      done.push(`${rel(m.spec.file)}:${l.n}  ${mm[2]}-? → ${id}`);
    }
    if (done.length) fs.writeFileSync(m.spec.file, ls.join('\n'));
  }
  /** @type {{ acNum: string, side: string, k: number }[]} */
  const all = [...m.slices.values()].flatMap((s) => s.acs);
  for (const sl of m.slices.values()) {
    const ls = sl.md.split('\n');
    let changed = false;
    for (const b of sl.sc.blocks) {
      const l = firstLine(b);
      const mm = l && l.text.match(PH_AC);
      if (!mm) continue;
      const side = mm[2].toUpperCase();
      const k = maxNum(all.filter((a) => a.acNum === sl.num && a.side === side).map((a) => a.k)) + 1;
      const id = `AC-${sl.num}-${side}${k}`;
      all.push({ acNum: sl.num, side, k });
      ls[l.n - 1] = l.text.replace(PH_AC, `$1${id}`);
      done.push(`${rel(sl.file)}:${l.n}  ${l.text.trim().split(/\s/)[0]} → ${id}`);
      changed = true;
    }
    if (changed) fs.writeFileSync(sl.file, ls.join('\n'));
  }
  return done;
}
// Вся механика fix: кириллица в ID, номера, ссылки, README, сброс одобрения правленого; затем проверки
// и сверка с git. Находки — в findings результата: их печатают fix и done.
/**
 * @param {Ctx} ctx @param {string} dir @param {{ snapshot?: boolean }} [opts]
 * @returns {{ m: Feature, changed: string[], notes: string[], findings: Finding[] }}
 */
export function fixFeature(ctx, dir, { snapshot = false } = {}) {
  const files = (/** @type {Feature} */ m) => uniq([...featureFiles(m), m.readmeFile, m.planFile].map((f) => path.resolve(f)));
  let m = loadFeature(dir);
  /** @type {string[]} */
  const notes = [];
  // Старые review/ и slices/plan.md — в _work/ до всего остального: дальше fix работает уже с новыми путями.
  const moved = moveLegacy(m);
  if (moved.length) notes.push(`Временные артефакты перенесены в ${rel(m.workDir)}/: ${moved.join('; ')}`);
  m = loadFeature(dir);
  const before = new Map(files(m).map((f) => [f, read(f)]));
  /** @type {Map<string, string[]>} */
  const detail = new Map();
  // Что поправлено в файле — для строки «Скрипт поправил»; зовут, когда detail.has(f).
  const detailOf = (/** @type {string} */ f) => /** @type {string[]} */ (detail.get(f)).join(', ');
  const note = (/** @type {string} */ file, /** @type {string} */ text) => detail.set(path.resolve(file), [...(detail.get(path.resolve(file)) || []), text]);
  // Кириллица в ID — до нумерации: «AC-002-В?» станет заготовкой, которую fix пронумерует.
  for (const file of [...[...m.slices.values()].map((s) => s.file), m.readmeFile, m.planFile]) {
    const md = read(file);
    if (md == null) continue;
    const r = fixIdTypos(md);
    if (!r.typos.length) continue;
    fs.writeFileSync(file, r.md);
    for (const t of r.typos) note(file, `${t.from} → ${t.to}`);
  }
  m = loadFeature(dir);
  for (const x of numberPlaceholders(m)) note(x.split(':')[0], x.split(/:\d+\s+/)[1]);
  m = loadFeature(dir);
  // Порядок — сверху вниз: spec ссылается на строки протокола, slices — на строки spec.
  // Ссылки на протокол: без протокола их убирает только close (/sdd-close) — fix их не трогает.
  if (m.spec && m.protocol) linkSpec(/** @type {import('./gen-links.mjs').SpecFeature} */ (m));
  else if (m.spec && hasProtocolTraces(m.spec.md))
    notes.push(`${rel(m.protocolFile)} нет, а spec ссылается на протокол: ссылки не тронуты. Если фича закрывается — ${skillCode('sdd-close', m.name)}`);
  m = loadFeature(dir);
  if (m.spec) for (const sl of m.slices.values()) linkSlice(sl, m.spec);
  m = loadFeature(dir);
  if (m.slices.size) genReadme(ctx, m, true);
  // Одобрение давалось прошлой версии — статус «на ревью», одобрять заново человеку.
  m = loadFeature(dir);
  for (const x of ownApprovals(m).filter((a) => a.state === 'changed')) {
    fs.writeFileSync(x.file, fs.readFileSync(x.file, 'utf8').replace(/^Статус:.*$/m, 'Статус: на ревью'));
    notes.push(`${rel(x.file)}: менялся после одобрения («${x.raw}») — статус «на ревью». Одобрить заново: ${approveCmd(m, x)}`);
  }

  m = loadFeature(dir);
  const findings = runChecks(m);
  const g = gitInfo(m.dir);
  if (g) findings.push(...diffChecks(dir, g, 'HEAD'));
  else notes.push('не git-репозиторий: сверка с git (DF-*) пропущена');
  if (snapshot) for (const f of featureFiles(m)) saveSnapshot(f);

  const changed = files(m)
    .filter((f) => before.get(f) !== read(f))
    .map((f) => `${rel(f)}${fileChange(before.get(f), read(f))}${detail.has(f) ? `: ${detailOf(f)}` : ''}`);
  return { m, changed, notes, findings };
}
/** @param {string[]} changed */
// Файл появился или пропал за fix; просто поправлен — пусто.
/** @param {string | null | undefined} was @param {string | null} now */
function fileChange(was, now) {
  if (was == null) return ' — создан';
  return now == null ? ' — удалён' : '';
}
/** @param {string[]} changed */
export const fixedText = (changed) => (changed.length ? `Скрипт поправил:\n${changed.map((x) => `- ${x}`).join('\n')}` : 'Скрипту поправлять нечего.');

/** @param {Ctx} ctx */
export function cmdFix(ctx) {
  const { flags, pos } = ctx.args;
  const { m, changed, notes, findings } = fixFeature(ctx, needDir(ctx, pos[0]), { snapshot: flags.snapshot });
  if (!flags.json) {
    ctx.io.log(fixedText(changed));
    for (const n of notes) ctx.io.log(`\n${n}`);
    if (findings.length) ctx.io.log('');
  }
  reportFeature(ctx, m, findings, { fixed: changed, notes });
}
