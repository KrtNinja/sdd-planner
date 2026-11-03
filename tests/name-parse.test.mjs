// Выбор имени: исходный ответ человека сохраняется только при допустимом исправлении.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { folderName, nameTrouble } from '../skills/sdd-lint/scripts/sdd-lint/name.mjs';
import { repo, inDir, JSON_ENV } from './helpers.mjs';

test('name: явное имя, имя из задачи и исправленный ответ человека', () => {
  const c = { kind: 'task', slug: null, task: { file: 'user-settings.md' }, sources: [], missing: [] };
  assert.deepEqual(folderName(c, 'task', 'override', 'ignored'), { slug: 'override', own: false });
  assert.deepEqual(folderName({ ...c, slug: 'given' }, 'task', null, null), { slug: 'given', own: false });
  for (const answer of ['name:auto', 'автоматически', 'auto']) {
    assert.deepEqual(folderName(c, 'task', null, answer), { slug: 'user-settings', own: false });
  }
  const rows = ['user-settings|user-settings|', 'user settings|user-settings|user settings', 'папка|папка|', ' docs/Pay_Refund/ |Pay-Refund|docs/Pay_Refund/'];
  for (const row of rows) {
    const [answer, slug, from] = row.split('|');
    assert.deepEqual(folderName(c, 'task', null, answer), { slug, own: true, from: from || null });
  }
});

test('name: свободная папка разрешена независимо от того, кто выбрал имя', () => {
  inDir(repo({ 'docs/free/note.md': 'заметка' }), JSON_ENV, () => {
    for (const own of [true, false]) {
      assert.equal(nameTrouble('free', 'task', own), null);
      assert.equal(nameTrouble('fresh', 'task', own), null);
    }
  });
});
