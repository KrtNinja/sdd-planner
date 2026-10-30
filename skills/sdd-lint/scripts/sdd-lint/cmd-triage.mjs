// Команда triage: решение человека по находке ревью — в файлы скриптом, а не правкой таблицы моделью.
// open — в открытые вопросы артефакта; ignore — снять: «отклонено» в ревью и строка в «Снято на ревью» протокола;
// П<n> / «исправлено» — решение провёл /sdd-decide; remarks — какие замечания разбирать, остальные снять.
import fs from 'node:fs';

import { pos } from './args.mjs';
import { usage } from './cli.mjs';
import { loadFeature } from './feature.mjs';
import { hasSection, inSection, plural, rel, scan, tables, today } from './md.mjs';
import { addOpenQuestion, openTarget, openText } from './open-questions.mjs';
import { needDir } from './pick.mjs';
import { DROPPED_RE, DROPPED_TITLE } from './protocol.mjs';
import { DECISION, findRow, untriagedRemarks, withDecisions } from './review.mjs';

const fail = (msg) => {
  console.log(msg);
  process.exit(2);
};
const cell = (s) => (s || '—').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

// Снятые находки — в протокол, раздел «Снято на ревью»: gate review отдаёт его ревьюеру, и тот их не поднимает.
// Протокола нет (фича закрыта) — остаётся только «отклонено» в файле ревью.
function addDropped(m, key, rows) {
  if (!m.protocol || !rows.length) return false;
  const lines = rows.map((r) => `| ${today()} | ${key} ${r.id} | ${cell(r.where)} | ${cell(r.what)} | ${r.blocker ? 'блокер' : 'замечание'}: не исправлять |`);
  let md = m.protocol.md;
  const sc = scan(md);
  const t = hasSection(sc, DROPPED_RE) ? tables(inSection(sc, DROPPED_RE))[0] : null;
  if (t) {
    const ls = md.split('\n');
    ls.splice(t.end, 0, ...lines);
    md = ls.join('\n');
  } else {
    md =
      `${md.replace(/\s*$/, '')}\n\n## ${DROPPED_TITLE}\n\n` +
      'Находки ревью, которые человек решил не исправлять: повторное ревью их не поднимает.\n\n' +
      `| Когда | Ревью | Где | Что не так | Статус |\n|---|---|---|---|---|\n${lines.join('\n')}\n`;
  }
  fs.writeFileSync(m.protocolFile, md);
  return true;
}

function save(rv, decisions) {
  fs.writeFileSync(rv.file, withDecisions(rv, decisions));
}

// Номера замечаний из ответа человека: «R3, R5», «3 и 5», «r3 r5».
const pickedIds = (text) => [...new Set([...String(text).matchAll(/(?:^|[^\p{L}\d])R?\s*(\d+)(?!\d)/giu)].map((x) => `R${x[1]}`))];

export function cmdTriage() {
  const m = loadFeature(needDir(pos[0]));
  const [ref, verb, ...rest] = pos.slice(1);
  if (!ref || !verb) usage('Укажи находку и решение: triage docs/<feature> <ревью>:R<n> open|ignore|П<n>|исправлено или triage docs/<feature> <ревью> remarks all|none|<номера>');
  const [key, rid] = ref.split(':');
  const rv = m.reviews.get(key);
  if (!rv) fail(`Ревью «${key}» нет. Есть: ${[...m.reviews.keys()].join(', ') || 'файлов ревью нет'}.`);
  const file = rel(rv.file);

  if (verb === 'remarks') {
    const pending = untriagedRemarks(rv);
    if (!pending.length) fail(`В ${file} нет замечаний без решения.`);
    const arg = rest.join(' ').trim();
    const all = pending.map((r) => r.id);
    let take;
    if (arg === 'all') take = all;
    else if (arg === 'none') take = [];
    else {
      const ids = pickedIds(arg);
      const unknown = ids.filter((x) => !all.includes(x));
      if (!ids.length || unknown.length)
        fail(`${ids.length ? `Не нашёл среди замечаний без решения: ${unknown.join(', ')}.` : 'Не понял номера.'} Замечания: ${all.join(', ')}. Напишите номера ещё раз, например: ${all.slice(0, 2).join(', ')}.`);
      take = ids;
    }
    const drop = pending.filter((r) => !take.includes(r.id));
    save(rv, new Map([...take.map((id) => [id, DECISION.queue]), ...drop.map((r) => [r.id, DECISION.ignore])]));
    const logged = addDropped(m, key, drop);
    const out = [];
    if (take.length) out.push(`К разбору: ${take.join(', ')} — по одному.`);
    if (drop.length) out.push(`Сняты: ${drop.map((r) => r.id).join(', ')} — «отклонено» в ${file}${logged ? `, ${plural(drop.length, 'строка', 'строки', 'строк')} в «${DROPPED_TITLE}» протокола: повторное ревью их не поднимет` : ''}.`);
    console.log(out.join('\n'));
    process.exit(0);
  }

  const r = findRow(rv, rid);
  if (!r) fail(`Находки ${rid || '—'} в ${file} нет. Есть: ${rv.rows.map((x) => x.id).join(', ') || 'нет'}.`);
  if (verb === 'open') {
    const target = openTarget(m, key, r);
    if (!target) fail(`Не понял, в какой файл записать вопрос по ${r.id}: в «Где» нет slice, AC или FR. Спроси человека, куда его записать.`);
    const n = addOpenQuestion(target, openText(r, target.adr));
    save(rv, new Map([[r.id, DECISION.open]]));
    console.log(
      `${r.id} → открытый вопрос: ${rel(target.file)}:${n} («${target.title}»).` +
        (target.adr ? '' : ' Одобрение подождёт ответа: «Одобрить» сначала спросит его.'),
    );
  } else if (verb === 'ignore') {
    save(rv, new Map([[r.id, DECISION.ignore]]));
    const logged = addDropped(m, key, [r]);
    console.log(`${r.id} снят: «отклонено» в ${file}${logged ? `, строка в «${DROPPED_TITLE}» протокола — повторное ревью его не поднимет` : ''}.`);
  } else if (/^П\d+$/.test(verb) || verb === 'исправлено') {
    save(rv, new Map([[r.id, verb]]));
    console.log(`${r.id}: «Решение» — ${verb} (${file}).`);
  } else fail(`Решение «${verb}» не бывает: open, ignore, П<n> или «исправлено».`);
  process.exit(0);
}
