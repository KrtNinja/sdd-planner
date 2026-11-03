// Контракт CI без снимка в git: выбор файлов, гейт и чтение исторических строк из лога.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { root, tmpDir, git } from './helpers.mjs';
import { unpack, shards } from '../tools/metrics/mutate.mjs';

const SOURCE = 'skills/sdd-lint/scripts/example.mjs';
function fixture() {
  const dir = tmpDir('sdd-mutate-test-');
  fs.mkdirSync(path.join(dir, 'tools/metrics'), { recursive: true });
  for (const f of ['mutate.mjs', 'edn.mjs']) fs.copyFileSync(path.join(root, 'tools/metrics', f), path.join(dir, 'tools/metrics', f));
  fs.mkdirSync(path.dirname(path.join(dir, SOURCE)), { recursive: true });
  fs.writeFileSync(path.join(dir, SOURCE), 'export const x = 0;\n');
  const g = git(dir);
  g('init', '-q'); g('add', '.'); g('commit', '-qm', 'base');
  const base = g('rev-parse', 'HEAD').trim();
  return { dir, g, base };
}
const run = (dir, args, env = {}) => spawnSync(process.execPath, ['tools/metrics/mutate.mjs', ...args],
  { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
const logOf = (payload) => ['--- mutate snapshot ---', zlib.gzipSync(JSON.stringify(payload)).toString('base64'), '--- конец ---'].join('\n');
const snapshot = (source = SOURCE) => {
  const id = JSON.stringify([source, 'example', 'defn/x', 16, 17, '0', '1']);
  return `{:source ${JSON.stringify(source)} :namespace "example" :forms [{:id "defn/x" :file ${JSON.stringify(source)} :line 1 :end-line 1 :killed 0 :survived 1 :uncovered 0}] :outcomes {${JSON.stringify(id)} :survived}}`;
};

test('mutate files: тестовый PR пуст; изменённый и новый код выбирается, удалённый исключён', () => {
  const { dir, g, base } = fixture();
  fs.mkdirSync(path.join(dir, 'tests'));
  fs.writeFileSync(path.join(dir, 'tests/a.test.mjs'), '// test');
  g('add', '.'); g('commit', '-qm', 'tests');
  assert.equal(run(dir, ['files', '--base', base]).stdout, '');
  fs.writeFileSync(path.join(dir, SOURCE), 'export const x = 1;\n');
  const next = SOURCE.replace('example', 'new');
  fs.writeFileSync(path.join(dir, next), '// new');
  g('add', '.'); g('commit', '-qm', 'code');
  assert.equal(run(dir, ['files', '--base', base]).stdout, `${SOURCE}\n${next}\n`);
  fs.unlinkSync(path.join(dir, SOURCE)); g('add', '.'); g('commit', '-qm', 'delete');
  assert.equal(run(dir, ['files', '--base', base]).stdout, `${next}\n`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('mutate gate: выживший в изменённой функции роняет гейт; лог содержит исходник прогона', () => {
  const { dir, g, base } = fixture();
  fs.writeFileSync(path.join(dir, SOURCE), 'export const x = 0; // changed\n');
  g('add', '.'); g('commit', '-qm', 'changed');
  fs.mkdirSync(path.join(dir, 'parts'));
  fs.writeFileSync(path.join(dir, 'parts/example.edn'), snapshot());
  const result = run(dir, ['gate', '--from', 'parts', '--base', base]);
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stdout.includes(`${SOURCE}:1 0 → 1`));
  assert.deepEqual(unpack(result.stdout), { version: 2, files: { 'example.edn': snapshot() }, sources: { [SOURCE]: 'export const x = 0; // changed\n' } });
  const empty = run(dir, ['gate', '--base', 'HEAD']);
  assert.equal(empty.status, 0, empty.stderr);
  assert.deepEqual(unpack(empty.stdout), { version: 2, files: {}, sources: {} });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('mutate survivors: исторические байтовые позиции, фильтр, очистка temp и отсутствие записи в git', () => {
  const { dir, g } = fixture();
  const src = '// Я\nexport const x = 0;\n';
  const offset = Buffer.from(src).indexOf('0');
  const edn = snapshot().replace(',16,17,', `,${offset},${offset + 1},`);
  const payload = { version: 2, files: { 'example.edn': edn }, sources: { [SOURCE]: src } };
  const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\ncat "$MUTATE_TEST_LOG"\n', { mode: 0o755 });
  const logfile = path.join(dir, 'run.log');
  fs.writeFileSync(logfile, logOf(payload).split('\n').map((l) => `job\tstep\t2026-11-03T00:00:00Z ${l}`).join('\n'));
  const temp = path.join(dir, 'temp'); fs.mkdirSync(temp);
  const env = { PATH: `${bin}:${process.env.PATH}`, MUTATE_TEST_LOG: logfile, TMPDIR: temp };
  const before = g('diff');
  const result = run(dir, ['survivors', '--run', '123', 'example'], env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${SOURCE}:2 0 → 1 [defn/x]\nВыживших: 1 в 1 функциях\n`);
  assert.equal(run(dir, ['survivors', '--run', '123', 'other'], env).stdout, 'Выживших: 0 в 0 функциях\n');
  assert.notEqual(run(dir, ['survivors'], env).status, 0);
  assert.deepEqual(fs.readdirSync(temp), []);
  assert.equal(fs.existsSync(path.join(dir, 'tools/metrics/mutate')), false);
  assert.equal(g('diff'), before);
  fs.writeFileSync(logfile, 'broken log');
  assert.notEqual(run(dir, ['survivors', '--run', '123'], env).status, 0);
  assert.deepEqual(fs.readdirSync(temp), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('mutate: старый формат, timestamp-only лог, повреждённый лог и распределение частей', () => {
  assert.deepEqual(unpack(logOf({ 'a.edn': '{}' })), { files: { 'a.edn': '{}' }, sources: null });
  assert.deepEqual(unpack(logOf({}).split('\n').map((l) => `2026-11-03T00:00:00Z ${l}`).join('\n')), { files: {}, sources: null });
  assert.throws(() => unpack('no snapshot'), /нет снимка/);
  assert.deepEqual(shards(['a', 'b', 'c'], 2, (f) => ({ a: 3, b: 2, c: 1 })[f]), [['a'], ['b', 'c']]);
});
