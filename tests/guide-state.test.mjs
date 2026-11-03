// Короткие имена этапов и цели ревью: все ветки до упрощения выбора фичи.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageName, reviewTargets } from '../skills/sdd-lint/scripts/sdd-lint/guide.mjs';
import { feature } from './helpers.mjs';

test('guide: stageName — приоритет spec, slices, существующего и требуемого ADR', () => {
  const rows = [
    '||||brainstorming', 'готов||||Dev Spec', '|черновик|||Dev Spec', '|одобрено|||slices',
    '|одобрено|черновик||slices', '|одобрено|одобрено|проект|ADR', '|одобрено|одобрено|нужен|ADR',
    '|одобрено|одобрено|принято|передача в реализацию',
  ];
  for (const row of rows) {
    const [protocol, spec, slices, adr, expected] = row.split('|');
    const m = feature({});
    if (protocol) m.protocol = { status: protocol };
    if (spec) m.spec = { status: spec };
    if (slices) m.slices.set('001', { num: '001', why: adr === 'нужен' ? 'Р1 — ADR: кэш' : null });
    m.slicesStatus = slices;
    if (adr && adr !== 'нужен') m.featureAdrs = [{ num: '0001', status: adr }];
    assert.equal(stageName(m), expected, row);
  }
});

test('guide: reviewTargets — порядок и пустые статусы, принятые артефакты исключены', () => {
  const m = feature({});
  assert.deepEqual(reviewTargets(m), []);
  m.spec = { status: null };
  m.slices.set('001', {});
  m.featureAdrs = [{ num: '0002', status: null }, { num: '0003', status: 'на ревью' }, { num: '0004', status: 'принято' }];
  assert.deepEqual(reviewTargets(m), [
    { mode: 'spec', label: 'Dev Spec «—»' }, { mode: 'slices', label: 'slices «—»' },
    { mode: 'adr', num: '0002', label: 'ADR 0002 «—»' }, { mode: 'adr', num: '0003', label: 'ADR 0003 «на ревью»' },
  ]);
  m.spec.status = 'одобрено';
  m.slicesStatus = 'одобрено';
  m.featureAdrs = [];
  assert.deepEqual(reviewTargets(m), []);
});
