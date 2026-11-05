import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../skills/sdd-lint/scripts/sdd-lint/run.mjs';

test('справка Q сохраняет операции пакета и продолжение, не превращается в NaN', () => {
  const r = run(['help', 'questions']);
  const text = r.chunks.map((c) => c[1]).join('');
  assert.equal(r.code, 0);
  assert.match(text, /questions <add\|defer/);
  assert.match(text, /prepare\|accept\|apply\|revise\|history\|recover> <feature> <JSON>/);
  assert.match(text, /ask — карточка продолжения/);
});
