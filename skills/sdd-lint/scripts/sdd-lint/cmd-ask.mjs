// Команды ask и choose.
import { execFileSync } from 'node:child_process';

import { pos } from './args.mjs';
import { lintArgs, askOf, askView } from './ask.mjs';
import { targetFiles } from './cmd-guard.mjs';
import { SELF, skillPrompt } from './cmd-prompt.mjs';
import { loadFeature } from './feature.mjs';
import { rel } from './md.mjs';
import { needDir } from './pick.mjs';
import { saveSnapshot } from './snapshot.mjs';

export function cmdAsk() {
  const m = loadFeature(needDir(pos[0]));
  console.log(JSON.stringify(askView(m), null, 2));
  process.exit(0);
}
export function cmdChoose() {
  const m = loadFeature(needDir(pos[0]));
  const id = pos[1];
  const all = askOf(m).questions.flatMap((q) => q.options);
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
    console.log(`${out.trimEnd()}\n\nПередай вывод человеку как есть. ${code ? 'Остановись.' : again}`);
    process.exit(code);
  }
  if (a.subagent) {
    if (a.snapshot) for (const f of targetFiles(a.snapshot)) saveSnapshot(f);
    const none = a.fallback ? `\n\nСабагентов у тебя нет — задание сам не выполняй: передай человеку дословно «${a.fallback}» и остановись.` : '';
    console.log(`Запусти сабагента. Его задача целиком, ничего не добавляй и не пересказывай:\n\n${a.subagent}\n\nОтвет сабагента передай человеку как есть. ${again}${none}`);
  } else if (a.here) console.log(skillPrompt(a.here[1], a.here.slice(2)));
  else if (a.show) console.log(`Передай человеку дословно и остановись:\n\n${a.show}`);
  else console.log('Ничего не делай, остановись.');
  process.exit(0);
}
