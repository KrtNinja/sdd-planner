// Команда sources: что человек передал к запросу — ссылки и файлы в «Источники:» протокола; нет их — вопрос человеку.
import fs from 'node:fs';

import { argv, pos } from './args.mjs';
import { lintArgs, questionsView } from './ask.mjs';
import { skill, WORK_DIR } from './config.mjs';
import { loadFeature } from './feature.mjs';
import { extractSources, protocolReady, protocolSources, sourceKind, sourceProblem, writeSourcesLine } from './inputs.mjs';
import { rel, uniq } from './md.mjs';
import { needDir } from './pick.mjs';

// Что делать с ответом человека — один текст для варианта «Да, пришлю» и для ответа своими словами.
const answerTask = (dir) =>
  `Ответ человека передай целиком: sdd_lint с args ${lintArgs(['sources', dir, '<ответ дословно>'])} — ссылки и пути скрипт найдёт сам. ` +
  `Кроме ссылок и путей в ответе есть текст (задача, переписка) — сохрани его как есть в ${dir}/${WORK_DIR}/sources.md и добавь этот путь в args. ` +
  `Прислать нечего — args ${lintArgs(['sources', dir, 'нет'])}.`;

// Варианты вопроса об источниках: их же исполняет choose, пока вопрос не закрыт (sourcesPending).
export function sourcesOptions(m) {
  const dir = rel(m.dir);
  return [
    {
      id: 'sources:send',
      label: 'Да, пришлю',
      description: 'задача, макеты, документ, переписка — ссылкой, файлом через @ или текстом, следующим сообщением',
      recommended: true,
      action: {
        show: 'Пришлите одним сообщением всё, что есть по фиче: ссылку на задачу, макеты, документ, переписку. Файл из репозитория — через @ и Tab, текст — как есть.',
        after: answerTask(dir),
      },
    },
    {
      id: 'sources:none',
      label: 'Нет, начнём с фразы',
      description: 'вопросы пойдут только по запросу',
      action: { lint: ['sources', dir, 'нет'], after: 'Продолжай скилл sdd-grill со следующего шага.' },
    },
  ];
}

// Почему источник не записан и что сделать человеку — без кавычек: текст сам уходит человеку в «…».
const rejectHint = (why, dir) => (why === 'нет такого файла' ? 'проверьте путь (@ и Tab дописывают его сами)' : `положите его в ${dir}/${WORK_DIR}/ и пришлите путь через @`);
const rejectedText = (rejected, dir) =>
  rejected.length ? `Не записал: ${rejected.map((r) => `${r.src} — ${r.why}: ${rejectHint(r.why, dir)}`).join('; ')}.` : null;

export function cmdSources() {
  const m = loadFeature(needDir(pos[0]));
  const dir = rel(m.dir);
  const p = m.protocol;
  if (!p) {
    console.error(`Нет ${rel(m.protocolFile)}: сначала создай протокол из шаблона скилла sdd-grill, затем повтори вызов.`);
    process.exit(2);
  }
  const cur = protocolSources(p);
  // Источники — из argv как есть: pos снимает «@», а по нему путь отличается от слова с «/» в тексте.
  const { found, rejected, none } = extractSources(argv.filter((a) => !a.startsWith('--')).slice(2), m.dir);
  const bad = rejectedText(rejected, dir);
  // После brainstorming источники не собираем: новое требование из материала — позднее решение.
  if (protocolReady(p)) {
    console.log(
      [
        Array.isArray(cur) ? `Источники протокола: ${cur.join(', ')}.` : 'Источников в протоколе нет.',
        found.length || none ? 'Протокол готов — источники больше не записываю.' : null,
        found.length ? `Новое требование из материала — решение: ${skill('sdd-decide', m.name, '"<вопрос>"', '"<решение>"')}.` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
    process.exit(0);
  }
  let next = cur;
  if (found.length) next = uniq([...(Array.isArray(cur) ? cur : []), ...found]);
  else if (none && cur == null) next = 'none';
  const added = Array.isArray(next) ? next.filter((s) => !(Array.isArray(cur) && cur.includes(s))) : [];
  if (JSON.stringify(next) !== JSON.stringify(cur)) fs.writeFileSync(p.file, writeSourcesLine(p.md, next === 'none' ? 'нет' : next.join(', ')));

  if (next == null) {
    const say = bad ? `Сначала одной строкой скажи человеку: «${bad}» ` : '';
    const view = questionsView(dir, 'Источники не указаны', [{ header: 'Источники', question: 'Есть что передать, чтобы было проще?', options: sourcesOptions(m) }]);
    view.instruction = `${say}${view.instruction} Человек вместо варианта сразу прислал ссылки, файлы или текст — это ответ «Да, пришлю». ${answerTask(dir)}`;
    console.log(JSON.stringify(view, null, 2));
    process.exit(0);
  }
  if (next === 'none') {
    console.log(
      [`Источники: нет — ${cur === 'none' ? 'уже' : 'записал'} в ${rel(p.file)}.`, bad ? `Скажи человеку: «${bad}»` : null, 'Строй design tree по фразе запроса.'].filter(Boolean).join('\n'),
    );
    process.exit(0);
  }
  const list = next.map((s) => {
    const why = sourceProblem(s);
    return `  - ${s} — ${why ? `${why}: скажи человеку, попроси прислать заново` : sourceKind(s)}${added.includes(s) ? ' (новый)' : ''}`;
  });
  console.log(
    [
      `Источники в ${rel(p.file)}:`,
      ...list,
      bad ? `Скажи человеку: «${bad}»` : null,
      '',
      'Прочитай каждый источник до design tree; папка — файлы в ней. Ссылка не открывается — скажи человеку, какая, попроси текст или файл через @ и продолжай без неё.',
      'Факты о системе из источников не спрашивай. Требование из источника — решение человека: задай его вопросом с рекомендацией по источнику («В задаче — до 500 символов. Оставляем?»), чтобы оно попало в протокол.',
    ]
      .filter((x) => x !== null)
      .join('\n'),
  );
  process.exit(0);
}
