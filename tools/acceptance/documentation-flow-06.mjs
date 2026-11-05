import assert from 'node:assert/strict';
import { mock } from 'node:test';
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
const { loadFeature } = await mod('feature');
const { originalAnswer } = await mod('registry-context');
const { questionDigest } = await mod('registry-format');
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
  if (verify && name === 'validation') {
    const start = call('start');
    assert.match(start, /задач|начать|какую/i);
  }
  if (verify) {
    const initial = call('gate', 'slices', dir);
    assert.match(initial, /spec|требован/i);
    assert.equal(outputs.at(-1).code, 3);
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
  if (verify && !simple) spec = spec.replace('## Пользовательские сценарии',
    '```\nFR-2  Анна читает справку.\nПример: справка открывается.\n```\nИз протокола: 1\n\n## Пользовательские сценарии');
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
    if (verify) {
      assert.equal(savedQuestion(dir).fields.Статус, 'deferred');
      const independent = call('questions', 'work', dir, '{"refs":["FR-2"]}');
      assert.equal(outputs.at(-1).code, 0);
      assert.match(independent, /Можно продолжить/);
    }
    call('ask', dir);
    call('approve', 'spec', dir);
    call('questions', 'answer', dir, '{"key":"answer","id":"Q1","answer":"Повтор запускает новое задание","origin":"analyst"}');
    const resumedQ = call('questions', 'resume', dir, '{"id":"Q1"}');
    if (verify) {
      assert.match(resumedQ, /Исходный этап: grill/);
      assert.match(resumedQ, /Повтор запускает новое задание/);
      assert.match(resumedQ, /SC-1-S1/);
      assert.match(resumedQ, /Исходный скилл: sdd-grill/);
      assert.doesNotMatch(resumedQ, /name: grilling/);
      assert.doesNotMatch(resumedQ, /# Реестр вопросов/);
    }
    if (verify) {
      const after = fs.readFileSync(`${dir}/questions.md`, 'utf8');
      assert.match(after, /answered/);
      assert.equal(call('approve', 'spec', dir).includes('НЕ ОДОБРЕНО'), true);
      const scoped = call('gate', 'spec', dir, 'draft:FR-1');
      assert.match(scoped, /черновик|вопрос|област|останов/i);
    }
  }
  call('ask', dir);
  call('prompt', 'sdd-review', name, 'spec');
  if (simple) {
    call('approve', 'spec', dir);
    call('gate', 'slices', dir);
    if (verify) {
      const plan = call('gen', 'slices', dir);
      assert.match(plan, /Нет .*plan|план/i);
      assert.equal(outputs.at(-1).code, 1);
      const done = call('done', dir);
      assert.match(done, /Этап|ошиб|предупрежден|Готов|Исправ/i);
    }
  }
  if (verify && !simple) verifyDecision(dir, call, outputs, complex);
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
        .replace(/^---\n[\s\S]*?\n---\n/, '').trim()));
    if (simple) {
      required('approve spec', 0);
      required('gate slices', 3); // до создания spec
      assert.equal(outputs.filter((o) => o.args.join(' ').startsWith('gate slices')).at(-1).code, 0);
      assert.equal(fs.existsSync(`${dir}/scenarios.md`), false);
      assert.equal(fs.existsSync('docs/adr'), false);
    } else {
      required('approve spec', 3);
      required('questions answer', 0);
      assert.match(required('ask docs/' + name, 0), /этап|вопрос|продолж/i);
      assert.match(required('questions resume', 0), /SC-1|Q1/);
      if (complex) {
        required('scenarios move', 0);
        required('approve adr', 0);
        assert.equal(fs.existsSync(`${dir}/scenarios.md`), true);
        assert.match(required('trace', 0), /SC-1/);
        assert.match(fs.readFileSync(`${dir}/scenarios.md`, 'utf8'), /SC-1/);
        assert.match(fs.readFileSync('docs/adr/0001-export.md', 'utf8'), /SC-1/);
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
function savedQuestion(dir) {
  return loadFeature(path.resolve(dir)).flow.records.find((q) => q.id === 'Q1');
}

// Сквозное проведение: состояние и точные документы проверяются после каждого шага.
function verifyDecision(dir, call, outputs, complex) {
  const step = (verb, input, code = 0) => {
    const text = call('questions', verb, dir, JSON.stringify(input));
    assert.equal(outputs.at(-1).code, code, text);
    return text;
  };
  const read = (file) => fs.readFileSync(`${dir}/${file}`, 'utf8');
  const answer = '  Повтор запускает новое задание.\n\nСтарый результат не используем.\r\n';
  step('answer', { key: 'exact-answer', id: 'Q1', answer, origin: 'analyst' });
  assert.equal(originalAnswer(savedQuestion(dir)), answer);
  const resume = step('resume', { id: 'Q1' });
  assert.match(resume, /Исходный этап: grill/);
  assert.ok(resume.includes(JSON.stringify(answer)));
  const input = JSON.parse(resume.match(/^Вход questions prepare .*?: (.*)$/m)[1]);
  const spec = read('spec.md');
  const tech = read('tech.md');
  Object.assign(input, { summary: 'Повтор создаёт новое задание без старого результата',
    assessment: 'Ответ полон, проверены ожидание и сбой', tradeoffs: 'Повторная подготовка',
    remaining: 'Нет', ready: true, conflicts: [], obligations: 'changed', changes: [
      { file: 'spec.md', before: spec, after: spec.replace('Экспорт готовится в фоне.',
        'Экспорт готовится в фоне; повтор создаёт новое задание без старого результата.') },
      { file: 'tech.md', before: tech, after: tech + '\nПовтор создаёт отдельное задание.\n' },
    ] });
  step('prepare', input);
  assert.equal(read('spec.md'), spec);
  assert.equal(savedQuestion(dir).fields.Согласование, undefined);
  const packageHash = questionDigest(savedQuestion(dir).fields.Пакет);
  const apply = { key: 'verified-apply', id: 'Q1', packageHash };
  step('apply', apply, 2);
  step('accept', { key: 'verified-accept', id: 'Q1', packageHash, origin: 'analyst', decision: 'Согласен с этим пакетом' });
  assert.equal(read('spec.md'), spec);
  assert.equal(savedQuestion(dir).fields.Статус, 'answered');
  fs.appendFileSync(`${dir}/spec.md`, '\nИзменение после согласования\n');
  step('apply', apply, 2);
  assert.equal(read('tech.md'), tech);
  assert.equal(originalAnswer(savedQuestion(dir)), answer);
  assert.match(read('spec.md'), /Изменение после согласования/);
  fs.writeFileSync(`${dir}/spec.md`, spec);
  const rename = fs.renameSync;
  const failure = mock.method(fs, 'renameSync', (from, to) => {
    if (String(to).endsWith('/tech.md')) throw new Error('Проверяемый сбой записи');
    return rename(from, to);
  });
  try { step('apply', apply, 2); } finally { failure.mock.restore(); }
  assert.equal(savedQuestion(dir).fields.Статус, 'answered');
  assert.equal(originalAnswer(savedQuestion(dir)), answer);
  assert.equal(read('tech.md'), tech);
  step('apply', apply);
  assert.equal(savedQuestion(dir).fields.Статус, 'resolved');
  assert.equal(originalAnswer(savedQuestion(dir)), answer);
  assert.match(read('spec.md'), /FR-2  Анна читает справку/);
  assert.match(read('tech.md'), /Повтор создаёт отдельное задание/);
  const applied = read('spec.md');
  step('apply', apply);
  assert.equal(read('spec.md'), applied);
  step('apply', { ...apply, key: 'another-apply' }, 2);
  if (complex) {
    call('approve', 'adr', dir, '0001');
    assert.equal(outputs.at(-1).code, 0);
  }
  call('approve', 'spec', dir);
  assert.equal(outputs.at(-1).code, 0, outputs.at(-1).text);
  assert.equal(savedQuestion(dir).fields.Статус, 'resolved');
  assert.match(call('ask', dir), /window:sdd-slices/);
}


// Полный переход start/done отдельно от исторических историй и их числа вызовов.
function verifyRoute() {
  const dir = 'docs/route';
  fs.mkdirSync(dir, { recursive: true });
  initTestFlow(path.resolve(dir));
  let calls = 0;
  const call = (args, code = 0) => {
    calls++;
    const result = run(args);
    const text = result.chunks.map((c) => c[1]).join('');
    assert.equal(result.code, code, text);
    return text;
  };
  const next = (skill) => {
    const done = call(['done', dir]);
    assert.ok(done.includes(`window:${skill}`), done);
    const ask = call(['ask', dir]);
    const check = call(['check', dir]);
    for (const out of [ask, check]) {
      assert.ok(out.includes(`window:${skill}`), out);
      assert.ok(out.includes(`here:${skill}`), out);
    }
    assert.doesNotMatch(done, /approve:spec/);
  };
  call(['start', 'проверять название', '--slug', 'route']);
  assert.match(call(['start', dir, '--sources', 'нет']), /старт готов/);
  assert.ok(fs.existsSync(`${dir}/brainstorming.md`));
  fs.writeFileSync(`${dir}/brainstorming.md`, '# Обсуждение\nСтатус: готов\n\n## Решения\n' +
    '| # | Ветка | Вопрос | Рекомендация агента | Решение |\n|---|---|---|---|---|\n' +
    '| 1 | Продукт | Поведение | — | Пустое название не сохраняется |\n');
  next('sdd-spec');
  call(['gate', 'spec', dir]);
  fs.writeFileSync(`${dir}/spec.md`, '# Проверка\nСтатус: черновик\n\n## Требования\n```\n' +
    'FR-1  Пустое название не сохраняется.\nПример: Анна видит ошибку.\n```\nИз протокола: 1\n');
  next('sdd-scenarios');
  assert.match(fs.readFileSync(`${dir}/spec.md`, 'utf8'), /Статус: черновик/);
  fs.appendFileSync(`${dir}/spec.md`, '\n## Пользовательские сценарии\nАнна видит ошибку и исправляет название.\n');
  next('sdd-tech');
  assert.equal(fs.existsSync(`${dir}/scenarios.md`), false);
  call(['gate', 'slices', dir], 3);
  fs.writeFileSync(`${dir}/tech.md`, '## TECH — Проверка\nСвязи: FR-1\nСуществующий валидатор проверяет название до сохранения.\n');
  assert.match(call(['done', dir]), /approve:spec/);
  assert.match(fs.readFileSync(`${dir}/spec.md`, 'utf8'), /Статус: на ревью/);
  call(['gate', 'slices', dir], 3);
  call(['approve', 'spec', dir]);
  call(['gate', 'slices', dir]);
  assert.match(call(['ask', dir]), /window:sdd-slices/);
  assert.equal(fs.existsSync(`${dir}/slices`), false);
  console.error('ROUTE_VERIFY ' + JSON.stringify({ calls, actualModelCalls: 0, actualUserActions: 0 }));
}

if (verify) verifyRoute();
story('validation'); story('export'); story('complex', true);
console.log(JSON.stringify(result, null, 2));
