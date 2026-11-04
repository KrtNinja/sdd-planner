import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scan, inSection, replaceSection, SectionConflict } from '../skills/sdd-lint/scripts/sdd-lint/md.mjs';
import { parseProtocol } from '../skills/sdd-lint/scripts/sdd-lint/protocol.mjs';
import { parseSpec } from '../skills/sdd-lint/scripts/sdd-lint/spec.mjs';
import { addOpenQuestion } from '../skills/sdd-lint/scripts/sdd-lint/open-questions.mjs';
import { feature, runner, JSON_ENV, workspace, commitAll } from './helpers.mjs';

const NAMES = [
  ['Вне scope', 'Не входит в задачу'],
  ['Решения после brainstorming', 'Решения после обсуждения'],
  ['Открытые вопросы к Dev Spec', 'Открытые вопросы к требованиям'],
  ['Покрытие Dev Spec', 'Покрытие требований'],
];

test('названия разделов: оба формата читаются, запись сохраняет исходный заголовок', () => {
  for (const [old, next] of NAMES) for (const title of [old, next]) {
    const md = `# Задача\n## ${title}\n- пункт\n\n## Другое\nхвост\n`;
    const re = new RegExp(`^${old}$`);
    assert.equal(inSection(scan(md), re)[0].text, '- пункт');
    assert.equal(replaceSection(md, re, next, '- новый пункт'), `# Задача\n## ${title}\n- новый пункт\n\n## Другое\nхвост\n`);
  }
  const md = NAMES.map(([old], i) => `## ${old}\n${i}`).join('\n');
  assert.equal(scan(md).lines.filter((l) => l.text.startsWith('##')).length, 4);
  assert.equal(scan('## Другое\na\n## Другое\nb').lines.length, 4);
});

test('названия разделов: оба названия в одном документе — явная ошибка, включая обратный порядок', () => {
  for (const pair of NAMES) for (const [a, b] of [pair, [...pair].reverse()]) {
    assert.throws(() => scan(`## ${a}\nпервое\n## ${b}\nвторое`), {
      name: 'Error', message: `Разделы «${a}» и «${b}» обозначают одно и то же. Объедините содержимое в одном разделе и повторите команду.`,
    });
    assert.throws(() => scan(`## ${a}\n## ${b}`), SectionConflict);
    assert.doesNotThrow(() => scan(`## ${a}\n\`\`\`\n## ${b}\n\`\`\``));
  }
});

test('протокол и связи требований: новый и смешанный формат сохраняют строки и цели ссылок', () => {
  for (const title of NAMES[0]) {
    const md = `## ${title}\n- экспорт (из протокола: 2)\n`;
    assert.deepEqual(parseProtocol('b.md', md).outScope, [{ text: '- экспорт (из протокола: 2)', n: 2 }]);
    assert.deepEqual(parseSpec('s.md', md).sources[0].target, { kind: 'вне scope' });
    for (const post of NAMES[1]) {
      const p = parseProtocol('b.md', `${md}\n## ${post}\n| # | Решение |\n|---|---|\n| П1 | сохранить |\n`);
      assert.equal(p.post[0].id, 'П1');
      assert.equal(p.post[0].dec, 'сохранить');
      assert.equal(p.outScope.length, 1);
    }
  }
});

test('запись открытого вопроса не дублирует старый или новый раздел', () => {
  for (const title of NAMES[2]) {
    const m = feature({ 'slices/001-a.md': `# Часть работы\n## ${title}\n- первый\n` });
    try {
      const file = path.join(m.dir, 'slices/001-a.md');
      addOpenQuestion({ file, re: /^Открытые вопросы/, title: NAMES[2][1] }, 'второй');
      assert.equal(fs.readFileSync(file, 'utf8'), `# Часть работы\n## ${title}\n- первый\n- второй\n`);
    } finally { fs.rmSync(m.dir, { recursive: true }); }
  }
});

test('неоднозначный документ: команды отказывают до записи, содержимое остаётся целым', () => {
  const md = 'Статус: черновик\n## Вне scope\n- первое\n## Не входит в задачу\n- второе\n';
  const m = feature({ 'spec.md': '# Задача\n' });
  const file = m.specFile;
  fs.writeFileSync(file, md);
  const run = runner(JSON_ENV);
  try {
    for (const args of [['fix'], ['done'], ['approve', 'spec'], ['close', '--yes'], ['gen', 'links']]) {
      const result = run(m.dir, ...args, m.dir);
      assert.equal(result.code, 1, JSON.stringify(args));
      assert.match(result.out, /Объедините содержимое/);
      assert.equal(fs.readFileSync(file, 'utf8'), md);
    }
  } finally { fs.rmSync(m.dir, { recursive: true }); }
});

test('заголовок требований: старый и новый суффикс отделяются от названия задачи', () => {
  for (const suffix of ['Dev Spec', 'Спецификация требований']) {
    assert.equal(parseSpec('s.md', `# Поиск — ${suffix}  \n`).title, 'Поиск');
  }
  assert.equal(parseSpec('s.md', '# Спецификация требований внутри названия').title, 'Спецификация требований внутри названия');
});

test('старый, новый и смешанный набор: fix, done, approve и close сохраняют требования', () => {
  for (const mode of ['old', 'new', 'mixed']) {
    const cwd = workspace();
    const dir = path.join(cwd, 'docs/comments');
    const specFile = path.join(dir, 'spec.md');
    const readme = path.join(dir, 'slices/README.md');
    const proto = path.join(dir, 'brainstorming.md');
    const run = runner(JSON_ENV);
    try {
      const files = [specFile, readme, proto, ...fs.readdirSync(path.join(dir, 'slices')).filter((f) => /^\d/.test(f)).map((f) => path.join(dir, 'slices', f))];
      for (const [i, file] of files.entries()) {
        if (mode === 'old' || (mode === 'mixed' && i % 2 === 0)) continue;
        let text = fs.readFileSync(file, 'utf8');
        for (const [old, next] of NAMES) text = text.replaceAll(`## ${old}`, `## ${next}`);
        text = text.replace('— Dev Spec', '— Спецификация требований');
        fs.writeFileSync(file, text);
      }
      commitAll(cwd);
      const titles = fs.readFileSync(specFile, 'utf8').match(/^## .*/gm);
      const before = parseSpec(specFile, fs.readFileSync(specFile, 'utf8'));
      for (const args of [['fix'], ['done'], ['approve', 'spec'], ['snapshot'], ['approve', 'slices']]) {
        const result = run(cwd, ...args, 'docs/comments');
        assert.equal(result.code, 0, `${mode}: ${args}\n${result.out}`);
      }
      assert.deepEqual(fs.readFileSync(specFile, 'utf8').match(/^## .*/gm), titles);
      const result = run(cwd, 'close', 'docs/comments', '--yes');
      assert.equal(result.code, 0, result.out);
      assert.equal(fs.existsSync(proto), false);
      const after = parseSpec(specFile, fs.readFileSync(specFile, 'utf8'));
      assert.deepEqual([...after.reqs].map(([id, r]) => [id, r.text]), [...before.reqs].map(([id, r]) => [id, r.text]));
      assert.match(after.status, /^одобрено/);
      assert.equal(run(cwd, 'check', 'docs/comments').code, 0);
    } finally { fs.rmSync(cwd, { recursive: true }); }
  }
});

test('исследование после закрытия берёт имя из нового заголовка требований', () => {
  const m = feature({ 'spec.md': '# Поиск — Спецификация требований\n' });
  try {
    const result = runner(JSON_ENV)(m.dir, 'research', 'fact', m.dir, 'Как устроен поиск?');
    assert.equal(result.code, 0, result.out);
    assert.match(fs.readFileSync(path.join(m.dir, '_work/context.md'), 'utf8'), /^Задача: «Поиск»$/m);
  } finally { fs.rmSync(m.dir, { recursive: true }); }
});
