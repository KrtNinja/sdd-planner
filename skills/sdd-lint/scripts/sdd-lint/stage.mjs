// Текущий этап фичи и блок «Следующий шаг».
// @ts-check
import { flowStage } from './flow-progress.mjs';

import { pendingAdrs } from './adr.mjs';
import { code, skill, lintCmd, tipLine } from './config.mjs';
import { neededAdrs, stubCount } from './cut.mjs';
import { rel, approved } from './md.mjs';
import { openBlockers, reviewKey } from './review.mjs';
import { tempArtifacts } from './work.mjs';
export { tempArtifacts } from './work.mjs';

/** @typedef {import('./io.mjs').Ctx} Ctx */
/** @typedef {import('./model.mjs').Feature} Feature */
/** @typedef {import('./model.mjs').Review} Review */
/** @typedef {import('./model.mjs').ReviewRow} ReviewRow */
/** Шаги для чтения и одна рекомендуемая команда для строки Tip. @typedef {{ steps: string[], tip: string | null }} Steps */
/** Этап фичи: где она (now), что дальше (next), команда для Tip.
 * @typedef {{ now: string, next: string[], tip: string | null, questions?: import('./question.mjs').Question[] }} Stage */

// Рекомендуемая команда при ревью артефакта — та же очерёдность, что в вопросе этапа (ask):
// ревью не было — ревью; открытые блокеры — их разбор; ревью разобрано — одобрить.
/** @param {Feature} m @param {Review | undefined} rv @param {ReviewRow[]} open @param {string} review @param {string} approve */
function reviewTip(m, rv, open, review, approve) {
  if (open.length) return lintCmd('ask', rel(m.dir));
  return rv ? approve : review;
}

/** @param {Feature} m @param {'spec' | 'slices'} what @returns {Steps} */
function handoff(m, what) {
  const dir = rel(m.dir);
  const target = what === 'spec' ? rel(m.specFile) : `${dir}/slices/`;
  const human = what === 'spec' ? code(skill('humanizer', target)) : `${code(skill('humanizer'))} по каждому файлу в ${code(target)}`;
  const guard = code(lintCmd('guard', what === 'spec' ? target : dir));
  const rv = m.reviews.get(what);
  const open = openBlockers(rv);
  const review = skill('sdd-review', m.name, what);
  const approve = lintCmd('approve', what, dir);
  const steps = [
    `по желанию упростить формулировки: ${human}, затем ${guard}`,
    rv ? `проверка ИИ уже была: ${code(rel(rv.file))}; повторить в новой сессии — ${code(review)}` : `проверка ИИ в новой сессии: ${code(review)}`,
    ...(open.length ? [blockersStep(m, /** @type {Review} */ (rv), open)] : []),
    `одобрить: ${code(approve)}`,
  ];
  return { steps, tip: reviewTip(m, rv, open, review, approve) };
}
// open — открытые блокеры этого ревью: раз они есть, есть и файл ревью.
/** @param {Feature} m @param {Review} rv @param {ReviewRow[]} open */
function blockersStep(m, rv, open) {
  const ids = open.map((r) => r.id);
  return `закрыть блокеры проверки ${ids.join(', ')} (${code(rel(rv.file))}): по одному — вопрос этапа (${code(lintCmd('ask', rel(m.dir)))}); ` +
    `решение — ${code(skill('sdd-decide', m.name, ids[0], '"<решение>"'))}, правка — исправьте файл и впишите «исправлено» в колонку «Решение»`;
}
/** @param {Feature} m @returns {Steps} */
function adrSteps(m) {
  /** @type {string | null} */
  let tip = null;
  const steps = pendingAdrs(m).flatMap((a) => {
    const rv = m.reviews.get(reviewKey('adr', a.num));
    const open = openBlockers(rv);
    const review = skill('sdd-review', m.name, 'adr', a.num);
    const approve = lintCmd('approve', 'adr', rel(m.dir), a.num);
    tip ??= reviewTip(m, rv, open, review, approve);
    return [
      rv
        ? `ADR ${a.num} «${a.status || '—'}» — проверка ИИ уже была: ${code(rel(rv.file))}`
        : `ADR ${a.num} «${a.status || '—'}» — проверка ИИ: ${code(review)}`,
      ...(open.length ? [blockersStep(m, /** @type {Review} */ (rv), open)] : []),
      `ADR ${a.num} — принять: ${code(approve)}`,
    ];
  });
  return { steps, tip };
}
// «Р1 — ADR: <тема>» в slices — ADR ещё не заведён: предложить его написать.
/** @param {Feature} m @returns {Steps} */
function newAdrSteps(m) {
  const need = neededAdrs(m).map((x) => ({ x, cmd: skill('sdd-adr', m.name, `"${x.topic}"`) }));
  return { steps: need.map(({ x, cmd }) => `написать ADR «${x.topic}» (часть работы ${x.num}): ${code(cmd)}`), tip: need[0]?.cmd ?? null };
}
// next — все шаги для чтения; tip — одна рекомендуемая команда для строки Tip (подсказка в строке ввода).
/** @param {string} cmd @returns {Steps} */
const one = (cmd, label = '') => ({ steps: [label ? `${label}: ${code(cmd)}` : code(cmd)], tip: cmd });
/** @param {Feature} m @param {string} now @param {Steps} [main] @returns {Stage} */
function stageWithAdrs(m, now, main = { steps: [], tip: null }) {
  const parts = [main, newAdrSteps(m), adrSteps(m)];
  return { now, next: parts.flatMap((p) => p.steps), tip: parts.find((p) => p.tip)?.tip ?? null };
}

/** @param {Feature} m @returns {Stage} */
function completedStage(m) {
  const pending = pendingAdrs(m);
  if (pending.length) {
    const a = adrSteps(m);
    return { now: `Части работы одобрены. Перед реализацией примите ADR: ${pending.map((x) => x.num).join(', ')}`, next: a.steps, tip: a.tip };
  }
  if (tempArtifacts(m).length) {
    const c = one(skill('sdd-close', m.name), `перед слиянием ветки убрать временные файлы (${tempArtifacts(m).map(code).join(', ')})`);
    return { now: 'Части работы одобрены, ADR приняты', next: c.steps, tip: c.tip };
  }
  return { now: 'Планирование завершено: части работы одобрены, ADR приняты, временные файлы убраны', next: [], tip: null };
}

/** @param {Feature} m @returns {Stage} */
function slicesStage(m) {
  // Неодобренный spec важнее всего ниже: после /sdd-decide он возвращается «на ревью»,
  // и одобрение slices относилось к другой его версии.
  if (m.spec && !approved(m.spec.status))
    return stageWithAdrs(
      m,
      approved(m.slicesStatus)
        ? `Требования «${m.spec.status || '—'}», а части работы уже есть — после одобрения требований проверьте и одобрите части заново`
        : `Требования «${m.spec.status || '—'}» — части работы ждут их одобрения`,
      handoff(m, 'spec'),
    );
  if (approved(m.slicesStatus)) return completedStage(m);
  const stubs = stubCount(m);
  if (stubs) return stageWithAdrs(
    m, `Части работы созданы по плану, заготовок «<…>» не заполнено: ${stubs}`, one(skill('sdd-slices', m.name), 'заполнить заготовки'),
  );
  return stageWithAdrs(m, 'Части работы ожидают проверки', handoff(m, 'slices'));
}

/** @param {Feature} m @returns {Stage} */
function specStage(m) {
  if (m.plan && m.spec && approved(m.spec.status))
    return stageWithAdrs(m, `План разбиения работы ждёт согласования (${rel(m.planFile)})`, one(skill('sdd-slices', m.name), 'согласовать разбиение работы'));
  if (m.spec && approved(m.spec.status)) return stageWithAdrs(m, 'Требования одобрены', one(skill('sdd-slices', m.name)));
  if (m.spec) return stageWithAdrs(m, `Требования «${m.spec.status || '—'}»`, handoff(m, 'spec'));
  return protocolStage(m);
}

/** @param {Feature} m @returns {Stage} */
function protocolStage(m) {
  if (m.protocol && /готов/i.test(m.protocol.status || '')) return stageWithAdrs(m, 'Протокол готов', one(skill('sdd-spec', m.name)));
  if (m.protocol) return stageWithAdrs(m, 'Идёт обсуждение задачи', one(skill('sdd-grill', m.name), 'продолжить'));
  return stageWithAdrs(m, 'Обсуждение задачи не начато', one(skill('sdd-grill', m.name)));
}

/** @param {Feature} m @returns {Stage} */
export function stageOf(m) {
  if (m.flow.state) return flowStage(m);
  return m.slices.size ? slicesStage(m) : specStage(m);
}
/** @param {Pick<Stage, 'now' | 'next'>} st */
export function stageText({ now, next }) {
  if (!next.length) return now;
  if (next.length === 1) return `${now}. Следующий шаг: ${next[0]}`;
  return `${now}. Следующий шаг:\n\n${next.map((x, i) => `${i + 1}. ${x}`).join('\n')}`;
}

export { tipOk, tipLine } from './config.mjs';
// Последней строкой вывода: агент переносит её в конец ответа дословно (правило в SKILL.md sdd-lint).
// При ошибках lint check и fix строку не печатают: сначала исправить, одобрять или ревьюить рано.
/** @param {Ctx} ctx @param {{ tip: string | null }} st */
export function printTip(ctx, st) {
  const t = tipLine(st.tip);
  if (t) ctx.io.log(`\n${t}`);
}
