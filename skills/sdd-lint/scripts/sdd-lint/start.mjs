// Старт /sdd-grill по шагам: задача → имя и папка фичи → источники → исследование сабагентом → «Старт готов».
// Агент передаёт сюда ответы человека и делает, что сказано в выводе: вопросы и задания — данные скрипта.
import fs from 'node:fs';
import path from 'node:path';

import { askOf } from './ask.mjs';
import { SKILLS_DIR } from './cmd-prompt.mjs';
import { skillCode, lintCode } from './config.mjs';
import { contextFindings, loadContext, markContext, syncContext } from './context.mjs';
import { loadFeature } from './feature.mjs';
import { item } from './findings.mjs';
import { NEW_PROJECT, REPO, caseTwin, classify, inventory, outside, parseSourcesAnswer, requestOf, slugProblem, titleOf } from './input.mjs';
import { dropHeader, header, read, rel, setHeader, uniq } from './md.mjs';
import { folderName, nameTrouble } from './name.mjs';
import { DOCS, isDir, listFeatures } from './pick.mjs';
import { ANSWER, questionsView, viewText, waitText } from './question.mjs';
import { A, G, blocks, codePaths, list, screen } from './screen.mjs';
import { bump, reset } from './runs.mjs';

// «нет» — источников нет, но проект не новый: о том, как устроено сейчас, спрашиваем человека.
export const NONE = 'нет';
const SPECIAL = [NEW_PROJECT, NONE];
const GIVE =
  'Пришлите пути или ссылки — можно несколько, через пробел. Надёжнее пути на этом компьютере: начните с @, Tab дополнит. ' +
  'Внутренние сайты (вики, GitLab) агент может не открыть — тогда сохраните страницу в файл и дайте путь.';
const MORE = 'Пришлите ещё пути или ссылки. Дали доступ к папке (/directory add <путь>) — напишите «готово», изучу заново.';
// Часть строки ⚙: человек попросит другое имя папки — куда его передать.
const rename = (d) => `другое имя папки → ${A(['start', d, '--rename', '<имя>'])}`;

export function sourcesOf(p) {
  const v = header(p?.md, 'Источники');
  if (!v || /^<.*>$/.test(v) || /^[—–-]?$/.test(v)) return null;
  return v.split(/\s*;\s*/).filter(Boolean);
}
export function taskOf(p) {
  const q = header(p.md, 'Запрос') || '';
  const f = q.match(/^файл\s+(.+)$/);
  if (f) return { file: f[1].trim(), line: q };
  const u = q.match(/^ссылка\s+(\S+)/);
  if (u) return { url: u[1], line: q };
  return { text: q.replace(/^«|»$/g, ''), line: q };
}
const projectSources = (src) => src.filter((x) => !SPECIAL.includes(x));
// Что изучать: файл или ссылку задачи, затем источники проекта.
export const researchList = (task, src) => [...(task.file ? [task.file] : task.url ? [task.url] : []), ...projectSources(src)];
const writeSources = (m, list) => fs.writeFileSync(m.protocolFile, setHeader(m.protocol.md, 'Источники', list.join('; '), ['Запрос', 'Статус']));

function sourcesQuestion(m) {
  const d = rel(m.dir);
  const inv = inventory(m.name);
  const repo = { id: 'src:repo', label: 'Нет, хватит того, что в этой папке', description: 'сабагент изучит то, что уже здесь', action: { lint: ['start', d, '--sources', REPO] } };
  const give = { id: 'src:give', label: 'Да, пришлю пути или ссылки', description: 'следующим сообщением', action: { wait: GIVE, then: ['start', d, '--sources', ANSWER] } };
  const fresh = { id: 'src:new', label: 'Нет, это новый проект', description: 'изучать нечего: спрошу, как должно быть', action: { lint: ['start', d, '--sources', NEW_PROJECT] } };
  // Есть код или несколько документов — изучить их и не мучить человека; почти пусто — попросить источники.
  const options = inv.empty ? [give, fresh] : inv.code > 0 || inv.docs >= 2 ? [repo, give, fresh] : [give, repo, fresh];
  options[0].recommended = true;
  const seen = inv.empty ? 'В этой папке, кроме фичи, ничего нет.' : `В этой папке уже вижу:\n${list(inv.items.map(codePaths))}`;
  return {
    header: 'Источники',
    question: 'Есть дополнительная документация или код, которые помогут понять, как устроен проект?',
    preview: blocks(`Папка фичи: \`${d}\` (другое имя — напишите, какое).`, seen),
    options,
  };
}
// После исследования: ничего не нашлось или не всё открылось — спросить, а не молча идти дальше.
function afterQuestion(m, ctx, src) {
  const d = rel(m.dir);
  const nothing = projectSources(src).length > 0 && ctx.facts === 0;
  if (ctx.accepted || (!nothing && !ctx.unread.length)) return null;
  // /directory add — только для папок вне проекта, которые сабагент не открыл.
  const outs = projectSources(src).filter((x) => outside(x) && !/^https?:/.test(x) && ctx.unread.some((u) => u.text.includes(x)));
  const lines = [`Изучил источники: фактов о проекте — ${ctx.facts}.`];
  if (ctx.unread.length) lines.push(`Не прочитал:\n${list(ctx.unread.map((x) => x.text.replace(/^\s*[-*]\s+/, '')))}`);
  if (outs.length) lines.push(`Папки вне проекта GigaCode читает после команды: ${outs.map((x) => `\`/directory add ${x}\``).join(', ')}`);
  const go = { id: 'ctx:go', label: 'Продолжаем с тем, что есть', description: 'чего нет в источниках, спрошу у вас', action: { lint: ['start', d, '--accept'] } };
  const more = { id: 'ctx:more', label: 'Дам доступ или пришлю ещё', description: 'пути, ссылки или «готово» после /directory add', action: { wait: MORE, then: ['start', d, '--sources', ANSWER] } };
  const options = nothing ? [more, go] : [go, more];
  options[0].recommended = true;
  return {
    header: 'Источники',
    question: nothing ? 'По задаче в источниках ничего не нашёл. Есть ещё документация или код?' : 'Часть источников не открылась. Как продолжим?',
    preview: blocks(lines),
    options,
  };
}

// Что сделать сейчас по фиче с протоколом «идёт». Одно место для start и choose.
export function startState(m) {
  const src = sourcesOf(m.protocol);
  if (!src) return { step: 'sources', question: sourcesQuestion(m) };
  const task = taskOf(m.protocol);
  const list = researchList(task, src);
  if (!list.length) return { step: 'ready', src, task };
  const key = list.join('; ');
  let ctx = loadContext(m);
  // Сабагент переписал шапку — вернуть её, а не изучать всё заново.
  if (ctx && ctx.sources == null && ctx.filled) ctx = syncContext(m, key, task.line).ctx;
  if (!ctx || ctx.sources !== key || (!ctx.checked && !ctx.filled)) return { step: 'research', src, task, ctx };
  if (!ctx.checked) {
    const errs = contextFindings(ctx).filter((x) => x.level === 'err');
    if (errs.length) return { step: 'fix', src, task, ctx, errs };
    markContext(ctx, 'Проверено');
    ctx = loadContext(m);
  }
  const question = afterQuestion(m, ctx, src);
  return question ? { step: 'after', src, task, ctx, question } : { step: 'ready', src, task, ctx };
}
export const startQuestion = (m) => (m.protocol && !/готов/i.test(m.protocol.status || '') ? startState(m).question || null : null);

const questionText = (m, q, lead = []) => viewText(questionsView(rel(m.dir), 'Brainstorming: источники', [q], { lead: blocks(lead), extra: [rename(rel(m.dir))] }));
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
function readyText(m, st, created, warn) {
  const d = rel(m.dir);
  const p = m.protocol;
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
  return readyText(m, st, created, warn);
}

function startedFeatures() {
  return listFeatures().filter((f) => {
    const md = read(path.join(DOCS, f, 'brainstorming.md'));
    return md && !/готов/i.test(header(md, 'Статус') || '');
  });
}
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
  let md = read(path.join(SKILLS_DIR, 'sdd-grill', 'assets', 'brainstorming.md'));
  md = md.replace('<Фича>', titleOf(c.task, slug)).replace(/^Запрос:.*$/m, () => `Запрос: ${requestOf(c.task)}`);
  if (c.sources.length) md = setHeader(md, 'Источники', c.sources.join('; '), ['Запрос']);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'brainstorming.md'), md);
  return { dir };
}

// Всё, что человек написал после /sdd-grill. slug — имя папки, которое придумал агент;
// name — ответ человека на вопрос «Как назвать папку?»: id варианта или имя словами.
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
  const r = createFeature(c, n.slug, raw, n.own);
  if (r.text) return r.text;
  const note = n.from ? `Из ответа «${n.from}» взято имя папки \`${n.slug}\`.` : null;
  return blocks(note, resume(r.dir, { created: true }));
}

// Ответ человека про источники: пути и ссылки дописываются, «нет» и «новый проект» — особые значения.
export function addSources(dir, answer) {
  const m = loadFeature(dir);
  const d = rel(m.dir);
  if (!m.protocol) return askTask({}, m.name);
  const a = parseSourcesAnswer(answer);
  const ask = (text) => waitText(text, ['start', d, '--sources', ANSWER]);
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
    const base = cur.length ? projectSources(cur) : inventory(m.name).empty ? [] : [REPO];
    writeSources(m, uniq([...base, ...fresh]));
  }
  return resume(dir);
}
export function acceptContext(dir) {
  const m = loadFeature(dir);
  const ctx = loadContext(m);
  if (ctx) markContext(ctx, 'Принято');
  return resume(dir);
}
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
