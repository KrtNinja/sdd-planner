import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// Детерминированная репетиция: тексты задаёт fixture, целевые модели не вызываются.
const root = path.resolve(process.argv[2] || '.');
const before = process.argv.includes('--before');
const verify = process.argv.includes('--verify');
const mod = (name) => import(`${root}/skills/sdd-lint/scripts/sdd-lint/${name}.mjs`);
const { run } = await mod('run');
const { initTestFlow, reserveFlowId } = await mod('flow-state');
const { visibleLength } = await mod('read-size');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-story-'));
process.chdir(work);
process.env.SDD_VIEW = '';
const result = [];
function story(name, complex = false) {
  const dir = `docs/${name}`;
  fs.mkdirSync(dir, { recursive: true }); initTestFlow(path.resolve(dir));
  const calls = [];
  const outputs = [];
  const call = (...args) => {
    const start = performance.now();
    const r = run(args); const text = r.chunks.map((c) => c[1]).join('');
    outputs.push({ args, text, code: r.code });
    calls.push({ command: args.slice(0, 3).join(' '), code: r.code, chars: text.length,
      ms: Math.round((performance.now() - start) * 100) / 100 });
    if (r.code && args[0] !== 'approve') console.error(args.slice(0,3).join(' '),text.slice(0,700));
    return text;
  };
  if (verify) {
    const initial = call('gate', 'slices', dir);
    assert.match(initial, /spec|требован/i);
  }
  call('prompt', 'sdd-grill', name);
  fs.writeFileSync(`${dir}/brainstorming.md`, '# Обсуждение\nСтатус: готов\n\n## Решения\n| # | Ветка | Вопрос | Рекомендация агента | Решение |\n|---|---|---|---|---|\n| 1 | Продукт | Поведение | — | Анна видит результат |\n');
  call('ask', dir);
  call('prompt', 'sdd-spec', name);
  reserveFlowId(path.resolve(dir), 'SC'); reserveFlowId(path.resolve(dir), 'STEP', 'SC-1');
  const simple = name === 'validation';
  const fr = simple ? 'Пустое название не сохраняется.' : 'Экспорт готовится в фоне.';
  let spec = `# ${name}\nСтатус: черновик\n\n## Требования\n\`\`\`\nFR-1  ${fr}\nПример: Анна видит результат.\n\`\`\`\nИз протокола: 1\n\n` +
    '## Пользовательские сценарии\n### SC-1 — Основной путь\nТребования: FR-1\n#### SC-1-S1 — Отправить\n' +
    (simple ? 'Анна сохраняет пустое название; форма показывает ошибку, запись не сохраняется.\n' :
      'Анна запускает экспорт; видит «Готовим файл». После ошибки видит «Повторить»; повтор запускает новое задание.\n');
  if (complex) spec += 'я'.repeat(10050 - visibleLength(spec));
  fs.writeFileSync(`${dir}/spec.md`, spec);
  if (!before) {
    call('prompt', 'sdd-scenarios', name);
    call('prompt', 'sdd-tech', name);
  }
  fs.writeFileSync(`${dir}/tech.md`, '## TECH — Обеспечение\nСвязи: FR-1, SC-1\n' +
    (simple ? 'Существующий валидатор отклоняет пустое название до сохранения. ADR не нужен.\n' :
      'Сервис экспорта создаёт задание; работник сохраняет результат, форма читает его состояние.\n'));
  call('gen', 'links', dir);
  if (complex) {
    fs.mkdirSync('docs/adr', { recursive: true });
    fs.writeFileSync('docs/adr/0001-export.md', '# ADR-0001 — Очередь\nФича: complex/\nСтатус: предложено\n' +
      '## Контекст\nSC-1\n## Варианты\n### A. Очередь\nВыбран: независимый запуск\n### B. Запрос\nОтложен: долго\n' +
      '## Решение\nОчередь\n## Последствия\nОжидание\n## Не выяснено\nНет\n');
    call('approve', 'adr', dir, '0001');
    call('scenarios', 'move', dir);
    call('trace', dir, 'SC-1');
  }
  if (!simple) {
    call('questions', 'add', dir, JSON.stringify({ key: 'retry', title: 'Повтор после ошибки?', stage: 'grill',
      topic: 'экспорт', context: 'После ошибки подготовки', resume: 'Уточнить повтор', impact: 'known', refs: ['SC-1-S1'] }));
    call('questions', 'defer', dir, '{"key":"later","id":"Q1"}');
    call('ask', dir);
    call('approve', 'spec', dir);
    call('questions', 'answer', dir, '{"key":"answer","id":"Q1","answer":"Повтор запускает новое задание","origin":"analyst"}');
    call('questions', 'resume', dir, '{"id":"Q1"}');
  }
  call('ask', dir);
  call('prompt', 'sdd-review', name, 'spec');
  if (simple) {
    call('approve', 'spec', dir);
    call('gate', 'slices', dir);
  }
  if (verify) {
    const find = (cmd) => outputs.find((o) => o.args.join(' ').startsWith(cmd));
    const required = (cmd, code) => {
      const item = find(cmd);
      assert.ok(item, `Нет вызова ${cmd}`);
      assert.equal(item.code, code, `Код ${cmd}`);
      return item.text;
    };
    assert.ok(required('prompt sdd-spec', 0).includes(
      fs.readFileSync(`${root}/skills/sdd-spec/SKILL.md`, 'utf8')
        .replace(/^---\\n[\\s\\S]*?\\n---\\n/, '').trim()));
    if (simple) {
      required('approve spec', 0);
      required('gate slices', 3); // первый вызов: до создания spec
      assert.equal(fs.existsSync(`${dir}/scenarios.md`), false);
      assert.equal(fs.existsSync('docs/adr'), false);
    } else {
      required('approve spec', 3);
      required('questions answer', 0);
      assert.match(required('questions resume', 0), /SC-1|Q1/);
      if (complex) {
        required('scenarios move', 0);
        required('approve adr', 0);
        assert.equal(fs.existsSync(`${dir}/scenarios.md`), true);
        assert.match(required('trace', 0), /SC-1/);
      }
    }
    const registry = fs.readFileSync(`${root}/skills/sdd-grill/references/registry.md`, 'utf8').trim();
    console.error('BASELINE_VERIFY ' + JSON.stringify({
      story: name, calls: outputs.length,
      outputChars: outputs.reduce((n, o) => n + o.text.length, 0),
      maxActionChars: Math.max(...outputs.map((o) => o.text.length)),
      registryLoads: outputs.filter((o) => o.text.includes(registry)).length,
      actualModelCalls: 0, actualUserActions: 0,
    }));
  }
  const reads = ['brainstorming.md', 'spec.md', 'tech.md', ...(complex ? ['scenarios.md'] : [])].map((file) => ({
    file, chars: fs.readFileSync(`${dir}/${file}`, 'utf8').length,
  }));
  result.push({ name, calls, outputChars: calls.reduce((n, c) => n + c.chars, 0),
    explicitReads: reads, repeatedExplicitReads: 0, timeMs: calls.reduce((n, c) => n + c.ms, 0) });
}
story('validation'); story('export'); story('complex', true);
console.log(JSON.stringify(result, null, 2));
