#!/usr/bin/env node
// sdd-lint — детерминированные проверки артефактов планирования SDD.
// Всё, что можно проверить или вывести скриптом, делает скрипт; модели остаётся смысл.
// Без зависимостей, Node 18+. Справка: node sdd-lint.mjs help
//
// Здесь только выбор команды. Код — в sdd-lint/, по модулю на тему; читай только нужный.
// Первая строка модуля — его назначение; карта: grep -m1 . sdd-lint/*.mjs
// Где проверяется правило: grep -rn "'XX-NN'" sdd-lint/; подсказка к нему — в rules.mjs.

import { run } from './sdd-lint/run.mjs';

// Печать сразу в поток — в том же порядке, что пишет команда; код выхода — после того, как всё напечатано.
const write = (fd, text) => (fd === 2 ? process.stderr : process.stdout).write(text);
process.exitCode = run(process.argv.slice(2), { write }).code;
