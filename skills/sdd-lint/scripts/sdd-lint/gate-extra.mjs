// Аргументы этапа после фичи — их разбирает скрипт, а не модель: тема ADR, находка ревью для decide,
// режим ревью; затронутые требованием slices и AC (trace FR-n).
import { lintArgs } from './ask.mjs';
import { neededAdrs } from './cut.mjs';
import { pickText, reviewTargets } from './guide.mjs';
import { rel, reqIds, uniq } from './md.mjs';

const call = (...args) => `sdd_lint ${lintArgs(args)}`;
const AC_ID = /\bAC-\d{3}-[BF]?\d+\b/g;
const short = (s, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Тема ADR: названа — дальше; нет — темы, которых ждут slices (Р1 — ADR: …); нет и их — кандидатов ищет сабагент.
export function adrTopicStep(m, topic) {
  const d = rel(m.dir);
  const needed = neededAdrs(m);
  if (topic) {
    const by = needed.filter((x) => x.topic.toLowerCase() === topic.toLowerCase()).map((x) => x.num);
    return { text: `Тема: «${topic}»${by.length ? ` — её ждёт slice ${by.join(', ')} (Р1)` : ''}.` };
  }
  if (needed.length) {
    const q = {
      header: 'Тема ADR',
      question: 'Какое решение оформляем в ADR? Другая тема — напишите её.',
      options: uniq(needed.map((x) => x.topic))
        .slice(0, 4)
        .map((t, i) => ({ id: t, label: t, description: `ждёт slice ${needed.filter((x) => x.topic === t).map((x) => x.num).join(', ')} (Р1)`, recommended: i === 0 })),
    };
    return { stop: true, text: pickText('Тема не указана. Задай вопрос — как сказано в instruction:', q, ['gate', 'adr', d, '<id>']) };
  }
  const question =
    'Какие технические решения нужны этой фиче и ещё не описаны в ADR: брокер, хранилище, доставка событий, порядок, кэш, лимиты? ' +
    'Каждое — тема и где в spec или slices оно нужно.';
  return {
    stop: true,
    text: [
      'Тема не указана, и slices не ждут ADR. Кандидатов найдёт сабагент — в это окно придут только они. Его задача целиком:',
      '',
      `Вызови инструмент sdd_lint с args ${lintArgs(['research', 'fact', d, question])} и выполни то, что он вернёт.`,
      '',
      'Сабагентов нет — тот же вызов сам. Пришли кандидаты — покажи их человеку списком и спроси, какую тему берём;',
      `ответ — ${call('gate', 'adr', d, '<тема>')}. Кандидатов нет — скажи человеку, что ADR не нужен, и остановись.`,
    ].join('\n'),
  };
}

// Находка ревью для /sdd-decide: «R2» или «slices:R2», если R2 есть в нескольких ревью.
export function findingStep(m, arg) {
  const d = rel(m.dir);
  const [key, id] = arg.includes(':') ? arg.split(':') : [null, arg];
  const all = [...m.reviews].flatMap(([k, rv]) => rv.rows.map((r) => ({ ...r, key: k, file: rv.file })));
  if (!all.length) return { stop: true, text: `Файлов ревью нет: фича закрыта или ревью не было. Попроси человека написать вопрос текстом и повторить ${'/sdd-decide'} — остановись.` };
  const hit = all.filter((r) => r.id.toUpperCase() === id.toUpperCase() && (!key || r.key === key));
  if (!hit.length) {
    const have = all.map((r) => `${r.id} (${r.key})`).join(', ');
    return { stop: true, text: `Находки ${arg} нет. Есть: ${have}. Спроси человека, какую он имел в виду; ответ — ${call('gate', 'decide', d, '<R…>')}.` };
  }
  if (hit.length > 1) {
    const q = {
      header: 'Находка',
      question: `${id} есть в нескольких ревью. Какая?`,
      options: hit.slice(0, 4).map((r) => ({ id: `${r.key}:${r.id}`, label: `${r.id} — ревью ${r.key}`, description: short(r.what, 60) })),
    };
    return { stop: true, text: pickText('Задай вопрос — как сказано в instruction:', q, ['gate', 'decide', d, '<id>']) };
  }
  const r = hit[0];
  const ids = uniq([...reqIds(`${r.where} ${r.what}`), ...(`${r.where} ${r.what}`.match(AC_ID) || [])]);
  return {
    text: [
      `Находка ${r.id} — ревью ${r.key}, ${rel(r.file)}:${r.n}`,
      `  Где: ${r.where || '—'}`,
      `  Что не так: ${r.what || '—'}`,
      `  Предложение: ${r.proposal || '—'}`,
      r.decision ? `  Решение уже есть: «${r.decision}» — спроси человека, менять ли его.` : '  Решение: пусто — впишешь в шаге «Источник».',
      ...(ids.length ? ['', impact(m, ids)] : []),
    ].join('\n'),
  };
}

// Режим ревью: не назван — что ждёт ревью; одно — берём, несколько — вопрос.
export function reviewStep(m, arg, num) {
  const d = rel(m.dir);
  let [mode, n] = (arg || '').split(':');
  n = n || num;
  const targets = reviewTargets(m);
  if (!mode) {
    if (targets.length === 1) [mode, n] = [targets[0].mode, targets[0].num];
    else if (!targets.length) return { stop: true, text: 'Ревью ничего не ждёт: всё одобрено. Повторное ревью — спроси человека, что смотреть: spec, slices или ADR, — и повтори gate с этим режимом.' };
    else {
      const q = { header: 'Ревью', question: 'Что смотрим?', options: targets.slice(0, 4).map((t, i) => ({ id: t.num ? `adr:${t.num}` : t.mode, label: t.label, recommended: i === 0 })) };
      return { stop: true, text: pickText('Режим не указан. Задай вопрос — как сказано в instruction:', q, ['gate', 'review', d, '<id>']) };
    }
  }
  if (!['spec', 'slices', 'adr'].includes(mode)) return { stop: true, text: `Режим «${mode}» не бывает: spec, slices или adr. Спроси человека и повтори ${call('gate', 'review', d, '<режим>')}.` };
  if (mode === 'adr') {
    const nums = m.featureAdrs.map((a) => a.num);
    const pend = targets.filter((t) => t.mode === 'adr').map((t) => t.num);
    if (!n && pend.length === 1) n = pend[0];
    if (!n && nums.length === 1) n = nums[0];
    if (!n || !nums.includes(n.padStart(4, '0'))) {
      if (!nums.length) return { stop: true, text: 'У фичи нет ADR — ревьюить нечего. Скажи человеку и остановись.' };
      const q = { header: 'ADR', question: 'Какой ADR смотрим?', options: m.featureAdrs.slice(0, 4).map((a) => ({ id: `adr:${a.num}`, label: `ADR ${a.num}`, description: `«${a.status || '—'}»` })) };
      return { stop: true, text: pickText('Задай вопрос — как сказано в instruction:', q, ['gate', 'review', d, '<id>']) };
    }
    n = n.padStart(4, '0');
  }
  return { text: `Режим: ${mode}${mode === 'adr' ? ` ${n}` : ''}`, mode, num: mode === 'adr' ? n : null };
}

// Что держится на требовании: строки протокола, slices, где оно в «Основание», и AC, которые его проверяют.
export function impact(m, ids) {
  const out = [];
  const s = m.spec;
  for (const id of ids) {
    if (/^AC-/.test(id)) {
      const sl = [...m.slices.values()].find((x) => x.acs.some((a) => a.id === id));
      const ac = sl?.acs.find((a) => a.id === id);
      out.push(ac ? `${id}  ${rel(sl.file)}:${ac.n}  проверяет: ${ac.refs.join(', ') || '—'}` : `${id}  — нет в slices`);
      continue;
    }
    const r = s?.reqs.get(id);
    if (!r) {
      out.push(`${id}  — нет в spec.md`);
      continue;
    }
    const proto = uniq(s.sources.filter((x) => x.target?.ids?.includes(id)).flatMap((x) => x.refs.map((y) => `#${y.id}`)));
    const slices = [...m.slices.values()].filter((x) => x.basis.has(id)).map((x) => x.num);
    const acs = [...m.slices.values()].flatMap((x) => x.acs.filter((a) => a.refs.includes(id) && !a.deleted).map((a) => `${a.id} ${rel(x.file)}:${a.n}`));
    out.push(
      `${id}  ${rel(s.file)}:${r.n}  ${short(r.text.replace(/^\s*N?FR-\d+\s*/, '').split(/Пример:/)[0].replace(/\s+/g, ' ').trim(), 70)}`,
      `  протокол: ${proto.join(', ') || '—'}`,
      `  slices (Основание): ${slices.join(', ') || '—'}`,
      `  AC: ${acs.join('; ') || '—'}`,
    );
  }
  return out.join('\n');
}
