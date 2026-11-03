// Старт /sdd-grill по шагам: задача → имя и папка фичи → источники → исследование сабагентом → «Старт готов».
// @ts-check
// Агент передаёт сюда ответы человека и делает, что сказано в выводе: вопросы и задания — данные скрипта.
import fs from 'node:fs';
import path from 'node:path';

import { askOf } from './ask.mjs';
import { SKILLS_DIR } from './cmd-prompt.mjs';
import { skillCode, lintCode } from './config.mjs';
import { loadContext, markContext } from './context.mjs';
import { loadFeature } from './feature.mjs';
import { item } from './findings.mjs';
import { NEW_PROJECT, REPO, caseTwin, classify, inventory, parseSourcesAnswer, requestOf, slugProblem, titleOf } from './input.mjs';
import { dropHeader, header, read, rel, setHeader, uniq } from './md.mjs';
import { folderName, nameTrouble } from './name.mjs';
import { DOCS, isDir, listFeatures } from './pick.mjs';
import { ANSWER, questionsView, viewText, waitText } from './question.mjs';
import { A, G, blocks, screen } from './screen.mjs';
import { bump, reset } from './runs.mjs';
import { GIVE, NONE, SPECIAL, projectSources, sourcesOf, startState, writeSources } from './start-sources.mjs';

/** @typedef {import('./model.mjs').Feature} Feature */
/** @typedef {import('./model.mjs').Protocol} Protocol */
/** @typedef {import('./question.mjs').Question} Question */
/** @typedef {import('./start-sources.mjs').StartState} StartState */

// Часть строки ⚙: человек попросит другое имя папки — куда его передать.
/** @param {string} d */
const rename = (d) => `другое имя папки → ${A(['start', d, '--rename', '<имя>'])}`;


/** @param {Feature} m @param {Question} q @param {string[]} [lead] */
const questionText = (m, q, lead = []) => viewText(questionsView(rel(m.dir), 'Brainstorming: источники', [q], { lead: blocks(lead), extra: [rename(rel(m.dir))] }));
/** @param {Feature} m @param {boolean} created @param {string[] | null} [again] */
function researchText(m, created, again = null) {
  const d = rel(m.dir);
  const say = created ? `Папка фичи — \`${d}\` (другое имя — напишите, какое). Изучаю источники, это займёт несколько минут.` : 'Изучаю источники, это займёт несколько минут.';
  return screen(
    blocks(again || say),
    G.sub(['research', 'context', d]),
    G.quiet,
    G.then(['start', d]),
    G.same,
    created ? rename(d) : null,
  );
}
/** @param {Feature} m @param {StartState & { step: 'ready' }} st @param {boolean} created @param {string | null} warn */
function readyText(m, st, created, warn) {
  const d = rel(m.dir);
  const p = /** @type {Protocol} */ (m.protocol);
  const rows = p.rows.length;
  const last = p.rows[rows - 1];
  const parts = ['старт готов', `фича ${d}`];
  if (st.ctx) {
    parts.push(`прочитай ${rel(st.ctx.file)} целиком (фактов ${st.ctx.facts}): эти факты известны, у человека их не спрашивай; «Не нашёл» — кандидаты в вопросы`);
    if (st.ctx.decided.length && !rows)
      parts.push(`«Уже решено в задаче» ${st.ctx.decided.length} — до первого раунда допиши каждое строкой в «Решения»: рекомендация «—», решение «из задачи: <как в задаче>»; снова не спрашивай`);
  } else if (st.src.includes(NEW_PROJECT)) parts.push('контекста нет, новый проект: спрашивай, как должно быть, а не как устроено сейчас');
  else parts.push('контекста нет, источников нет: что есть сейчас (роли, сервисы, данные) спрашивай коротко, как факт, без рекомендации');
  parts.push(rows ? `решений ${rows}, последнее #${last.id} «${last.q}» — продолжи с веток без решения` : 'протокол пуст — начни с design tree');
  parts.push(`${G.skill} со 2-го шага`);
  if (created) parts.push(rename(d));
  const say = rows
    ? `Продолжаем \`${d}\`: решений ${rows}. Всё нужное — в протоколе и контексте, историю чата держать не нужно.`
    : `Начинаем brainstorming \`${d}\`${created ? ' (другое имя папки — напишите, какое)' : ''}. Вопросы — блоками; отвечайте вариантом или своими словами.`;
  return screen(blocks(say, warn), parts);
}

// Фича с папкой: следующий шаг старта.
/** @param {string} dir @param {{ created?: boolean }} [opts] */
export function resume(dir, { created = false } = {}) {
  const m = loadFeature(dir);
  const d = rel(m.dir);
  if (!m.protocol) {
    if (m.spec) return screen(`Brainstorming \`${d}\` пройден и закрыт: есть spec.md. Поменять поведение — ${skillCode('sdd-decide', m.name, '"<вопрос>"', '"<решение>"')}; что дальше по фиче — ${lintCode(m.name)}.`, G.stop);
    return askTask({}, m.name);
  }
  if (/готов/i.test(m.protocol.status || '')) {
    const { stage, questions } = askOf(m);
    return viewText(questionsView(d, stage, questions, { lead: `Протокол \`${d}\` готов: brainstorming закончен, новое решение — через ${skillCode('sdd-decide', m.name)}.` }));
  }
  let st = startState(m);
  if (st.step === 'sources') return questionText(m, st.question, created ? [`Создан \`${d}/brainstorming.md\`.`] : []);
  if (st.step === 'research') return researchText(m, created);
  /** @type {string | null} */
  let warn = null;
  if (st.step === 'fix') {
    const { runs } = bump(m.dir, 'research');
    if (runs <= 2)
      return researchText(m, created, [
        `Контекст \`${rel(st.ctx.file)}\` не прошёл проверку — изучаю заново, попытка ${runs} из 2:\n${st.errs.map(item).join('\n')}`,
        'Сабагент получит этот список вместе с заданием.',
      ]);
    // Две попытки не помогли — идём дальше, но агент знает, каким фактам не верить сразу.
    markContext(st.ctx, 'Проверено');
    warn = `В контексте остались ошибки (${st.errs.length}): факты с ними перепроверю, прежде чем на них опираться.`;
    st = startState(m);
  }
  reset(m.dir, 'research');
  if (st.step === 'after') return questionText(m, st.question, warn ? [warn] : []);
  // После fix startState даёт after или ready, after вернулся выше.
  return readyText(m, /** @type {StartState & { step: 'ready' }} */ (st), created, warn);
}

function startedFeatures() {
  return listFeatures().filter((f) => {
    const md = read(path.join(DOCS, f, 'brainstorming.md'));
    return md && !/готов/i.test(header(md, 'Статус') || '');
  });
}
/** @param {{ sources?: string[] }} [input] @param {string | null} [slug] */
export function askTask({ sources = [] } = {}, slug = null) {
  const started = startedFeatures();
  const args = ['start', `${ANSWER}${sources.length ? ` ${sources.join(' ')}` : ''}`, ...(slug ? ['--slug', slug] : [])];
  return waitText(
    blocks(
      'Какую задачу будем делать? Опишите одной-двумя фразами, что должно появиться или измениться. Задача уже записана в файле — укажите его: `@путь` (Tab дополнит).',
      started.length ? `Начатые: ${started.join(', ')} — чтобы продолжить, напишите имя.` : null,
    ),
    args,
    sources.length ? ['источники в конце args уже дописаны — оставь их'] : [],
  );
}

/**
 * @param {import('./input.mjs').Input & { kind: 'task' }} c @param {string} slug @param {string} raw @param {boolean} own
 * @returns {{ dir: string, text?: undefined } | { text: string, dir?: undefined }}
 */
function createFeature(c, slug, raw, own) {
  const trouble = nameTrouble(slug, raw, own);
  if (trouble) return { text: trouble };
  const dir = path.join(DOCS, slug);
  if (!isDir(DOCS) && !fs.existsSync('.git'))
    return {
      text: screen(
        `Здесь (\`${process.cwd()}\`) нет папки \`${DOCS}/\` и git — похоже, GigaCode запущен не из репозитория с доками. Запустите его из корня репозитория или создайте здесь папку \`${DOCS}/\` и повторите ${skillCode('sdd-grill')}.`,
        G.stop,
      ),
    };
  let md = /** @type {string} */ (read(path.join(SKILLS_DIR, 'sdd-grill', 'assets', 'brainstorming.md')));
  md = md.replace('<Фича>', titleOf(c.task, slug)).replace(/^Запрос:.*$/m, () => `Запрос: ${requestOf(c.task)}`);
  if (c.sources.length) md = setHeader(md, 'Источники', c.sources.join('; '), ['Запрос']);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'brainstorming.md'), md);
  return { dir };
}

// Всё, что человек написал после /sdd-grill. slug — имя папки, которое придумал агент;
// name — ответ человека на вопрос «Как назвать папку?»: id варианта или имя словами.
/** @param {string} raw @param {string | null} [slug] @param {string | null} [name] */
export function startFrom(raw, slug = null, name = null) {
  const c = classify(raw);
  if (c.missing.length)
    return waitText(`Не нашёл ${c.missing.map((x) => `\`${x}\``).join(', ')}. Проверьте путь: начните с \`@\` — Tab дополнит. Или пришлите ссылку.`, ['start', '<прежний текст, путь — из ответа человека>']);
  if (c.kind === 'feature') {
    if (c.sources.length) return addSources(c.dir, c.sources.join(' '));
    return resume(c.dir);
  }
  if (c.kind !== 'task') return askTask(c, slug || c.slug);
  const n = folderName(c, raw, slug, name);
  if (n.text) return n.text;
  // Вопроса нет — имя есть (folderName).
  const r = createFeature(c, /** @type {string} */ (n.slug), raw, /** @type {boolean} */ (n.own));
  if (r.text) return r.text;
  const note = n.from ? `Из ответа «${n.from}» взято имя папки \`${n.slug}\`.` : null;
  return blocks(note, resume(/** @type {string} */ (r.dir), { created: true }));
}

// То, что уже в папке, как источник: «репозиторий», если там что-то есть.
/** @param {Feature} m */
const inventoryRepo = (m) => (inventory(m.name).empty ? [] : [REPO]);

// Ответ человека про источники: пути и ссылки дописываются, «нет» и «новый проект» — особые значения.
/** @param {string} dir @param {string} answer */
export function addSources(dir, answer) {
  const m = loadFeature(dir);
  const d = rel(m.dir);
  if (!m.protocol) return askTask({}, m.name);
  const a = parseSourcesAnswer(answer);
  const ask = (/** @type {string} */ text) => waitText(text, ['start', d, '--sources', ANSWER]);
  if (a.missing.length) return ask(`Не нашёл ${a.missing.map((x) => `\`${x}\``).join(', ')}. Проверьте путь: начните с \`@\` — Tab дополнит. Или пришлите ссылку.`);
  if (a.unclear) return ask(`Из ответа не понял, есть ли источники. ${GIVE} Нет ничего — напишите «нет».`);
  const cur = sourcesOf(m.protocol) || [];
  const ctx = loadContext(m);
  if (a.retry) {
    // Доступ дали — изучить заново: шапка контекста не совпадёт с источниками.
    if (ctx) fs.writeFileSync(ctx.file, dropHeader(dropHeader(setHeader(ctx.md, 'Источники', '—'), 'Проверено'), 'Принято'));
    return resume(dir);
  }
  if (a.none) {
    if (cur.length) {
      if (ctx) markContext(ctx, 'Принято');
    } else writeSources(m, [inventory(m.name).empty ? NONE : REPO]);
    return resume(dir);
  }
  const fresh = a.entries.filter((x) => !SPECIAL.includes(x));
  if (!fresh.length) writeSources(m, projectSources(cur).length ? projectSources(cur) : [NEW_PROJECT]);
  else {
    // «Да, вот …» на первый вопрос — это дополнительная документация: то, что уже в папке, изучаем тоже.
    const base = cur.length ? projectSources(cur) : inventoryRepo(m);
    writeSources(m, uniq([...base, ...fresh]));
  }
  return resume(dir);
}
/** @param {string} dir */
export function acceptContext(dir) {
  const m = loadFeature(dir);
  const ctx = loadContext(m);
  if (ctx) markContext(ctx, 'Принято');
  return resume(dir);
}
/** @param {string} dir @param {string} slug */
export function renameFeature(dir, slug) {
  const m = loadFeature(dir);
  const d = rel(m.dir);
  const problem = slugProblem(slug);
  if (problem) return waitText(`Имя папки ${problem}. Какое имя взять?`, ['start', d, '--rename', ANSWER]);
  if (m.spec || !m.protocol || /готов/i.test(m.protocol.status || '')) return screen(`Переименовать \`${d}\` можно только пока идёт brainstorming.`, G.stop);
  const to = path.join(path.dirname(m.dir), slug);
  const twin = caseTwin(slug, m.name);
  if (twin) return waitText(`\`${DOCS}/${twin}\` уже есть: имена, которые отличаются только регистром, на macOS и Windows — одна папка. Какое имя взять?`, ['start', d, '--rename', ANSWER]);
  if (fs.existsSync(to) && slug.toLowerCase() !== m.name.toLowerCase()) return waitText(`\`${rel(to)}\` уже есть. Какое имя взять?`, ['start', d, '--rename', ANSWER]);
  fs.renameSync(m.dir, to);
  return blocks(`Папка \`${d}\` теперь \`${rel(to)}\`.`, resume(to));
}
