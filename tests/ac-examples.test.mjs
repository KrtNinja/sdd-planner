// Номер и сервис AC: проверяются реальные разобранные блоки и полный состав находки.
import { test } from 'node:test';
import { checkSlices } from '../skills/sdd-lint/scripts/sdd-lint/slice-rules.mjs';
import { feature, slice, ac } from './helpers.mjs';
import { expectRules } from './rule-examples-helpers.mjs';

const FILE = 'slices/001-a.md';
test('SL-04: номер AC совпадает с файлом, в том числе у удалённого AC и заготовки', () => {
  for (const suffix of ['Поиск', 'Поиск (удалён: повтор)', '<название>']) {
    for (const num of ['001', '002']) {
      const id = `AC-${num}-B1`;
      const m = feature({ [FILE]: slice('001', {}, ...ac(`${id} ${suffix}`)) });
      expectRules(m, checkSlices(m), ['SL-04'], num === '001' ? []
        : [['SL-04', 'err', FILE, 15, `${id} — номер не совпадает с файлом 001`]]);
    }
  }
});

test('SL-21: сервис серверной половины должен присутствовать в шапке', () => {
  const cases = [
    ['Billing-половина', 'B', 'Поиск', 'tasks-core + frontend', true],
    ['Billing-половина', 'B', 'Поиск', 'BILLING + frontend', false],
    ['Frontend-половина', 'F', 'Поиск', 'tasks-core', false],
    ['Общая приёмка', '', 'Поиск', 'tasks-core', false],
    [null, 'B', 'Поиск', 'tasks-core', false],
    ['Billing-половина', 'B', 'Поиск', null, false],
    ['Billing-половина', 'B', 'Поиск (удалён: повтор)', 'tasks-core', false],
    ['Billing-половина', 'B', '<название>', 'tasks-core', false],
  ];
  for (const [heading, side, title, halves, bad] of cases) {
    let md = slice('001', { halves }, ...(heading ? [`## ${heading}`] : []), ...ac(`AC-001-${side}1 ${title}`));
    if (halves === null) md = md.replace('Половины: null\n', '');
    const m = feature({ [FILE]: md });
    expectRules(m, checkSlices(m), ['SL-21'], bad ? [['SL-21', 'warn', FILE, 16,
      `раздел «${heading}», а в «Половины:» — «${halves}»`]] : []);
  }
});
