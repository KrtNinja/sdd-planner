// Аргументы этапа после фичи — их разбирает скрипт, а не модель: тема ADR, находка ревью для decide,
// @ts-check
// режим ревью; затронутые требованием slices и AC (trace FR-n).
import { neededAdrs } from './cut.mjs';
import { reviewTargets } from './guide.mjs';
import { reviewKey, undecided } from './review.mjs';
import { rel, reqIds, uniq } from './md.mjs';
import { itemBlock, pickText } from './question.mjs';
import { G, blocks, bold, codePaths, list, screen } from './screen.mjs';
import { code, skillCode } from './config.mjs';

// Шаг после фичи: { card, parts } — дополнение к выводу открытых ворот (карточка и части строки ⚙),
// { stop, text } — готовый вывод целиком: вопрос или стоп, этап дальше не идёт.
/** @typedef {import('./model.mjs').Feature} Feature */
/** @typedef {import('./model.mjs').Slice} Slice */
/** @typedef {import('./question.mjs').Question} Question */
/**
 * Шаг после фичи: дополнение к выводу ворот или готовый вывод со стопом.
 * @typedef {{ card: string | null, parts?: string[], stop?: undefined, mode?: string, num?: string | null }
 *   | { stop: true, text: string, card?: undefined }} GateStep
 */
const AC_ID = /\bAC-\d{3}-[BF]?\d+\b/g;
/** @param {string} s */
const short = (s, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Тема ADR: названа — дальше; нет — темы, которых ждут slices (Р1 — ADR: …); нет и их — кандидатов ищет сабагент.
/** @param {Feature} m @param {string | undefined} topic @returns {GateStep} */
export function adrTopicStep(m, topic) {
  const d = rel(m.dir);
  if (m.flow.state && !topic) return { stop: true, text: screen(
    'ADR необязателен. Какое уже принятое решение и причины выбора вы хотите записать?', G.wait(['gate', 'adr', d, '<тема>'])) };
  const needed = neededAdrs(m);
  if (topic) {
    const by = needed.filter((x) => x.topic.toLowerCase() === topic.toLowerCase()).map((x) => x.num);
    return { card: `Тема ADR: «${topic}»${by.length ? ` — её ждут части работы ${by.join(', ')} (Р1)` : ''}.` };
  }
  if (needed.length) {
    /** @type {Question} */
    const q = {
      header: 'Тема ADR',
      question: 'Какое решение оформляем в ADR? Другая тема — напишите её.',
      options: uniq(needed.map((x) => x.topic))
        .slice(0, 4)
        .map((t, i) => ({
          id: t,
          label: t,
          description: `нужно частям работы ${needed
            .filter((x) => x.topic === t)
            .map((x) => x.num)
            .join(', ')} (Р1)`,
          recommended: i === 0,
        })),
    };
    return { stop: true, text: pickText('Тема ADR не указана.', q, ['gate', 'adr', d, '<id>']) };
  }
  return adrCandidates(d);
}

/** @param {string} d @returns {GateStep} */
function adrCandidates(d) {
  const question =
    'Какие технические решения нужны этой фиче и ещё не описаны в ADR: брокер, хранилище, доставка событий, порядок, кэш, лимиты? ' +
    'Каждое — тема и где в spec или slices оно нужно.';
  const research = ['research', 'fact', d, question];
  return {
    stop: true,
    text: screen(
      'Тема ADR не указана; части работы не требуют ADR. Отдельный агент найдёт неописанные технические решения — покажу список тем.',
      G.sub(research),
      `кандидаты — покажи человеку списком и спроси, какую тему берём; ${G.wait(['gate', 'adr', d, '<ответ человека>'])}`,
      'кандидатов нет — скажи «ADR этой фиче не нужен» и стоп',
      G.same,
    ),
  };
}

// Находка ревью для /sdd-decide: «R2» или «slices:R2», если R2 есть в нескольких ревью.
/** @param {Feature} m @param {string} arg @returns {GateStep} */
export function findingStep(m, arg) {
  const d = rel(m.dir);
  const [key, id] = arg.includes(':') ? arg.split(':') : [null, arg];
  const all = [...m.reviews].flatMap(([k, rv]) => rv.rows.map((r) => ({ ...r, key: k, file: rv.file })));
  if (!all.length)
    return {
      stop: true,
      text: screen(
        `Файлов проверки нет: задача закрыта или проверка ИИ ещё не проводилась. ` +
          `Напишите вопрос текстом: ${skillCode('sdd-decide', m.name, '"<вопрос>"', '"<решение>"')}.`,
        G.stop,
      ),
    };
  const hit = all.filter((r) => r.id.toUpperCase() === id.toUpperCase() && (!key || r.key === key));
  if (!hit.length) {
    const have = all.map((r) => `${r.id} (${r.key})`).join(', ');
    return { stop: true, text: screen(`Пункта ${arg} нет. Есть: ${have}. Какой вы имели в виду?`, G.wait(['gate', 'decide', d, '<ответ человека>'])) };
  }
  if (hit.length > 1) {
    /** @type {Question} */
    const q = {
      header: 'Выявленная проблема',
      question: `${id} есть в нескольких проверках. Какую выбрать?`,
      options: hit.slice(0, 4).map((r) => ({ id: `${r.key}:${r.id}`, label: `${r.id} — проверка ${r.key}`, description: short(r.what, 60) })),
    };
    return { stop: true, text: pickText(null, q, ['gate', 'decide', d, '<id>']) };
  }
  return findingCard(m, hit[0]);
}

/** @param {Feature} m @param {import('./model.mjs').ReviewRow & { key: string, file: string }} r @returns {GateStep} */
function findingCard(m, r) {
  const ids = uniq([...reqIds(`${r.where} ${r.what}`), ...(`${r.where} ${r.what}`.match(AC_ID) || [])]);
  return {
    card: blocks(
      itemBlock(`${bold(`Выявленная проблема ${r.id}`)} · проверка ${r.key} · ${code(`${rel(r.file)}:${r.n}`)}`, [
        ['Где', r.where],
        ['Что не так', r.what],
        ['Предложение', r.proposal],
        .../** @type {[string, string][]} */ (undecided(r) ? [] : [['Решение уже есть', `«${r.decision}»`]]),
      ]),
      ids.length ? `Связанные требования и критерии приёмки:\n${impact(m, ids)}` : null,
    ),
    parts: [`находка ${r.key}:${r.id}`, undecided(r) ? 'решение в ревью впишешь на шаге «Источник»' : 'решение уже есть — спроси человека, менять ли его'],
  };
}

/** @typedef {{ mode: string, num?: string } | { stop: true, text: string }} ReviewChoice */
/** @param {Feature} m @param {string | undefined} arg @param {string | undefined} num @returns {ReviewChoice} */
function selectReview(m, arg, num) {
  const parts = (arg || '').split(':');
  if (parts[0]) return { mode: parts[0], num: parts[1] || num };
  const targets = reviewTargets(m);
  if (targets.length === 1) return { mode: targets[0].mode, num: targets[0].num };
  const d = rel(m.dir);
  if (!targets.length) return { stop: true, text: screen('Всё одобрено; обязательной проверки сейчас нет. ' +
      'Что проверить заново — требования, части работы или ADR?', G.wait(['gate', 'review', d, '<ответ человека>'])) };
  /** @type {Question} */
  const q = {
    header: 'Проверка',
    question: 'Что смотрим?',
    options: targets.slice(0, 4).map((t, i) => ({ id: t.num ? `adr:${t.num}` : t.mode, label: t.label, recommended: i === 0 })),
  };
  return { stop: true, text: pickText(null, q, ['gate', 'review', d, '<id>']) };
}

/** @param {Feature} m @param {string | undefined} num @returns {GateStep} */
function adrReview(m, num) {
  const nums = m.featureAdrs.map((a) => a.num);
  const n = reviewAdrNumber(m, num);
  if (!n || !nums.includes(n.padStart(4, '0'))) return askReviewAdr(m);
  return reviewResult(m, 'adr', n.padStart(4, '0'));
}

/** @param {Feature} m @param {string | undefined} num */
function reviewAdrNumber(m, num) {
  if (num) return num;
  const pend = reviewTargets(m).filter((t) => t.mode === 'adr').map((t) => t.num);
  if (pend.length === 1 && pend[0]) return pend[0];
  if (m.featureAdrs.length === 1) return m.featureAdrs[0].num;
  return undefined;
}

/** @param {Feature} m @returns {GateStep} */
function askReviewAdr(m) {
  if (!m.featureAdrs.length) return { stop: true, text: screen(
    `У задачи нет ADR для проверки. Подготовить архитектурное решение: ${skillCode('sdd-adr', m.name)}.`, G.stop) };
  /** @type {Question} */
  const q = {
    header: 'ADR',
    question: 'Какой ADR смотрим?',
    options: m.featureAdrs.slice(0, 4).map((a) => ({ id: `adr:${a.num}`, label: `ADR ${a.num}`, description: `«${a.status || '—'}»` })),
  };
  return { stop: true, text: pickText(null, q, ['gate', 'review', rel(m.dir), '<id>']) };
}

/** @param {Feature} m @param {string} mode @param {string | null} adrNum @returns {GateStep} */
function reviewResult(m, mode, adrNum) {
  return { card: droppedText(m, reviewKey(mode, adrNum)), parts: [`режим ${mode}${adrNum ? ` ${adrNum}` : ''}`], mode, num: adrNum };
}

// Режим ревью: не назван — что ждёт ревью; одно — берём, несколько — вопрос.
/** @param {Feature} m @param {string | undefined} arg @param {string | undefined} [num] @returns {GateStep} */
export function reviewStep(m, arg, num) {
  const choice = selectReview(m, arg, num);
  if ('stop' in choice) return choice;
  const { mode } = choice;
  if (!['spec', 'slices', 'adr'].includes(mode))
    return { stop: true, text: screen(`Режима проверки «${mode}» нет. Укажите spec (требования), slices (части работы) или adr (архитектурное решение).`,
      G.wait(['gate', 'review', rel(m.dir), '<ответ человека>'])) };
  return mode === 'adr' ? adrReview(m, choice.num) : reviewResult(m, mode, null);
}
// Находки, которые человек снял на прошлых ревью этого артефакта («Снято на ревью» в протоколе): ревьюер их не поднимает.
// Снятая находка: где (если указано), что не так, какое ревью и когда.
/** @param {import('./model.mjs').DroppedRow} x */
const droppedLine = (x) => `${x.where && x.where !== '—' ? `${codePaths(x.where)}: ` : ''}${x.what} (${x.review}, ${x.when})`;
/** @param {Feature} m @param {string} key */
function droppedText(m, key) {
  const rows = (m.protocol?.dropped || []).filter((x) => x.review.split(/\s+/)[0] === key);
  if (!rows.length) return null;
  return `Отклонены при прошлых проверках — повторно не предлагаются:\n${list(rows.map(droppedLine))}`;
}

// Что держится на требовании: строки протокола, slices, где оно в «Основание», и AC, которые его проверяют.
/** @param {Feature} m @param {string[]} ids */
export function impact(m, ids) {
  return ids.flatMap((id) => /^AC-/.test(id) ? [acImpact(m, id)] : requirementImpact(m, id)).join('\n');
}

/** @param {Feature} m @param {string} id */
function acImpact(m, id) {
  const sl = [...m.slices.values()].find((x) => x.acs.some((a) => a.id === id));
  const ac = sl?.acs.find((a) => a.id === id);
  return ac
      ? `- ${bold(id)} ${code(`${rel(/** @type {Slice} */ (sl).file)}:${ac.n}`)} — проверяет: ${ac.refs.join(', ') || '—'}`
      : `- ${bold(id)} — нет в частях работы`;
}

/** @param {Feature} m @param {string} id */
function requirementImpact(m, id) {
  const s = m.spec;
  const r = s?.reqs.get(id);
  if (!r) {
    return [`- ${bold(id)} — нет в spec.md`];
  }
  // требование нашлось — значит, spec есть.
  const spec = /** @type {import('./model.mjs').Spec} */ (s);
  const proto = uniq(spec.sources.filter((x) => x.target?.kind === 'req' && x.target.ids.includes(id)).flatMap((x) => x.refs.map((y) => `#${y.id}`)));
  const slices = [...m.slices.values()].filter((x) => x.basis.has(id)).map((x) => x.num);
  const acs = [...m.slices.values()].flatMap((x) => x.acs.filter((a) => a.refs.includes(id) && !a.deleted).map((a) => `${a.id} ${rel(x.file)}:${a.n}`));
  return [
    `- ${bold(id)} ${code(`${rel(spec.file)}:${r.n}`)} — ${short(r.text.replace(/^\s*N?FR-\d+\s*/, '').split(/Пример:/)[0].replace(/\s+/g, ' ').trim(), 70)}`,
    `  - протокол: ${proto.join(', ') || '—'}`,
    `  - части работы (Основание): ${slices.join(', ') || '—'}`,
    `  - AC: ${acs.map(codePaths).join('; ') || '—'}`,
  ];
}

// Прямой /sdd-decide также попадает в реестр: отсутствие spec на grill не блокирует ответ.
/** @param {Feature} m @param {string} question */
export function resumeGateStep(m, question) {
  if (/^(\w+:)?R\d+$/i.test(question)) return null;
  const ids = uniq(question.match(/\bQ[1-9]\d*\b/g) || []);
  const input = ids.length === 1 ? { id: ids[0] } : {};
  return screen('Продолжим исходную ветку вопроса. Получение ответа ещё не меняет обязательства.',
    G.call(['questions', 'resume', rel(m.dir), JSON.stringify(input)]));
}
