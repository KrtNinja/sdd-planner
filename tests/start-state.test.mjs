// Переименование не меняет закрытые фичи и не перезаписывает занятую папку.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { renameFeature, startFrom } from '../skills/sdd-lint/scripts/sdd-lint/start.mjs';
import { repo, inDir, JSON_ENV } from './helpers.mjs';

test('renameFeature: spec, нет протокола и готовый протокол запрещают переименование', () => {
  for (const files of [
    { 'spec.md': '# Spec\n', 'brainstorming.md': '# Brainstorming\nСтатус: идёт\n' },
    { 'README.md': '# Feature\n' },
    { 'brainstorming.md': '# Brainstorming\nСтатус: готов\n' },
  ]) {
    const cwd = repo(Object.fromEntries(Object.entries(files).map(([f, s]) => [`docs/old/${f}`, s])));
    inDir(cwd, JSON_ENV, () => assert.equal(renameFeature('docs/old', 'new'),
      'Переименовать `docs/old` можно только пока идёт обсуждение задачи. Продолжить работу можно под текущим именем.\n\n⚙ sdd: стоп'));
    assert.deepEqual(fs.readdirSync(path.join(cwd, 'docs')), ['old']);
    for (const [f, s] of Object.entries(files)) assert.equal(fs.readFileSync(path.join(cwd, 'docs/old', f), 'utf8'), s);
  }
});
test('renameFeature: занятое точное имя остаётся целым', () => {
  const cwd = repo({ 'docs/old/brainstorming.md': '# Brainstorming\n', 'docs/new/README.md': 'занято\n' });
  inDir(cwd, JSON_ENV, () => assert.equal(renameFeature('docs/old', 'new'),
    '`docs/new` уже есть. Какое имя взять?\n\n⚙ sdd: жди ответ → ["start","docs/old","--rename","<ответ человека>"]'));
  assert.deepEqual(fs.readdirSync(path.join(cwd, 'docs')).sort(), ['new', 'old']);
  assert.equal(fs.readFileSync(path.join(cwd, 'docs/new/README.md'), 'utf8'), 'занято\n');
});


test('startFrom: закрытый brainstorming со spec не запускается заново', () => {
  const cwd = repo({ 'docs/old/spec.md': '# Spec\n' });
  inDir(cwd, JSON_ENV, () => assert.equal(startFrom('old'),
    'Обсуждение задачи `docs/old` завершено: есть spec.md. Поменять поведение — `/sdd-decide old "<вопрос>" "<решение>"`; ' +
      'что дальше по задаче — `node scripts/sdd-lint.mjs old`.\n\n⚙ sdd: стоп'));
  assert.deepEqual(fs.readdirSync(path.join(cwd, 'docs/old')), ['spec.md']);
});
