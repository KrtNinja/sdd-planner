import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpDir, SPEC, slice, ac } from './helpers.mjs';
import { loadFeature } from '../skills/sdd-lint/scripts/sdd-lint/feature.mjs';
import { decisionLinks, decisionReviews, decisionFiles } from '../skills/sdd-lint/scripts/sdd-lint/decision-files.mjs';
import { initTestFlow } from '../skills/sdd-lint/scripts/sdd-lint/flow-state.mjs';
import { linkSlice } from '../skills/sdd-lint/scripts/sdd-lint/gen-links.mjs';

function setup() {
  const dir = tmpDir();
  initTestFlow(dir);
  fs.mkdirSync(path.join(dir, 'slices'));
  fs.writeFileSync(path.join(dir, 'spec.md'), SPEC);
  fs.writeFileSync(path.join(dir, 'slices/001-search.md'), slice('001', {}, ...ac('AC-001-1')));
  fs.writeFileSync(path.join(dir, 'slices/README.md'), '# Части работы\nСтатус: одобрено\n');
  return dir;
}

test('подготовка пересчитывает ссылки AC тем же генератором, не пишет документы и снимает зависимый статус', () => {
  const dir = setup();
  const file = path.join(dir, 'slices/001-search.md');
  const before = fs.readFileSync(file, 'utf8');
  const after = SPEC.replace('# Поиск — Dev Spec', '# Поиск — Dev Spec\n\nДополнение.');
  const changes = decisionLinks(dir, [{ file: 'spec.md', before: SPEC, after }]);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  const c = changes.find((p) => p.file === 'slices/001-search.md');
  assert.equal(c.before, before);
  assert.match(c.after, /Проверяет: \[FR-1\]\(\.\.\/spec.md#L10\)/);
  const reviewed = decisionReviews(loadFeature(dir), changes);
  assert.match(reviewed.find((p) => p.file === 'slices/README.md').after, /на ревью/);
  assert.match(reviewed.find((p) => p.file === 'slices/001-search.md').after, /Статус: на ревью/);
  assert.equal(fs.readFileSync(path.join(dir, 'slices/README.md'), 'utf8').includes('одобрено'), true);
  fs.writeFileSync(path.join(dir, 'spec.md'), after);
  fs.writeFileSync(file, c.after);
  assert.equal(decisionLinks(dir, [{ file: 'spec.md', before: after, after }]).length, 1);
  const m = loadFeature(dir);
  assert.equal(linkSlice([...m.slices.values()][0], m.spec), 0);
});

test('пакет сохраняет before:null нового документа и не пишет по символической ссылке', () => {
  const dir = setup();
  const change = { file: 'tech.md', before: null, after: '# Tech\n\n## TECH — Решение\nСвязи: FR-1\n' };
  const normalized = decisionFiles(loadFeature(dir), [change])[0];
  assert.equal(normalized.before, null);
  assert.match(normalized.after, /Статус: на ревью/);
  fs.symlinkSync(path.join(dir, 'spec.md'), path.join(dir, 'tech.md'));
  assert.throws(() => decisionFiles(loadFeature(dir), [change]), /символические/);
  assert.equal(fs.readFileSync(path.join(dir, 'spec.md'), 'utf8'), SPEC);
});

test('изменение протокола не удаляет согласованные исключения из объёма', async () => {
  const { checkDecisionMeaning } = await import('../skills/sdd-lint/scripts/sdd-lint/decision-files.mjs');
  const dir = setup();
  const protocol = path.join(dir, 'brainstorming.md');
  fs.writeFileSync(protocol, '# Обсуждение\nСтатус: идёт\n\n## Вне scope\n- Экспорт без авторизации\n');
  const before = loadFeature(dir);
  assert.doesNotThrow(() => checkDecisionMeaning(before, loadFeature(dir), 'unchanged'));
  fs.writeFileSync(protocol, '# Обсуждение\nСтатус: идёт\n');
  assert.throws(() => checkDecisionMeaning(before, loadFeature(dir), 'unchanged'), /исключения протокола/);
});


test('изменение FR без сдвига ссылок отправляет существующие AC на пересмотр', () => {
  const dir = setup();
  const file = path.join(dir, 'slices/001-search.md');
  const before = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, before.replace('\n', '\nСтатус: одобрено\n'));
  const changes = decisionReviews(loadFeature(dir), [{ file: 'spec.md', before: SPEC,
    after: SPEC.replace('FR-1  Текст.', 'FR-1  Экспорт разрешён.') }]);
  const dependent = changes.find((c) => c.file === 'slices/001-search.md');
  assert.ok(dependent);
  assert.match(dependent.after, /Статус: на ревью/);
  assert.equal(fs.readFileSync(file, 'utf8'), dependent.before);
});

test('пересмотр FR затрагивает связанные SC/TECH/AC, сохраняя независимую ветку', async () => {
  const { reserveFlowId } = await import('../skills/sdd-lint/scripts/sdd-lint/flow-state.mjs');
  const dir = setup();
  reserveFlowId(dir, 'SC'); reserveFlowId(dir, 'SC');
  const scenario = (n) => `### SC-${n} — Ветка ${n}\nТребования: FR-${n}\nАнна видит результат ${n}.\n`;
  const scenarios = '# Сценарии\nСтатус: одобрено\n' + scenario(1) + scenario(2);
  fs.writeFileSync(path.join(dir, 'scenarios.md'), scenarios);
  fs.writeFileSync(path.join(dir, 'tech.md'), '# Решение\nСтатус: одобрено\n## TECH — Ветка 2\nСвязи: FR-2\nПоиск.\n');
  const independent = slice('002', { basis: 'FR-2' }, ...ac('AC-002-1', 'FR-2'));
  fs.writeFileSync(path.join(dir, 'slices/002-independent.md'), independent);
  const changes = decisionReviews(loadFeature(dir), [{ file: 'spec.md', before: SPEC,
    after: SPEC.replace('FR-1  Текст.', 'FR-1  Экспорт разрешён.') }]);
  const files = changes.map((c) => c.file);
  assert.ok(files.includes('scenarios.md'));
  assert.ok(files.includes('slices/001-search.md'));
  assert.ok(files.includes('slices/README.md'));
  assert.ok(!files.includes('tech.md'));
  assert.ok(!files.includes('slices/002-independent.md'));
  assert.ok(changes.find((c) => c.file === 'scenarios.md').after.includes(scenario(2)));
  assert.equal(fs.readFileSync(path.join(dir, 'slices/002-independent.md'), 'utf8'), independent);
});

test('пересмотр объединяет прежние и новые связи, не теряет старое основание', () => {
  const dir = setup();
  const old = '# Решение\nСтатус: одобрено\n## TECH — Ветка\nСвязи: FR-1\nПоиск.\n';
  fs.writeFileSync(path.join(dir, 'tech.md'), old);
  const changes = decisionReviews(loadFeature(dir), [{ file: 'tech.md', before: old,
    after: old.replace('Связи: FR-1', 'Связи: FR-2') }]);
  assert.ok(changes.some((c) => c.file === 'spec.md'));
  assert.ok(changes.some((c) => c.file === 'slices/001-search.md'));
});
