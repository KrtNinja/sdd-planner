// Старт /sdd-grill по шагам: задача → папка фичи → источники → исследование сабагентом → «Старт готов».
// Агент передаёт сюда ответы человека и делает, что сказано в выводе: вопросы и задания — данные скрипта.
import fs from 'node:fs';
import path from 'node:path';

import { askView, lintArgs, questionsView } from './ask.mjs';
import { SKILLS_DIR } from './cmd-prompt.mjs';
import { skill, lintCmd } from './config.mjs';
import { contextFindings, loadContext, markContext, syncContext } from './context.mjs';
import { loadFeature } from './feature.mjs';
import { line } from './findings.mjs';
import { NEW_PROJECT, REPO, classify, inventory, outside, parseSourcesAnswer, requestOf, slugFromFile, slugProblem, titleOf } from './input.mjs';
import { dropHeader, header, read, rel, setHeader, uniq } from './md.mjs';
import { DOCS, isDir, listFeatures } from './pick.mjs';
import { bump, reset } from './runs.mjs';

// «нет» — источников нет, но проект не новый: о том, как устроено сейчас, спрашиваем человека.
export const NONE = 'нет';
const SPECIAL = [NEW_PROJECT, NONE];
const call = (...args) => `sdd_lint ${lintArgs(args)}`;
const FOLLOW = 'Выполняй то, что сказано в выводе выше.';
const GIVE =
  'Пришлите пути или ссылки — можно несколько, через пробел. Надёжнее пути на этом компьютере: начните с @, Tab дополнит. ' +
  'Внутренние сайты (вики, GitLab) агент может не открыть — тогда сохраните страницу в файл и дайте путь.';
const MORE = 'Пришлите ещё пути или ссылки. Дали доступ к папке (/directory add <путь>) — напишите «готово», изучу заново.';
const rename = (d) => `Человек попросит другое имя папки — ${call('start', d, '--rename', '<имя>')}.`;

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
  const repo = { id: 'src:repo', label: 'Нет, хватит того, что в этой папке', description: 'сабагент изучит то, что уже здесь', action: { lint: ['start', d, '--sources', REPO], after: FOLLOW } };
  const give = { id: 'src:give', label: 'Да, пришлю пути или ссылки', description: 'следующим сообщением', action: { wait: GIVE, then: ['start', d, '--sources', '<ответ человека>'] } };
  const fresh = { id: 'src:new', label: 'Нет, это новый проект', description: 'изучать нечего: спрошу, как должно быть', action: { lint: ['start', d, '--sources', NEW_PROJECT], after: FOLLOW } };
  // Есть код или несколько документов — изучить их и не мучить человека; почти пусто — попросить источники.
  const options = inv.empty ? [give, fresh] : inv.code > 0 || inv.docs >= 2 ? [repo, give, fresh] : [give, repo, fresh];
  options[0].recommended = true;
  const seen = inv.empty ? 'В этой папке, кроме фичи, ничего нет.' : `В этой папке уже вижу:\n${inv.items.map((x) => `- ${x}`).join('\n')}`;
  return {
    header: 'Источники',
    question: 'Есть дополнительная документация или код, которые помогут понять, как устроен проект?',
    preview: `Папка фичи: ${d} (другое имя — напишите, какое).\n\n${seen}`,
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
  if (ctx.unread.length) lines.push(`Не прочитал:\n${ctx.unread.map((x) => x.text).join('\n')}`);
  if (outs.length) lines.push(`Папки вне проекта GigaCode читает после команды: ${outs.map((x) => `/directory add ${x}`).join(', ')}`);
  const go = { id: 'ctx:go', label: 'Продолжаем с тем, что есть', description: 'чего нет в источниках, спрошу у вас', action: { lint: ['start', d, '--accept'], after: FOLLOW } };
  const more = { id: 'ctx:more', label: 'Дам доступ или пришлю ещё', description: 'пути, ссылки или «готово» после /directory add', action: { wait: MORE, then: ['start', d, '--sources', '<ответ человека>'] } };
  const options = nothing ? [more, go] : [go, more];
  options[0].recommended = true;
  return {
    header: 'Источники',
    question: nothing ? 'По задаче в источниках ничего не нашёл. Есть ещё документация или код?' : 'Часть источников не открылась. Как продолжим?',
    preview: lines.join('\n\n'),
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

const questionText = (m, q, lead = []) =>
  [...lead, `Задай вопрос — как сказано в instruction. ${rename(rel(m.dir))}`, JSON.stringify(questionsView(rel(m.dir), 'Brainstorming: источники', [q]), null, 2)].join('\n');
function researchText(m, created, again = null) {
  const d = rel(m.dir);
  const say = created ? `Папка фичи — ${d} (другое имя — напишите, какое). Изучаю источники, это займёт несколько минут.` : 'Изучаю источники, это займёт несколько минут.';
  return [
    ...(again || [`Скажи человеку одной строкой: «${say}»${created ? ` ${rename(d)}` : ''}`, `Источники изучит сабагент: факты лягут в ${d}/_work/context.md, в это окно — только его итог.`]),
    '',
    'Запусти сабагента. Его задача целиком, ничего не добавляй и не пересказывай:',
    '',
    `Вызови инструмент sdd_lint с args ${lintArgs(['research', 'context', d])} и выполни то, что он вернёт.`,
    '',
    `Сабагент закончил — ${call('start', d)}; его отчёт человеку не пересказывай.`,
    `Сабагентов у тебя нет — выполни сам здесь: ${call('research', 'context', d)}, затем ${call('start', d)}.`,
  ].join('\n');
}
function readyText(m, st, created, warn) {
  const d = rel(m.dir);
  const p = m.protocol;
  const rows = p.rows.length;
  const last = p.rows[rows - 1];
  const out = ['Старт готов — дальше шаги скилла со 2-го.', `Фича: ${d}`, `Задача: ${st.task.line}`, `Источники: ${st.src.join('; ')}`];
  if (st.ctx) {
    out.push(`Контекст: ${rel(st.ctx.file)}, фактов о проекте — ${st.ctx.facts}. Прочитай его целиком: эти факты известны, у человека их не спрашивай; «Не нашёл» — кандидаты в вопросы.`);
    if (st.ctx.decided.length && !rows)
      out.push(`«Уже решено в задаче» — ${st.ctx.decided.length}: до первого раунда допиши каждое строкой в «Решения» — рекомендация «—», решение «из задачи: <как в задаче>». Снова не спрашивай.`);
  } else if (st.src.includes(NEW_PROJECT)) out.push('Контекста нет: новый проект. Спрашивай, как должно быть, а не как устроено сейчас.');
  else out.push('Контекста нет: источников нет. Что есть сейчас (роли, сервисы, данные), спрашивай у человека коротко, как факт, — без рекомендации.');
  out.push(rows ? `Протокол: решений ${rows}, последнее — #${last.id} «${last.q}». Продолжи с веток без решения.` : 'Протокол пуст — начинай с design tree.');
  if (warn) out.push(warn);
  const say = rows
    ? `Продолжаем ${d}: решений ${rows}. Всё нужное — в протоколе и контексте, историю чата держать не нужно.`
    : `Начинаем brainstorming ${d}${created ? ' (другое имя папки — напишите, какое)' : ''}. Вопросы — блоками; отвечайте вариантом или своими словами.`;
  out.push(`Скажи человеку одной строкой: «${say}»${created ? ` ${rename(d)}` : ''}`);
  return out.join('\n');
}

// Фича с папкой: следующий шаг старта.
export function resume(dir, { created = false } = {}) {
  const m = loadFeature(dir);
  const d = rel(m.dir);
  if (!m.protocol) {
    if (m.spec) return `Brainstorming ${d} пройден и закрыт: есть spec.md. Скажи человеку: «Поменять поведение — ${skill('sdd-decide', m.name, '"<вопрос>"', '"<решение>"')}; что дальше по фиче — ${lintCmd(m.name)}» — и остановись.`;
    return askTask({}, m.name);
  }
  if (/готов/i.test(m.protocol.status || ''))
    return [`Протокол ${d} готов: brainstorming закончен, новое решение — через ${skill('sdd-decide', m.name)}. Задай вопрос этапа — как сказано в instruction:`, JSON.stringify(askView(m), null, 2)].join('\n');
  let st = startState(m);
  if (st.step === 'sources') return questionText(m, st.question, created ? [`Создан ${d}/brainstorming.md.`] : []);
  if (st.step === 'research') return researchText(m, created);
  let warn = null;
  if (st.step === 'fix') {
    const { runs } = bump(m.dir, 'research');
    if (runs <= 2) return researchText(m, created, [`Контекст ${rel(st.ctx.file)} не прошёл проверку — попытка ${runs} из 2:`, ...st.errs.map((x) => `  ${line(x)}`), 'Сабагент получит этот список вместе с заданием.']);
    // Две попытки не помогли — идём дальше, но агент знает, каким фактам не верить сразу.
    markContext(st.ctx, 'Проверено');
    warn = `В контексте остались ошибки (${st.errs.length}): факты с ними перепроверь, прежде чем на них опираться.`;
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
  const args = ['start', `<ответ>${sources.length ? ` ${sources.join(' ')}` : ''}`, ...(slug ? ['--slug', slug] : [])];
  return [
    'Задачи нет. Спроси человека дословно и жди ответа:',
    '',
    '«Какую задачу будем делать? Опишите одной-двумя фразами, что должно появиться или измениться. Задача уже записана в файле — укажите его: @путь (Tab дополнит).»',
    ...(started.length ? ['', `Второй строкой того же сообщения: «Начатые: ${started.join(', ')} — чтобы продолжить, напишите имя.»`] : []),
    '',
    `Ответ человека передай дословно: ${call(...args)}${sources.length ? ' — источники в конце уже дописаны, оставь их' : ''}.`,
  ].join('\n');
}

function createFeature(c, slug, raw) {
  const problem = slugProblem(slug);
  if (problem) return { text: `Имя папки ${problem}. Придумай другое и повтори: ${call('start', raw, '--slug', '<имя>')}` };
  const dir = path.join(DOCS, slug);
  const old = read(path.join(dir, 'brainstorming.md'));
  if (old != null || fs.existsSync(path.join(dir, 'spec.md')))
    return { text: `Папка ${dir} уже занята${old ? ` — запрос ${header(old, 'Запрос') || '—'}` : ''}. Та же задача — ${call('start', dir)}; другая — придумай другое имя: ${call('start', raw, '--slug', '<имя>')}` };
  if (!isDir(DOCS) && !fs.existsSync('.git'))
    return { text: `Скажи человеку: «Здесь (${process.cwd()}) нет папки ${DOCS}/ и git — похоже, GigaCode запущен не из репозитория с доками. Запустите его из корня репозитория или создайте здесь папку ${DOCS}/ и повторите /sdd-grill.» — и остановись.` };
  let md = read(path.join(SKILLS_DIR, 'sdd-grill', 'assets', 'brainstorming.md'));
  md = md.replace('<Фича>', titleOf(c.task, slug)).replace(/^Запрос:.*$/m, () => `Запрос: ${requestOf(c.task)}`);
  if (c.sources.length) md = setHeader(md, 'Источники', c.sources.join('; '), ['Запрос']);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'brainstorming.md'), md);
  return { dir };
}

// Всё, что человек написал после /sdd-grill. slug — имя папки, которое придумал агент.
export function startFrom(raw, slug = null) {
  const c = classify(raw);
  if (c.missing.length)
    return [`Не нашёл: ${c.missing.join(', ')}. Передай человеку дословно и жди ответа:`, '', `«Не нашёл ${c.missing.join(', ')}. Проверьте путь: начните с @ — Tab дополнит. Или пришлите ссылку.»`, '', `Затем тот же текст с исправленным путём: ${call('start', '<текст>')}`].join('\n');
  if (c.kind === 'feature') {
    if (c.sources.length) return addSources(c.dir, c.sources.join(' '));
    return resume(c.dir);
  }
  if (c.kind !== 'task') return askTask(c, slug || c.slug);
  const name = slug || c.slug || (c.task.file ? slugFromFile(c.task.file) : null);
  if (!name)
    return [
      `Задача: ${requestOf(c.task)}.`,
      'Придумай имя папки фичи: 2–4 английских слова через дефис по сути задачи, например user-settings-panel. Человека не спрашивай: имя он увидит и сможет поменять.',
      `Затем: ${call('start', raw, '--slug', '<имя>')}`,
    ].join('\n');
  const r = createFeature(c, name, raw);
  return r.text || resume(r.dir, { created: true });
}

// Ответ человека про источники: пути и ссылки дописываются, «нет» и «новый проект» — особые значения.
export function addSources(dir, answer) {
  const m = loadFeature(dir);
  const d = rel(m.dir);
  if (!m.protocol) return askTask({}, m.name);
  const a = parseSourcesAnswer(answer);
  const ask = (lead, text) => [lead, '', `«${text}»`, '', `Ответ передай дословно: ${call('start', d, '--sources', '<ответ человека>')}`].join('\n');
  if (a.missing.length) return ask('Передай человеку дословно и жди ответа:', `Не нашёл ${a.missing.join(', ')}. Проверьте путь: начните с @ — Tab дополнит. Или пришлите ссылку.`);
  if (a.unclear) return ask('Из ответа не понял, есть ли источники. Передай человеку дословно и жди ответа:', `${GIVE} Нет ничего — напишите «нет».`);
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
  if (problem) return `Имя ${problem}. Спроси человека о другом и повтори: ${call('start', d, '--rename', '<имя>')}`;
  if (m.spec || !m.protocol || /готов/i.test(m.protocol.status || '')) return `Переименовать ${d} можно только пока идёт brainstorming. Скажи это человеку и остановись.`;
  const to = path.join(path.dirname(m.dir), slug);
  if (fs.existsSync(to)) return `${rel(to)} уже есть. Спроси человека о другом имени и повтори: ${call('start', d, '--rename', '<имя>')}`;
  fs.renameSync(m.dir, to);
  return `Папка ${d} теперь ${rel(to)} — дальше подставляй её.\n${resume(to)}`;
}
