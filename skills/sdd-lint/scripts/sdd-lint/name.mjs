// Имя папки фичи на старте /sdd-grill: вопрос «Автоматически» или «Своё», имя от человека, проверка и «занято».
import fs from 'node:fs';
import path from 'node:path';

import { skillCode } from './config.mjs';
import { SLUG_MAX, caseTwin, requestOf, slugFromAnswer, slugFromFile, slugProblem } from './input.mjs';
import { header, read } from './md.mjs';
import { DOCS } from './pick.mjs';
import { ANSWER, pickText, waitText } from './question.mjs';
import { A, G, blocks, screen } from './screen.mjs';

export const NAME_AUTO = 'name:auto';
export const NAME_OWN = 'name:own';
const RULE = `латиница, цифры и дефис, до ${SLUG_MAX} знаков`;
const nameArgs = (raw, v) => ['start', raw, '--name', v];
// «авто», «автоматически», «сам придумай» — словами вместо варианта 1.
const AUTO_WORDS = /^(?:авто\p{L}*|сам[аи]?\s+придумай|придумай(?:\s+сам)?|auto)$/iu;

// Человек не назвал папку: «Автоматически» (рекомендую) или «Своё»; имя можно написать сразу, вместо номера.
function nameQuestion(c, raw, fileSlug) {
  const auto = {
    id: NAME_AUTO,
    label: 'Автоматически',
    recommended: true,
    description: fileSlug ? `\`${DOCS}/${fileSlug}\` (из имени файла задачи)` : 'агент подберёт 2–4 английских слова по задаче',
  };
  const own = { id: NAME_OWN, label: 'Своё', description: 'напишете имя следующим сообщением' };
  const q = { header: 'Папка', question: 'Как назвать папку фичи?', preview: `Задача: ${requestOf(c.task)}. Папка — в \`${DOCS}/\`: ${RULE}.`, options: [auto, own] };
  return pickText(null, q, nameArgs(raw, '<id>'));
}
// why — почему переспрашиваем: имя не подошло или папка занята.
const askName = (raw, why = null) =>
  waitText(why ? blocks(why, 'Какое имя взять?') : `Как назвать папку фичи? ${RULE.charAt(0).toUpperCase()}${RULE.slice(1)} — например, \`user-settings\` или \`PROJECT-4567\`.`, nameArgs(raw, ANSWER));

// Имя новой папки. slug — придумал агент после «Автоматически» или человек написал «/sdd-grill my-feature "…"»;
// name — ответ на вопрос: id варианта или имя словами. { slug, own, from } — создавать (from — ответ человека,
// если скрипт его поправил: человеку об этом скажут); { text } — сначала этот шаг.
export function folderName(c, raw, slug, name) {
  if (slug || c.slug) return { slug: slug || c.slug, own: false };
  const fileSlug = c.task.file ? slugFromFile(c.task.file) : null;
  if (name == null) return { text: nameQuestion(c, raw, fileSlug) };
  const answer = name.trim();
  if (answer === NAME_OWN) return { text: askName(raw) };
  if (answer === NAME_AUTO || AUTO_WORDS.test(answer)) {
    if (fileSlug) return { slug: fileSlug, own: false };
    return {
      text: screen(
        null,
        `придумай имя папки фичи по задаче ${requestOf(c.task)}: 2–4 английских слова строчными через дефис, например user-settings-panel; человека не спрашивай — он выбрал «Автоматически», имя увидит и сможет поменять`,
        G.call(['start', raw, '--slug', '<имя>']),
      ),
    };
  }
  const own = slugFromAnswer(answer);
  return { slug: own, own: true, from: own !== answer && !slugProblem(own) ? answer : null };
}

// Имя не подходит или папка занята — что сказать; null — можно создавать.
// own — имя дал человек: переспросить его, а не поручать агенту.
export function nameTrouble(slug, raw, own) {
  const problem = slugProblem(slug);
  if (problem) return own ? askName(raw, `Имя ${problem}.`) : screen(null, `имя папки ${problem} — придумай другое → ${A(['start', raw, '--slug', '<имя>'])}`);
  const dir = path.join(DOCS, slug);
  const old = read(path.join(dir, 'brainstorming.md'));
  const twin = caseTwin(slug);
  if (twin) {
    const why = `Папка \`${path.join(DOCS, twin)}\` уже есть: имена, которые отличаются только регистром, на macOS и Windows — одна папка.`;
    return own ? askName(raw, why) : screen(null, `папка ${path.join(DOCS, twin)} уже есть и отличается только регистром — придумай другое имя → ${A(['start', raw, '--slug', '<имя>'])}`);
  }
  if (old == null && !fs.existsSync(path.join(dir, 'spec.md'))) return null;
  const was = old ? ` (запрос ${header(old, 'Запрос') || '—'})` : '';
  if (own) return askName(raw, `Папка \`${dir}\` уже занята${was}. Продолжить ту фичу — ${skillCode('sdd-grill', slug)}; для этой задачи нужно другое имя.`);
  return screen(null, `папка ${dir} уже занята${was}`, `та же задача — ${G.call(['start', dir])}`, `другая — придумай другое имя → ${A(['start', raw, '--slug', '<имя>'])}`);
}
