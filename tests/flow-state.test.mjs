import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { initTestFlow, parseFlowState, reserveFlowId, recoverFlowState } from '../skills/sdd-lint/scripts/sdd-lint/flow-state.mjs';
import { tmpDir, git, commitAll } from './helpers.mjs';

const statePath = (dir) => path.join(dir, '.sdd-flow.json');
const load = (dir) => parseFlowState(fs.readFileSync(statePath(dir), 'utf8'));

test('F-01/F-02: отсутствие версии — legacy; opt-in только пустой тестовой фичи', () => {
  assert.equal(parseFlowState(null), null);
  const dir = tmpDir();
  assert.throws(() => reserveFlowId(dir, 'Q'), /не мигрируют/);
  assert.deepEqual(initTestFlow(dir), { version: 2, next: { Q: 1, SC: 1, STEP: 1 } });
  assert.throws(() => initTestFlow(dir), /пустой/);
  assert.throws(() => parseFlowState('{'), SyntaxError);
  for (const text of ['null', '{}', '{"version":3}']) assert.throws(() => parseFlowState(text), /версия/);
  for (const bad of [0, -1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => parseFlowState(JSON.stringify({ version: 2, next: { Q: bad, SC: 1, STEP: 1 } })), /счётчик Q/);
  assert.throws(() => parseFlowState('{"version":2}'), /счётчик/);
});

test('F-03/F-07: close-подобная очистка и git clone не обнуляют номера', () => {
  const dir = tmpDir();
  initTestFlow(dir);
  assert.equal(reserveFlowId(dir, 'Q'), 'Q1');
  assert.equal(reserveFlowId(dir, 'Q'), 'Q2');
  assert.equal(reserveFlowId(dir, 'SC'), 'SC-1');
  assert.equal(reserveFlowId(dir, 'STEP', 'SC-1'), 'SC-1-S1');
  assert.equal(reserveFlowId(dir, 'STEP', 'SC-2'), 'SC-2-S2');
  for (const file of ['brainstorming.md', 'questions.md']) {
    fs.writeFileSync(path.join(dir, file), 'временные данные');
    fs.unlinkSync(path.join(dir, file));
  }
  commitAll(dir);
  const clone = path.join(tmpDir(), 'clone');
  git(dir)('clone', '-q', dir, clone);
  assert.equal(reserveFlowId(clone, 'Q'), 'Q3');
  assert.equal(reserveFlowId(clone, 'SC'), 'SC-2');
  assert.equal(load(clone).next.STEP, 3);
});

test('F-08: сбой записи/rename сохраняет целый предыдущий JSON, не выдаёт ID', () => {
  const dir = tmpDir();
  initTestFlow(dir);
  for (const method of ['writeFileSync', 'fsyncSync', 'renameSync']) {
    const failure = mock.method(fs, method, () => { throw new Error('disk failure'); });
    try { assert.throws(() => reserveFlowId(dir, 'SC'), /disk failure/); }
    finally { failure.mock.restore(); }
    assert.equal(load(dir).next.SC, 1);
    assert.equal(fs.existsSync(`${statePath(dir)}.pending`), false);
  }
  assert.equal(reserveFlowId(dir, 'SC'), 'SC-1');
});

test('F-08: pending блокирует второго писателя и восстанавливается явно', () => {
  const dir = tmpDir();
  initTestFlow(dir);
  const pending = `${statePath(dir)}.pending`;
  const before = fs.readFileSync(statePath(dir), 'utf8');
  fs.writeFileSync(pending, '{');
  assert.throws(() => reserveFlowId(dir, 'Q'), /EEXIST/);
  assert.equal(fs.readFileSync(statePath(dir), 'utf8'), before);
  assert.deepEqual(recoverFlowState(dir), load(dir));
  fs.writeFileSync(pending, JSON.stringify({ version: 2, next: { Q: 4, SC: 1, STEP: 1 } }));
  assert.equal(recoverFlowState(dir).next.Q, 4);
  assert.equal(reserveFlowId(dir, 'Q'), 'Q4');
  assert.deepEqual(recoverFlowState(dir), load(dir));
  fs.writeFileSync(pending, before);
  assert.throws(() => recoverFlowState(dir), /меньше/);
  assert.equal(fs.existsSync(pending), true);
});

test('счётчик не переполняется, неверный kind/родитель не меняет состояние', () => {
  const dir = tmpDir();
  initTestFlow(dir);
  assert.throws(() => reserveFlowId(dir, 'FR'), /ожидается/);
  assert.throws(() => reserveFlowId(dir, 'STEP'), /сценария/);
  const state = load(dir);
  state.next.Q = Number.MAX_SAFE_INTEGER;
  fs.writeFileSync(statePath(dir), JSON.stringify(state));
  assert.throws(() => reserveFlowId(dir, 'Q'), /Исчерпан/);
  assert.equal(load(dir).next.Q, Number.MAX_SAFE_INTEGER);
  const empty = tmpDir();
  fs.writeFileSync(`${statePath(empty)}.pending`, JSON.stringify(state));
  assert.deepEqual(recoverFlowState(empty), state);
});
