// Открытые вопросы: границы раздела, элементы списка и продолжения с точными строками.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openQuestions } from '../skills/sdd-lint/scripts/sdd-lint/open-questions.mjs';
import { feature } from './helpers.mjs';

test('openQuestions: обычный текст, продолжения и разные маркеры списка', () => {
  const md = [
    '# Spec', '## Открытые вопросы', '  Первый вопрос', '  продолжение первого',
    '', '<!-- скрытая заметка -->', '```', '- код не вопрос', '```',
    '- Второй вопрос', '   продолжение второго', '* Третий вопрос',
    '1. Четвёртый вопрос', '2) Пятый вопрос', '## Вне scope', '- не вопрос',
  ].join('\n');
  const m = feature({ 'spec.md': md });
  assert.deepEqual(openQuestions(m, 'spec'), [
    { file: m.specFile, n: 3, text: 'Первый вопрос продолжение первого' },
    { file: m.specFile, n: 10, text: 'Второй вопрос продолжение второго' },
    { file: m.specFile, n: 12, text: 'Третий вопрос' },
    { file: m.specFile, n: 13, text: 'Четвёртый вопрос' },
    { file: m.specFile, n: 14, text: 'Пятый вопрос' },
  ]);
});

test('openQuestions: пустой раздел, Нет, отсутствующая spec и чужой режим', () => {
  for (const body of ['', 'Нет.', '\n<!-- заметка -->\n```\n- только код\n```']) {
    assert.deepEqual(openQuestions(feature({ 'spec.md': `## Открытые вопросы\n${body}` }), 'spec'), []);
  }
  assert.deepEqual(openQuestions(feature({}), 'spec'), []);
  assert.deepEqual(openQuestions(feature({ 'spec.md': '## Открытые вопросы\n- Вопрос' }), 'adr'), []);
});
