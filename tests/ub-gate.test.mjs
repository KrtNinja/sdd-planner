// Повреждённый замер не становится нулём нарушений и не перезаписывает baseline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, tmpDir } from './helpers.mjs';
import { readEdn } from '../tools/metrics/edn.mjs';

const GOOD = '{:entries [{:namespace "x" :name "f" :complexity 1 :coverage 100 :crap 1}]}';
test('ub-gate: обязательные отчёты проверяются до сводки и записи baseline', () => {
  const dir = tmpDir('sdd-ub-');
  try {
    const metrics = path.join(dir, 'tools/metrics'); fs.mkdirSync(metrics, { recursive: true });
    for (const f of ['ub-gate.mjs', 'edn.mjs']) fs.copyFileSync(path.join(root, 'tools/metrics', f), path.join(metrics, f));
    const reports = path.join(dir, '.metrics'); fs.mkdirSync(reports);
    const baseline = path.join(metrics, 'ub-baseline.json');
    const saved = JSON.stringify({ crap: { over10: 1, offenders: {} }, dry: { candidates: 0 } });
    const cases = `missing|missing
${GOOD}|missing
missing|{:candidates []}
{}|{:candidates []}
{:entries []}|{:candidates []}
{:entries [{}]}|{:candidates []}
${GOOD}|{}
${GOOD}|{:candidates [{}]}
${GOOD}|{:candidates [{:score -1}]}
${GOOD} garbage|{:candidates []}
{:entries|{:candidates []}`;
    for (const row of cases.split('\n')) {
      fs.writeFileSync(baseline, saved);
      for (const [i, name] of ['crap.edn', 'dry.edn'].entries()) {
        const text = row.split('|')[i]; const file = path.join(reports, name);
        if (text === 'missing') fs.rmSync(file, { force: true }); else fs.writeFileSync(file, text);
      }
      for (const args of [[], ['--baseline']]) {
        const r = spawnSync(process.execPath, [path.join(metrics, 'ub-gate.mjs'), ...args], { encoding: 'utf8' });
        assert.equal(r.status, 1, row);
        assert.equal(r.stdout, '', row);
        assert.match(r.stderr, /ГЕЙТ НЕ ПРОЙДЕН — отчёты ub-mode:/);
        assert.equal(fs.readFileSync(baseline, 'utf8'), saved);
      }
    }
    fs.writeFileSync(path.join(reports, 'crap.edn'), GOOD);
    fs.writeFileSync(path.join(reports, 'dry.edn'), '{:candidates []}');
    const r = spawnSync(process.execPath, [path.join(metrics, 'ub-gate.mjs'), '--baseline'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(baseline, 'utf8')), {
      crap: { functions: 1, over10: 0, offenders: {} }, dry: { candidates: 0, pairs: [] },
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('EDN: незавершённая карта и хвост не считаются отчётом', () => {
  for (const text of ['{:entries}', '{:a 1} {}', 'nil trailing']) assert.throws(() => readEdn(text));
  assert.deepEqual(readEdn('{:entries []}\n'), { entries: [] });
});
