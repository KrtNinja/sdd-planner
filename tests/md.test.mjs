// Помощники разбора markdown (md.mjs) — напрямую, без CLI: точные значения на границах.
// Тесты написаны под выживших мутантов (шаг 8.2 REFACTORING.md): каждая проверка убивает свою замену.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  plural,
  distance,
  stem,
  header,
  setHeader,
  headerLine,
  hasSection,
  scan,
  tables,
  cell,
  placeholders,
  depNums,
  reqIds,
} from '../skills/sdd-lint/scripts/sdd-lint/md.mjs';

test('md: plural — форма слова по последней цифре, второй десяток — «файлов»', () => {
  const form = (n) => plural(n, 'файл', 'файла', 'файлов').split(' ')[1];
  // «число форма» через запятую: границы последней цифры и второго десятка.
  const want = '0 файлов, 1 файл, 2 файла, 3 файла, 4 файла, 5 файлов, 9 файлов, 10 файлов, 11 файлов, 12 файлов, 14 файлов, 19 файлов, ' +
    '20 файлов, 21 файл, 22 файла, 24 файла, 25 файлов, 101 файл, 111 файлов, 112 файлов, 121 файл, 1012 файлов, 1022 файла';
  for (const [n, w] of want.split(', ').map((x) => x.split(' '))) assert.equal(form(Number(n)), w, `n = ${n}`);
  assert.equal(plural(3, 'файл', 'файла', 'файлов'), '3 файла');
});

test('md: distance — расстояние Левенштейна', () => {
  // «a → b = d»; пустая строка — «∅».
  const cases = '∅ → ∅ = 0; ∅ → ab = 2; abc → ∅ = 3; a → a = 0; a → b = 1; ab → ba = 2; aprove → approve = 1; approve → aprove = 1; ' +
    'kitten → sitting = 3; notify-servise → notify-service = 1; абв → аб = 1; xab → ab = 1; ab → abx = 1';
  for (const c of cases.split('; ')) {
    const [a, b, d] = c.replaceAll('∅', '').split(/ → | = /);
    assert.equal(distance(a, b), Number(d), c);
  }
});

test('md: stem — без последней буквы, короче четырёх букв — слово целиком', () => {
  assert.deepEqual(['Ан', 'Иван', 'Анна', 'Петрова', 'Ивановой'].map(stem), ['Ан', 'Ива', 'Анн', 'Петров', 'Иваново']);
});

test('md: header — значение строки шапки, без строки — fallback', () => {
  const md = '# T\n\nСтатус:   черновик  \nТип: поведение\n';
  assert.equal(header(md, 'Статус'), 'черновик');
  assert.equal(header(md, 'Основание'), null);
  assert.equal(header(md, 'Основание', ''), '');
  assert.equal(header(null, 'Статус', ''), '');
});

test('md: headerLine — номер строки с 1, первая строка тоже', () => {
  assert.equal(headerLine('Статус: x\nТип: y', 'Статус'), 1);
  assert.equal(headerLine('# T\n\nТип: y', 'Тип'), 3);
  assert.equal(headerLine('# T', 'Тип'), null);
  assert.equal(headerLine(null, 'Тип'), null);
});

test('md: setHeader — замена, вставка после первого найденного ключа, иначе под заголовком', () => {
  assert.equal(setHeader('# T\n\nСтатус: a\n', 'Статус', 'b'), '# T\n\nСтатус: b\n');
  assert.equal(setHeader('# T\nТип: x\nОснование: y\n', 'Статус', 'b', ['Нет', 'Основание', 'Тип']), '# T\nТип: x\nОснование: y\n\nСтатус: b\n');
  assert.equal(setHeader('Тип: x\nтекст', 'Статус', 'b', ['Тип']), 'Тип: x\n\nСтатус: b\nтекст');
  assert.equal(setHeader('# T\nтекст', 'Статус', 'b', ['Тип']), '# T\n\nСтатус: b\nтекст');
});

test('md: hasSection — только заголовок ## с подходящим названием', () => {
  const sc = scan('# T\n## Цели\nтекст\n```\n## Решения\n```\n');
  assert.equal(hasSection(sc, /^Цели/), true);
  assert.equal(hasSection(sc, /^Решения/), false);
  assert.equal(hasSection(scan('## Цели\n'), /^Вне scope/), false);
});

test('md: cell — ячейка по номеру колонки, нет колонки или ячейки — пусто', () => {
  const [t] = tables(scan('| # | Вопрос |\n|---|---|\n| 1 | Зачем |\n| 2 |').lines);
  assert.deepEqual(t.rows.map((r) => [cell(r, 0), cell(r, 1), cell(r, -1)]), [['1', 'Зачем', ''], ['2', '', '']]);
});

test('md: placeholders — заготовки <…>, без HTML-тегов, адресов и «текстов»', () => {
  assert.deepEqual(placeholders('Если <условие>, то <FR-n>; <br> <https://x.ru> «<не это>» <!-- <и не это> -->'), ['<условие>', '<FR-n>']);
  assert.deepEqual(placeholders('<b>жирный</b>'), []);
});

test('md: depNums — номера slices из «Зависимости:»', () => {
  assert.deepEqual(depNums('002, 003 и снова 002'), ['002', '003']);
  assert.deepEqual(depNums(' нет '), []);
  assert.deepEqual(depNums('—'), []);
  assert.deepEqual(depNums(), []);
  assert.deepEqual(reqIds('FR-1, NFR-2 и FR-1'), ['FR-1', 'NFR-2']);
});
