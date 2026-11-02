// Текущий этап фичи и блок «Следующий шаг».
import fs from 'node:fs';

import { pendingAdrs } from './adr.mjs';
import { skill, lintCmd } from './config.mjs';
import { neededAdrs, stubCount } from './cut.mjs';
import { rel, approved } from './md.mjs';
import { openBlockers, reviewKey } from './review.mjs';
import { legacyPaths, workFiles } from './work.mjs';

// Временные артефакты этапа планирования: нужны, пока требования пишутся, в merge не идут. Убирает их /sdd-close.
// Протокол лежит в папке фичи, остальное — в _work/; старые review/ и slices/plan.md close тоже убирает.
export function tempArtifacts(m) {
  const old = legacyPaths(m);
  return [
    m.protocol ? rel(m.protocolFile) : null,
    workFiles(m).length ? `${rel(m.workDir)}/` : null,
    fs.existsSync(old.review) ? `${rel(old.review)}/` : null,
    fs.existsSync(old.plan) ? rel(old.plan) : null,
  ].filter(Boolean);
}

// Рекомендуемая команда при ревью артефакта — та же очерёдность, что в вопросе этапа (ask):
// ревью не было — ревью; открытые блокеры — их разбор; ревью разобрано — одобрить.
const reviewTip = (m, rv, open, review, approve) => (open.length ? lintCmd('ask', rel(m.dir)) : rv ? approve : review);

function handoff(m, what) {
  const dir = rel(m.dir);
  const target = what === 'spec' ? rel(m.specFile) : `${dir}/slices/`;
  const human = what === 'spec' ? `${skill('humanizer', target)}` : `${skill('humanizer')} по каждому файлу в ${target}`;
  const guard = lintCmd('guard', what === 'spec' ? target : dir);
  const rv = m.reviews.get(what);
  const open = openBlockers(rv);
  const review = skill('sdd-review', m.name, what);
  const approve = lintCmd('approve', what, dir);
  const steps = [
    `по желанию убрать AI стиль: ${human}, затем ${guard}`,
    rv ? `ревью уже было: ${rel(rv.file)}; повторить в чистом контексте — ${review}` : `ревью в чистом контексте: ${review}`,
    ...(open.length ? [blockersStep(m, rv, open)] : []),
    `одобрить: ${approve}`,
  ];
  return { steps, tip: reviewTip(m, rv, open, review, approve) };
}
export function blockersStep(m, rv, open) {
  const ids = open.map((r) => r.id);
  return `закрыть блокеры ревью ${ids.join(', ')} (${rel(rv.file)}): по одному — вопрос этапа (${lintCmd('ask', rel(m.dir))}); решение — ${skill('sdd-decide', m.name, ids[0], '"<решение>"')}, правка — исправьте файл и впишите «исправлено» в колонку «Решение»`;
}
function adrSteps(m) {
  let tip = null;
  const steps = pendingAdrs(m).flatMap((a) => {
    const rv = m.reviews.get(reviewKey('adr', a.num));
    const open = openBlockers(rv);
    const review = skill('sdd-review', m.name, 'adr', a.num);
    const approve = lintCmd('approve', 'adr', rel(m.dir), a.num);
    tip ??= reviewTip(m, rv, open, review, approve);
    return [
      rv ? `ADR ${a.num} «${a.status || '—'}» — ревью уже было: ${rel(rv.file)}` : `ADR ${a.num} «${a.status || '—'}» — ревью: ${review}`,
      ...(open.length ? [blockersStep(m, rv, open)] : []),
      `ADR ${a.num} — принять: ${approve}`,
    ];
  });
  return { steps, tip };
}
// «Р1 — ADR: <тема>» в slices — ADR ещё не заведён: предложить его написать.
function newAdrSteps(m) {
  const need = neededAdrs(m).map((x) => ({ x, cmd: skill('sdd-adr', m.name, `"${x.topic}"`) }));
  return { steps: need.map(({ x, cmd }) => `написать ADR «${x.topic}» (slice ${x.num}): ${cmd}`), tip: need[0]?.cmd ?? null };
}
// next — все шаги для чтения; tip — одна рекомендуемая команда для строки Tip (подсказка в строке ввода).
const one = (cmd, label = '') => ({ steps: [label ? `${label}: ${cmd}` : cmd], tip: cmd });
export function stageOf(m) {
  const st = (now, main = { steps: [], tip: null }) => {
    const parts = [main, newAdrSteps(m), adrSteps(m)];
    return { now, next: parts.flatMap((p) => p.steps), tip: parts.find((p) => p.tip)?.tip ?? null };
  };
  // Неодобренный spec важнее всего ниже: после /sdd-decide он возвращается «на ревью»,
  // и одобрение slices относилось к другой его версии.
  if (m.slices.size && m.spec && !approved(m.spec.status))
    return st(
      approved(m.slicesStatus)
        ? `Dev Spec «${m.spec.status || '—'}», а slices уже есть — после одобрения spec проверьте и одобрите slices заново`
        : `Dev Spec «${m.spec.status || '—'}» — slices ждут его одобрения`,
      handoff(m, 'spec'),
    );
  if (m.slices.size && approved(m.slicesStatus)) {
    const pending = pendingAdrs(m);
    if (pending.length) {
      const a = adrSteps(m);
      return { now: `Slices одобрены. Перед реализацией примите ADR: ${pending.map((x) => x.num).join(', ')}`, next: a.steps, tip: a.tip };
    }
    if (tempArtifacts(m).length) {
      const c = one(skill('sdd-close', m.name), `перед merge убрать временные артефакты (${tempArtifacts(m).join(', ')})`);
      return { now: 'Slices одобрены, ADR приняты', next: c.steps, tip: c.tip };
    }
    return { now: 'Планирование завершено: slices одобрены, ADR приняты, временные артефакты убраны', next: [], tip: null };
  }
  const stubs = m.slices.size ? stubCount(m) : 0;
  if (stubs) return st(`Slices созданы по плану, заготовок «<…>» не заполнено: ${stubs}`, one(skill('sdd-slices', m.name), 'заполнить заготовки'));
  if (m.slices.size) return st('Slices на ревью', handoff(m, 'slices'));
  if (m.plan && m.spec && approved(m.spec.status)) return st(`План нарезки ждёт согласия (${rel(m.planFile)})`, one(skill('sdd-slices', m.name), 'согласовать нарезку'));
  if (m.spec && approved(m.spec.status)) return st('Dev Spec одобрен', one(skill('sdd-slices', m.name)));
  if (m.spec) return st(`Dev Spec «${m.spec.status || '—'}»`, handoff(m, 'spec'));
  if (m.protocol && /готов/i.test(m.protocol.status || '')) return st('Протокол готов', one(skill('sdd-spec', m.name)));
  if (m.protocol) return st('Brainstorming идёт', one(skill('sdd-grill', m.name), 'продолжить'));
  return st('Brainstorming не начат', one(skill('sdd-grill', m.name)));
}
export function stageText({ now, next }) {
  if (!next.length) return now;
  if (next.length === 1) return `${now}. Следующий шаг: ${next[0]}`;
  return `${now}. Следующий шаг:\n${next.map((x, i) => `  ${i + 1}. ${x}`).join('\n')}`;
}

// Строка для подсказки в поле ввода GigaCode (followup suggestions, унаследованы от Qwen Code).
// Её модель-предсказатель ищет в последних строках ответа явную подсказку (в его промпте пример —
// «Tip: type X to …») и берёт X. Пишем по-русски, префикс «Tip:» оставляем как маркер. Запятой перед
// «чтобы» нет намеренно: она прилипла бы к команде в подсказке.
// Подсказку длиннее 12 слов или от 100 символов, с переносом, «*» или границей предложения CLI отбросит,
// а заготовку с «<…>» нельзя отправить как есть, — такую строку не печатаем вовсе.
export function tipOk(cmd) {
  if (!cmd) return false;
  const words = cmd.trim().split(/\s+/).length;
  return words <= 12 && cmd.length < 100 && !/[\n*<>]/.test(cmd) && !/[.!?]\s+[A-ZА-ЯЁ]/.test(cmd);
}
export const tipLine = (cmd) => (tipOk(cmd) ? `Tip: Введите ${cmd} чтобы продолжить` : null);
// Последней строкой вывода: агент переносит её в конец ответа дословно (правило в SKILL.md sdd-lint).
// При ошибках lint check и fix строку не печатают: сначала исправить, одобрять или ревьюить рано.
export function printTip(st) {
  const t = tipLine(st.tip);
  if (t) console.log(`\n${t}`);
}
