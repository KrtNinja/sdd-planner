// Бриф slices: полный текст и шаг продолжения на границах состояния фичи.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slicesBrief } from '../skills/sdd-lint/scripts/sdd-lint/brief.mjs';
import { loadFeature } from '../skills/sdd-lint/scripts/sdd-lint/feature.mjs';
import { repo, inDir, JSON_ENV } from './helpers.mjs';

test('brief: без сервисов и ADR, готовые slices и существующий план', () => {
  const cwd = repo({ 'docs/x/spec.md': '```\nFR-1 Найти товар. Пример: Анна.\n```\n```\nFR-2 (удалён)\n```' });
  inDir(cwd, JSON_ENV, () => {
    const m = loadFeature('docs/x');
    const card = 'Требования spec.md (1) — каждое попадёт в «Основание» хотя бы одной части работы:\n- **FR-1** Найти товар.\n\n' +
      'Сервисы: в протоколе нет строки «Сервисы:» — назову их по spec и ADR.\n\n' +
      'Записей ADR нет; они необязательны. Неизвестные решения оформляйте как вопросы, а не как ожидание ADR.';
    assert.deepEqual(slicesBrief(m), { card, parts: [null, 'плана нет — начни с него: docs/x/_work/plan.md'] });
    m.plan = { slices: [] };
    assert.deepEqual(slicesBrief(m), { card, parts: [null, 'план docs/x/_work/plan.md есть — продолжай с проверки: вызови ["plan","docs/x"]'] });
    m.slices.set('001', { acs: [] });
    assert.deepEqual(slicesBrief(m), { card, parts: [null,
      'файлы slices есть и заполнены — нарезку заново не начинай; поправить поведение — через sdd-decide; закончить этап — вызови ["done","docs/x"]'] });
  });
});
