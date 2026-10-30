// Команды ask и choose.
import { execFileSync } from 'node:child_process';

import { pos } from './args.mjs';
import { lintArgs, askOf, askView } from './ask.mjs';
import { closeOptions } from './close.mjs';
import { targetFiles } from './cmd-guard.mjs';
import { SELF, skillPrompt } from './cmd-prompt.mjs';
import { loadFeature } from './feature.mjs';
import { rel } from './md.mjs';
import { needDir } from './pick.mjs';
import { saveSnapshot } from './snapshot.mjs';
import { tempArtifacts } from './stage.mjs';
import { startQuestion } from './start.mjs';

export function cmdAsk() {
  const m = loadFeature(needDir(pos[0]));
  console.log(JSON.stringify(askView(m), null, 2));
  process.exit(0);
}
export function cmdChoose() {
  const m = loadFeature(needDir(pos[0]));
  const id = pos[1];
  // Подтверждение close задаёт сам close, поэтому его варианты в askOf нет: добавляем, пока есть что удалять.
  // Вопросы старта /sdd-grill (источники) задаёт сам start — их варианты тоже здесь, пока вопрос актуален.
  const all = [...askOf(m).questions.flatMap((q) => q.options), ...(tempArtifacts(m).length ? closeOptions(m) : []), ...(startQuestion(m)?.options || [])];
  const opt = all.find((o) => o.id === id);
  const again = `Следующий вопрос: sdd_lint с args ${lintArgs(['ask', rel(m.dir)])}.`;
  if (!opt) {
    console.error(`${id ? `Варианта «${id}» сейчас нет — этап изменился` : 'Укажи вариант'}. Варианты: ${all.map((o) => o.id).join(', ') || 'нет'}. Задай вопрос заново: sdd_lint с args ${lintArgs(['ask', rel(m.dir)])}.`);
    process.exit(2);
  }
  const a = opt.action;
  if (a.lint) {
    let out = '';
    let code = 0;
    try {
      out = execFileSync(process.execPath, [SELF, ...a.lint], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      out = `${e.stdout || ''}${e.stderr || ''}`;
      code = typeof e.status === 'number' ? e.status : 1;
    }
    // after — что делать дальше, когда команда прошла (gen slices: продолжить скилл, а не новый вопрос).
    const tail = code ? 'Передай вывод человеку как есть. Остановись.' : a.after || `Передай вывод человеку как есть. ${again}`;
    console.log(`${out.trimEnd()}\n\n${tail}`);
    process.exit(code);
  }
  if (a.subagent) {
    if (a.snapshot) for (const f of targetFiles(a.snapshot)) saveSnapshot(f);
    const none = a.fallback ? `\n\nСабагентов у тебя нет — задание сам не выполняй: передай человеку дословно «${a.fallback}» и остановись.` : '';
    console.log(`Запусти сабагента. Его задача целиком, ничего не добавляй и не пересказывай:\n\n${a.subagent}\n\nОтвет сабагента передай человеку как есть. ${again}${none}`);
  } else if (a.here) console.log(skillPrompt(a.here[1], a.here.slice(2)));
  else if (a.show) console.log(`Передай человеку дословно и остановись:\n\n${a.show}`);
  // wait — вопрос с ответом своими словами: ответ уходит в скрипт, а не в рассуждения агента.
  else if (a.wait) console.log(`Передай человеку дословно и жди ответа:\n\n${a.wait}\n\nОтвет человека передай дословно: sdd_lint с args ${lintArgs(a.then)}.`);
  else console.log('Ничего не делай, остановись.');
  process.exit(0);
}
