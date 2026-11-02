// Команды ask и choose.
import { execFileSync } from 'node:child_process';

import { LEGACY, flags, pos } from './legacy.mjs';
import { askOf, askView } from './ask.mjs';
import { closeOptions } from './close.mjs';
import { targetFiles } from './cmd-guard.mjs';
import { SELF, skillPrompt } from './cmd-prompt.mjs';
import { loadFeature } from './feature.mjs';
import { rel } from './md.mjs';
import { needDir } from './pick.mjs';
import { ANSWER, viewText, waitText } from './question.mjs';
import { G, blocks, gearLine, screen, splitGear } from './screen.mjs';
import { saveSnapshot } from './snapshot.mjs';
import { tempArtifacts } from './stage.mjs';
import { startQuestion } from './start.mjs';

export function cmdAsk() {
  const m = loadFeature(needDir(LEGACY, pos[0]));
  console.log(viewText(askView(m)));
  process.exit(0);
}

function runLint(args) {
  try {
    return { out: execFileSync(process.execPath, [SELF, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), code: 0 };
  } catch (e) {
    return { out: `${e.stdout || ''}${e.stderr || ''}`, code: typeof e.status === 'number' ? e.status : 1 };
  }
}
// Одно исполнение для всех действий: выбранного варианта и ответа человека на wait.
// Человеку — карточка (что происходит), агенту — строка ⚙. id — вариант, asked — вопрос, на который
// пришёл ответ: ответ не понят (код 2) — спросить ещё раз.
function run(m, a, id, asked = null) {
  const d = rel(m.dir);
  const next = a.next || ['ask', d];
  if (a.lint) {
    const { out, code } = runLint(a.lint);
    const { card, gear } = splitGear(out);
    if (code === 2 && a.retry && asked) {
      console.log(waitText(blocks(card, asked.wait), asked.then));
      process.exit(0);
    }
    // Вывод команды уже карточка; её строка ⚙ главнее (close --json задаёт свой вопрос, start ведёт дальше).
    // after — что дальше, когда команда прошла (gen slices: продолжить скилл, а не новый вопрос).
    const g = code ? gear || gearLine(G.stop) : a.after ? gearLine(a.after) : gear || gearLine(G.call(next));
    console.log(blocks(card || 'Готово.', g));
    process.exit(code);
  }
  if (a.subagent) {
    if (flags.fallback) {
      console.log(screen(a.fallback || 'Сабагентов нет — этот шаг здесь не выполнить.', G.stop));
      process.exit(0);
    }
    if (a.snapshot) for (const f of targetFiles(LEGACY, a.snapshot)) saveSnapshot(f);
    // Без сабагентов: here — тот же скилл здесь, fallback — что сказать человеку (choose --fallback).
    const none = a.here ? `без сабагентов — ${G.call(a.here)}` : `без сабагентов — ${G.call(['choose', d, id, '--fallback'])}`;
    console.log(screen(a.say, G.sub(a.subagent), a.quiet ? G.quiet : G.report, G.then(next), none));
  } else if (a.here) console.log(screen(skillPrompt(a.here[1], a.here.slice(2)), G.skill));
  else if (a.show) console.log(screen(a.show, G.stop));
  else if (a.wait) console.log(waitText(a.wait, a.then));
  else console.log(screen('Хорошо, ничего не делаю.', G.stop));
  process.exit(0);
}

export function cmdChoose() {
  const m = loadFeature(needDir(LEGACY, pos[0]));
  const d = rel(m.dir);
  const [id, answer] = [pos[1], pos[2]];
  // Подтверждение close задаёт сам close, поэтому его варианта в askOf нет: добавляем, пока есть что удалять.
  // Вопросы старта /sdd-grill (источники) задаёт сам start — их варианты тоже здесь, пока вопрос актуален.
  const all = [...askOf(m).questions.flatMap((q) => q.options), ...(tempArtifacts(m).length ? closeOptions(m) : []), ...(startQuestion(m)?.options || [])];
  const opt = all.find((o) => o.id === id);
  if (!opt) {
    console.error(screen(id ? `Варианта «${id}» сейчас нет — этап изменился. Задам вопрос заново.` : 'Вариант не указан.', G.call(['ask', d])));
    process.exit(2);
  }
  const a = opt.action;
  // Ответ человека на wait: answer превращает его в действие (decide в сабагенте, triage).
  if (answer !== undefined && a.answer) {
    if (!answer.trim() || answer === ANSWER) {
      console.log(waitText(blocks('Ответа нет.', a.wait), a.then));
      process.exit(0);
    }
    run(m, a.answer(answer), id, a);
  }
  run(m, a, id);
}
