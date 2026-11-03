// Команда triage: решение человека по находке ревью — в файлы скриптом, а не правкой таблицы моделью.
// @ts-check
// open — в открытые вопросы артефакта; ignore — снять: «отклонено» в ревью и строка в «Снято на ревью» протокола;
// П<n> / «исправлено» — решение провёл /sdd-decide; remarks — какие замечания разбирать, остальные снять.
import fs from 'node:fs';

import { usage } from './cli.mjs';
import { loadFeature } from './feature.mjs';
import { hasSection, inSection, plural, rel, scan, tables, today } from './md.mjs';
import { addOpenQuestion, openTarget, openText } from './open-questions.mjs';
import { needDir } from './pick.mjs';
import { DROPPED_RE, DROPPED_TITLE } from './protocol.mjs';
import { DECISION, findRow, untriagedRemarks, withDecisions } from './review.mjs';
import { codePaths } from './screen.mjs';

/** @typedef {import('./io.mjs').Ctx} Ctx */
/** @typedef {import('./model.mjs').Feature} Feature */
/** @typedef {import('./model.mjs').Review} Review */
/** @typedef {import('./model.mjs').ReviewRow} ReviewRow */

/** @param {string | null | undefined} s */
const cell = (s) => (s || '—').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

// Снятые находки — в протокол, раздел «Снято на ревью»: gate review отдаёт его ревьюеру, и тот их не поднимает.
// Протокола нет (фича закрыта) — остаётся только «отклонено» в файле ревью.
/** @param {Feature} m @param {string} key @param {ReviewRow[]} rows */
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

/** @param {Review} rv @param {Map<string, string>} decisions */
function save(rv, decisions) {
  fs.writeFileSync(rv.file, withDecisions(rv, decisions));
}

// Номера замечаний из ответа человека: «R3, R5», «3 и 5», «r3 r5».
/** @param {string} text */
const pickedIds = (text) => [...new Set([...String(text).matchAll(/(?:^|[^\p{L}\d])R?\s*(\d+)(?!\d)/giu)].map((x) => `R${x[1]}`))];

/** @param {Ctx} ctx */
export function cmdTriage(ctx) {
  const { pos } = ctx.args;
  // Вывод triage — текст человеку; пути — кодом. Строку ⚙ добавляет choose (что дальше).
  const say = (/** @type {string} */ msg) => ctx.io.log(codePaths(msg));
  /** @type {(msg: string) => never} */
  const fail = (msg) => {
    say(msg);
    return ctx.io.exit(2);
  };
  const m = loadFeature(needDir(ctx, pos[0]));
  const [ref, verb, ...rest] = pos.slice(1);
  if (!ref || !verb) usage(ctx, 'Укажи находку и решение: ' +
    'triage docs/<feature> <ревью>:R<n> open|ignore|П<n>|исправлено или triage docs/<feature> <ревью> remarks all|none|<номера>');
  const [key, rid] = ref.split(':');
  const rv = m.reviews.get(key);
  if (!rv) fail(`Ревью «${key}» нет. Есть: ${[...m.reviews.keys()].join(', ') || 'файлов ревью нет'}.`);
  const file = rel(rv.file);

  if (verb === 'remarks') {
    triageRemarks(m, rv, { key, rest, say, fail });
    ctx.io.exit(0);
  }

  const r = findRow(rv, rid);
  if (!r) fail(`Находки ${rid || '—'} в ${file} нет. Есть: ${rv.rows.map((x) => x.id).join(', ') || 'нет'}.`);
  triageFinding(m, rv, { key, r, verb, say, fail });
  ctx.io.exit(0);
}

/** @typedef {{say: (msg: string) => void, fail: (msg: string) => never}} TriageOutput */
/** @param {Feature} m @param {Review} rv @param {TriageOutput & {key: string, rest: string[]}} input */
function triageRemarks(m, rv, { key, rest, say, fail }) {
  const file = rel(rv.file);
  const pending = untriagedRemarks(rv);
  if (!pending.length) fail(`В ${file} нет замечаний без решения.`);
  const arg = rest.join(' ').trim();
  const all = pending.map((r) => r.id);
  const take = selectedRemarks(arg, all, fail);
  const drop = pending.filter((r) => !take.includes(r.id));
  const decisions = /** @type {[string, string][]} */ ([...take.map((id) => [id, DECISION.queue]), ...drop.map((r) => [r.id, DECISION.ignore])]);
  save(rv, new Map(decisions));
  const logged = addDropped(m, key, drop);
  /** @type {string[]} */
  const out = [];
  if (take.length) out.push(`К разбору: ${take.join(', ')} — по одному.`);
  if (drop.length) {
    const inProtocol = logged ? `, ${plural(drop.length, 'строка', 'строки', 'строк')} в «${DROPPED_TITLE}» протокола: повторное ревью их не поднимет` : '';
    out.push(`Сняты: ${drop.map((r) => r.id).join(', ')} — «отклонено» в ${file}${inProtocol}.`);
  }
  say(out.join('\n\n'));
}

/** @param {string} arg @param {string[]} all @param {TriageOutput['fail']} fail */
function selectedRemarks(arg, all, fail) {
  if (arg === 'all') return all;
  else if (arg === 'none') return [];
  else {
    const ids = pickedIds(arg);
    const unknown = ids.filter((x) => !all.includes(x));
    if (!ids.length || unknown.length) {
      const why = ids.length ? `Не нашёл среди замечаний без решения: ${unknown.join(', ')}.` : 'Не понял номера.';
      fail(`${why} Замечания: ${all.join(', ')}. Напишите номера ещё раз, например: ${all.slice(0, 2).join(', ')}.`);
    }
    return ids;
  }
}

/** @param {Feature} m @param {Review} rv @param {TriageOutput & {key: string, r: ReviewRow, verb: string}} input */
function triageFinding(m, rv, { key, r, verb, say, fail }) {
  const file = rel(rv.file);
  if (verb === 'open') {
    const target = openTarget(m, key, r);
    if (!target) return fail(`Не понял, в какой файл записать вопрос по ${r.id}: в «Где» нет slice, AC или FR. Куда его записать?`);
    const n = addOpenQuestion(target, openText(r, target.adr));
    save(rv, new Map([[r.id, DECISION.open]]));
    say(
      `${r.id} → открытый вопрос: ${rel(target.file)}:${n} («${target.title}»).` +
        (target.adr ? '' : ' Одобрение подождёт ответа: «Одобрить» сначала спросит его.'),
    );
  } else if (verb === 'ignore') {
    save(rv, new Map([[r.id, DECISION.ignore]]));
    const logged = addDropped(m, key, [r]);
    say(`${r.id} снят: «отклонено» в ${file}${logged ? `, строка в «${DROPPED_TITLE}» протокола — повторное ревью его не поднимет` : ''}.`);
  } else if (/^П\d+$/.test(verb) || verb === 'исправлено') {
    save(rv, new Map([[r.id, verb]]));
    say(`${r.id}: «Решение» — ${verb} (${file}).`);
  } else fail(`Решение «${verb}» не бывает: open, ignore, П<n> или «исправлено».`);
}
