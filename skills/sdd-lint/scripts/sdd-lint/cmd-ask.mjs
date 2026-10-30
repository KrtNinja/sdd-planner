// Команды ask и choose.
import { execFileSync } from 'node:child_process';

import { pos } from './args.mjs';
import { askOf, askView } from './ask.mjs';
import { closeOptions } from './close.mjs';
import { targetFiles } from './cmd-guard.mjs';
import { SELF, skillPrompt } from './cmd-prompt.mjs';
import { loadFeature } from './feature.mjs';
import { rel } from './md.mjs';
import { needDir } from './pick.mjs';
import { ANSWER, lintArgs, lintCall, waitText } from './question.mjs';
import { saveSnapshot } from './snapshot.mjs';
import { tempArtifacts } from './stage.mjs';
import { startQuestion } from './start.mjs';

export function cmdAsk() {
  const m = loadFeature(needDir(pos[0]));
  console.log(JSON.stringify(askView(m), null, 2));
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
// asked — вопрос, на который ответ пришёл: ответ не понят (код 2) — спросить ещё раз.
function run(m, a, asked = null) {
  const again = lintCall(['ask', rel(m.dir)]);
  const next = a.next ? `Следующий шаг: ${lintCall(a.next)}` : `Следующий вопрос: ${again}`;
  if (a.lint) {
    const { out, code } = runLint(a.lint);
    if (code === 2 && a.retry && asked) {
      console.log(`${out.trimEnd()}\n\n${waitText(asked.wait, asked.then)}`);
      process.exit(0);
    }
    // after — что делать дальше, когда команда прошла (gen slices: продолжить скилл, а не новый вопрос).
    const tail = code ? 'Передай вывод человеку как есть. Остановись.' : a.after || `Передай вывод человеку как есть. Следующий вопрос: ${again}.`;
    console.log(`${out.trimEnd()}\n\n${tail}`);
    process.exit(code);
  }
  if (a.subagent) {
    if (a.snapshot) for (const f of targetFiles(a.snapshot)) saveSnapshot(f);
    // Без сабагентов: here — тот же скилл здесь, fallback — команда, которую человек запустит в новом окне.
    const none = a.here
      ? `\n\nСабагентов у тебя нет — вызови ${lintCall(a.here)} и выполни, что он вернёт, здесь${a.next ? `; вопрос этапа в конце не задавай. ${next}` : ''}.`
      : a.fallback
        ? `\n\nСабагентов у тебя нет — задание сам не выполняй: передай человеку дословно «${a.fallback}» и остановись.`
        : '';
    console.log(`Запусти сабагента. Его задача целиком, ничего не добавляй и не пересказывай:\n\n${a.subagent}\n\nОтвет сабагента передай человеку как есть. ${next}.${none}`);
  } else if (a.here) console.log(skillPrompt(a.here[1], a.here.slice(2)));
  else if (a.show) console.log(`Передай человеку дословно и остановись:\n\n${a.show}`);
  else if (a.wait) console.log(waitText(a.wait, a.then));
  else console.log('Ничего не делай, остановись.');
  process.exit(0);
}

export function cmdChoose() {
  const m = loadFeature(needDir(pos[0]));
  const [id, answer] = [pos[1], pos[2]];
  // Подтверждение close задаёт сам close, поэтому его варианты в askOf нет: добавляем, пока есть что удалять.
  // Вопросы старта /sdd-grill (источники) задаёт сам start — их варианты тоже здесь, пока вопрос актуален.
  const all = [...askOf(m).questions.flatMap((q) => q.options), ...(tempArtifacts(m).length ? closeOptions(m) : []), ...(startQuestion(m)?.options || [])];
  const opt = all.find((o) => o.id === id);
  if (!opt) {
    console.error(`${id ? `Варианта «${id}» сейчас нет — этап изменился` : 'Укажи вариант'}. Варианты: ${all.map((o) => o.id).join(', ') || 'нет'}. Задай вопрос заново: sdd_lint с args ${lintArgs(['ask', rel(m.dir)])}.`);
    process.exit(2);
  }
  const a = opt.action;
  // Ответ человека на wait: answer превращает его в действие (decide в сабагенте, triage).
  if (answer !== undefined && a.answer) {
    if (!answer.trim() || answer === ANSWER) {
      console.log(`Ответа нет. ${waitText(a.wait, a.then)}`);
      process.exit(0);
    }
    run(m, a.answer(answer), a);
  }
  run(m, a);
}
