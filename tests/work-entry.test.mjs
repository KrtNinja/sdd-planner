// _work: полный текст ссылки и перенос старых файлов вне git.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkWork, moveLegacy } from '../skills/sdd-lint/scripts/sdd-lint/work.mjs';
import { feature, brief, inDir, JSON_ENV } from './helpers.mjs';

test('work: ссылка в рабочие артефакты сохраняет первый символ и обрезается до 80', () => {
  const text = 'см. _work/plan.md ' + 'a'.repeat(90);
  const m = feature({ 'spec.md': text });
  assert.deepEqual(brief(m, checkWork(m)), [`WK-02 spec.md:1 ${text.slice(0, 80)}`]);
});

test('moveLegacy: два переноса с общим родителем без git, содержимое сохранено', () => {
  const m = feature({ 'review/spec.md': 'ревью', 'slices/plan.md': 'план' });
  inDir(m.dir, JSON_ENV, () => {
    assert.deepEqual(moveLegacy(m), ['review → _work/review', 'slices/plan.md → _work/plan.md']);
    assert.deepEqual(fs.readdirSync('_work').sort(), ['plan.md', 'review']);
    assert.deepEqual(['_work/review/spec.md', '_work/plan.md'].map((f) => fs.readFileSync(f, 'utf8')), ['ревью', 'план']);
    assert.deepEqual(['review', 'slices/plan.md'].map((f) => fs.existsSync(path.resolve(f))), [false, false]);
    assert.deepEqual(moveLegacy(m), []);
  });
});
