// Команда fix: номера вместо FR-? и AC-NNN-?, ссылки, README, затем проверки и diff.
import fs from 'node:fs';
import path from 'node:path';

import { ownApprovals, approveCmd } from './approval.mjs';
import { flags, pos } from './args.mjs';
import { diffChecks } from './cmd-diff.mjs';
import { lintCmd } from './config.mjs';
import { loadFeature, featureFiles, runChecks } from './feature.mjs';
import { findings, report } from './findings.mjs';
import { linkSpec, linkSlice } from './gen-links.mjs';
import { gitInfo } from './git.mjs';
import { read, rel, uniq } from './md.mjs';
import { needDir } from './pick.mjs';
import { genGuessed } from './protocol.mjs';
import { genReadme } from './readme.mjs';
import { saveSnapshot } from './snapshot.mjs';
import { hasProtocolTraces } from './sources.mjs';
import { stageOf, stageText } from './stage.mjs';

// Модель пишет «FR-?» и «AC-003-B?», номера строк не считает, README и ссылки не трогает:
// всё это скрипт делает здесь, затем проверяет фичу и сверяет её с git.
const PH_REQ = /^(\s*)(N?FR)-\?(?=\s|$)/;
const PH_AC = /^(\s*)AC-(?:\d{3}-)?([BF]?)\?(?=\s|$)/;
const firstLine = (b) => b.lines.find((l) => l.text.trim());
const maxNum = (arr) => arr.reduce((a, b) => Math.max(a, b), 0);
function numberPlaceholders(m) {
  const done = [];
  if (m.spec) {
    const ids = [...m.spec.reqs.keys()];
    const last = { FR: maxNum(ids.filter((x) => x.startsWith('FR-')).map((x) => Number(x.slice(3)))), NFR: maxNum(ids.filter((x) => x.startsWith('NFR-')).map((x) => Number(x.slice(4)))) };
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
export function cmdFix() {
  const dir = needDir(pos[0]);
  const files = (m) => uniq([...featureFiles(m), m.readmeFile].map((f) => path.resolve(f)));
  let m = loadFeature(dir);
  const before = new Map(files(m).map((f) => [f, read(f)]));
  const notes = [];
  const numbered = numberPlaceholders(m);
  m = loadFeature(dir);
  // Порядок — сверху вниз: протокол меняет строки, на которые ссылается spec, spec — строки для slices.
  if (m.protocol && /готов/i.test(m.protocol.status || '')) {
    const msg = genGuessed(m, true);
    if (/Заполни/.test(msg)) notes.push(msg.replace(/^.*?Заполни/, `${rel(m.protocolFile)}: заполни`));
  }
  m = loadFeature(dir);
  // Ссылки на протокол: без протокола их убирает только close — fix их не трогает.
  if (m.spec && m.protocol) linkSpec(m);
  else if (m.spec && hasProtocolTraces(m.spec.md))
    notes.push(`${rel(m.protocolFile)} нет, а spec ссылается на протокол: ссылки не тронуты. Если фича закрывается — ${lintCmd('close', rel(m.dir))}`);
  m = loadFeature(dir);
  if (m.spec) for (const sl of m.slices.values()) linkSlice(sl, m.spec);
  m = loadFeature(dir);
  if (m.slices.size) genReadme(m, true);
  // Одобрение давалось прошлой версии — статус «на ревью», одобрять заново человеку.
  m = loadFeature(dir);
  for (const x of ownApprovals(m).filter((a) => a.state === 'changed')) {
    fs.writeFileSync(x.file, fs.readFileSync(x.file, 'utf8').replace(/^Статус:.*$/m, 'Статус: на ревью'));
    notes.push(`${rel(x.file)}: менялся после одобрения («${x.raw}») — статус «на ревью». Одобрить заново: ${approveCmd(m, x)}`);
  }

  m = loadFeature(dir);
  findings.length = 0;
  runChecks(m);
  const g = gitInfo(m.dir);
  if (g) diffChecks(dir, g, 'HEAD');
  else notes.push('не git-репозиторий: сверка с git (DF-*) пропущена');
  if (flags.snapshot) for (const f of featureFiles(m)) saveSnapshot(f);

  const detail = new Map();
  for (const x of numbered) {
    const f = path.resolve(x.split(':')[0]);
    detail.set(f, [...(detail.get(f) || []), x.split(/:\d+\s+/)[1]]);
  }
  const changed = files(m)
    .filter((f) => before.get(f) !== read(f))
    .map((f) => `${rel(f)}${before.get(f) == null ? ' — создан' : ''}${detail.has(f) ? `: ${detail.get(f).join(', ')}` : ''}`);

  const st = stageOf(m);
  if (!flags.json) {
    console.log(changed.length ? `Скрипт поправил:\n${changed.map((x) => `  ${x}`).join('\n')}` : 'Скрипту поправлять нечего.');
    for (const n of notes) console.log(n);
    if (findings.length) console.log('');
  }
  const c = report({ stage: st.now, next: st.next, fixed: changed, notes });
  if (!flags.json) {
    const acs = [...m.slices.values()].reduce((x, s) => x + s.acs.length, 0);
    console.log(`\n${stageText(st)}`);
    console.log(`Ошибок: ${c.err}, предупреждений: ${c.warn}. FR/NFR: ${m.spec ? m.spec.reqs.size : 0}, slices: ${m.slices.size}, AC: ${acs}`);
  }
  process.exit(c.err ? 1 : 0);
}
